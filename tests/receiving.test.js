const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('supplier receipt increases each product once and records movements', async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmaspot-receiving-'));
  process.env.APPDATA = appData;
  process.env.APPNAME = 'test-receiving';
  fs.mkdirSync(path.join(appData, 'test-receiving', 'server', 'databases'), { recursive: true });
  fs.mkdirSync(path.join(appData, 'test-receiving', 'uploads'), { recursive: true });
  const server = require('../api/inventory').listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  async function createProduct(name, barcode) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      id: '', barcode, expirationDate: '', price: '12.00', category: 'PPR',
      supplier: 'Araplast', quantity: '10', name, minStock: '2', img: '', remove: '0',
    })) form.append(key, value);
    assert.equal((await fetch(`${base}/product`, { method: 'POST', body: form })).status, 200);
    return (await fetch(`${base}/products`).then(r => r.json())).find(product => product.name === name);
  }

  try {
    const pipe = await createProduct('PPR pipe', 'PPR-20');
    const fitting = await createProduct('PPR fitting', 'PPR-21');
    const receipt = {
      supplier: 'Araplast', reference: 'BL-100', receivedAt: '2026-11-10',
      lines: [
        { productId: pipe._id, quantity: 5, unitCost: 2.4 },
        { productId: fitting._id, quantity: 3, unitCost: 1.25 },
      ],
    };
    const post = body => fetch(`${base}/receiving`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const response = await post(receipt);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).total, 15.75);
    assert.equal(Number((await fetch(`${base}/product/${pipe._id}`).then(r => r.json())).quantity), 15);
    assert.equal(Number((await fetch(`${base}/product/${fitting._id}`).then(r => r.json())).quantity), 13);
    assert.equal((await post(receipt)).status, 409);
    assert.equal(Number((await fetch(`${base}/product/${pipe._id}`).then(r => r.json())).quantity), 15);
    const movements = await fetch(`${base}/stock/movements`).then(r => r.json());
    assert.equal(movements.total, 2);
    assert.ok(movements.items.every(item => item.mode === 'receiving'));
    const bad = { ...receipt, reference: 'BL-101', lines: [
      { productId: pipe._id, quantity: 2, unitCost: 1 },
      { productId: 999999, quantity: 1, unitCost: 1 },
    ] };
    assert.equal((await post(bad)).status, 409);
    assert.equal(Number((await fetch(`${base}/product/${pipe._id}`).then(r => r.json())).quantity), 15);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(appData, { recursive: true, force: true });
  }
});
