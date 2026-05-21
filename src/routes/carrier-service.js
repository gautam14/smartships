/**
 * SmartShip — Carrier Service Endpoint
 */

const { evaluateRates } = require('../lib/rateEngine');
const { verifyShopifyHmac } = require('../lib/auth');
const logger = require('../lib/logger');

async function carrierServiceHandler(req, res) {
  const requestId = logger.nextRequestId();
  const shopDomain = req.headers['x-shopify-shop-domain'] || 'unknown';
  const meta = { requestId, shop: shopDomain };

  console.log(`\n[${requestId}] ━━━ INCOMING RATE REQUEST ━━━`);
  console.log(`[${requestId}] Timestamp:`, new Date().toISOString());

  logger.info(`Rate request started`, meta);

  // 1. Verify HMAC
  const hmacValid = verifyShopifyHmac(req);
  if (!hmacValid) {
    console.warn(`[${requestId}] [SmartShip] ⚠️  HMAC Auth Failed (Request rejected)`);
    logger.warn(`HMAC auth failed`, meta);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  console.log(`[${requestId}] [SmartShip] ✅ Auth Verified`);

  try {
    const { rate: rateRequest } = req.body;

    if (!rateRequest) {
      console.error(`[${requestId}] [SmartShip] ❌ Missing rate request body`);
      logger.error(`BACKUP RATE TRIGGERED - Missing rate request body`, meta);
      return res.status(400).json({ error: 'Missing rate request body' });
    }

    // Calculate subtotal for this shipment
    const subtotalCents = (rateRequest.items || []).reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const subtotalFormatted = (subtotalCents / 100).toFixed(2);

    // Detect Warehouse
    const zip = rateRequest.origin?.zip || rateRequest.origin?.postal_code || '';
    let warehouse = 'Canada';
    if (zip.startsWith('14225')) warehouse = 'USA';
    else if (zip.startsWith('51811')) warehouse = 'China';
    else if (zip.startsWith('L5T')) warehouse = 'Canada';
    else warehouse = `Other (${zip || 'Unknown'})`;

    // Collect order details for logging
    const dest = rateRequest.destination || {};
    const customerName = dest.name || 'Guest Customer';
    const destCountry = dest.country || dest.country_code || 'Unknown';
    const destProvince = dest.province || '';
    const destZip = dest.postal_code || '';
    const email = dest.email || rateRequest.email || '';
    const originZip = rateRequest.origin?.zip || rateRequest.origin?.postal_code || 'Unknown';
    const itemCount = rateRequest.items?.length || 0;
    const originCountry = rateRequest.origin?.country || '';

    Object.assign(meta, {
      customer: customerName,
      destination: `${destZip} ${destProvince} ${destCountry}`,
      origin: `${originZip} ${originCountry}`,
    });

    // Log full request details to file
    logger.info(`Request details`, {
      ...meta,
      warehouse,
      items: itemCount,
      subtotal: subtotalFormatted,
      email,
    });

    // 2. Calculate rates
    const rates = await evaluateRates(rateRequest, shopDomain, meta);

    // Log Summary
    const ratesSummary = rates.length
      ? rates.map(r => `${r.service_name}: $${r.total_price / 100}`).join(', ')
      : 'NONE';

    console.log(`[${requestId}] [Summary] Warehouse: ${warehouse} | Shipment Subtotal: $${subtotalFormatted}`);
    console.log(`[${requestId}] Returning rates: ${ratesSummary}`);
    console.log(`[${requestId}] ━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    if (rates.length === 0) {
      logger.warn(`BACKUP RATE TRIGGERED - No rates returned from evaluateRates`, {
        ...meta,
        warehouse,
        subtotal: subtotalFormatted,
        items: itemCount,
      });
    } else {
      logger.info(`Rates returned successfully`, {
        ...meta,
        rates: ratesSummary,
      });
    }

    // 3. Return to Shopify
    return res.status(200).json({ rates });

  } catch (err) {
    console.error(`[${requestId}] [SmartShip] ❌ Rate calculation error:`, err);
    logger.error(`BACKUP RATE TRIGGERED - Rate calculation error`, {
      ...meta,
      error: err.message,
      stack: err.stack,
    });
    return res.status(200).json({ rates: [] });
  }
}

module.exports = { carrierServiceHandler };
