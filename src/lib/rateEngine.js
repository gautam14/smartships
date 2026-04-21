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
  const { destination, origin } = rateRequest;

  // Generate a stable session ID for this checkout.
  // We use destination + shopDomain because Shopify doesn't provide a checkout ID.
  const sessionId = generateSessionId(rateRequest, shopDomain);

  // Determine if we should deduplicate (charge $0) or show the full price.
  // We use a 3-second window: within a single page load, all warehouse requests 
  // happen almost simultaneously. If a request comes in 3+ seconds later, 
  // it's likely a page refresh, so we should show the full price again.
  const lastPaidTimestamp = activeCheckouts.get(sessionId) || 0;
  const now = Date.now();
  const DEDUPE_WINDOW = 3000; // 3 seconds

  const isDeduplicated = (now - lastPaidTimestamp) < DEDUPE_WINDOW;

  if (!isDeduplicated) {
    // This is either the first warehouse request or a fresh page load.
    // Mark the timestamp so subsequent requests in this window return $0.
    activeCheckouts.set(sessionId, now);
    console.log(`[SmartShip] CHARGING checkout: ${sessionId} | Shop: ${shopDomain} | Origin: ${origin?.zip || 'unknown'}`);
  } else {
    // This is a near-simultaneous request for the same session (another warehouse).
    console.log(`[SmartShip] DEDUPLICATING request: ${sessionId} | Shop: ${shopDomain} | Origin: ${origin?.zip || 'unknown'} | Returning $0`);
  }

  // Find the applicable rate based on destination country
  const zone = resolveZone(destination.country);
  const rule = RULES.find(r => r.zone === zone);

  if (!rule) {
    console.warn(`[SmartShip] No rule found for zone: ${zone}`);
    return [];
  }

  // Deduplication: Only the first request in the window gets the full price.
  const effectivePrice = isDeduplicated ? 0 : rule.price;

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
    description: '',
  };
}

module.exports = { evaluateRates };
