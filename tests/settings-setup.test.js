const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('first-run store setup saves multipart settings and accepts later edits', async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'easypos-setup-'));
  process.env.APPDATA = appData;
  process.env.APPNAME = 'test-setup';
  fs.mkdirSync(path.join(appData, 'test-setup', 'server', 'databases'), { recursive: true });
  fs.mkdirSync(path.join(appData, 'test-setup', 'uploads'), { recursive: true });
  const server = require('../api/settings').listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = fields => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return fetch(`${base}/post`, { method: 'POST', body: data });
  };
  const fields = {
    id: '', img: '', remove: '0', app: 'Standalone Point of Sale',
    store: 'Droguerie Générale', address_one: 'Rue Hassan II', address_two: 'Casablanca',
    contact: '', tax: '', symbol: 'MAD', percentage: '20', charge_tax: 'on',
    quick_billing: '', footer: '',
  };
  try {
    assert.equal((await post(fields)).status, 200);
    let result = await fetch(`${base}/get`).then(response => response.json());
    assert.equal(result.settings.store, 'Droguerie Générale');
    assert.equal(result.settings.symbol, 'MAD');
    assert.equal(result.settings.charge_tax, true);

    assert.equal((await post({ ...fields, id: '1', store: 'Droguerie Centrale', percentage: '0', charge_tax: '' })).status, 200);
    result = await fetch(`${base}/get`).then(response => response.json());
    assert.equal(result.settings.store, 'Droguerie Centrale');
    assert.equal(result.settings.percentage, '0');
    assert.equal(result.settings.charge_tax, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(appData, { recursive: true, force: true });
  }
});
