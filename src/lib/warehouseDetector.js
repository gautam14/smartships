/**
 * SmartShip — Warehouse Split Detector (Simplified)
 */

const WAREHOUSE_MAP = {
  '14225': 'USA',
  '51811': 'China',
  'L5T': 'Canada'
};

function detectWarehouseSplit(items, origin) {
  if (!origin || !origin.zip) return { isSplit: false, location: 'Unknown' };

  const zip = String(origin.zip).trim();
  let currentLocation = 'Canada'; // Default

  if (zip.startsWith('14225')) currentLocation = 'USA';
  else if (zip.startsWith('51811')) currentLocation = 'China';
  else if (zip.startsWith('L5T')) currentLocation = 'Canada';

  return { isSplit: false, location: currentLocation };
}

module.exports = { detectWarehouseSplit, WAREHOUSE_MAP };
