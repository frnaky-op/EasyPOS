const test = require('node:test');
const assert = require('node:assert/strict');
const Datastore = require('@seald-io/nedb');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createMobileApp } = require('../mobile/server');

test('paired phone can scan, create and update products without exposing inventory to unpaired phones', async t => {
  const inventoryDB = new Datastore({ inMemoryOnly: true, autoload: true });
  const categoryDB = new Datastore({ inMemoryOnly: true, autoload: true });
  await new Promise((resolve, reject) => categoryDB.insert({ _id: 7, name: 'Outillage' }, error => error ? reject(error) : resolve()));
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easypos-mobile-'));
  t.after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));
  const androidApkPath = path.join(uploadsDir, 'EasyPOS-Mobile.apk');
  fs.writeFileSync(androidApkPath, 'test apk');
  fs.writeFileSync(androidApkPath.replace(/\.apk$/, '.json'), JSON.stringify({
    packageId: 'com.easypos.companion', versionCode: 3, versionName: '1.2.0', size: 8,
    sha256: crypto.createHash('sha256').update('test apk').digest('hex'),
  }));
  const app = createMobileApp({ inventoryDB, categoryDB, uploadsDir, pairingCode: '12345678', androidApkPath, iosInstallUrl: 'https://testflight.apple.com/join/example' });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (route, options) => fetch(base + route, options);

  assert.equal((await get('/')).status, 200);
  assert.equal((await get('/scanner.js')).status, 200);
  assert.equal((await get('/pairing.js')).status, 200);
  assert.equal((await get('/api/mobile-update')).status, 401);
  assert.equal((await get('/connect')).status, 200);
  assert.equal((await get('/connect.js')).status, 200);
  assert.deepEqual(await (await get('/install-options')).json(), { android: true, ios: 'https://testflight.apple.com/join/example' });
  const apk = await get('/download/android');
  assert.equal(apk.status, 200);
  assert.match(apk.headers.get('content-disposition'), /EasyPOS-Mobile\.apk/);
  assert.equal(await apk.text(), 'test apk');
  const nativeOrigin = 'capacitor://localhost';
  const preflight = await get('/api/pair', { method: 'OPTIONS', headers: { Origin: nativeOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), nativeOrigin);
  const nativePair = await get('/api/pair', { method: 'POST', headers: { Origin: nativeOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '12345678' }) });
  const nativeToken = (await nativePair.json()).token;
  assert.match(nativeToken, /^[a-f0-9]{64}$/);
  const nativeSession = await get('/api/session', { headers: { Origin: nativeOrigin, Authorization: `Bearer ${nativeToken}` } });
  assert.equal(nativeSession.status, 200);
  const update = await (await get('/api/mobile-update', { headers: { Origin: nativeOrigin, Authorization: `Bearer ${nativeToken}` } })).json();
  assert.equal(update.android.versionCode, 3);
  assert.equal(update.android.size, 8);
  assert.equal(update.android.url, '/download/android');
  fs.writeFileSync(androidApkPath.replace(/\.apk$/, '.json'), JSON.stringify({ ...update.android, packageId: 'com.easypos.companion', size: 99 }));
  assert.equal((await (await get('/api/mobile-update', { headers: { Origin: nativeOrigin, Authorization: `Bearer ${nativeToken}` } })).json()).android, null);
  assert.equal(nativeSession.headers.get('access-control-allow-origin'), nativeOrigin);
  const nativeCsrf = (await nativeSession.json()).csrf;
  assert.equal((await get('/api/logout', { method: 'POST', headers: { Origin: nativeOrigin, Authorization: `Bearer ${nativeToken}`, 'x-mobile-csrf': nativeCsrf } })).status, 200);
  assert.equal((await get('/api/session', { headers: { Authorization: `Bearer ${nativeToken}` } })).status, 401);
  assert.equal((await get('/api/categories')).status, 401);
  assert.equal((await get('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '00000000' }) })).status, 401);
  const paired = await get('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '12345678' }) });
  assert.equal(paired.status, 200);
  const cookie = paired.headers.get('set-cookie').split(';')[0];
  const session = await (await get('/api/session', { headers: { Cookie: cookie } })).json();
  assert.ok(session.csrf);
  assert.equal((await get('/api/categories', { headers: { Cookie: cookie } })).status, 200);

  const form = new FormData();
  for (const [key, value] of Object.entries({ barcode: '6110001234567', name: 'Perceuse Bosch', price: '845,00', category: '7', quantity: '100', minStock: '5' })) form.set(key, value);
  assert.equal((await get('/api/product', { method: 'POST', headers: { Cookie: cookie }, body: form })).status, 403);
  const createdResponse = await get('/api/product', { method: 'POST', headers: { Cookie: cookie, 'x-mobile-csrf': session.csrf }, body: form });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).product;
  assert.equal(created.price, '845.00');
  assert.equal(created.quantity, 100);
  assert.equal((await get('/api/product', { method: 'POST', headers: { Cookie: cookie, 'x-mobile-csrf': session.csrf }, body: form })).status, 409);
  const lookedUp = await (await get('/api/product?barcode=6110001234567', { headers: { Cookie: cookie } })).json();
  assert.equal(lookedUp.product.id, created.id);
  form.set('id', String(created.id));
  form.set('quantity', '95');
  form.set('photo', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], { type: 'image/png' }), 'product.png');
  const updated = await get('/api/product', { method: 'POST', headers: { Cookie: cookie, 'x-mobile-csrf': session.csrf }, body: form });
  assert.equal(updated.status, 200);
  const updatedProduct = (await updated.json()).product;
  assert.equal(updatedProduct.quantity, 95);
  assert.ok(updatedProduct.image);
  assert.equal((await get(updatedProduct.image)).status, 401);
  assert.equal((await get(updatedProduct.image, { headers: { Cookie: cookie } })).status, 200);
  const nativeAgain = await get('/api/pair', { method: 'POST', headers: { Origin: nativeOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '12345678' }) });
  const imageToken = (await nativeAgain.json()).token;
  const imageSession = await (await get('/api/session', { headers: { Origin: nativeOrigin, Authorization: `Bearer ${imageToken}` } })).json();
  assert.equal((await get(updatedProduct.image, { headers: { Origin: nativeOrigin, Authorization: `Bearer ${imageToken}` } })).status, 200);
  form.set('quantity', '94');
  assert.equal((await get('/api/product', { method: 'POST', headers: { Origin: nativeOrigin, Authorization: `Bearer ${imageToken}`, 'x-mobile-csrf': imageSession.csrf }, body: form })).status, 200);
  assert.equal((await get('/api/products', { headers: { Cookie: cookie } })).status, 200);
  await new Promise((resolve, reject) => inventoryDB.insert([
    { _id: 4001, name: 'Vis en stock faible', barcode: 'LOW-1', quantity: 3, minStock: 5, stock: 1 },
    { _id: 4002, name: 'Vis en rupture', barcode: 'OUT-1', quantity: 0, minStock: 5, stock: 1 },
    { _id: 4003, name: 'Service sans stock', barcode: 'FREE-1', quantity: 0, minStock: 5, stock: 0 },
  ], error => error ? reject(error) : resolve()));
  const low = await (await get('/api/products?stock=low', { headers: { Cookie: cookie } })).json();
  const out = await (await get('/api/products?stock=out', { headers: { Cookie: cookie } })).json();
  assert.deepEqual(low.items.map(item => item.id), [4001]);
  assert.deepEqual(out.items.map(item => item.id), [4002]);
  assert.equal((await get('/api/products?stock=invalid', { headers: { Cookie: cookie } })).status, 400);
  assert.equal((await get('/api/product?barcode=6110001234567')).status, 401);
});

