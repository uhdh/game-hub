const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('card-chess.html', 'utf8');

test('cards occupy the top row and the enlarged board spans beneath them', () => {
  assert.match(html, /\.hand-left,\s*\.hand-right\s*\{[^}]*grid-row:\s*1/s);
  assert.match(html, /\.hand-left\s*\{[^}]*grid-column:\s*1/s);
  assert.match(html, /\.wait-slot-wrap\s*\{[^}]*grid-column:\s*2[^}]*grid-row:\s*1/s);
  assert.match(html, /\.hand-right\s*\{[^}]*grid-column:\s*3/s);
  assert.match(html, /\.board-wrap\s*\{[^}]*grid-column:\s*1\s*\/\s*4[^}]*grid-row:\s*2/s);
  assert.match(html, /\.board\s*\{[^}]*width:\s*min\(420px,\s*100%\)/s);
});

test('board cells use a visible checker pattern', () => {
  assert.match(html, /\.cell:nth-child\(odd\)/);
  assert.match(html, /\.cell:nth-child\(even\)/);
});

test('pieces scale with the enlarged board', () => {
  assert.match(html, /\.piece\s*\{[^}]*width:\s*50px;[^}]*height:\s*50px;/s);
  assert.match(html, /\.piece\s*\{[^}]*mask:\s*url\(/s);
});
