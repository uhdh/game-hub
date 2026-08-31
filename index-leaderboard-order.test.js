const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('lobby leaderboard places 언어의 조각 directly below 카드체스', () => {
  const labels = [...html.matchAll(/label:\s*'([^']+)'/g)].map(match => match[1]);
  const cardChess = labels.indexOf('카드체스');
  assert.notEqual(cardChess, -1);
  assert.equal(labels[cardChess + 1], '언어의 조각');
});
