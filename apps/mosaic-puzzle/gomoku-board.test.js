const test = require('node:test');
const assert = require('node:assert/strict');
const Board = require('./gomoku-board.js');

test('checkFiveInRowOf finds a straight line of 5', () => {
  const stacks = { '-2_0': [1], '-1_0': [1], '0_0': [1], '1_0': [1], '2_0': [1] };
  const run = Board.checkFiveInRowOf(stacks, 1);
  assert.ok(run);
  assert.equal(run.length, 5);
  assert.deepEqual(new Set(run), new Set(['-2_0', '-1_0', '0_0', '1_0', '2_0']));
});

test('checkFiveInRowOf returns null when the line is broken', () => {
  const stacks = { '-2_0': [1], '-1_0': [1], '1_0': [1], '2_0': [1] };
  assert.equal(Board.checkFiveInRowOf(stacks, 1), null);
});

test('checkFiveAtTop3Of finds 5 stacks with the color on top at height 3', () => {
  const keys = ['-2_0', '-1_0', '0_0', '1_0', '2_0'];
  const stacks = {};
  keys.forEach(k => { stacks[k] = [2, 2, 1]; });
  const found = Board.checkFiveAtTop3Of(stacks, 1);
  assert.ok(found);
  assert.equal(found.length, 5);
});

test('checkFiveAtTop3Of ignores stacks shorter than height 3', () => {
  const stacks = { '-2_0': [1, 1], '-1_0': [1, 1] };
  assert.equal(Board.checkFiveAtTop3Of(stacks, 1), null);
});

test('checkTriangleTop3Of finds 3 mutually adjacent height-3 stacks', () => {
  // "0_0"의 이웃 6칸 중 인접한 두 칸을 골라 삼각형을 이룬다: 0_0, 1_0, 1_-1
  const stacks = {
    '0_0': [2, 2, 1],
    '1_0': [2, 2, 1],
    '1_-1': [2, 2, 1],
  };
  const tri = Board.checkTriangleTop3Of(stacks, 1);
  assert.ok(tri);
  assert.equal(tri.length, 3);
});

test('checkWinOf reports the specific win reason for each condition', () => {
  const rowStacks = { '-2_0': [1], '-1_0': [1], '0_0': [1], '1_0': [1], '2_0': [1] };
  assert.equal(Board.checkWinOf(rowStacks, 1).reason, '오목 완성 (5개 일직선 연결)');

  // 5개 일직선(checkFiveInRowOf)과 겹치지 않도록 세 방향 모두 일렬이 아닌 산개된 칸을 사용
  const top3Stacks = {};
  ['0_0', '1_0', '0_1', '-1_1', '1_-1'].forEach(k => { top3Stacks[k] = [2, 2, 1]; });
  assert.equal(Board.checkWinOf(top3Stacks, 1).reason, '돌 5개 3층 쌓기 완성');

  assert.equal(Board.checkWinOf({}, 1), null);
});

test('isValidInitialPlacementOf rejects the center cell and occupied/adjacent-to-self cells', () => {
  assert.equal(Board.isValidInitialPlacementOf({}, '0_0', 1), false);
  assert.equal(Board.isValidInitialPlacementOf({ '2_0': [1] }, '2_0', 1), false);
  // 2_0에 내 돌이 있으면 그 이웃 칸(1_0)에는 초기 배치 불가
  assert.equal(Board.isValidInitialPlacementOf({ '2_0': [1] }, '1_0', 1), false);
  assert.equal(Board.isValidInitialPlacementOf({ '2_0': [1] }, '-2_0', 1), true);
});

test('isValidMoveTargetOf: destination height must not exceed origin height', () => {
  const stacks = { '0_0': [1, 1], '1_0': [2] };
  assert.equal(Board.isValidMoveTargetOf(stacks, '0_0', '1_0', 1), true);
  const stacksReject = { '0_0': [1], '1_0': [2, 2] };
  assert.equal(Board.isValidMoveTargetOf(stacksReject, '0_0', '1_0', 1), false);
});

test('isValidMoveTargetOf rejects non-adjacent cells and the 3-high cap', () => {
  const stacks = { '0_0': [1, 1, 1], '2_0': [2, 2] };
  assert.equal(Board.isValidMoveTargetOf(stacks, '0_0', '2_0', 1), false); // 인접 아님
  const capped = { '0_0': [1, 1, 1], '1_0': [2, 2, 2] };
  assert.equal(Board.isValidMoveTargetOf(capped, '0_0', '1_0', 1), false); // 3층 초과 금지
});

test('placeStoneOf and moveStoneOf do not mutate the original stacks object', () => {
  const stacks = { '0_0': [1] };
  const placed = Board.placeStoneOf(stacks, '1_0', 2);
  assert.deepEqual(stacks, { '0_0': [1] });
  assert.deepEqual(placed['1_0'], [2]);

  const moved = Board.moveStoneOf(placed, '1_0', '2_0', 2);
  assert.deepEqual(placed['1_0'], [2]); // 원본 유지
  assert.deepEqual(moved['1_0'], []);
  assert.deepEqual(moved['2_0'], [2]);
});

test('getAllLegalMainMoves includes placements only while supply remains', () => {
  const stacks = {};
  const withSupply = Board.getAllLegalMainMoves(stacks, 1, 5);
  const noSupply = Board.getAllLegalMainMoves(stacks, 1, 0);
  assert.ok(withSupply.some(m => m.type === 'place'));
  assert.ok(!noSupply.some(m => m.type === 'place'));
});

test('moveIdKey produces distinct, stable ids for place vs move actions', () => {
  assert.equal(Board.moveIdKey({ type: 'place', key: '0_0' }), 'p:0_0');
  assert.equal(Board.moveIdKey({ type: 'move', origin: '0_0', dest: '1_0' }), 'm:0_0>1_0');
});

test('applyMoveWithSupply decrements supply only for place moves', () => {
  const stacks = {};
  const supply = { 1: 3, 2: 3 };
  const placed = Board.applyMoveWithSupply(stacks, supply, { type: 'place', key: '0_0' }, 1);
  assert.equal(placed.supply[1], 2);

  const stacksWithStone = { '0_0': [1] };
  const moved = Board.applyMoveWithSupply(stacksWithStone, supply, { type: 'move', origin: '0_0', dest: '1_0' }, 1);
  assert.equal(moved.supply[1], 3); // 이동은 서플라이 소모 없음
});
