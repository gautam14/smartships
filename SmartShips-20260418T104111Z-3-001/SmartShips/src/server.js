/**
 * SmartShip — Express Server
 * Run:  node src/server.js
 */
require('dotenv').config();
const express = require('express');
const { carrierServiceHandler } = require('./routes/carrier-service');

const app = express();
const PORT = process.env.PORT || 3000;

// CRITICAL: capture raw body before JSON parse (needed for HMAC verification)
app.use((req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try { req.body = data ? JSON.parse(data) : {}; } catch { req.body = {}; }
    next();
  });
});

app.post('/api/carrier-service/rates', carrierServiceHandler);
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'SmartShip', timestamp: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`SmartShip running on port ${PORT}`);
  console.log(`Carrier endpoint: http://localhost:${PORT}/api/carrier-service/rates`);
});

module.exports = app;
