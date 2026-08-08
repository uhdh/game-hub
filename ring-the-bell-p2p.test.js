const test = require('node:test');
const assert = require('node:assert/strict');
const P2P = require('./ring-the-bell-p2p.js');

test('mulberry32 is deterministic for the same seed', () => {
  const a = P2P.mulberry32(42);
  const b = P2P.mulberry32(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 produces different sequences for different seeds', () => {
  const a = P2P.mulberry32(1)();
  const b = P2P.mulberry32(2)();
  assert.notEqual(a, b);
});

test('mulberry32 output stays within [0, 1)', () => {
  const rand = P2P.mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const v = rand();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('makeRoomCode returns a 6-character uppercase alphanumeric code', () => {
  const code = P2P.makeRoomCode();
  assert.match(code, /^[A-Z0-9]{6}$/);
});

test('makeRoomCode is not constant across calls', () => {
  const codes = new Set(Array.from({ length: 20 }, () => P2P.makeRoomCode()));
  assert.ok(codes.size > 1, 'expected at least some variation across 20 calls');
});
