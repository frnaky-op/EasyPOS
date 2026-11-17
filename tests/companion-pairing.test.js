const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeServer } = require('../companion/server-address');

test('companion accepts shop LAN addresses and trusted HTTPS for pairing', () => {
  assert.equal(normalizeServer('http://192.168.1.20:3211/#pair=12345678'), 'http://192.168.1.20:3211/');
  assert.equal(normalizeServer('http://10.0.0.5:3211/'), 'http://10.0.0.5:3211/');
  assert.equal(normalizeServer('https://pos.example.com:3211/#pair=12345678'), 'https://pos.example.com:3211/');
  assert.throws(() => normalizeServer('http://example.com:3211/'));
  assert.throws(() => normalizeServer('http://127.0.0.1:3211/'));
  assert.throws(() => normalizeServer('javascript:alert(1)'));
});
