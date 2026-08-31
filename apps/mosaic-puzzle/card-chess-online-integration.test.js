const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('card-chess.html', 'utf8');

test('card chess loads the shared invite transport and online helpers', () => {
  assert.match(html, /card-chess-online\.js/);
  assert.match(html, /ring-the-bell-p2p\.js/);
  assert.match(html, /id="friend-invite-btn"/);
});

test('online matches use prefixed rooms and never record leaderboard results', () => {
  assert.match(html, /'CC' \+ window\.RingBellP2P\.makeRoomCode\(\)/);
  assert.match(html, /if \(onlineMode\) return;/);
});

test('rendering and input use the local online player perspective', () => {
  assert.match(html, /const player = localPlayer;/);
  assert.match(html, /O\.toEngineCell\(visualRow, visualCol, localPlayer\)/);
  assert.match(html, /classList\.toggle\('own-hand'/);
});

test('the invite modal closes when the data channel opens', () => {
  assert.match(html, /deleteSignals\(roomCode\);\s*document\.getElementById\('online-modal'\)\.classList\.add\('hidden'\)/);
});
