const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('./gomoku-ai.js');

test('evaluatePosition returns the win/loss sentinel for the player passed in', () => {
  AI.setPlayers(2, 1);
  const winForP1 = { '-2_0': [1], '-1_0': [1], '0_0': [1], '1_0': [1], '2_0': [1] };
  assert.equal(AI.evaluatePosition(winForP1, 1), 1e7);
  assert.equal(AI.evaluatePosition(winForP1, 2), -1e7);
});

test('evaluatePosition favors a position with more open threats for the color in question', () => {
  AI.setPlayers(2, 1);
  const empty = {};
  const threeInARow = { '-1_0': [1], '0_0': [1], '1_0': [1] };
  assert.ok(AI.evaluatePosition(threeInARow, 1) > AI.evaluatePosition(empty, 1));
});

test('lineThreatScore is 0 on an empty board and positive with an open line', () => {
  assert.equal(AI.lineThreatScore({}, 1), 0);
  const openTwo = { '0_0': [1], '1_0': [1] };
  assert.ok(AI.lineThreatScore(openTwo, 1) > 0);
});

test('findOpenThreeBlockCells detects both ends of an open three', () => {
  const openThree = { '-1_0': [1], '0_0': [1], '1_0': [1] };
  const cells = AI.findOpenThreeBlockCells(openThree, 1);
  assert.equal(cells.size, 2);
  assert.ok(cells.has('-2_0'));
  assert.ok(cells.has('2_0'));
});

test('findOpenThreeBlockCells returns empty when one end is already blocked', () => {
  const blockedThree = { '-2_0': [2], '-1_0': [1], '0_0': [1], '1_0': [1] };
  const cells = AI.findOpenThreeBlockCells(blockedThree, 1);
  assert.equal(cells.size, 0);
});

test('pickBestBlock only returns moves that land on a target cell', () => {
  AI.setPlayers(2, 1);
  const stacks = { '-1_0': [1], '0_0': [1], '1_0': [1] };
  const supply = { 1: 5, 2: 5 };
  const allMoves = [
    { type: 'place', key: '-2_0' },
    { type: 'place', key: '2_0' },
    { type: 'place', key: '5_0' },
  ];
  const targetCells = new Set(['-2_0', '2_0']);
  const chosen = AI.pickBestBlock(stacks, supply, allMoves, targetCells, 1);
  assert.ok(chosen);
  assert.ok(targetCells.has(chosen.key));
});

test('pickBestBlock returns null when no legal move lands on a target cell', () => {
  const chosen = AI.pickBestBlock({}, { 1: 5, 2: 5 }, [{ type: 'place', key: '5_0' }], new Set(['-2_0']), 1);
  assert.equal(chosen, null);
});

test('minimax short-circuits to the win sentinel when the position is already decided', () => {
  AI.setPlayers(2, 1);
  const aiWins = { '-2_0': [2], '-1_0': [2], '0_0': [2], '1_0': [2], '2_0': [2] };
  const supply = { 1: 5, 2: 5 };
  assert.equal(AI.minimax(aiWins, supply, 3, true, -Infinity, Infinity), 1e7 + 3);
});

test('minimax respects a past deadline by falling back to a static evaluation', () => {
  AI.setPlayers(2, 1);
  const stacks = { '0_0': [1] };
  const supply = { 1: 5, 2: 5 };
  const pastDeadline = Date.now() - 1000;
  const val = AI.minimax(stacks, supply, 4, true, -Infinity, Infinity, pastDeadline);
  assert.equal(val, AI.evaluatePosition(stacks, 2));
});
