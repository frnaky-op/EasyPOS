const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const https = require('https');
const multer = require('multer');
const os = require('os');
const path = require('path');
const validator = require('validator');
const { readAndroidUpdate } = require('./update');

const SESSION_AGE_MS = 12 * 60 * 60 * 1000;
const COMPANION_ORIGINS = new Set(['capacitor://localhost', 'http://localhost', 'https://localhost']);
const imageTypes = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function mobileAddresses(port, protocol = 'http') {
  const addresses = [];
  for (const [name, interfaces] of Object.entries(os.networkInterfaces())) {
    for (const address of interfaces || []) {
      if (address.family === 'IPv4' && !address.internal) {
        const virtual = /virtual|vEthernet|VPN|Tailscale|WireGuard|Docker|Loopback/i.test(name);
        const preferred = /wi-?fi|wlan|ethernet/i.test(name);
        addresses.push({ url: `${protocol}://${address.address}:${port}/`, priority: virtual ? 2 : preferred ? 0 : 1 });
      }
    }
  }
  return [...new Set(addresses.sort((a, b) => a.priority - b.priority).map(entry => entry.url))];
}

function query(db, method, ...args) {
  return new Promise((resolve, reject) => db[method](...args, (error, ...result) => error ? reject(error) : resolve(result[0])));
}

function publicProduct(product) {
  if (!product) return null;
  return {
    id: product._id,
    barcode: validator.unescape(String(product.barcode || '')),
    name: validator.unescape(String(product.name || '')),
    category: String(product.category || ''),
    supplier: validator.unescape(String(product.supplier || '')),
    price: String(product.price || '0'),
    quantity: Number(product.quantity || 0),
    minStock: Number(product.minStock || 0),
    stock: product.stock !== 0,
    image: product.img ? `/api/image/${encodeURIComponent(path.basename(product.img))}` : '',
  };
}

