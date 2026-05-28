const crypto = require('crypto');
const { ZONES, RULES } = require('../config/rules');
const logger = require('./logger');

const activeCheckouts = new Map();
const SESSION_TTL = 30000;
const DEDUPE_WINDOW = 5000;

async function evaluateRates(rateRequest, shopDomain = 'unknown', meta = {}) {
  try {
    const { origin, items = [] } = rateRequest;

    const dest = rateRequest.destination || {};
    const country = dest.country || dest.country_code;

    if (!country) {
      console.error(`[SmartShip] ❌ MISSING country in destination from ${shopDomain}`);
      console.log('Payload:', JSON.stringify(rateRequest));
      logger.error(`BACKUP RATE TRIGGERED - Missing country in destination`, {
        ...meta,
        shop: shopDomain,
        destination: JSON.stringify(dest),
      });
      return [];
    }

    const destination = { ...dest, country };

    const lastName = (destination.name || 'GUEST').split(' ').pop().toUpperCase();
    const zip = (destination.postal_code || '00000').toUpperCase().replace(/\s/g, '');
    const readableId = `${lastName}-${zip}`;

    const sessionId = generateSessionId(rateRequest, shopDomain);
    const originKey = `${origin?.country || ''}-${(origin?.zip || origin?.postal_code || 'Main').replace(/\s/g, '')}`;

    const sessionData = activeCheckouts.get(sessionId);
    const now = Date.now();

    let isDeduplicated = false;
    if (sessionData && (now - sessionData.timestamp) < DEDUPE_WINDOW) {
      if (sessionData.originKey !== originKey) {
        isDeduplicated = true;
      }
    }

    if (!isDeduplicated) {
      activeCheckouts.set(sessionId, { timestamp: now, originKey });
      console.log(`\n[SmartShip] 🔥 PRIMARY WAREHOUSE | Session: ${readableId} | Origin: ${originKey}`);
    } else {
      console.log(`\n[SmartShip] ♻️  SPLIT WAREHOUSE   | Session: ${readableId} | Origin: ${originKey} (Deduplicated)`);
    }

    const customerName = destination.name || 'Guest Customer';
    console.log(`    Customer: ${customerName} (${destination.province || ''}, ${destination.country})`);
    const email = destination.email || rateRequest.email;
    const emailLog = email ? ` | Email: ${email}` : '';
    console.log(`    Customer: ${customerName} (${destination.province || ''}, ${destination.country}) ${emailLog}`);
    console.log(`    Origin: ${origin?.zip || origin?.postal_code || 'Unknown'} | Items: ${items.length} units | Currency: ${rateRequest.currency}`);

    const zone = resolveZone(destination.country);
    const rule = RULES.find(r => r.zone === zone);

    if (!rule) {
      console.error(`[SmartShip] ❌ No rule found for zone: ${zone} (Country Code: ${destination.country})`);
      logger.error(`BACKUP RATE TRIGGERED - No rule for zone`, {
        ...meta,
        shop: shopDomain,
        zone,
        country: destination.country,
      });
      return [];
    }

    if (isDeduplicated) {
      console.log(`    Skipping: Split warehouse — rate already returned for this session`);
      return [];
    }

    const finalRate = formatRate(rule, rule.price);

    console.log(`    Returning: ${finalRate.service_name} at $${finalRate.total_price / 100}`);

    return [finalRate];

  } catch (err) {
    console.error('[SmartShip] ❌ CRITICAL ERROR in evaluateRates:', err);
    logger.error(`BACKUP RATE TRIGGERED - evaluateRates threw`, {
      ...meta,
      shop: shopDomain,
      error: err.message,
      stack: err.stack,
    });
    return [];
  }
}

function generateSessionId(req, shopDomain) {
  const { destination, currency } = req;
  const d = destination || {};

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

function formatRate(rule, price) {
  return {
    service_name: rule.name,
    service_code: rule.id,
    total_price: String(Math.round(price * 100)),
    currency: rule.currency,
    description: '',
  };
}

module.exports = { evaluateRates };
