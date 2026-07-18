const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAuctionBulkText } = require('./admin-auction-parse.js');

test('parses well-formed lines with and without memo', () => {
  const text = '금시계, 18, 스위스제\n광대열론, 3\n';
  const { items, failedCount } = parseAuctionBulkText(text);
  assert.equal(failedCount, 0);
  assert.deepEqual(items, [
    { item_name: '금시계', value: 18, memo: '스위스제' },
    { item_name: '광대열론', value: 3, memo: null },
  ]);
});

test('skips blank lines', () => {
  const { items } = parseAuctionBulkText('금시계, 18\n\n\n광대열론, 3');
  assert.equal(items.length, 2);
});

test('counts lines with a non-numeric or missing value as failures', () => {
  const { items, failedCount } = parseAuctionBulkText('금시계, 열여덟\n광대열론, 3\n이름없음,');
  assert.equal(items.length, 1);
  assert.equal(failedCount, 2);
});

test('counts a line with no item name as a failure', () => {
  const { items, failedCount } = parseAuctionBulkText(', 10');
  assert.equal(items.length, 0);
  assert.equal(failedCount, 1);
});

test('rejects non-integer values', () => {
  const { items, failedCount } = parseAuctionBulkText('금시계, 18.5');
  assert.equal(items.length, 0);
  assert.equal(failedCount, 1);
});