function createMobileApp({ inventoryDB, categoryDB, customerDB, transactionsDB, decrementInventory, uploadsDir, pairingCode, androidApkPath, iosInstallUrl, iosVersionCode, iosVersionName }) {
  const app = express();
  const sessions = new Map();
  const failedPairs = new Map();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }).single('photo');
  const apkPath = androidApkPath || path.join(__dirname, 'downloads', 'EasyPOS-Mobile.apk');
  const apkManifestPath = apkPath.replace(/\.apk$/i, '.json');
  const iosUrl = typeof iosInstallUrl === 'string' && /^https:\/\//i.test(iosInstallUrl) ? iosInstallUrl : '';

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (COMPANION_ORIGINS.has(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-mobile-csrf',
        'Access-Control-Allow-Private-Network': 'true',
        'Vary': 'Origin',
      });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
    });
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  const page = path.join(__dirname, 'index.html');
  app.get('/', (_req, res) => res.sendFile(page));
  app.get('/connect', (_req, res) => res.sendFile(path.join(__dirname, 'connect.html')));
  app.get('/connect.css', (_req, res) => res.sendFile(path.join(__dirname, 'connect.css')));
  app.get('/connect.js', (_req, res) => res.sendFile(path.join(__dirname, 'connect.js')));
  app.get('/install-options', (_req, res) => res.json({ android: fs.existsSync(apkPath), ios: iosUrl }));
  app.get('/download/android', (_req, res) => {
    if (!fs.existsSync(apkPath)) return res.sendStatus(404);
    res.download(apkPath, 'EasyPOS-Mobile.apk');
  });
  app.get('/app.css', (_req, res) => res.sendFile(path.join(__dirname, 'app.css')));
  app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));
  app.get('/pairing.js', (_req, res) => res.sendFile(path.join(__dirname, 'pairing.js')));
  app.get('/scanner.js', (_req, res) => res.sendFile(require.resolve('@zxing/browser/umd/zxing-browser.min.js')));
  app.get('/catalog.tsv', (_req, res) => res.type('text/tab-separated-values').sendFile(path.join(__dirname, '..', 'assets', 'i18n', 'catalog.tsv')));
  app.get('/logo.png', (_req, res) => res.sendFile(path.join(__dirname, '..', 'assets', 'images', 'easypos-logo-concept.png')));
  app.get('/icons/:name', (req, res) => {
    const name = String(req.params.name || '');
    if (!/^[a-z-]+\.svg$/.test(name)) return res.sendStatus(404);
    res.sendFile(path.join(__dirname, '..', 'assets', 'icons', 'lucide', name), error => {
      if (error && !res.headersSent) res.sendStatus(404);
    });
  });

  function sessionFrom(req) {
    const bearer = String(req.get('authorization') || '').match(/^Bearer ([a-f0-9]{64})$/i);
    const match = String(req.headers.cookie || '').match(/(?:^|;\s*)easypos_mobile=([a-f0-9]{64})(?:;|$)/);
    const token = bearer ? bearer[1] : match && match[1];
    const session = token && sessions.get(token);
    if (!session) return null;
    if (session.expires < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return { token, session, bearer: Boolean(bearer) };
  }
  function requireSession(req, res, next) {
    const found = sessionFrom(req);
    if (!found) return res.status(401).json({ error: 'Session expirée. Saisissez le code de connexion.' });
    req.mobileSession = found;
    next();
  }
  function requireCsrf(req, res, next) {
    const header = String(req.get('x-mobile-csrf') || '');
    const expected = req.mobileSession.session.csrf;
    if (header.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
      return res.status(403).json({ error: 'Session invalide. Rechargez la page.' });
    }
    const origin = req.get('origin');
    if (origin) {
      try {
        if (req.mobileSession.bearer ? !COMPANION_ORIGINS.has(origin) : new URL(origin).host !== req.get('host')) return res.sendStatus(403);
      }
      catch { return res.sendStatus(403); }
    }
    next();
  }
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  app.post('/api/pair', (req, res) => {
    const key = req.ip;
    const attempt = failedPairs.get(key) || { count: 0, since: Date.now() };
    if (Date.now() - attempt.since > 15 * 60 * 1000) { attempt.count = 0; attempt.since = Date.now(); }
    if (attempt.count >= 10) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    const input = String(req.body && req.body.code || '');
    const valid = /^\d{8}$/.test(input) && crypto.timingSafeEqual(Buffer.from(input), Buffer.from(pairingCode));
    if (!valid) {
      attempt.count++;
      failedPairs.set(key, attempt);
      return res.status(401).json({ error: 'Code incorrect.' });
    }
    failedPairs.delete(key);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { csrf: crypto.randomBytes(24).toString('hex'), expires: Date.now() + SESSION_AGE_MS });
    res.setHeader('Set-Cookie', `easypos_mobile=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);
    res.json(COMPANION_ORIGINS.has(req.get('origin')) ? { ok: true, token } : { ok: true });
  });
  app.get('/api/session', requireSession, (req, res) => res.json({ csrf: req.mobileSession.session.csrf }));
  app.get('/api/mobile-update', requireSession, (_req, res) => {
    const iosBuild = Number(iosVersionCode);
    res.json({ android: readAndroidUpdate(apkPath, apkManifestPath),
      ios: iosUrl && Number.isSafeInteger(iosBuild) && iosBuild > 0
        ? { versionCode: iosBuild, versionName: String(iosVersionName || iosBuild), url: iosUrl } : null });
  });
  app.post('/api/logout', requireSession, requireCsrf, (req, res) => {
    sessions.delete(req.mobileSession.token);
    res.setHeader('Set-Cookie', 'easypos_mobile=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  app.get('/api/categories', requireSession, wrap(async (_req, res) => {
    const categories = await query(categoryDB, 'find', {});
    res.json(categories.map(item => ({ id: String(item._id), name: validator.unescape(String(item.name || '')) })).sort((a, b) => a.name.localeCompare(b.name)));
  }));
  app.get('/api/product', requireSession, wrap(async (req, res) => {
    const barcode = String(req.query.barcode || '').trim();
    if (!barcode || barcode.length > 80) return res.status(400).json({ error: 'Code-barres invalide.' });
    const escaped = validator.escape(barcode);
    const numeric = Number(barcode);
    const values = [escaped];
    if (Number.isSafeInteger(numeric)) values.push(numeric);
    let product = await query(inventoryDB, 'findOne', { barcode: { $in: values } });
    if (!product && Number.isSafeInteger(numeric)) product = await query(inventoryDB, 'findOne', { _id: numeric });
    res.json({ product: publicProduct(product) });
  }));
  app.get('/api/products', requireSession, wrap(async (req, res) => {
    const search = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    const stock = String(req.query.stock || 'all');
    const page = Number(req.query.page || 1);
    if (search.length > 80 || category.length > 80 || !['all', 'low', 'out'].includes(stock) || !Number.isSafeInteger(page) || page < 1) return res.status(400).json({ error: 'Recherche invalide.' });
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const filter = { ...(search ? { $or: [{ name: pattern }, { barcode: pattern }] } : {}), ...(category ? { category } : {}) };
    if (stock === 'out') filter.$where = function () { return this.stock !== 0 && Number(this.quantity || 0) <= 0; };
    if (stock === 'low') filter.$where = function () { const quantity = Number(this.quantity || 0); return this.stock !== 0 && quantity > 0 && quantity <= Number(this.minStock || 0); };
    const total = await query(inventoryDB, 'count', filter);
    const items = await new Promise((resolve, reject) => inventoryDB.find(filter).sort({ _id: -1 }).skip((page - 1) * 24).limit(24).exec((error, rows) => error ? reject(error) : resolve(rows)));
    res.json({ items: items.map(publicProduct), total, page, pageSize: 24 });
  }));
  app.get('/api/customers', requireSession, wrap(async (_req, res) => {
    if (!customerDB) return res.json([]);
    const customers = await query(customerDB, 'find', {});
    res.json(customers.map(customer => ({ id: customer._id, name: validator.unescape(String(customer.name || '')) })).filter(customer => customer.name).sort((a, b) => a.name.localeCompare(b.name)));
  }));
  app.post('/api/sale', requireSession, requireCsrf, wrap(async (req, res) => {
    if (!transactionsDB || !decrementInventory) return res.status(503).json({ error: 'Caisse mobile indisponible.' });
    const lines = req.body && req.body.items;
    const method = String(req.body && req.body.paymentType || '');
    const paid = Number(req.body && req.body.paid);
    const customerId = req.body && req.body.customerId;
    if (!Array.isArray(lines) || !lines.length || lines.length > 100 || !['Cash', 'Card'].includes(method) ||
      !Number.isFinite(paid) || paid < 0 || lines.some(line => !Number.isSafeInteger(Number(line.id)) || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) < 1 || Number(line.quantity) > 10000)) {
      return res.status(400).json({ error: 'Vérifiez le panier et le paiement.' });
    }
    const quantities = new Map();
    for (const line of lines) quantities.set(Number(line.id), (quantities.get(Number(line.id)) || 0) + Number(line.quantity));
    const products = await query(inventoryDB, 'find', { _id: { $in: [...quantities.keys()] } });
    if (products.length !== quantities.size) return res.status(409).json({ error: 'Un produit du panier est introuvable.' });
    const items = products.map(product => ({
      id: product._id, sku: validator.unescape(String(product.barcode || product._id)),
      product_name: validator.unescape(String(product.name || '')), price: Number(product.price), quantity: quantities.get(product._id),
    }));
    if (items.some(item => !Number.isFinite(item.price) || item.price < 0)) return res.status(409).json({ error: 'Prix produit invalide.' });
    const totalCents = items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
    const paidCents = Math.round(paid * 100);
    if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(paidCents) || paidCents < totalCents) return res.status(400).json({ error: 'Le paiement doit couvrir le total.' });
    const total = totalCents / 100;
    let customer = '0';
    if (customerId !== undefined && customerId !== null && customerId !== '') {
      if (!customerDB || !Number.isSafeInteger(Number(customerId))) return res.status(400).json({ error: 'Client invalide.' });
      const found = await query(customerDB, 'findOne', { _id: Number(customerId) });
      if (!found) return res.status(400).json({ error: 'Client introuvable.' });
      customer = { id: found._id, name: validator.unescape(String(found.name || '')) };
    }
    const order = Date.now() * 1000 + crypto.randomInt(1000);
    const transaction = {
      _id: order, order, ref_number: '', discount: 0, customer, status: 1,
      subtotal: total.toFixed(2), tax: 0, order_type: 1, items, date: new Date().toISOString(),
      payment_type: method, payment_info: '', total, paid: (paidCents / 100).toFixed(2),
      change: ((paidCents - totalCents) / 100).toFixed(2), till: 'Mobile', mac: '', user: 'Mobile', user_id: 0,
    };
    await query(transactionsDB, 'insert', transaction);
    try {
      await new Promise((resolve, reject) => decrementInventory(items, error => error ? reject(error) : resolve(), String(order)));
    } catch (error) {
      await query(transactionsDB, 'remove', { _id: order }, {}).catch(rollbackError => console.error('Could not remove failed mobile sale:', rollbackError));
      return res.status(409).json({ error: error.message });
    }
    res.status(201).json({ order, total, change: Number(transaction.change) });
  }));
  app.get('/api/image/:name', requireSession, (req, res) => {
    const name = req.params.name;
    if (name !== path.basename(name) || !/^[a-zA-Z0-9._-]+$/.test(name)) return res.sendStatus(400);
    res.sendFile(path.join(uploadsDir, name), error => { if (error && !res.headersSent) res.sendStatus(404); });
  });
  app.post('/api/product', requireSession, requireCsrf, (req, res, next) => upload(req, res, error => {
    if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Photo limitée à 2 Mo.' : 'Photo invalide.' });
    next();
  }), wrap(async (req, res) => {
    const body = req.body || {};
    const id = body.id ? Number(body.id) : null;
    const barcode = String(body.barcode || '').trim();
    const name = String(body.name || '').trim();
    const price = String(body.price || '').trim().replace(',', '.');
    const quantity = Number(body.quantity === '' || body.quantity === undefined ? 100 : body.quantity);
    const minStock = Number(body.minStock === '' || body.minStock === undefined ? 5 : body.minStock);
    const category = String(body.category || '');
    const supplier = String(body.supplier || '').trim();
    if ((id !== null && !Number.isSafeInteger(id)) || !barcode || barcode.length > 80 || !name || name.length > 180 ||
        !/^\d{1,8}(?:\.\d{1,2})?$/.test(price) || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000 ||
        !Number.isSafeInteger(minStock) || minStock < 0 || minStock > 1000000 || !category || supplier.length > 120) {
      return res.status(400).json({ error: 'Vérifiez le nom, le code, la catégorie, le prix et le stock.' });
    }
    const categories = await query(categoryDB, 'find', {});
    if (!categories.some(item => String(item._id) === category)) return res.status(400).json({ error: 'Catégorie inconnue.' });
    const existing = id === null ? null : await query(inventoryDB, 'findOne', { _id: id });
    if (id !== null && !existing) return res.status(404).json({ error: 'Produit introuvable.' });
    const numericBarcode = Number(barcode);
    const barcodeValues = [validator.escape(barcode)];
    if (Number.isSafeInteger(numericBarcode)) barcodeValues.push(numericBarcode);
    const duplicate = await query(inventoryDB, 'findOne', { barcode: { $in: barcodeValues } });
    if (duplicate && duplicate._id !== id) return res.status(409).json({ error: 'Ce code-barres appartient déjà à un produit.', product: publicProduct(duplicate) });
    let image = existing && existing.img || '';
    if (req.file) {
      const extension = imageTypes[req.file.mimetype];
      const signature = req.file.buffer;
      const validImage = extension && (
        (extension === '.jpg' && signature[0] === 0xff && signature[1] === 0xd8) ||
        (extension === '.png' && signature.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
        (extension === '.webp' && signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP')
      );
      if (!validImage) return res.status(400).json({ error: 'Utilisez une photo JPG, PNG ou WebP.' });
      image = `${crypto.randomBytes(16).toString('hex')}${extension}`;
      await fs.promises.mkdir(uploadsDir, { recursive: true });
      await fs.promises.writeFile(path.join(uploadsDir, image), signature, { flag: 'wx' });
    }
    const product = {
      barcode: validator.escape(barcode), name: validator.escape(name), category,
      supplier: validator.escape(supplier), price: price, quantity, minStock,
      stock: existing ? existing.stock : 1, img: image, priceBasis: 'manual', reviewRequired: false,
    };
    try {
      if (existing) {
        await query(inventoryDB, 'update', { _id: id }, { $set: product }, {});
        return res.json({ product: publicProduct({ ...existing, ...product }) });
      }
      product._id = Number(`${Date.now()}${crypto.randomInt(1000).toString().padStart(3, '0')}`);
      const inserted = await query(inventoryDB, 'insert', product);
      res.status(201).json({ product: publicProduct(inserted) });
    } catch (error) {
      if (req.file) await fs.promises.unlink(path.join(uploadsDir, image)).catch(() => {});
      throw error;
    }
  }));
  app.use((error, _req, res, _next) => {
    console.error('Mobile catalogue error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Une erreur est survenue. Réessayez.' });
  });
  return app;
}

function startMobileServer(options) {
  const port = Number(process.env.MOBILE_PORT || 3211);
  const pairingCode = crypto.randomInt(10000000, 100000000).toString();
  const app = createMobileApp({ ...options, pairingCode,
    androidApkPath: options.androidApkPath || process.env.MOBILE_ANDROID_APK,
    iosInstallUrl: options.iosInstallUrl || process.env.MOBILE_IOS_INSTALL_URL,
    iosVersionCode: options.iosVersionCode || process.env.MOBILE_IOS_VERSION_CODE,
    iosVersionName: options.iosVersionName || process.env.MOBILE_IOS_VERSION_NAME });
  const certPath = process.env.MOBILE_TLS_CERT;
  const keyPath = process.env.MOBILE_TLS_KEY;
  let tlsOptions;
  if (certPath && keyPath) {
    try { tlsOptions = { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }; }
    catch (error) { console.error('Mobile HTTPS unavailable; using HTTP:', error.message); }
  } else if (certPath || keyPath) console.error('Mobile HTTPS requires both MOBILE_TLS_CERT and MOBILE_TLS_KEY; using HTTP');
  let secure = false;
  let ready = false;
  let server;
  if (tlsOptions) {
    try { server = https.createServer(tlsOptions, app); secure = true; }
    catch (error) { console.error('Mobile HTTPS certificate invalid; using HTTP:', error.message); }
  }
  if (!server) server = require('http').createServer(app);
  server.listen(port, '0.0.0.0', () => { ready = true; console.log(`Mobile catalogue listening on ${secure ? 'https' : 'http'} port ${port}`); });
  server.on('error', error => { ready = false; console.error('Mobile catalogue unavailable:', error); });
  return { server, info: () => ({ code: pairingCode, urls: ready ? mobileAddresses(port, secure ? 'https' : 'http') : [], port, ready, secure }) };
}

module.exports = { createMobileApp, startMobileServer, mobileAddresses };
