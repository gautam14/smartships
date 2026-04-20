/**
 * SmartShip — Warehouse Split Detector
 *
 * Determines whether the items in a cart will be fulfilled
 * from more than one physical location.
 *
 * How Shopify signals location:
 * Each line item in the rate request includes a `fulfillment_service` field.
 * When you use multiple locations in Shopify, items stocked only at a specific
 * location will have that location's fulfillment service ID attached.
 *
 * For Lil Helper specifically:
 * - Items in Mississauga, ON → fulfillment_service: "lil-helper-canada" (or "manual" if default)
 * - Items in New York, NY    → fulfillment_service: "lil-helper-us"
 *
 * SETUP REQUIRED:
 * In your Shopify admin → Settings → Shipping and delivery → Custom shipping,
 * note the fulfillment service names for each location and update WAREHOUSE_MAP below.
 */

/**
 * Map your Shopify fulfillment service names to human-readable warehouse names.
 * 
 * To find your fulfillment service name:
 * Admin → Settings → Shipping and delivery → scroll to "Fulfillment and delivery"
 * Or check via API: GET /admin/api/2024-01/fulfillment_services.json
 */
const WAREHOUSE_MAP = {
  // Shopify fulfillment service value → warehouse label
  'manual':              'Mississauga, ON',   // Shopify's default for your primary location
  'lil-helper-canada':   'Mississauga, ON',   // If you've named it explicitly
  'lil-helper-us':       'New York, NY',
  // Add more as needed:
  // 'china-warehouse':  'Shenzhen, CN',
};

/**
 * Detect whether a cart's items span more than one fulfillment location.
 *
 * @param {Array} items - Shopify line items from the rate request
 * @returns {{ isSplit: boolean, locations: string[] }}
 */
function detectWarehouseSplit(items) {
  const locationSet = new Set();

  for (const item of items) {
    // Only evaluate items that require shipping
    if (!item.requires_shipping) continue;

    const service = item.fulfillment_service || 'manual';
    const warehouseLabel = WAREHOUSE_MAP[service] || service;
    locationSet.add(warehouseLabel);
  }

  const locations = Array.from(locationSet);
  const isSplit = locations.length > 1;

  if (isSplit) {
    console.log(`[SmartShip] Split order detected — locations: ${locations.join(', ')}`);
  }

  return { isSplit, locations };
}

/**
 * Helper: Given a list of items, group them by warehouse.
 * Useful for logging and admin dashboards.
 */
function groupItemsByWarehouse(items) {
  const groups = {};

  for (const item of items) {
    if (!item.requires_shipping) continue;
    const service = item.fulfillment_service || 'manual';
    const label = WAREHOUSE_MAP[service] || service;
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }

  return groups;
}

module.exports = { detectWarehouseSplit, groupItemsByWarehouse, WAREHOUSE_MAP };
