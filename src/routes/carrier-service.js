/**
 * SmartShip — Shopify Carrier Service Endpoint
 * POST /api/carrier-service/rates
 *
 * Shopify calls this URL every time a customer reaches the shipping step.
 * It sends the cart + destination; we return consolidated rates.
 *
 * Shopify docs: https://shopify.dev/docs/apps/selling-strategies/shipping/rate-calculation
 */

const { evaluateRates } = require('../lib/rateEngine');
const { verifyShopifyHmac } = require('../lib/auth');

/**
 * Express route handler.
 * Mount at: app.post('/api/carrier-service/rates', carrierServiceHandler)
 */
async function carrierServiceHandler(req, res) {
  // 1. Verify this request actually came from Shopify
  const hmacValid = verifyShopifyHmac(req);
  if (!hmacValid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { rate: rateRequest } = req.body;

    if (!rateRequest) {
      return res.status(400).json({ error: 'Missing rate request body' });
    }

    // 2. Run the rate engine — this is where all the magic happens
    const rates = await evaluateRates(rateRequest);

    // 3. Return in Shopify's expected format
    return res.status(200).json({ rates });

  } catch (err) {
    console.error('[SmartShip] Rate calculation error:', err);
    // IMPORTANT: Return empty array on error, not 500.
    // A 500 causes Shopify to show "No shipping available" — worse than a fallback.
    return res.status(200).json({ rates: [] });
  }
}

module.exports = { carrierServiceHandler };
