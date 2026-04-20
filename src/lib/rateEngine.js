/**
 * SmartShip — Rate Engine (Consolidated)
 */

const { ZONES, RULES } = require('../config/rules');
const { detectWarehouseSplit } = require('./warehouseDetector');

// In-memory cache to prevent double-charging during split shipments
// Key: destinationZip-orderTotal, Value: timestamp
const transactionCache = new Map();
const CACHE_TTL = 5000; // 5 seconds (Shopify calls happen within milliseconds)

async function evaluateRates(rateRequest) {
  const { destination, items, currency, origin, order_totals } = rateRequest;

  const zone = resolveZone(destination.country);
  const cartTotalCents = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartTotal = cartTotalCents / 100;

  // Use Shopify's grand total (if available) for threshold checks (e.g. Free over $200)
  const grandTotal = order_totals ? (order_totals.subtotal_price / 100) : cartTotal;
  const totalWeightGrams = items.reduce((sum, item) => sum + (item.grams * item.quantity), 0);

  const { isSplit } = detectWarehouseSplit(items, origin);

  // ─── CONSOLIDATION LOGIC ──────────────────────────────────────────────────
  // If this is a split shipment, we only want to charge the $9.99 once.
  let isConsolidatedCall = false;

  if (order_totals && (cartTotal < grandTotal)) {
    // This is a split call. Generate a unique key for this specific customer checkout.
    const cacheKey = `${destination.postal_code}-${grandTotal}-${currency}`;
    const now = Date.now();

    if (transactionCache.has(cacheKey)) {
      const lastCall = transactionCache.get(cacheKey);
      if (now - lastCall < CACHE_TTL) {
        isConsolidatedCall = true; // We already processed another part of this order
      }
    } else {
      transactionCache.set(cacheKey, now);
      // Clean up old cache entries occasionally
      if (transactionCache.size > 100) transactionCache.clear();
    }
  }

  // Find rules based on the GRAND total (so $50 + $160 = $210 qualifies for Free Shipping)
  const matchingRates = evaluateRules({
    zone,
    cartTotal: grandTotal,
    totalWeightGrams,
    isSplit: isSplit || (cartTotal < grandTotal),
    currency,
    destination,
    items,
  });

  // If this is the SECOND or THIRD box in a split, return $0 for matching rates
  if (isConsolidatedCall) {
    return matchingRates.map(r => ({ ...r, price: 0 })).map(formatRate);
  }

  return matchingRates.map(formatRate);
}

function resolveZone(countryCode) {
  for (const [zoneId, zone] of Object.entries(ZONES)) {
    if (zone.countries.includes(countryCode)) return zoneId;
  }
  return 'international';
}

function evaluateRules({ zone, cartTotal, totalWeightGrams, isSplit, currency, destination, items }) {
  const applicableRules = RULES.filter(rule => {
    if (rule.zone && rule.zone !== zone) return false;
    for (const condition of rule.conditions) {
      if (!evaluateCondition(condition, { cartTotal, totalWeightGrams, isSplit })) return false;
    }
    return true;
  });

  if (isSplit && applicableRules.length > 0) return consolidate(applicableRules);
  return applicableRules;
}

function evaluateCondition(condition, { cartTotal, totalWeightGrams, isSplit }) {
  let actual;
  switch (condition.field) {
    case 'price': actual = cartTotal; break;
    case 'weight_kg': actual = totalWeightGrams / 1000; break;
    case 'is_split': actual = isSplit ? 1 : 0; break;
    default: return true;
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

function consolidate(rates) {
  const freeRate = rates.find(r => r.type === 'free');
  if (freeRate) return [freeRate];
  const sorted = [...rates].sort((a, b) => a.price - b.price);
  return [sorted[0]];
}

function formatRate(rule) {
  return {
    service_name: rule.name,
    service_code: rule.id,
    total_price: rule.price === 0 ? '0' : String(Math.round(rule.price * 100)),
    currency: rule.currency || 'USD',
    min_delivery_date: rule.minDelivery || null,
    max_delivery_date: rule.maxDelivery || null,
    description: rule.description || '',
    phone_required: false,
  };
}

module.exports = { evaluateRates };
