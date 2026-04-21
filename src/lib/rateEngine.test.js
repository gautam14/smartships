/**
 * SmartShip — Rate Engine Tests (Simplified)
 * 
 * Run: node src/lib/rateEngine.test.js
 */

const { evaluateRates } = require('./rateEngine');

const tests = [
  {
    label: 'CA order → $9.99 CAD',
    input: makeRequest({ country: 'CA', zip: 'L5T1A1' }),
    expect: { count: 1, price: '999', currency: 'CAD' },
  },
  {
    label: 'US order → $9.99 USD',
    input: makeRequest({ country: 'US', zip: '14225' }),
    expect: { count: 1, price: '999', currency: 'USD' },
  },
  {
    label: 'International (UK) → $20 USD',
    input: makeRequest({ country: 'GB', zip: 'SW1A' }),
    expect: { count: 1, price: '2000', currency: 'USD' },
  },
  {
    label: 'Multi-warehouse: First request → $9.99',
    input: makeRequest({ country: 'CA', zip: 'L5T1A1', sessionId: 'test-session-1' }),
    expect: { count: 1, price: '999' },
  },
  {
    label: 'Multi-warehouse: Second request (same session) → $0',
    input: makeRequest({ country: 'CA', zip: '14225', sessionId: 'test-session-1' }),
    expect: { count: 1, price: '0' },
  },
];

function makeRequest({ country, zip, sessionId }) {
  return {
    id: sessionId || `test-${Math.random()}`,
    origin: { country: 'CA', province: 'ON', city: 'Toronto', zip },
    destination: { country, province: '', city: '', postal_code: 'ABC123' },
    items: [
      { name: 'Product', sku: 'TEST', quantity: 1, grams: 500, price: 5000, requires_shipping: true },
    ],
    currency: country === 'US' ? 'USD' : 'CAD',
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
        errors.push(`Expected ${test.expect.count} rate(s), got ${rates.length}`);
      }
      
      if (test.expect.price !== undefined && rates[0]?.total_price !== test.expect.price) {
        ok = false;
        errors.push(`Expected price ${test.expect.price}, got ${rates[0]?.total_price}`);
      }
      
      if (test.expect.currency !== undefined && rates[0]?.currency !== test.expect.currency) {
        ok = false;
        errors.push(`Expected currency ${test.expect.currency}, got ${rates[0]?.currency}`);
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
