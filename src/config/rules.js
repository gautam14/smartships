/**
 * SmartShip — Simplified Flat Rate Rules
 * 
 * US: $9.99 flat
 * CA: $9.99 flat  
 * International: $20 flat
 */

const ZONES = {
  canada: {
    label: 'Canada',
    countries: ['CA'],
  },
  usa: {
    label: 'United States',
    countries: ['US'],
  },
  international: {
    label: 'International',
    countries: [
      'GB', 'AU', 'DE', 'FR', 'JP', 'MX', 'BR', 'IN', 'NL', 'ES',
      'IT', 'SE', 'NO', 'DK', 'FI', 'NZ', 'KR', 'SG', 'HK', 'IE',
      'CH', 'AT', 'BE', 'PT', 'PL', 'CZ', 'AR', 'CL', 'ZA', 'AE',
      'SA', 'TR', 'ID', 'TH', 'MY', 'PH', 'VN', 'IL', 'EG', 'NG',
    ],
  },
};

const RULES = [
  {
    id: 'ca-flat',
    name: 'Standard Shipping',
    zone: 'canada',
    price: 9.99,
    currency: 'CAD',
  },
  {
    id: 'us-flat',
    name: 'Standard Shipping',
    zone: 'usa',
    price: 9.99,
    currency: 'USD',
  },
  {
    id: 'intl-flat',
    name: 'International Shipping',
    zone: 'international',
    price: 20.00,
    currency: 'USD',
  },
];

module.exports = { ZONES, RULES };
