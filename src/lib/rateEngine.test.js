/**
 * SmartShip — Rate Engine Tests
 *
 * Run:  node src/lib/rateEngine.test.js
 * Or with Jest:  npx jest
 *
 * Tests the exact scenarios Lil Helper cares about:
 *   1. CA order < $99 → $9.99
 *   2. CA order ≥ $99 → Free
 *   3. US order < $99 → $9.99
 *   4. US order ≥ $99 → Free
 *   5. Split order (NY + Mississauga), CA, $85 → single $9.99 (not double)
 *   6. Split order (NY + Mississauga), CA, $110 → single Free (not $9.99 + $9.99)
 *   7. International order → flat rate
 */

const { evaluateRates } = require('./rateEngine');

const tests = [
  {
    label: 'CA < $99 → $9.99',
    input: makeRequest({ country: 'CA', priceCents: 8500, fulfillment: 'manual' }),
    expect: { count: 1, name: 'Standard Shipping', price: '999' },
  },
  {
    label: 'CA ≥ $99 → Free',
    input: makeRequest({ country: 'CA', priceCents: 12000, fulfillment: 'manual' }),
    expect: { count: 1, name: 'Free Shipping', price: '0' },
  },
  {
    label: 'US < $99 → $9.99',
    input: makeRequest({ country: 'US', priceCents: 5000, fulfillment: 'lil-helper-us' }),
    expect: { count: 1, name: 'Standard Shipping', price: '999' },
  },
  {
    label: 'US ≥ $99 → Free',
    input: makeRequest({ country: 'US', priceCents: 15000, fulfillment: 'lil-helper-us' }),
    expect: { count: 1, name: 'Free Shipping', price: '0' },
  },
  {
    label: 'Split order, CA, $85 combined → SINGLE $9.99 (not $19.98)',
    input: makeRequest({ country: 'CA', priceCents: 8500, fulfillment: 'split' }),
    expect: { count: 1, price: '999' },
  },
  {
    label: 'Split order, CA, $110 combined → SINGLE Free (not $9.99 + $9.99)',
    input: makeRequest({ country: 'CA', priceCents: 11000, fulfillment: 'split' }),
    expect: { count: 1, price: '0' },
  },
  {
    label: 'International → flat rate (1 result)',
    input: makeRequest({ country: 'GB', priceCents: 5000, fulfillment: 'manual' }),
    expect: { count: 1 },
  },
];

function makeRequest({ country, priceCents, fulfillment }) {
  const isSplit = fulfillment === 'split';
  const items = isSplit
    ? [
        { name: 'Diaper A', sku: 'A1', quantity: 1, grams: 300, price: Math.floor(priceCents / 2), requires_shipping: true, fulfillment_service: 'manual' },
        { name: 'Diaper B', sku: 'B1', quantity: 1, grams: 300, price: Math.ceil(priceCents / 2),  requires_shipping: true, fulfillment_service: 'lil-helper-us' },
      ]
    : [
        { name: 'Diaper A', sku: 'A1', quantity: 1, grams: 500, price: priceCents, requires_shipping: true, fulfillment_service: fulfillment },
      ];

  return {
    origin:      { country: 'CA', province: 'ON', city: 'Mississauga', zip: 'L5B 3C4' },
    destination: { country, province: '', city: '', zip: '' },
    items,
    currency: country === 'US' ? 'USD' : 'CAD',
    locale: 'en',
  };
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const rates = await evaluateRates(test.input);

      let ok = true;
      const errors = [];

      if (test.expect.count !== undefined && rates.length !== test.expect.count) {
        ok = false;
        errors.push(`Expected ${test.expect.count} rate(s), got ${rates.length}: ${rates.map(r=>r.service_name).join(', ')}`);
      }
      if (test.expect.price !== undefined && rates[0]?.total_price !== test.expect.price) {
        ok = false;
        errors.push(`Expected price ${test.expect.price}, got ${rates[0]?.total_price}`);
      }
      if (test.expect.name !== undefined && !rates.find(r => r.service_name === test.expect.name)) {
        ok = false;
        errors.push(`Expected rate named "${test.expect.name}", got: ${rates.map(r=>r.service_name).join(', ')}`);
      }

      if (ok) {
        console.log(`  ✅  ${test.label}`);
        passed++;
      } else {
        console.log(`  ❌  ${test.label}`);
        errors.forEach(e => console.log(`       → ${e}`));
        failed++;
      }
    } catch (err) {
      console.log(`  💥  ${test.label} — threw: ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

console.log('SmartShip — Rate Engine Test Suite');
console.log('─────────────────────────────────────');
runTests();
