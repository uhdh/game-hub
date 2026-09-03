const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('lobby leaderboard places 언어의 조각 first', () => {
  const sectionsStart = html.indexOf('const LB_SECTIONS');
  assert.notEqual(sectionsStart, -1);
  const sectionsSrc = html.slice(sectionsStart);
  const labels = [...sectionsSrc.matchAll(/label:\s*'([^']+)'/g)].map(match => match[1]);
  assert.equal(labels[0], '언어의 조각');
});
