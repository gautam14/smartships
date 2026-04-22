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
  try {
    const { origin, items = [] } = rateRequest;

    // Shopify sometimes sends 'country_code' instead of 'country'
    const dest = rateRequest.destination || {};
    const country = dest.country || dest.country_code;

    if (!country) {
      console.error(`[SmartShip] ❌ MISSING country in destination from ${shopDomain}`);
      console.log('Payload:', JSON.stringify(rateRequest));
      return [];
    }

    const destination = { ...dest, country }; // Ensure 'country' exists for downstream

    // Generate a readable shorthand ID for easier debugging (e.g. BILLER-39743)
    const lastName = (destination.name || 'GUEST').split(' ').pop().toUpperCase();
    const zip = (destination.postal_code || '00000').toUpperCase().replace(/\s/g, '');
    const readableId = `${lastName}-${zip}`;

    // Generate a stable session ID for the internal Map (more precise than the readable one)
    const sessionId = generateSessionId(rateRequest, shopDomain);

    // DEDUPLICATION WINDOW LOGIC (Origin-Aware)
    // We only return $0 if this is a DIFFERENT warehouse than the one we already charged.
    const sessionData = activeCheckouts.get(sessionId);
    const now = Date.now();
    const DEDUPE_WINDOW = 5000; // 5 seconds

    // Determine the unique key for this warehouse origin
    const originKey = `${origin?.country || ''}-${origin?.zip || origin?.postal_code || 'Main'}`;

    let isDeduplicated = false;
    if (sessionData && (now - sessionData.timestamp) < DEDUPE_WINDOW) {
      // If we already charged a DIFFERENT origin, then this is a split shipment.
      if (sessionData.originKey !== originKey) {
        isDeduplicated = true;
      }
    }

    if (!isDeduplicated) {
      // Either a new session, or a re-calculation for the SAME warehouse.
      activeCheckouts.set(sessionId, { timestamp: now, originKey });
      console.log(`\n[SmartShip] 🔥 PRIMARY WAREHOUSE | Session: ${readableId} | Origin: ${originKey}`);
    } else {
      // This is a truly separate warehouse (Split Shipment).
      console.log(`\n[SmartShip] ♻️  SPLIT WAREHOUSE   | Session: ${readableId} | Origin: ${originKey} (Deduplicated)`);
    }

    // High-level log for debugging
    const customerName = destination.name || 'Guest Customer';
    console.log(`    Customer: ${customerName} (${destination.province || ''}, ${destination.country})`);
    console.log(`    Origin: ${origin?.zip || origin?.postal_code || 'Unknown'} | Items: ${items.length} units | Currency: ${rateRequest.currency}`);

    // Find the applicable rate based on destination country
    const zone = resolveZone(destination.country);
    const rule = RULES.find(r => r.zone === zone);

    if (!rule) {
      console.error(`[SmartShip] ❌ No rule found for zone: ${zone} (Country Code: ${destination.country})`);
      return [];
    }

    // Deduplication: Only the first request in the window gets the full price.
    const effectivePrice = isDeduplicated ? 0 : rule.price;
    const finalRate = formatRate(rule, effectivePrice);

    console.log(`    Returning: ${finalRate.service_name} at $${finalRate.total_price / 100}`);

    return [finalRate];

  } catch (err) {
    console.error('[SmartShip] ❌ CRITICAL ERROR in evaluateRates:', err);
    return [];
  }
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
 * Resolve destination country to zone (case-insensitive)
 */
function resolveZone(countryCode) {
  if (!countryCode) return 'international';
  const code = String(countryCode).toUpperCase();

  for (const [zoneId, zone] of Object.entries(ZONES)) {
    if (zone.countries.includes(code)) {
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
