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

function emptyState(turn) {
  const s = E.createInitialState(turn || 'P1');
  s.pieces = [];
  return s;
}

test('rook: orthogonal 1-step only, blocked by own piece, captures enemy', () => {
  const s = emptyState();
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P1', col: 3, row: 2, facing: 1 },
    { id: 'c', owner: 'P2', col: 2, row: 1, facing: -1 },
  ];
  const moves = E.getLegalMoves(s, 'rook', 'P1').filter(m => m.pieceId === 'a');
  const dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['1,2', '2,1', '2,3']);
});

test('bishop: diagonal 1-step only', () => {
  const s = emptyState();
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  const moves = E.getLegalMoves(s, 'bishop', 'P1');
  const dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['1,1', '1,3', '3,1', '3,3']);
});

test('knight: 8 L-shaped destinations, jumps over pieces', () => {
  const s = emptyState();
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'block', owner: 'P2', col: 2, row: 3, facing: -1 },
  ];
  const moves = E.getLegalMoves(s, 'knight', 'P1').filter(m => m.pieceId === 'a');
  assert.equal(moves.length, 8);
});

test('jumper: only jumps over an adjacent occupied cell, lands 2 away, hopped piece survives', () => {
  const s = emptyState();
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'hop', owner: 'P2', col: 3, row: 2, facing: -1 },
  ];
  const moves = E.getLegalMoves(s, 'jumper', 'P1').filter(m => m.pieceId === 'a');
  assert.deepEqual(moves.map(m => m.to), [{ col: 4, row: 2 }]);
});

test('jumper: no move in a direction with no adjacent piece', () => {
  const s = emptyState();
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  const moves = E.getLegalMoves(s, 'jumper', 'P1').filter(m => m.pieceId === 'a');
  assert.equal(moves.length, 0);
});

test('jumper converts to queen movement once total pieces on board <= 2', () => {
  const s = emptyState();
  s.jumperConverted = true;
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 4, row: 4, facing: -1 },
  ];
  const moves = E.getLegalMoves(s, 'jumper', 'P1').filter(m => m.pieceId === 'a');
  const dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['1,1', '1,2', '1,3', '2,1', '2,3', '3,1', '3,2', '3,3']);
});

test('attacker: forward 1/2 cells straight (blocked by any piece in between) plus forward-diagonal 1 cell', () => {
  const s = emptyState();
  s.pieces = [{ id: 'a', owner: 'P1', col: 1, row: 2, facing: 1 }];
  let moves = E.getLegalMoves(s, 'attacker', 'P1').filter(m => m.pieceId === 'a');
  let dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['2,1', '2,2', '2,3', '3,2']);

  s.pieces.push({ id: 'block', owner: 'P2', col: 2, row: 2, facing: -1 });
  moves = E.getLegalMoves(s, 'attacker', 'P1').filter(m => m.pieceId === 'a');
  dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  // 2칸 전진(3,2)은 중간(2,2)이 막혀서 사라지고, 1칸 전진은 상대말 포획으로 남음
  assert.deepEqual(dests, ['2,1', '2,2', '2,3']);
});

test('attacker uses facing to determine forward direction', () => {
  const s = emptyState();
  s.pieces = [{ id: 'a', owner: 'P2', col: 3, row: 2, facing: -1 }];
  const moves = E.getLegalMoves(s, 'attacker', 'P2').filter(m => m.pieceId === 'a');
  const dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['1,2', '2,1', '2,2', '2,3']);
});

test('queen movement (post-conversion) covers all 8 adjacent cells from board center', () => {
  const s = emptyState();
  s.jumperConverted = true;
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  const moves = E.getLegalMoves(s, 'jumper', 'P1');
  assert.equal(moves.length, 8);
});

test('applyDraft assigns hands and leaves exactly one waiting card', () => {
  const s = E.createInitialState('P1'); // P1=선, P2=후
  const next = E.applyDraft(s, ['knight', 'jumper'], ['attacker', 'bishop']);
  assert.deepEqual(next.hands.P2, ['knight', 'jumper']);
  assert.deepEqual(next.hands.P1, ['attacker', 'bishop']);
  assert.equal(next.waiting, 'rook');
});

test('applyDraft throws on duplicate or wrong-count cards', () => {
  const s = E.createInitialState('P1');
  assert.throws(() => E.applyDraft(s, ['knight', 'knight'], ['attacker', 'bishop']));
  assert.throws(() => E.applyDraft(s, ['knight'], ['attacker', 'bishop']));
});

test('chooseAiDraft ranks knight/jumper for self, attacker/bishop for opponent, rook waits', () => {
  const draft = E.chooseAiDraft();
  assert.deepEqual(draft.secondCards.slice().sort(), ['jumper', 'knight']);
  assert.deepEqual(draft.firstCards.slice().sort(), ['attacker', 'bishop']);
});
