/**
 * SmartShip — Rate Engine (Simplified for Flat Rates + Multi-Warehouse Deduplication)
 * 
 * THE PROBLEM:
 * When you have 3 warehouses, Shopify sends 3 SEPARATE rate requests per checkout.
 * Without deduplication, customer sees shipping charged 3 times.
 * 
 * THE SOLUTION:
 * Track each unique checkout session. Only charge shipping for the FIRST warehouse request.
 * All subsequent requests for the same checkout return $0 rates.
 */

const { ZONES, RULES } = require('../config/rules');

// Session tracking: Maps checkout ID → timestamp of first request
const activeCheckouts = new Map();
const SESSION_TTL = 60000; // 60 seconds (plenty of time for all 3 warehouse calls)

/**
 * Main entry point
 */
async function evaluateRates(rateRequest) {
  const { destination, origin } = rateRequest;
  
  // Generate a unique session ID for this checkout
  // Shopify sends a unique 'id' field per checkout session
  const sessionId = rateRequest.id || generateFallbackSessionId(rateRequest);
  
  // Determine if this is the first warehouse request for this checkout
  const isFirstRequest = !activeCheckouts.has(sessionId);
  
  if (isFirstRequest) {
    // Mark this session as seen
    activeCheckouts.set(sessionId, Date.now());
    
    // Auto-cleanup after TTL
    setTimeout(() => {
      activeCheckouts.delete(sessionId);
    }, SESSION_TTL);
    
    console.log(`[SmartShip] NEW checkout session: ${sessionId} | Origin: ${origin?.zip || 'unknown'}`);
  } else {
    console.log(`[SmartShip] DUPLICATE request for session: ${sessionId} | Origin: ${origin?.zip || 'unknown'} | Returning $0`);
  }
  
  // Find the applicable rate based on destination country
  const zone = resolveZone(destination.country);
  const rule = RULES.find(r => r.zone === zone);
  
  if (!rule) {
    console.warn(`[SmartShip] No rule found for zone: ${zone}`);
    return [];
  }
  
  // If this is NOT the first request, return a $0 version of the rate
  const effectivePrice = isFirstRequest ? rule.price : 0;
  
  return [formatRate(rule, effectivePrice)];
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

/**
 * Fallback session ID generator (if Shopify doesn't send 'id')
 */
function generateFallbackSessionId(req) {
  const { destination, items } = req;
  const itemsHash = items.map(i => `${i.sku}-${i.quantity}`).join('|');
  return `${destination.postal_code}-${itemsHash}-${Date.now()}`;
}

module.exports = { evaluateRates };
