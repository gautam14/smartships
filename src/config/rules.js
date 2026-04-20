/**
 * SmartShip — Lil Helper Shipping Rules Configuration
 *
 * This is the ONLY file you should need to edit day-to-day.
 * No code changes needed to update thresholds, add new zones, or adjust rates.
 *
 * ─────────────────────────────────────────────
 * CURRENT POLICY (as of Jan 2026):
 *   Canada:        < $200 → $9.99  |  ≥ $200 → Free  |  5–8 business days
 *   United States: < $200 → $9.99  |  ≥ $200 → Free  |  5–8 business days
 *   International: All orders → Calculated at checkout (subsidised)
 * ─────────────────────────────────────────────
 */

// ─── ZONES ────────────────────────────────────────────────────────────────────
// Keys are zone IDs referenced in RULES below.
// country values = ISO 3166-1 alpha-2 country codes (2-letter).
// Full list: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
const ZONES = {
  canada: {
    label: 'Canada',
    countries: ['CA'],
  },
  usa: {
    label: 'United States',
    countries: ['US'],
  },
  international: {
    label: 'International',
    countries: [
      'GB', 'AU', 'DE', 'FR', 'JP', 'MX', 'BR', 'IN', 'NL', 'ES',
      'IT', 'SE', 'NO', 'DK', 'FI', 'NZ', 'KR', 'SG', 'HK', 'IE',
      'CH', 'AT', 'BE', 'PT', 'PL', 'CZ', 'AR', 'CL', 'ZA', 'AE',
      'SA', 'TR', 'ID', 'TH', 'MY', 'PH', 'VN', 'IL', 'EG', 'NG',
      // Add more ISO codes as needed
    ],
  },
};

// ─── DELIVERY DATE HELPERS ────────────────────────────────────────────────────
// Shopify accepts ISO 8601 date strings for min/max delivery date.
// These helpers generate dates offset from today.
function daysFromNow(n) {
  const d = new Date();
  // Skip weekends for business day calculation
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

// ─── RULES ────────────────────────────────────────────────────────────────────
// Rules are evaluated in order. ALL conditions must match for a rule to fire.
// The first matching rule per zone wins (unless consolidation is off).
//
// condition fields:   price | weight_kg | weight_g | is_split
// condition operators: gte | lte | gt | lt | eq
//
const RULES = [

  // ── CANADA ──────────────────────────────────────────────────────────────────

  {
    id: 'ca-free',
    name: 'Free Shipping',          // Shown at checkout
    description: '5–8 business days',
    zone: 'canada',
    type: 'free',
    price: 0,
    currency: 'CAD',
    minDelivery: daysFromNow(5),
    maxDelivery: daysFromNow(8),
    conditions: [
      { field: 'price', operator: 'gte', value: '200' },
    ],
  },

  {
    id: 'ca-standard',
    name: 'Standard Shipping',
    description: '5–8 business days',
    zone: 'canada',
    type: 'flat',
    price: 9.99,
    currency: 'CAD',
    minDelivery: daysFromNow(5),
    maxDelivery: daysFromNow(8),
    conditions: [
      { field: 'price', operator: 'lt', value: '200' },
    ],
  },

  // ── UNITED STATES ───────────────────────────────────────────────────────────

  {
    id: 'us-free',
    name: 'Free Shipping',
    description: '5–8 business days',
    zone: 'usa',
    type: 'free',
    price: 0,
    currency: 'USD',
    minDelivery: daysFromNow(5),
    maxDelivery: daysFromNow(8),
    conditions: [
      { field: 'price', operator: 'gte', value: '200' },
    ],
  },

  {
    id: 'us-standard',
    name: 'Standard Shipping',
    description: '5–8 business days',
    zone: 'usa',
    type: 'flat',
    price: 9.99,
    currency: 'USD',
    minDelivery: daysFromNow(5),
    maxDelivery: daysFromNow(8),
    conditions: [
      { field: 'price', operator: 'lt', value: '200' },
    ],
  },

  // ── INTERNATIONAL ───────────────────────────────────────────────────────────
  // For international, we return a fixed subsidised flat rate.
  // If you have a live carrier rate API (Stallion, EasyPost, etc.) you can
  // replace this with a calculated rate — see docs/calculated-rates.md

  {
    id: 'intl-standard',
    name: 'International Shipping',
    description: 'Tracked. Delivery times vary by country.',
    zone: 'international',
    type: 'flat',
    price: 19.99,    // ← Update this to match your subsidised rate
    currency: 'CAD',
    minDelivery: daysFromNow(7),
    maxDelivery: daysFromNow(21),
    conditions: [],        // No conditions — applies to all international orders
  },

  // ── EXAMPLE: EXPRESS ADD-ON (currently disabled) ──────────────────────────
  // Uncomment and adjust to add an express option for Canada:
  //
  // {
  //   id:          'ca-express',
  //   name:        'Express Shipping',
  //   description: '1–3 business days',
  //   zone:        'canada',
  //   type:        'flat',
  //   price:       19.99,
  //   currency:    'CAD',
  //   minDelivery: daysFromNow(1),
  //   maxDelivery: daysFromNow(3),
  //   conditions: [],
  // },

];

// ─── CONSOLIDATION SETTINGS ───────────────────────────────────────────────────
const CONSOLIDATION = {
  // When an order splits across warehouses, how do we pick the rate to show?
  // Options: 'cheapest' | 'free_first' | 'all'
  strategy: 'free_first',

  // Should we combine the cart totals from all locations when
  // evaluating the free shipping threshold?
  // TRUE = $60 from Canada + $50 from USA = $110 combined → qualifies for free
  // FALSE = each location evaluated separately (customer less likely to get free shipping)
  useCombinedCartTotal: true,
};

module.exports = { ZONES, RULES, CONSOLIDATION };
