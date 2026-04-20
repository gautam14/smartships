/**
 * SmartShip — Shopify Carrier Service Registration
 *
 * Run this ONCE to register SmartShip as a carrier service in your Shopify store.
 * After registration, Shopify will call your endpoint on every checkout.
 *
 * Prerequisites:
 *   1. SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN set in .env
 *   2. Your server is deployed and publicly accessible (not localhost)
 *   3. Your Shopify plan supports carrier-calculated shipping
 *      (Required: Shopify plan or higher, or Advanced/Plus)
 *
 * Usage:
 *   node src/config/shopify-setup.js register
 *   node src/config/shopify-setup.js list
 *   node src/config/shopify-setup.js delete <id>
 */

require('dotenv').config();

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const API_VER = '2026-04';
const BASE = `https://${SHOP}/admin/api/${API_VER}`;

/**
 * Get the access token, either from .env or by exchanging Client ID/Secret
 */
async function getHeaders() {
  let token = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!token && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
    console.log('🔄 SHOPIFY_ADMIN_TOKEN missing.. Attempting to exchange Client ID/Secret...');

    try {
      const body = new URLSearchParams({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        grant_type: 'client_credentials'
      });

      const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error('❌ Failed to parse JSON response. Raw response:');
        console.error(text.substring(0, 500) + '...'); // Log first 500 chars
        process.exit(1);
      }

      if (!res.ok) {
        throw new Error(data.errors || data.error_description || 'Unknown error during token exchange');
      }

      token = data.access_token;
      console.log('✅ Token obtained successfully!');
    } catch (err) {
      console.error('❌ Token exchange failed:', err.message);
      process.exit(1);
    }
  }

  if (!token) {
    console.error('❌ Error: No authentication provided.');
    console.error('   Please set SHOPIFY_ADMIN_TOKEN or both SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env');
    process.exit(1);
  }

  return {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token,
    'User-Agent': 'SmartShip-Helper/1.0.0',
  };
}

async function registerCarrierService() {
  const headers = await getHeaders();
  const payload = {
    carrier_service: {
      name: 'SmartShip — Lil Helper',
      callback_url: process.env.SMARTSHIP_PUBLIC_URL + '/api/carrier-service/rates',
      service_discovery: true,
      format: 'json',
      active: true,
    },
  };

  const res = await fetch(`${BASE}/carrier_services.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Registration failed:', JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('✅ Carrier service registered!');
  console.log('   ID:', data.carrier_service.id);
  console.log('   Callback URL:', data.carrier_service.callback_url);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Go to Shopify Admin → Settings → Shipping and delivery');
  console.log('  2. Click your shipping profile → Add rate → "Use carrier or app to calculate rates"');
  console.log('  3. Select "SmartShip — Lil Helper"');
  console.log('  4. REMOVE all Shopify native rates from that profile');
}

async function listCarrierServices() {
  const headers = await getHeaders();
  const res = await fetch(`${BASE}/carrier_services.json`, { headers });
  const data = await res.json();
  console.log('Registered carrier services:');
  console.log(JSON.stringify(data.carrier_services, null, 2));
}

async function deleteCarrierService(id) {
  const headers = await getHeaders();
  const res = await fetch(`${BASE}/carrier_services/${id}.json`, { method: 'DELETE', headers });
  if (res.status === 200) console.log(`✅ Deleted carrier service ${id}`);
  else console.error('❌ Delete failed:', res.status);
}

const [, , command, arg] = process.argv;
switch (command) {
  case 'register': registerCarrierService(); break;
  case 'list': listCarrierServices(); break;
  case 'delete': deleteCarrierService(arg); break;
  default:
    console.log('Usage: node src/config/shopify-setup.js [register|list|delete <id>]');
}
