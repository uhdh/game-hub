const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./card-chess-engine.js');
const O = require('./card-chess-online.js');

test('maps the bottom row to the local player side', () => {
  assert.deepEqual(O.toEngineCell(4, 0, 'P1'), { col: 0, row: 0 });
  assert.deepEqual(O.toEngineCell(4, 0, 'P2'), { col: 4, row: 4 });
  assert.deepEqual(O.toEngineCell(0, 4, 'P2'), { col: 0, row: 0 });
});

test('applies a serialized move only for the current player', () => {
  const state = E.createInitialState('P1');
  state.hands.P1 = ['rook', 'bishop'];
  state.hands.P2 = ['knight', 'jumper'];
  state.waiting = 'attacker';
  const action = { type: 'move', player: 'P1', cardId: 'rook', from: { col: 0, row: 0 }, to: { col: 1, row: 0 } };
  const next = O.applyAction(state, action, E);
  assert.equal(next.turn, 'P2');
  assert.ok(next.pieces.some(piece => piece.owner === 'P1' && piece.col === 1 && piece.row === 0));
  assert.throws(() => O.applyAction(state, { ...action, player: 'P2' }, E), /turn/);
});

test('applies a serialized pass and returns a stable checksum', () => {
  const engine = { applyPass: (state, cardId) => ({ ...state, turn: 'P2', used: cardId }) };
  const state = { turn: 'P1', hands: { P1: ['rook'], P2: [] }, pieces: [] };
  const next = O.applyAction(state, { type: 'pass', player: 'P1', cardId: 'rook' }, engine);
  assert.equal(next.used, 'rook');
  assert.equal(O.checksum(next), O.checksum(JSON.parse(JSON.stringify(next))));
  assert.notEqual(O.checksum(next), O.checksum({ ...next, turn: 'P1' }));
});
