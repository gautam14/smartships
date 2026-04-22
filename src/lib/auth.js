/**
 * SmartShip — Shopify Request Authentication
 *
 * Shopify signs every carrier service request with an HMAC-SHA256 signature
 * using your app's shared secret. We must verify this on every request.
 *
 * Without this, anyone who discovers your endpoint URL could spoof requests.
 *
 * Shopify docs: https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/getting-started-with-client-secret
 */

const crypto = require('crypto');

/**
 * Verify that a request came from Shopify.
 *
 * Shopify sends the HMAC in the X-Shopify-Hmac-Sha256 header.
 * We recompute it from the raw request body and compare.
 *
 * IMPORTANT: This requires the raw (unparsed) request body.
 * In Express, use express.raw() or store rawBody in a middleware — see server.js.
 *
 * @param {Express.Request} req
 * @returns {boolean}
 */
function verifyShopifyHmac(req) {
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    console.error('[SmartShip] ❌ HMAC Auth Error: SHOPIFY_API_SECRET missing in .env');
    return process.env.NODE_ENV !== 'production';
  }

  const receivedHmac = req.headers['x-shopify-hmac-sha256'];
  if (!receivedHmac) {
    console.warn('[SmartShip] ⚠️  HMAC Auth Error: No HMAC header on request');
    return false;
  }

  // Use the raw body for HMAC — parsed JSON will produce a different hash
  const rawBody = req.rawBody || JSON.stringify(req.body);

  const computedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  // Use timingSafeEqual to prevent timing attacks
  try {
    const received = Buffer.from(receivedHmac, 'base64');
    const computed = Buffer.from(computedHmac, 'base64');

    if (received.length !== computed.length) return false;

    return crypto.timingSafeEqual(received, computed);
  } catch {
    return false;
  }
}

module.exports = { verifyShopifyHmac };
