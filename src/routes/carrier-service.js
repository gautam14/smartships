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

    // Calculate subtotal for this shipment
    const subtotalCents = (rateRequest.items || []).reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const subtotalFormatted = (subtotalCents / 100).toFixed(2);

    // Detect Warehouse
    const zip = rateRequest.origin?.zip || '';
    let warehouse = 'Canada';
    if (zip.startsWith('14225')) warehouse = 'USA';
    else if (zip.startsWith('51811')) warehouse = 'China';
    else if (zip.startsWith('L5T')) warehouse = 'Canada';
    else warehouse = `Other (${zip || 'Unknown'})`;

    // 2. Calculate rates
    const shopDomain = req.headers['x-shopify-shop-domain'] || 'unknown';
    const rates = await evaluateRates(rateRequest, shopDomain);

    // Log Summary
    console.log(`[Summary] Warehouse: ${warehouse} | Shipment Subtotal: $${subtotalFormatted}`);
    console.log('Returning rates:', rates.map(r => `${r.service_name}: $${r.total_price / 100}`).join(', '));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 3. Return to Shopify
    return res.status(200).json({ rates });

  } catch (err) {
    console.error('[SmartShip] ❌ Rate calculation error:', err);
    return res.status(200).json({ rates: [] });
  }
}

module.exports = { carrierServiceHandler };
