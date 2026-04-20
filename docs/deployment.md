# Deployment Guide

## Recommended: Railway (easiest, ~5 minutes)

1. Push the code to a GitHub repo
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Select the repo → Railway auto-detects Node.js
4. Add environment variables (Settings → Variables):
   - SHOPIFY_API_SECRET
   - SHOPIFY_ADMIN_TOKEN
   - SHOPIFY_STORE_DOMAIN
   - SHOPIFY_PUBLIC_URL (set AFTER Railway gives you a domain, e.g. https://smartship-production.up.railway.app)
   - NODE_ENV=production
5. Railway assigns a public URL → copy it → set as SMARTSHIP_PUBLIC_URL
6. Run: `npm run setup:shopify`

## Alternative: Render

Same flow. render.com → New Web Service → Connect GitHub → Free tier works fine.

## Alternative: Fly.io

```bash
npm install -g flyctl
flyctl launch
flyctl secrets set SHOPIFY_API_SECRET=xxx SHOPIFY_ADMIN_TOKEN=xxx ...
flyctl deploy
```

---

# Shopify Setup (after deploying)

## Step 1 — Register the carrier service
```bash
npm run setup:shopify
```

## Step 2 — Enable carrier-calculated shipping in your profile
1. Shopify Admin → Settings → Shipping and delivery
2. Click your shipping profile (likely "General shipping profile")
3. For each zone (Canada, United States, International):
   - Click "Add rate"
   - Select "Use carrier or app to calculate rates"
   - Choose "SmartShip — Lil Helper"
4. **DELETE all existing Shopify native flat rates from this profile**
   (If you leave them, customers see both sets of rates)

## Step 3 — Test
1. Open your store in an incognito window
2. Add any product to cart
3. Proceed to checkout
4. Enter a Canadian address → should see $9.99 or Free Shipping (not both)
5. Enter a US address → same
6. Check your server logs for the rate request

## Step 4 — Test split orders
Add a product from each warehouse to cart, proceed to checkout.
You should see ONE rate, not two.

---

# Shopify Plan Requirement

Carrier-calculated shipping at checkout requires **Shopify plan or higher** (not Basic).
If on Basic: upgrade temporarily, register the carrier service, then you can downgrade —
the service stays registered.

---

# Troubleshooting

**"No shipping available" at checkout**
→ Server is down or returning 500. Check /health endpoint.
→ SHOPIFY_API_SECRET may be wrong — HMAC verification failing.

**Seeing Shopify's native rates AND SmartShip rates**
→ You didn't remove Shopify's flat rates from the profile. Remove them.

**Rates not updating after config change**
→ Shopify caches carrier rates for ~5 min. Clear cache: Admin → Settings → Shipping → click your carrier → "Reset cache".

**Split orders still showing double charge**
→ Check WAREHOUSE_MAP in warehouseDetector.js — the fulfillment_service values must match what Shopify sends.
→ Test by logging req.body in carrier-service.js and checking items[].fulfillment_service.
