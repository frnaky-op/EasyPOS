const test = require('node:test');
const assert = require('node:assert/strict');
const QRCode = require('qrcode');
const { buildPairUrl, buildAppUrl, parseAppUrl, takePairCode } = require('../mobile/pairing');
const { mobileAddresses } = require('../mobile/server');
const os = require('os');

test('QR link opens the install or pair page and passes the code in a fragment', async () => {
  const link = buildPairUrl('http://192.168.1.20:3211/', '12345678');
  assert.equal(link, 'http://192.168.1.20:3211/connect#pair=12345678');
  assert.equal(buildPairUrl('https://shop.example:3211/', '12345678'), 'https://shop.example:3211/connect#pair=12345678');
  assert.equal(new URL(link).search, '');
  const appLink = buildAppUrl('http://192.168.1.20:3211/', '12345678');
  assert.deepEqual(parseAppUrl(appLink), { server: 'http://192.168.1.20:3211/', code: '12345678' });
  assert.equal(parseAppUrl('easypos://pair?server=http%3A%2F%2F192.168.1.20%3A3211%2F&code=wrong'), null);
  const image = await QRCode.toDataURL(link, { width: 224 });
  assert.match(image, /^data:image\/png;base64,iVBORw0KGgo/);
});

test('phone consumes QR pairing code and clears it from browser history', () => {
  const location = { hash: '#pair=12345678', pathname: '/', search: '?view=products' };
  const history = { replaceState: (...args) => { history.replacement = args; } };
  assert.equal(takePairCode(location, history), '12345678');
  assert.deepEqual(history.replacement, [null, '', '/?view=products']);
  assert.equal(takePairCode({ hash: '#pair=wrong', pathname: '/', search: '' }, history), '');
  assert.throws(() => buildPairUrl('http://192.168.1.20:3211/', 'wrong'), /Invalid pairing code/);
});

test('mobile pairing advertises HTTPS when a trusted certificate is configured', () => {
  const original = os.networkInterfaces;
  os.networkInterfaces = () => ({ WiFi: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }] });
  try { assert.deepEqual(mobileAddresses(3211, 'https'), ['https://192.168.1.20:3211/']); }
  finally { os.networkInterfaces = original; }
});
