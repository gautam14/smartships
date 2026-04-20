/**
 * SmartShip — Rate Engine (v2026.04)
 */

const { ZONES, RULES } = require('../config/rules');
const { detectWarehouseSplit } = require('./warehouseDetector');

// In-memory cache to prevent double-charging during split shipments
const transactionCache = new Map();
const CACHE_TTL = 10000; // 10 seconds

async function evaluateRates(rateRequest) {
  const { destination, items, currency, origin, order_totals } = rateRequest;

  // 1. Calculate the price of the items in THIS specific box
  const boxTotalCents = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const boxTotal = boxTotalCents / 100;

  // 2. Identify the GRAND TOTAL of the entire order (all boxes combined)
  // Shopify sends total_price (discounted) and subtotal_price (pre-discount)
  const grandTotal = order_totals ? (order_totals.total_price / 100) : boxTotal;

  // 3. Detect if this is a split shipment call
  // If the box price is less than the grand total, it's a split.
  const isSplitShipment = order_totals && (boxTotal < (grandTotal - 0.01));

  // 4. Determine which warehouse is calling us
  const { location } = detectWarehouseSplit(items, origin);

  // 5. Consolidation Lock
  let isSecondaryBox = false;
  if (isSplitShipment) {
    const cacheKey = `${destination.postal_code}-${grandTotal}-${currency}`;
    const now = Date.now();

    if (transactionCache.has(cacheKey)) {
      isSecondaryBox = true;
    } else {
      transactionCache.set(cacheKey, now);
      // Clean up cache every 100 entries
      if (transactionCache.size > 100) {
        const threshold = now - CACHE_TTL;
        for (let [key, val] of transactionCache) if (val < threshold) transactionCache.delete(key);
      }
    }
  }

  // 6. Find matching rules based on the GRAND total
  const zone = resolveZone(destination.country);
  const matchingRates = evaluateRules({
    zone,
    cartTotal: grandTotal,
    isSplit: isSplitShipment,
    currency,
  });

  // 7. If this is Box #2 or Box #3, return the rates with $0 price
  if (isSecondaryBox) {
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

function evaluateRules({ zone, cartTotal, isSplit }) {
  return RULES.filter(rule => {
    if (rule.zone && rule.zone !== zone) return false;
    for (const condition of rule.conditions) {
      let actual = (condition.field === 'price') ? cartTotal : (isSplit ? 1 : 0);
      let threshold = parseFloat(condition.value);

      if (condition.operator === 'gte' && actual < threshold) return false;
      if (condition.operator === 'lt' && actual >= threshold) return false;
      if (condition.operator === 'eq' && actual !== threshold) return false;
    }
    return true;
  });
}

function formatRate(rule) {
  return {
    service_name: rule.name,
    service_code: rule.id,
    total_price: rule.price === 0 ? '0' : String(Math.round(rule.price * 100)),
    currency: rule.currency || 'USD',
    description: rule.description || '',
    min_delivery_date: rule.minDelivery || null,
    max_delivery_date: rule.maxDelivery || null
  };
}

module.exports = { evaluateRates };
