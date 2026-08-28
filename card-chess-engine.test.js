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

function draftedState(first) {
  let s = E.createInitialState(first || 'P1');
  const draft = E.chooseAiDraft(); // 결정적 배분 재사용 (테스트 목적)
  return E.applyDraft(s, draft.secondCards, draft.firstCards);
}

test('applyMove moves the piece and captures an enemy on the destination', () => {
  let s = E.createInitialState('P1');
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 2, row: 1, facing: -1 },
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 2, row: 1 });
  assert.equal(next.pieces.length, 1);
  assert.equal(next.pieces[0].col, 2);
  assert.equal(next.pieces[0].row, 1);
  assert.equal(next.pieces[0].owner, 'P1');
});

test('applyMove cycles cards: used card -> waiting, waiting card -> hand', () => {
  let s = E.createInitialState('P1');
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 2, row: 1 });
  assert.deepEqual(next.hands.P1, ['bishop', 'attacker']);
  assert.equal(next.waiting, 'rook');
});

test('applyMove flips facing when a piece reaches the far edge column', () => {
  let s = E.createInitialState('P1');
  s.pieces = [{ id: 'a', owner: 'P1', col: 3, row: 2, facing: 1 }];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 3, row: 2 }, { col: 4, row: 2 });
  assert.equal(next.pieces[0].facing, -1);
});

test('applyMove throws on an illegal destination', () => {
  let s = E.createInitialState('P1');
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  assert.throws(() => E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 4, row: 4 }));
});

test('applyPass cycles the card and passes the turn when no legal move exists', () => {
  let s = E.createInitialState('P1');
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 4, row: 4, facing: -1 },
  ];
  s.hands = { P1: ['jumper', 'bishop'], P2: ['knight', 'attacker'] };
  s.waiting = 'rook';
  // jumper: 인접 8칸에 아무 말도 없으면 이동 불가 (상대 말은 멀리 떨어져 있어 인접하지 않음)
  const moves = E.getLegalMoves(s, 'jumper', 'P1');
  assert.equal(moves.length, 0);
  const next = E.applyPass(s, 'jumper');
  assert.deepEqual(next.hands.P1, ['bishop', 'rook']);
  assert.equal(next.waiting, 'jumper');
  assert.equal(next.turn, 'P2');
  assert.deepEqual(next.pieces, s.pieces); // 말은 그대로
});

test('applyPass throws if legal moves actually exist for that card', () => {
  let s = E.createInitialState('P1');
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  assert.throws(() => E.applyPass(s, 'rook'));
});

test('capturing the last enemy piece wins immediately by elimination', () => {
  let s = E.createInitialState('P1');
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 2, row: 1, facing: -1 },
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 2, row: 1 });
  assert.equal(next.winner, 'P1');
  assert.equal(next.winReason, 'elimination');
});

test('jumper converts to queen once total pieces drop to 2', () => {
  let s = E.createInitialState('P1');
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'extra', owner: 'P1', col: 0, row: 0, facing: 1 },
    { id: 'b', owner: 'P2', col: 2, row: 1, facing: -1 },
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  assert.equal(s.jumperConverted, false);
  // P1이 P2의 유일한 말을 잡으면: P1 2개(a,extra) vs P2 0개 -> 이미 전멸승, jumperConverted 조건(<=2)도 참이 되지만 승패는 전멸로 먼저 결정됨.
  // jumperConverted 자체를 확인하려면 전멸이 아닌 '총 2개 남는' 상황을 만든다.
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 2, row: 1, facing: -1 },
    { id: 'c', owner: 'P2', col: 0, row: 0, facing: -1 },
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 2, row: 1 });
  assert.equal(next.pieces.length, 2); // a, c만 생존
  assert.equal(next.winner, null); // 아직 상대(c)가 살아있으니 전멸 아님
  assert.equal(next.jumperConverted, true);
});

test('castle win: opponent piece sits on my castle, and I fail to remove it during my turn', () => {
  // finishTurn의 castleFlag는 "그 플레이어가 자기 턴을 마칠 때" 스냅샷된다. 따라서 승리가 감지되려면
  // 먼저 침입한 쪽(P2)이 성을 점유한 채로 자기 턴을 한 번 마쳐 castleFlag.P2를 세우고, 그다음 상대(P1)가
  // 침입자를 못 잡고 턴을 마쳐야 한다 — 그 두 번째 이동이 끝나 턴이 P2로 넘어가는 순간 승리가 확정된다.
  // 그래서 이 시나리오는 P2가 먼저 두는 것으로 시작해야 한다(P1이 먼저 두면 한 번 더 왕복해야 함).
  let s = E.createInitialState('P2'); // 이 테스트 한정으로 P2가 먼저 둔다
  // P2 말 하나를 P2의 성(0,2)에 미리 세워둔다 (원래 그 자리에 있던 P1 말은 비워둔 것으로 취급)
  s.pieces = s.pieces.filter(p => !(p.owner === 'P1' && p.row === 2));
  s.pieces = s.pieces.map(p => p.owner === 'P2' && p.row === 2 ? Object.assign({}, p, { col: 0, row: 2 }) : p);
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  // P2 턴: 성 점유와 무관한 수를 둬서 castleFlag.P2를 세운다
  const p2Mover = s.pieces.find(p => p.owner === 'P2' && p.row === 4);
  let next = E.applyMove(s, 'knight', { col: p2Mover.col, row: p2Mover.row }, E.getLegalMoves(s, 'knight', 'P2').find(m => m.pieceId === p2Mover.id).to);
  assert.equal(next.winner, null); // 아직 P1 턴이 안 끝났으니 승리 아님
  assert.equal(next.turn, 'P1');
  // P1 턴: 침입자를 못 잡는 무관한 수를 둔다 (성 칸 유지)
  const p1Mover = next.pieces.find(p => p.owner === 'P1' && p.row === 4);
  next = E.applyMove(next, 'rook', { col: p1Mover.col, row: p1Mover.row }, { col: p1Mover.col + 1, row: p1Mover.row });
  assert.equal(next.winner, 'P2');
  assert.equal(next.winReason, 'castle');
});
