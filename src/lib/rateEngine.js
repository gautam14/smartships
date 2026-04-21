const crypto = require('crypto');
const { ZONES, RULES } = require('../config/rules');

// Session tracking: Maps destination hash → timestamp of first request
const activeCheckouts = new Map();
const SESSION_TTL = 30000; // 30 seconds

/**
 * Main entry point
 * @param {Object} rateRequest - The rate request from Shopify
 * @param {string} shopDomain - The X-Shopify-Shop-Domain header
 */
async function evaluateRates(rateRequest, shopDomain = 'unknown') {
  const { destination, origin, items } = rateRequest;

  // Generate a stable session ID for this checkout.
  // We use destination + shopDomain because Shopify doesn't provide a checkout ID.
  const sessionId = generateSessionId(rateRequest, shopDomain);

  // Determine if this is the first warehouse request for this checkout
  const sessionStatus = activeCheckouts.get(sessionId);
  const isFirstRequest = !sessionStatus;

  if (isFirstRequest) {
    // Mark this session as seen
    activeCheckouts.set(sessionId, Date.now());

    // Auto-cleanup after TTL
    setTimeout(() => {
      activeCheckouts.delete(sessionId);
    }, SESSION_TTL);

    console.log(`[SmartShip] NEW checkout session: ${sessionId} | Shop: ${shopDomain} | Origin: ${origin?.zip || 'unknown'}`);
  } else {
    console.log(`[SmartShip] DUPLICATE request for session: ${sessionId} | Shop: ${shopDomain} | Origin: ${origin?.zip || 'unknown'} | Returning $0`);
  }

  // Find the applicable rate based on destination country
  const zone = resolveZone(destination.country);
  const rule = RULES.find(r => r.zone === zone);

  if (!rule) {
    console.warn(`[SmartShip] No rule found for zone: ${zone}`);
    return [];
  }

  // Deduplication: Only the first warehouse request gets the actual price.
  // All subsequent requests for the same session (other warehouses) return $0.
  // This ensures the total shipping cost is equal to exactly one flat rate.
  const effectivePrice = isFirstRequest ? rule.price : 0;

  return [formatRate(rule, effectivePrice)];
}

/**
 * Generate a session ID that is identical for all warehouse requests in one checkout.
 */
function generateSessionId(req, shopDomain) {
  const { destination, currency } = req;
  const d = destination || {};

  // Create a stable string from identifying features of the checkout
  const identityString = [
    shopDomain,
    (d.country || '').toUpperCase(),
    (d.province || '').toUpperCase(),
    (d.city || '').toLowerCase().trim(),
    (d.postal_code || '').toUpperCase().replace(/\s/g, ''),
    (d.address1 || '').toLowerCase().trim(),
    currency
  ].join('|');

  return crypto.createHash('md5').update(identityString).digest('hex');
}

/**
 * Resolve destination country to zone
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
 * Format rate for Shopify
 */
function formatRate(rule, price) {
  return {
    service_name: rule.name,
    service_code: rule.id,
    total_price: String(Math.round(price * 100)), // Shopify wants cents as string
    currency: rule.currency,
    description: price === 0 ? '(Consolidated Shipment)' : '',
  };
}

module.exports = { evaluateRates };
