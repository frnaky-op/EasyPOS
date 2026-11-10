const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

test('paid sales reduce stock once, including held orders', async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmaspot-inventory-'));
  process.env.APPDATA = appData;
  process.env.APPNAME = 'test-shop';
  fs.mkdirSync(path.join(appData, 'test-shop', 'server', 'databases'), { recursive: true });
  fs.mkdirSync(path.join(appData, 'test-shop', 'uploads'), { recursive: true });

  const app = express();
  app.use('/api/inventory', require('../api/inventory'));
  app.use('/api/customers', require('../api/customers'));
  app.use('/api', require('../api/transactions'));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const stock = async () => {
    const response = await fetch(`${base}/inventory/products`);
    assert.equal(response.status, 200);
    const products = await response.json();
    const product = products.find(item => item.name === 'Test product');
    assert.ok(product);
    return product;
  };

  const sendOrder = async (method, order) => fetch(`${base}/new`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(order),
  });

  try {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      id: '', barcode: '12345', expirationDate: '31-Dec-2030', price: '5.00',
      category: 'Test', supplier: '', quantity: '10', name: 'Test product',
      minStock: '1', img: '', remove: '0',
    })) form.append(key, value);
    assert.equal((await fetch(`${base}/inventory/product`, { method: 'POST', body: form })).status, 200);
    const product = await stock();
    assert.equal(Number(product.quantity), 10);

    const paid = {
      _id: 101, order: 101, status: 1, paid: '20.00', total: '5.00',
      date: new Date().toISOString(), user: 'Test cashier', customer: '0',
      items: [{ id: product._id, product_name: 'Test product', quantity: 2 }],
    };
    assert.equal((await sendOrder('POST', paid)).status, 200);
    assert.equal(Number((await stock()).quantity), 8);

    const held = {
      _id: 102, order: 102, status: 0, paid: '', total: '5.00',
      date: new Date().toISOString(), user: 'Test cashier', customer: '0',
      items: [{ id: product._id, product_name: 'Test product', quantity: 3 }],
    };
    assert.equal((await sendOrder('POST', held)).status, 200);
    assert.equal(Number((await stock()).quantity), 8);
    const settled = { ...held, status: 1, paid: '5.00' };
    assert.equal((await sendOrder('PUT', settled)).status, 200);
    assert.equal(Number((await stock()).quantity), 5);
    const salesSummary = await fetch(`${base}/sales/summary`).then(response => response.json());
    assert.equal(salesSummary.today.count, 2);
    assert.equal(salesSummary.today.amount, 10);
    assert.equal(salesSummary.topProducts[0].quantity, 5);
    assert.equal(salesSummary.daily.length, 7);
    const salesCsv = await fetch(`${base}/sales/export`).then(response => response.text());
    assert.match(salesCsv, /Test cashier/);
    assert.match(salesCsv, /Client comptoir/);
    assert.equal((await sendOrder('PUT', settled)).status, 200);
    assert.equal(Number((await stock()).quantity), 5);

    const oversold = { ...paid, _id: 103, order: 103, items: [{ id: product._id, quantity: 6 }] };
    assert.equal((await sendOrder('POST', oversold)).status, 409);
    assert.equal(Number((await stock()).quantity), 5);

    const secondForm = new FormData();
    for (const [key, value] of Object.entries({
      id: '', barcode: '67890', expirationDate: '31-Dec-2030', price: '5.00',
      category: 'Test', supplier: 'Atlas Supplier', quantity: '1', name: 'Second product',
      minStock: '1', img: '', remove: '0',
    })) secondForm.append(key, value);
    assert.equal((await fetch(`${base}/inventory/product`, { method: 'POST', body: secondForm })).status, 200);
    const secondProduct = (await (await fetch(`${base}/inventory/products`)).json())
      .find(item => item.name === 'Second product');
    assert.ok(secondProduct);
    const defaultForm = new FormData();
    for (const [key, value] of Object.entries({
      id: '', barcode: '', expirationDate: '', price: '3.00', category: 'Other',
      supplier: '', quantity: '', name: 'Default stock product', minStock: '1',
      img: '', remove: '0',
    })) defaultForm.append(key, value);
    assert.equal((await fetch(`${base}/inventory/product`, { method: 'POST', body: defaultForm })).status, 200);
    const all = await (await fetch(`${base}/inventory/products`)).json();
    assert.equal(all.find(item => item.name === 'Default stock product').quantity, 100);
    const noBarcode = all.find(item => item.name === 'Default stock product');
    const scanned = await fetch(`${base}/inventory/product/sku`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ skuCode: String(noBarcode._id) }),
    });
    assert.equal(scanned.status, 200);
    assert.equal((await scanned.json())._id, noBarcode._id);

    const stockOverview = await fetch(`${base}/inventory/stock/overview`);
    assert.equal(stockOverview.status, 200);
    assert.equal(typeof (await stockOverview.json()).value, 'number');
    const adjust = (mode, amount) => fetch(`${base}/inventory/stock/adjust`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: noBarcode._id, mode, amount, note: 'Inventory check' }),
    });
    assert.equal((await adjust('count', 7)).status, 200);
    assert.equal((await adjust('add', 3)).status, 200);
    assert.equal((await adjust('remove', 2)).status, 200);
    assert.equal((await adjust('remove', 20)).status, 409);
    assert.equal(Number((await fetch(`${base}/inventory/product/${noBarcode._id}`).then(r => r.json())).quantity), 8);
    const movements = await fetch(`${base}/inventory/stock/movements?page=1&pageSize=2`).then(r => r.json());
    assert.equal(movements.total, 5);
    assert.equal(movements.items.length, 2);
    const allMovements = await fetch(`${base}/inventory/stock/movements?page=1&pageSize=10`).then(r => r.json());
    assert.equal(allMovements.items.filter(item => item.mode === 'sale').length, 2);
    assert.equal((await fetch(`${base}/inventory/stock/movements?pageSize=51`)).status, 400);

    const firstPage = await (await fetch(`${base}/inventory/products/page?page=1&pageSize=1`)).json();
    const secondPage = await (await fetch(`${base}/inventory/products/page?page=2&pageSize=1`)).json();
    assert.equal(firstPage.total, 3);
    assert.equal(firstPage.items.length, 1);
    assert.equal(secondPage.items.length, 1);
    assert.notEqual(firstPage.items[0]._id, secondPage.items[0]._id);
    const filtered = await (await fetch(`${base}/inventory/products/page?page=1&pageSize=25&q=Second&category=Test`)).json();
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0]._id, secondProduct._id);
    const supplierSearch = await (await fetch(`${base}/inventory/products/page?page=1&pageSize=25&q=Atlas%20Supplier`)).json();
    assert.equal(supplierSearch.total, 1);
    assert.equal(supplierSearch.items[0]._id, secondProduct._id);
    assert.equal((await (await fetch(`${base}/inventory/products/page?pageSize=101`)).status), 400);
    const stockResponse = await fetch(`${base}/inventory/products/stocks`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [product._id, secondProduct._id] }),
    });
    assert.equal(stockResponse.status, 200);
    assert.equal((await stockResponse.json()).length, 2);
    const mixedOrder = {
      ...paid, _id: 104, order: 104,
      items: [{ id: product._id, quantity: 1 }, { id: secondProduct._id, quantity: 2 }],
    };
    assert.equal((await sendOrder('POST', mixedOrder)).status, 409);
    assert.equal(Number((await stock()).quantity), 5);

    const customer = { _id: 201, name: 'Atlas Bâtiment', phone: '0612345678', email: '', address: '', city: 'Casablanca', type: 'professional' };
    assert.equal((await fetch(`${base}/customers/customer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(customer),
    })).status, 200);
    assert.equal((await fetch(`${base}/customers/customer/201`).then(r => r.json())).name, customer.name);
    const clientPage = await fetch(`${base}/customers/page?page=1&pageSize=25&q=Atlas&type=professional`).then(r => r.json());
    assert.equal(clientPage.total, 1);
    assert.equal((await fetch(`${base}/customers/customer`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...customer, city: 'Rabat' }),
    })).status, 200);
    assert.equal((await fetch(`${base}/customers/customer/201`).then(r => r.json())).city, 'Rabat');
    assert.equal((await sendOrder('POST', {
      _id: 105, order: 105, status: 1, paid: '3.00', total: '3.00', date: new Date().toISOString(),
      customer: { id: customer._id, name: customer.name },
      items: [{ id: noBarcode._id, product_name: 'Default stock product', quantity: 1 }],
    })).status, 200);
    const clientHistory = await fetch(`${base}/sales/customer/201`).then(r => r.json());
    assert.equal(clientHistory.total, 1);
    assert.equal(clientHistory.spent, 3);
    const latest = await fetch(`${base}/sales/customers/latest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [201] }),
    }).then(r => r.json());
    assert.ok(latest['201']);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(appData, { recursive: true, force: true });
  }
});
