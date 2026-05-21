const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'smartship.log');

let requestCounter = 0;
let logStream = null;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getStream() {
  if (!logStream) {
    ensureLogDir();
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  }
  return logStream;
}

function timestamp() {
  return new Date().toISOString();
}

function nextRequestId() {
  return String(++requestCounter).padStart(5, '0');
}

function write(level, message, meta = {}) {
  const ts = timestamp();
  const rid = meta.requestId || '-';
  const metaStr = meta.shop ? ` [shop=${meta.shop}]` : '';
  const metaCustomer = meta.customer ? ` [customer=${meta.customer}]` : '';
  const metaDest = meta.destination ? ` [dest=${meta.destination}]` : '';
  const metaOrigin = meta.origin ? ` [origin=${meta.origin}]` : '';
  const extra = `${metaStr}${metaCustomer}${metaDest}${metaOrigin}`;

  const line = `[${ts}] [${rid}] [${level}]${extra} ${message}`;

  // Write to file (local dev / persistent storage)
  try {
    const stream = getStream();
    stream.write(line + '\n');
  } catch { /* silent */ }

  // Write to stdout/stderr (Railway captures this in dashboard)
  const dest = level === 'ERROR' ? process.stderr : process.stdout;
  dest.write(`[SmartShip] [${rid}] [${level}] ${message}${metaStr}${metaCustomer}${metaDest}${metaOrigin}\n`);

  return rid;
}

function close() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

module.exports = {
  info: (msg, meta) => write('INFO', msg, meta),
  warn: (msg, meta) => write('WARN', msg, meta),
  error: (msg, meta) => write('ERROR', msg, meta),
  nextRequestId,
  close,
};
