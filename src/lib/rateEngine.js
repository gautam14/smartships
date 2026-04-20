/**
 * SmartShip — Rate Engine
 * 
 * This is the brain. It receives Shopify's raw rate request,
 * detects multi-warehouse splits, evaluates all rules,
 * and returns a single consolidated rate to the customer.
 *
 * Shopify rate request shape:
 * {
 *   origin: { country, province, city, zip },
 *   destination: { country, province, city, zip },
 *   items: [{ name, sku, quantity, grams, price, vendor, requires_shipping, taxable, fulfillment_service }],
 *   currency: "CAD",
 *   locale: "en"
 * }
 */

const { ZONES, RULES } = require('../config/rules');
const { detectWarehouseSplit } = require('./warehouseDetector');

/**
 * Main entry point. Called by the carrier service route.
 * @param {object} rateRequest - Raw Shopify rate request object
 * @returns {Array} Array of rate objects in Shopify format
 */
async function evaluateRates(rateRequest) {
  const { destination, items, currency } = rateRequest;

  // Step 1: Determine the customer's shipping zone
  const zone = resolveZone(destination.country);

  // Step 2: Calculate the combined cart total (in cents — Shopify sends prices as integers)
  const cartTotalCents = items.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);
  const cartTotal = cartTotalCents / 100; // Convert to dollars

  // Step 3: Calculate total weight in grams
  const totalWeightGrams = items.reduce((sum, item) => {
    return sum + (item.grams * item.quantity);
  }, 0);

  // Step 4: Detect if this order splits across multiple warehouses
  const { isSplit, locations } = detectWarehouseSplit(items, rateRequest.origin);

  // CONSOLIDATION FIX (2026 Update):
  // If Shopify split this into multiple calls, we only charge for the first one.
  // Note: order_totals is a field added in late 2025/2026.
  let isConsolidatedSplit = isSplit;
  if (rateRequest.order_totals) {
    const grandTotal = rateRequest.order_totals.subtotal / 100;
    if (cartTotal < grandTotal) {
      isConsolidatedSplit = true;
      // If this is a split call, we evaluate based on the GRAND total (for free shipping)
      cartTotal = grandTotal;
    }
  }

  // Step 5: Find all matching rules
  const matchingRates = evaluateRules({
    zone,
    cartTotal,
    totalWeightGrams,
    isSplit: isConsolidatedSplit,
    currency,
    destination,
    items,
  });

  // FINAL CONSOLIDATION GUARD:
  // If this is a split call, and the customer already qualifies for a rate,
  // we only return the price for the "Primary" warehouse (alphabetical) to avoid double charging.
  if (isConsolidatedSplit && matchingRates.length > 0) {
    // Determine if this specific warehouse should show the price
    const primaryWarehouse = locations.sort()[0];
    const currentWarehouse = locations[0]; // The one in this request

    if (currentWarehouse !== primaryWarehouse) {
      // Return the same rate but with $0 price for the second box
      return matchingRates.map(r => ({ ...r, price: 0 })).map(formatRate);
    }
  }

  return matchingRates.map(formatRate);
}

/**
 * Resolve which shipping zone a country belongs to.
 * Returns zone ID or 'international' as fallback.
 */
function resolveZone(countryCode) {
  for (const [zoneId, zone] of Object.entries(ZONES)) {
    if (zone.countries.includes(countryCode)) {
      return zoneId;
    }
  }
  return 'international';
}

/**
 * Walk through all configured rules and return the ones that match
 * the current cart context.
 */
function evaluateRules({ zone, cartTotal, totalWeightGrams, isSplit, currency, destination, items }) {
  const applicableRules = RULES.filter(rule => {
    // Zone check — null zone means "applies to all zones"
    if (rule.zone && rule.zone !== zone) return false;

    // Condition checks
    for (const condition of rule.conditions) {
      if (!evaluateCondition(condition, { cartTotal, totalWeightGrams, isSplit })) {
        return false;
      }
    }

    return true;
  });

  // CONSOLIDATION LOGIC:
  // If the order splits across warehouses but multiple rates matched,
  // apply the consolidation strategy from config.
  if (isSplit && applicableRules.length > 0) {
    return consolidate(applicableRules);
  }

  return applicableRules;
}

/**
 * Evaluate a single condition against current cart values.
 */
function evaluateCondition(condition, { cartTotal, totalWeightGrams, isSplit }) {
  let actual;

  switch (condition.field) {
    case 'price': actual = cartTotal; break;
    case 'weight_kg': actual = totalWeightGrams / 1000; break;
    case 'weight_g': actual = totalWeightGrams; break;
    case 'is_split': actual = isSplit ? 1 : 0; break;
    default: return true; // Unknown field — don't block
  }

  const threshold = parseFloat(condition.value);

  switch (condition.operator) {
    case 'gte': return actual >= threshold;
    case 'lte': return actual <= threshold;
    case 'gt': return actual > threshold;
    case 'lt': return actual < threshold;
    case 'eq': return actual === threshold;
    default: return true;
  }
}

/**
 * Consolidation strategy for split orders.
 * Strategy: return only the single best-match rate.
 * This prevents the customer from ever seeing 2 shipping lines.
 */
function consolidate(rates) {
  // Priority: free shipping first, then lowest price
  const freeRate = rates.find(r => r.type === 'free');
  if (freeRate) return [freeRate];

  const sorted = [...rates].sort((a, b) => a.price - b.price);
  return [sorted[0]];
}

/**
 * Format a rule into Shopify's carrier service rate format.
 * Shopify expects prices in CENTS (integer).
 *
 * Full format: https://shopify.dev/docs/apps/selling-strategies/shipping/rate-calculation#rate-object
 */
function formatRate(rule) {
  return {
    service_name: rule.name,
    service_code: rule.id,
    total_price: rule.type === 'free' ? '0' : String(Math.round(rule.price * 100)),
    currency: rule.currency || 'CAD',
    min_delivery_date: rule.minDelivery || null,
    max_delivery_date: rule.maxDelivery || null,
    description: rule.description || '',
    phone_required: false,
  };
}

module.exports = { evaluateRates };
