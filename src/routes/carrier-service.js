/**
 * SmartShip — Carrier Service Endpoint
 */

const { evaluateRates } = require('../lib/rateEngine');
const { verifyShopifyHmac } = require('../lib/auth');

async function carrierServiceHandler(req, res) {
  // Log incoming request for debugging
  console.log('\n━━━ INCOMING RATE REQUEST ━━━');
  console.log('Timestamp:', new Date().toISOString());
  
  // 1. Verify HMAC
  const hmacValid = verifyShopifyHmac(req);
  if (!hmacValid) {
    console.error('[SmartShip] ❌ HMAC verification failed');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { rate: rateRequest } = req.body;

    if (!rateRequest) {
      console.error('[SmartShip] ❌ Missing rate request body');
      return res.status(400).json({ error: 'Missing rate request body' });
    }

    // Log key request details
    console.log('Session ID:', rateRequest.id || 'MISSING');
    console.log('Origin ZIP:', rateRequest.origin?.zip || 'unknown');
    console.log('Destination:', `${rateRequest.destination?.country} ${rateRequest.destination?.postal_code || ''}`);
    console.log('Items:', rateRequest.items?.length || 0);

    // 2. Calculate rates
    const rates = await evaluateRates(rateRequest);

    console.log('Returning rates:', rates.map(r => `${r.service_name}: $${r.total_price/100}`).join(', '));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 3. Return to Shopify
    return res.status(200).json({ rates });

  } catch (err) {
    console.error('[SmartShip] ❌ Rate calculation error:', err);
    return res.status(200).json({ rates: [] });
  }
}

module.exports = { carrierServiceHandler };
