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

const SHOP    = process.env.SHOPIFY_STORE_DOMAIN; // e.g. lil-helper.myshopify.com
const TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN;  // Admin API access token
const API_VER = '2024-10';
const BASE    = `https://${SHOP}/admin/api/${API_VER}`;

const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': TOKEN,
};

async function registerCarrierService() {
  const payload = {
    carrier_service: {
      name:              'SmartShip — Lil Helper',
      callback_url:      process.env.SMARTSHIP_PUBLIC_URL + '/api/carrier-service/rates',
      service_discovery: true,   // Shopify caches rates — true = always call our endpoint
      format:            'json',
      active:            true,
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
  const res = await fetch(`${BASE}/carrier_services.json`, { headers });
  const data = await res.json();
  console.log('Registered carrier services:');
  console.log(JSON.stringify(data.carrier_services, null, 2));
}

async function deleteCarrierService(id) {
  const res = await fetch(`${BASE}/carrier_services/${id}.json`, { method: 'DELETE', headers });
  if (res.status === 200) console.log(`✅ Deleted carrier service ${id}`);
  else console.error('❌ Delete failed:', res.status);
}

const [,, command, arg] = process.argv;
switch (command) {
  case 'register': registerCarrierService(); break;
  case 'list':     listCarrierServices();    break;
  case 'delete':   deleteCarrierService(arg); break;
  default:
    console.log('Usage: node src/config/shopify-setup.js [register|list|delete <id>]');
}
