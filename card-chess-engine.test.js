const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./card-chess-engine.js');

test('createInitialState places 5 pieces per side facing each other', () => {
  const state = E.createInitialState('P1');
  const p1 = state.pieces.filter(p => p.owner === 'P1');
  const p2 = state.pieces.filter(p => p.owner === 'P2');
  assert.equal(p1.length, 5);
  assert.equal(p2.length, 5);
  assert.ok(p1.every(p => p.col === 0 && p.facing === 1));
  assert.ok(p2.every(p => p.col === 4 && p.facing === -1));
  assert.deepEqual(p1.map(p => p.row).sort(), [0, 1, 2, 3, 4]);
  assert.equal(state.turn, 'P1');
  assert.equal(state.turnCount, 0);
  assert.equal(state.jumperConverted, false);
  assert.deepEqual(state.hands, { P1: [], P2: [] });
});

test('other() flips player', () => {
  assert.equal(E.other('P1'), 'P2');
  assert.equal(E.other('P2'), 'P1');
});

test('countAlive counts only that owner\'s pieces', () => {
  const state = E.createInitialState('P1');
  assert.equal(E.countAlive(state, 'P1'), 5);
  assert.equal(E.countAlive(state, 'P2'), 5);
});

test('isHoldingCastle is false at game start (castle cell holds owner\'s own piece)', () => {
  const state = E.createInitialState('P1');
  assert.equal(E.isHoldingCastle(state, 'P1'), false);
  assert.equal(E.isHoldingCastle(state, 'P2'), false);
});

test('isHoldingCastle is true once a player\'s piece sits on its own target castle cell', () => {
  const state = E.createInitialState('P1');
  state.pieces.push({ id: 'test', owner: 'P1', col: 4, row: 2, facing: 1 });
  assert.equal(E.isHoldingCastle(state, 'P1'), true);
});
