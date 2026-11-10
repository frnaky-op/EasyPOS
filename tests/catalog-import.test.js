const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { ZipArchive } = require('archiver');

function makePackage(products, image) {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive();
    const chunks = [];
    archive.on('data', chunk => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.append(JSON.stringify({ format: 'pharmaspot-catalog', version: 1, products }), { name: 'manifest.json' });
    archive.append(image, { name: 'images/images/sample.jpg' });
    archive.finalize();
  });
}

test('catalogue ZIP imports images, creates categories, and skips repeats', async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmaspot-catalog-'));
  process.env.APPDATA = appData;
  process.env.APPNAME = 'catalog-test';
  fs.mkdirSync(path.join(appData, 'catalog-test', 'server', 'databases'), { recursive: true });
  fs.mkdirSync(path.join(appData, 'catalog-test', 'uploads'), { recursive: true });
  const app = express();
  app.use('/api/categories', require('../api/categories'));
  app.use('/api/inventory', require('../api/inventory'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const image = fs.readFileSync(path.join(__dirname, '..', 'public', 'uploads', 'product_image', 'default.jpg'));
  const products = ['one', 'two', 'three'].map((key, index) => ({
    source_key: `test:${key}`, name: `Test item ${index + 1}`, department: 'Plumbing',
    category: 'PPR', supplier: 'Example', image_path: 'images/sample.jpg',
    source_url: `https://example.com/${key}`, record_type: 'product_range',
    selling_price_mad: index === 0 ? '0.00' : '12.50',
    opening_quantity: index === 0 ? '0' : index === 1 ? '5' : undefined,
    barcode: index === 0 ? '' : '001234',
  }));
  const packageBytes = await makePackage(products, image);
  const sendPackage = async () => {
    const form = new FormData();
    form.append('package', new Blob([packageBytes], { type: 'application/zip' }), 'sample.zip');
    return fetch(`${base}/inventory/import-package`, { method: 'POST', body: form });
  };
  try {
    const first = await sendPackage();
    assert.equal(first.status, 200, first.status === 200 ? '' : await first.text());
    assert.deepEqual(await first.json(), { added: 3, skipped: 0, total: 3 });
    const second = await sendPackage();
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { added: 0, skipped: 3, total: 3 });
    const imported = await (await fetch(`${base}/inventory/products`)).json();
    assert.equal(imported.length, 3);
    assert.ok(imported.every(p => p.sourceKey && p.img));
    assert.ok(imported.some(p => p.price === '0.00' && p.quantity === '0'));
    assert.ok(imported.some(p => p.price === '12.50' && p.quantity === '5' && p.barcode === '001234'));
    assert.ok(imported.some(p => p.quantity === '100'));
    const barcodeResponse = await fetch(`${base}/inventory/product/sku`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skuCode: '001234' }),
    });
    assert.equal((await barcodeResponse.json()).barcode, '001234');
    assert.equal(imported[0].img, imported[1].img);
    assert.ok(fs.existsSync(path.join(appData, 'catalog-test', 'uploads', imported[0].img)));
    const categories = await (await fetch(`${base}/categories/all`)).json();
    assert.equal(categories.length, 1);
    assert.equal(categories[0].name, 'Plumbing - PPR');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(appData, { recursive: true, force: true });
  }
});