test('mobile checkout uses database prices and reduces stock only after valid payment', async t => {
  const inventoryDB = new Datastore({ inMemoryOnly: true, autoload: true });
  const categoryDB = new Datastore({ inMemoryOnly: true, autoload: true });
  const customerDB = new Datastore({ inMemoryOnly: true, autoload: true });
  const transactionsDB = new Datastore({ inMemoryOnly: true, autoload: true });
  const db = (store, method, ...args) => new Promise((resolve, reject) => store[method](...args, (error, value) => error ? reject(error) : resolve(value)));
  await db(inventoryDB, 'insert', { _id: 12, name: 'Tube PPR', barcode: '12345678', price: '42.00', quantity: 5, stock: 1, category: '7' });
  await db(customerDB, 'insert', { _id: 4, name: 'Client A' });
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easypos-mobile-sale-'));
  t.after(() => fs.rmSync(uploadsDir, { recursive: true, force: true }));
  const decrementInventory = (items, done) => {
    const item = items[0];
    inventoryDB.findOne({ _id: item.id }, (error, product) => {
      if (error) return done(error);
      if (product.quantity < item.quantity) return done(new Error('Insufficient stock.'));
      inventoryDB.update({ _id: item.id }, { $set: { quantity: product.quantity - item.quantity } }, {}, done);
    });
  };
  const app = createMobileApp({ inventoryDB, categoryDB, customerDB, transactionsDB, decrementInventory, uploadsDir, pairingCode: '12345678' });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const paired = await fetch(base + '/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '12345678' }) });
  const cookie = paired.headers.get('set-cookie').split(';')[0];
  const csrf = (await (await fetch(base + '/api/session', { headers: { Cookie: cookie } })).json()).csrf;
  const body = JSON.stringify({ items: [{ id: 12, quantity: 2, price: 0.01 }], paymentType: 'Cash', paid: 84, customerId: 4 });
  const post = (data, token = csrf, auth = cookie) => fetch(base + '/api/sale', { method: 'POST', headers: { Cookie: auth, 'Content-Type': 'application/json', 'x-mobile-csrf': token }, body: data });
  assert.equal((await post(body, csrf, '')).status, 401);
  assert.equal((await post(body, 'wrong')).status, 403);
  assert.equal((await post(JSON.stringify({ items: [{ id: 12, quantity: 2 }], paymentType: 'Cash', paid: 10 }))).status, 400);
  assert.equal((await db(inventoryDB, 'findOne', { _id: 12 })).quantity, 5);
  const sale = await post(body);
  assert.equal(sale.status, 201);
  assert.equal((await sale.json()).total, 84);
  assert.equal((await db(inventoryDB, 'findOne', { _id: 12 })).quantity, 3);
  const transactions = await db(transactionsDB, 'find', {});
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].customer.name, 'Client A');
  assert.equal(transactions[0].items[0].price, 42);
  assert.equal((await post(JSON.stringify({ items: [{ id: 12, quantity: 4 }], paymentType: 'Card', paid: 168 }))).status, 409);
  assert.equal((await db(transactionsDB, 'count', {})), 1);
  assert.equal((await fetch(base + '/icons/shopping-cart.svg')).status, 200);
});
