const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

test('editing an account without a password keeps its existing login', async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmaspot-users-'));
  process.env.APPDATA = appData;
  process.env.APPNAME = 'test-shop';
  fs.mkdirSync(path.join(appData, 'test-shop', 'server', 'databases'), { recursive: true });
  const app = express();
  app.use('/api/users', require('../api/users'));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/users`;
  const post = body => fetch(`${base}/post`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const login = password => fetch(`${base}/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'cashier', password }),
  }).then(response => response.json());
  try {
    assert.equal((await post({ id: '', fullname: 'Cashier', username: 'cashier', password: 'initial-secret', perm_products: 1 })).status, 200);
    const [account] = await fetch(`${base}/all`).then(response => response.json());
    assert.ok(account.password && account.password !== 'initial-secret');
    assert.equal((await login('initial-secret')).auth, true);

    assert.equal((await post({ id: String(account._id), fullname: 'New Cashier', username: 'cashier', password: '', perm_products: 1 })).status, 200);
    assert.equal((await login('initial-secret')).auth, true);
    const [updated] = await fetch(`${base}/all`).then(response => response.json());
    assert.equal(updated.fullname, 'New Cashier');
    assert.equal(updated.password, account.password);

    assert.equal((await post({ id: String(account._id), fullname: 'New Cashier', username: 'cashier', password: 'new-secret', perm_products: 1 })).status, 200);
    assert.equal((await login('new-secret')).auth, true);
    assert.equal((await login('initial-secret')).auth, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(appData, { recursive: true, force: true });
  }
});
