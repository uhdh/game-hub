const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./blind-auction-logic.js');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('pickGamePool throws when pool has fewer than 22 items', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: i, item_name: 'x' + i, value: 10 }));
  assert.throws(() => L.pickGamePool(items), /최소 22개/);
});

test('pickGamePool returns 22-item pool and 11-item play queue drawn from the pool', () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: i, item_name: 'x' + i, value: i + 1 }));
  const rng = mulberry32(42);
  const { pool, poolTotal, playQueue } = L.pickGamePool(items, rng);
  assert.equal(pool.length, 22);
  assert.equal(playQueue.length, 11);
  const expectedTotal = pool.reduce((s, it) => s + it.value, 0);
  assert.equal(poolTotal, expectedTotal);
  const poolIds = new Set(pool.map((it) => it.id));
  playQueue.forEach((it) => assert.ok(poolIds.has(it.id)));
});

test('currentActor starts with the designated start player', () => {
  const round = L.createRound('ai2');
  assert.equal(L.currentActor(round), 'ai2');
});

test('applyBid rejects when it is not the given player\'s turn', () => {
  const players = L.createPlayers();
  const round = L.createRound('user');
  const res = L.applyBid(round, players, 'ai1', [5]);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_your_turn');
});

test('applyBid rejects a cube value the player does not currently hold', () => {
  const players = L.createPlayers();
  const round = L.createRound('user');
  const res = L.applyBid(round, players, 'user', [999]);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'cube_not_available');
});

test('applyBid rejects a bid that does not exceed the current highest total', () => {
  const players = L.createPlayers();
  const round = L.createRound('user');
  L.applyBid(round, players, 'user', [10]);
  const actor = L.currentActor(round);
  const res = L.applyBid(round, players, actor, [8]);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'bid_too_low');
});

test('applyBid updates the leader and remainingCubesInRound excludes committed cubes', () => {
  const players = L.createPlayers();
  const round = L.createRound('user');
  const res = L.applyBid(round, players, 'user', [10, 4]);
  assert.equal(res.ok, true);
  assert.equal(round.highestPlayerId, 'user');
  assert.equal(round.highestTotal, 14);
  const user = L.findPlayer(players, 'user');
  const remaining = L.remainingCubesInRound(user, round);
  assert.ok(!remaining.includes(10));
  assert.ok(!remaining.includes(4));
  assert.ok(remaining.includes(1));
});

test('the current leader is skipped and never asked to act while leading', () => {
  const players = L.createPlayers();
  const round = L.createRound('ai2');
  L.applyBid(round, players, 'ai2', [4]);
  const next = L.currentActor(round);
  assert.notEqual(next, 'ai2');
});

test('round resolves to a winner once all but one player pass', () => {
  const players = L.createPlayers();
  const round = L.createRound('user');
  L.applyBid(round, players, 'user', [10]);
  let actor;
  while ((actor = L.currentActor(round)) !== null) {
    L.applyPass(round, actor);
  }
  assert.deepEqual(L.getRoundResult(round), { type: 'won', winnerId: 'user', amount: 10 });
});

test('round resolves to unsold when every player passes without ever bidding', () => {
  const round = L.createRound('user');
  let actor;
  while ((actor = L.currentActor(round)) !== null) {
    L.applyPass(round, actor);
  }
  assert.deepEqual(L.getRoundResult(round), { type: 'unsold' });
});

test('finalizeRound permanently deducts the winner\'s cubes and records the won item', () => {
  const players = L.createPlayers();
  const round = L.createRound('user');
  L.applyBid(round, players, 'user', [10, 4]);
  let actor;
  while ((actor = L.currentActor(round)) !== null) {
    L.applyPass(round, actor);
  }
  const item = { id: 'item-1', item_name: '금시계', value: 18, memo: '테스트 메모' };
  const result = L.finalizeRound(round, players, item);
  assert.equal(result.type, 'won');
  const user = L.findPlayer(players, 'user');
  assert.deepEqual(user.cubes.slice().sort((a, b) => a - b), [1, 2, 3, 6, 8, 12, 15, 20, 25]);
  assert.equal(user.wonItems.length, 1);
  assert.equal(user.wonItems[0].value, 18);
});

test('finalizeRound leaves every player\'s cubes untouched when the round is unsold', () => {
  const players = L.createPlayers();
  const round = L.createRound('user');
  const item = { id: 'item-2', item_name: '유찰물품', value: 5, memo: null };
  let actor;
  while ((actor = L.currentActor(round)) !== null) {
    L.applyPass(round, actor);
  }
  const result = L.finalizeRound(round, players, item);
  assert.equal(result.type, 'unsold');
  const user = L.findPlayer(players, 'user');
  assert.equal(user.cubes.length, 11);
});

