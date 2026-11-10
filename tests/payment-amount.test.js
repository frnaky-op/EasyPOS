const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePaymentAmount, paymentChange } = require('../assets/js/payment-amount');

test('checkout amounts accept local decimal notation and calculate change in cents', () => {
  assert.equal(parsePaymentAmount('300,50'), 300.5);
  assert.equal(parsePaymentAmount('1 000,50'), 1000.5);
  assert.equal(parsePaymentAmount('1,000.50'), 1000.5);
  assert.equal(parsePaymentAmount('1.000,50'), 1000.5);
  assert.ok(Number.isNaN(parsePaymentAmount('300abc')));
  assert.deepEqual(paymentChange('285.50', '300'), { valid: true, change: 14.5 });
  assert.deepEqual(paymentChange('285.50', '285,50'), { valid: true, change: 0 });
  assert.deepEqual(paymentChange('285.50', '285'), { valid: false, change: 0 });
  assert.deepEqual(paymentChange('285.50', ''), { valid: false, change: 0 });
  assert.deepEqual(paymentChange('0.00', '0.00'), { valid: true, change: 0 });
});
