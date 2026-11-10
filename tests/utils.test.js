const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const moment = require('moment');
const {
  moneyFormat,
  isExpired,
  daysToExpire,
  checkFileExists,
  getFileHash,
  getStockStatus,
} = require('../assets/js/utils');

describe('moneyFormat', () => {
  test('formats currency for each locale', () => {
    assert.equal(moneyFormat(1234.56), '1,234.56');
    assert.equal(moneyFormat(1234.56, 'de-DE'), '1.234,56');
  });
});

describe('expiry dates', () => {
  test('future dates have days remaining', () => {
    const future = moment().add(3, 'days');
    assert.ok(daysToExpire(future.format('DD-MMM-YYYY')) > 0);
    assert.equal(isExpired(future.format('YYYY-MM-DD')), false);
  });

  test('today and past dates have expired', () => {
    for (const date of [moment(), moment().subtract(3, 'days')]) {
      const formatted = date.format('YYYY-MM-DD');
      assert.equal(daysToExpire(date.format('DD-MMM-YYYY')), 0);
      assert.equal(isExpired(formatted), true);
    }
  });
});

describe('getStockStatus', () => {
  test('identifies no stock', () => {
    for (const stock of [0, -5, '0']) assert.equal(getStockStatus(stock, 10), 0);
    assert.equal(getStockStatus(0, 0), 0);
  });

  test('identifies low stock', () => {
    for (const stock of [5, 9, 10]) assert.equal(getStockStatus(stock, 10), -1);
    assert.equal(getStockStatus('5', '10'), -1);
    assert.equal(getStockStatus(499999, 500000), -1);
  });

  test('identifies normal stock', () => {
    for (const stock of [11, 15, 45]) assert.equal(getStockStatus(stock, 10), 1);
    assert.equal(getStockStatus('10', '5'), 1);
    assert.equal(getStockStatus(10, -5), 1);
    assert.equal(getStockStatus(1000000, 500000), 1);
  });

  test('rejects invalid numbers', () => {
    assert.throws(() => getStockStatus('abc', '10'));
  });
});

describe('file utilities', () => {
  test('finds files and ignores missing paths', () => {
    assert.equal(checkFileExists(__filename), true);
    assert.equal(checkFileExists(path.join(__dirname, 'missing-file')), false);
  });

  test('calculates SHA-256 of file contents', () => {
    const expected = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
    assert.equal(getFileHash(__filename), expected);
  });
});