test('nextStartPlayer follows the winner, or rotates past the previous starter when unsold', () => {
  assert.equal(L.nextStartPlayer(L.PLAYER_ORDER, 'user', { type: 'won', winnerId: 'ai3', amount: 20 }), 'ai3');
  assert.equal(L.nextStartPlayer(L.PLAYER_ORDER, 'user', { type: 'unsold' }), 'ai1');
  assert.equal(L.nextStartPlayer(L.PLAYER_ORDER, 'ai4', { type: 'unsold' }), 'user');
});

test('pickMinimalRaise prefers the single smallest cube that clears the target', () => {
  assert.deepEqual(L.pickMinimalRaise([1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25], 7), [8]);
});

test('pickMinimalRaise falls back to a combination when no single cube suffices', () => {
  const combo = L.pickMinimalRaise([1, 2, 3], 5);
  assert.ok(combo.reduce((a, b) => a + b, 0) >= 5);
});

test('pickMinimalRaise returns null when no combination can reach the target', () => {
  assert.equal(L.pickMinimalRaise([1, 2], 10), null);
});

test('decideAiAction passes when the required raise exceeds its willingness/budget', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 1000;
  const action = L.decideAiAction(ai1, round, { aggressiveness: 1.0 }, 220, 11, () => 0.5);
  assert.equal(action.action, 'pass');
});

test('decideAiAction bids the minimal sufficient cubes when within its willingness', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 3;
  const action = L.decideAiAction(ai1, round, { aggressiveness: 1.2 }, 220, 11, () => 1);
  assert.equal(action.action, 'bid');
  assert.ok(action.cubes.reduce((a, b) => a + b, 0) >= 4);
});

test('computeFinalRanking sorts players by total won value, descending', () => {
  const players = L.createPlayers();
  L.findPlayer(players, 'user').wonItems = [{ itemId: 1, itemName: 'a', value: 10 }];
  L.findPlayer(players, 'ai1').wonItems = [{ itemId: 2, itemName: 'b', value: 30 }];
  const ranking = L.computeFinalRanking(players);
  assert.equal(ranking[0].id, 'ai1');
  assert.equal(ranking[0].total, 30);
  assert.equal(ranking[1].total, 10);
});

test('createAiProfiles assigns each of the 4 archetypes to exactly one ai player', () => {
  const rng = mulberry32(7);
  const profiles = L.createAiProfiles(rng);
  const archetypes = ['ai1', 'ai2', 'ai3', 'ai4'].map((id) => profiles[id].archetype);
  assert.equal(archetypes.length, 4);
  assert.equal(new Set(archetypes).size, 4);
  archetypes.forEach((a) => assert.ok(L.AI_ARCHETYPES.includes(a)));
});

test('createAiProfiles keeps aggressiveness within the assigned archetype\'s range', () => {
  const rng = mulberry32(7);
  const profiles = L.createAiProfiles(rng);
  const ranges = {
    '테토남': [1.05, 1.3],
    '에겐남': [0.75, 0.95],
    '욜로족': [0.9, 1.1],
    '안정형': [0.9, 1.1],
  };
  ['ai1', 'ai2', 'ai3', 'ai4'].forEach((id) => {
    const p = profiles[id];
    const [min, max] = ranges[p.archetype];
    assert.ok(p.aggressiveness >= min && p.aggressiveness <= max, `${p.archetype}: ${p.aggressiveness}`);
  });
});

test('createAiProfiles sets pressureThreshold/paceCoefficient/gambleChance per archetype spec', () => {
  const rng = mulberry32(7);
  const profiles = L.createAiProfiles(rng);
  const expected = {
    '테토남': { pressureThreshold: 1.4, paceCoefficient: 0.4, gambleChance: 0 },
    '에겐남': { pressureThreshold: 1.05, paceCoefficient: 0.4, gambleChance: 0 },
    '욜로족': { pressureThreshold: 1.4, paceCoefficient: 0, gambleChance: 0.15 },
    '안정형': { pressureThreshold: 1.2, paceCoefficient: 1.0, gambleChance: 0 },
  };
  ['ai1', 'ai2', 'ai3', 'ai4'].forEach((id) => {
    const p = profiles[id];
    const exp = expected[p.archetype];
    assert.equal(p.pressureThreshold, exp.pressureThreshold);
    assert.equal(p.paceCoefficient, exp.paceCoefficient);
    assert.equal(p.gambleChance, exp.gambleChance);
  });
});
