# 블라인드 경매 (Blind Auction) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 유저 1명 + AI 4명이 큐브로 경매를 벌이는 싱글플레이 브라우저 게임(블라인드 경매)을 기존 모자이크퍼즐 게임 허브에 추가한다.

**Architecture:** 순수 HTML/CSS/JS 단일 페이지(`blind-auction.html`)로 게임을 구현하고, 재사용/테스트를 위해 게임 규칙(턴 진행·AI 판단·큐브 계산)은 DOM에 의존하지 않는 순수 로직 파일(`blind-auction-logic.js`)로 분리해 `<script>` 태그로 불러온다. 물품 데이터와 리더보드는 기존 프로젝트가 쓰는 Supabase 프로젝트(`paktzmofotvwfdxcpmzv`)에 새 테이블 2개를 추가해 raw `fetch` REST 호출로 연동한다. 관리자용 물품 등록은 기존 `admin.html`에 탭을 추가하는 방식으로 확장한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 도구 없음), Supabase REST API(anon key), Node.js 내장 테스트 러너(`node:test`, `node:assert/strict`, 로직 유닛 테스트 전용 — 브라우저에는 포함되지 않음).

## Global Constraints

- 기존 프로젝트 컨벤션 유지: 다크 테마(배경 `#0f0f12`~`#0b0c0f` 계열, 패널 `#15181c`/`#181b20`, 강조색 `#5fb8b0`), Pretendard/시스템 폰트, 모바일 우선(`max-width: 480px` 컬럼).
- Supabase 접근은 supabase-js SDK 없이 anon publishable key를 사용한 raw `fetch`만 사용 (기존 파일들과 동일 패턴).
- 물품 풀 크기는 22, 실제 경매 라운드 수는 11 (플레이어당 큐브 11개 `{1,2,3,4,6,8,10,12,15,20,25}`, 합계 106).
- AI는 물품의 실제 가치를 알지 못한다 — 게임 시작 시 공개되는 "22개 총합"만으로 추정한다.
- 낙찰 전 이탈(포기)한 플레이어의 큐브는 해당 경매 종료 시점에 일괄 반환된다(즉시 반환 아님).
- 새 파일은 프로젝트 루트에 평평하게 둔다(기존 파일 구조와 동일 — `tests/` 같은 하위 디렉터리 신설 없음).
- 설계 문서: `docs/superpowers/specs/2026-07-18-blind-auction-design.md` (모든 태스크는 이 문서와 일치해야 함).

---

## Task 1: Supabase 테이블 생성 (`auction_items`, `blind_auction_leaderboard`)

**Files:** 없음 (Supabase 인프라 변경, MCP 도구로 직접 적용)

**Interfaces:**
- Produces: REST 엔드포인트 `https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/auction_items` (컬럼: `id, item_name, value, memo, created_at`), `https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/blind_auction_leaderboard` (컬럼: `id, nickname, score, created_at`). 이후 모든 태스크가 이 두 테이블에 `apikey`/`Authorization` 헤더로 anon 접근한다.

- [ ] **Step 1: 마이그레이션 적용**

`mcp__claude_ai_Supabase__apply_migration` 도구를 다음 인자로 호출한다.

```
project_id: "paktzmofotvwfdxcpmzv"
name: "create_blind_auction_tables"
query:
```
```sql
create table public.auction_items (
  id bigint generated always as identity primary key,
  item_name text not null,
  value integer not null,
  memo text,
  created_at timestamptz not null default now()
);

alter table public.auction_items enable row level security;

create policy "auction_items_select_anon" on public.auction_items
  for select to anon using (true);

create policy "auction_items_insert_anon" on public.auction_items
  for insert to anon with check (true);

create policy "auction_items_delete_anon" on public.auction_items
  for delete to anon using (true);

create table public.blind_auction_leaderboard (
  id bigint generated always as identity primary key,
  nickname text not null default '익명',
  score integer not null,
  created_at timestamptz not null default now()
);

alter table public.blind_auction_leaderboard enable row level security;

create policy "blind_auction_leaderboard_select_anon" on public.blind_auction_leaderboard
  for select to anon using (true);

create policy "blind_auction_leaderboard_insert_anon" on public.blind_auction_leaderboard
  for insert to anon with check (true);
```

- [ ] **Step 2: 테이블 생성 확인**

`mcp__claude_ai_Supabase__list_tables`를 `project_id: "paktzmofotvwfdxcpmzv"`, `schemas: ["public"]`, `verbose: true`로 호출.
Expected: 결과에 `public.auction_items`(컬럼 `id, item_name, value, memo, created_at`)와 `public.blind_auction_leaderboard`(컬럼 `id, nickname, score, created_at`)가 `rls_enabled: true`로 나타남.

- [ ] **Step 3: anon 권한으로 실제 insert/select/delete 동작 확인**

`mcp__claude_ai_Supabase__execute_sql`로 다음을 실행해 정책이 의도대로 동작하는지 확인 (이 호출 자체는 service-role 컨텍스트지만, 정책이 `to anon`으로 걸려 있는지와 데이터 흐름을 확인하는 용도):

```sql
insert into public.auction_items (item_name, value, memo) values ('테스트물품', 10, '플랜 검증용') returning id;
```

반환된 `id`를 메모해두고, 같은 도구로 조회 후 삭제까지 확인한다:

```sql
select count(*) from public.auction_items;
delete from public.auction_items where item_name = '테스트물품';
```

Expected: insert 성공, count가 1 증가했다가 delete 후 원래대로 돌아옴. 이 검증용 행은 실제 서비스 데이터가 아니므로 반드시 삭제까지 완료한다.

---

## Task 2: 순수 게임 로직 모듈 (`blind-auction-logic.js`)

**Files:**
- Create: `blind-auction-logic.js`
- Test: `blind-auction-logic.test.js`

**Interfaces:**
- Consumes: 없음 (순수 함수, DOM/네트워크 의존성 없음)
- Produces: 브라우저에서는 전역 `window.BlindAuctionLogic`, Node에서는 `module.exports`로 다음을 노출:
  - `CUBE_VALUES: number[]` = `[1,2,3,4,6,8,10,12,15,20,25]`, `CUBE_TOTAL: number` = `106`
  - `PLAYER_ORDER: string[]` = `['user','ai1','ai2','ai3','ai4']`
  - `TOTAL_ROUNDS: number` = `11`, `POOL_SIZE: number` = `22`
  - `createPlayers(): Array<{id, cubes: number[], wonItems: Array<{itemId,itemName,value,memo}>}>`
  - `findPlayer(players, id)`
  - `shuffle(arr, rng?)`
  - `pickGamePool(allItems, rng?) => { pool, poolTotal, playQueue }` (allItems.length < 22면 throw)
  - `rotateOrder(order, startId)`
  - `createRound(startPlayerId) => round`
  - `currentActor(round) => playerId | null`
  - `remainingCubesInRound(player, round) => number[]`
  - `applyBid(round, players, playerId, cubeValues) => {ok, reason?}`
  - `applyPass(round, playerId) => {ok, reason?}`
  - `isRoundOver(round) => boolean`
  - `getRoundResult(round) => {type:'won',winnerId,amount} | {type:'unsold'} | null`
  - `finalizeRound(round, players, item) => 위와 동일한 result 객체 (부수효과로 승자 큐브/획득물품 갱신)`
  - `nextStartPlayer(order, previousStartId, roundResult) => playerId`
  - `pickMinimalRaise(availableCubeValues, extraNeeded) => number[] | null`
  - `createAiProfiles(rng?) => {ai1:{aggressiveness}, ai2:{...}, ai3:{...}, ai4:{...}}`
  - `computeAiWillingness(profile, poolTotal, rng?) => number`
  - `decideAiAction(player, round, profile, poolTotal, remainingRounds, rng?) => {action:'bid',cubes} | {action:'pass'}`
  - `computeFinalRanking(players) => Array<{id, total, wonItems}>` (total 내림차순 정렬)

- [ ] **Step 1: 테스트 파일 작성**

`blind-auction-logic.test.js`:

```js
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
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: FAIL — `Cannot find module './blind-auction-logic.js'`

- [ ] **Step 3: `blind-auction-logic.js` 구현**

```js
// blind-auction-logic.js
// 블라인드 경매 순수 게임 로직 (DOM/네트워크 의존성 없음).
// 브라우저에서는 <script src="./blind-auction-logic.js"></script>로 로드되고,
// Node 테스트에서는 require()로 그대로 재사용된다.
(function (root) {
  'use strict';

  var CUBE_VALUES = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25];
  var CUBE_TOTAL = CUBE_VALUES.reduce(function (a, b) { return a + b; }, 0);
  var PLAYER_ORDER = ['user', 'ai1', 'ai2', 'ai3', 'ai4'];
  var TOTAL_ROUNDS = 11;
  var POOL_SIZE = 22;

  function createPlayers() {
    return PLAYER_ORDER.map(function (id) {
      return { id: id, cubes: CUBE_VALUES.slice(), wonItems: [] };
    });
  }

  function findPlayer(players, id) {
    for (var i = 0; i < players.length; i++) {
      if (players[i].id === id) return players[i];
    }
    return null;
  }

  function shuffle(arr, rng) {
    var random = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pickGamePool(allItems, rng) {
    if (allItems.length < POOL_SIZE) {
      throw new Error('물품 풀이 부족합니다 (최소 ' + POOL_SIZE + '개 필요, 현재 ' + allItems.length + '개)');
    }
    var pool = shuffle(allItems, rng).slice(0, POOL_SIZE);
    var poolTotal = pool.reduce(function (sum, item) { return sum + item.value; }, 0);
    var playQueue = shuffle(pool, rng).slice(0, TOTAL_ROUNDS);
    return { pool: pool, poolTotal: poolTotal, playQueue: playQueue };
  }

  function rotateOrder(order, startId) {
    var i = order.indexOf(startId);
    if (i < 0) throw new Error('알 수 없는 플레이어: ' + startId);
    return order.slice(i).concat(order.slice(0, i));
  }

  function createRound(startPlayerId) {
    var active = {};
    var submitted = {};
    var usedCubes = {};
    PLAYER_ORDER.forEach(function (id) {
      active[id] = true;
      submitted[id] = 0;
      usedCubes[id] = [];
    });
    return {
      order: rotateOrder(PLAYER_ORDER, startPlayerId),
      pointer: 0,
      active: active,
      submitted: submitted,
      usedCubes: usedCubes,
      highestPlayerId: null,
      highestTotal: 0,
      log: []
    };
  }

  function activeIds(round) {
    return round.order.filter(function (id) { return round.active[id]; });
  }

  function currentActor(round) {
    var ids = activeIds(round);
    if (ids.length === 0) return null;
    if (ids.length === 1 && ids[0] === round.highestPlayerId) return null;
    var n = round.order.length;
    for (var step = 0; step < n; step++) {
      var id = round.order[(round.pointer + step) % n];
      if (!round.active[id]) continue;
      if (id === round.highestPlayerId) continue;
      return id;
    }
    return null;
  }

  function remainingCubesInRound(player, round) {
    var usedCopy = round.usedCubes[player.id].slice();
    return player.cubes.filter(function (v) {
      var idx = usedCopy.indexOf(v);
      if (idx === -1) return true;
      usedCopy.splice(idx, 1);
      return false;
    });
  }

  function applyBid(round, players, playerId, cubeValues) {
    if (currentActor(round) !== playerId) {
      return { ok: false, reason: 'not_your_turn' };
    }
    if (!cubeValues || cubeValues.length === 0) {
      return { ok: false, reason: 'no_cubes_selected' };
    }
    var player = findPlayer(players, playerId);
    var remainingCopy = remainingCubesInRound(player, round).slice();
    for (var i = 0; i < cubeValues.length; i++) {
      var idx = remainingCopy.indexOf(cubeValues[i]);
      if (idx === -1) return { ok: false, reason: 'cube_not_available' };
      remainingCopy.splice(idx, 1);
    }
    var addSum = cubeValues.reduce(function (a, b) { return a + b; }, 0);
    var newTotal = round.submitted[playerId] + addSum;
    if (newTotal <= round.highestTotal) {
      return { ok: false, reason: 'bid_too_low' };
    }
    round.usedCubes[playerId] = round.usedCubes[playerId].concat(cubeValues);
    round.submitted[playerId] = newTotal;
    round.highestPlayerId = playerId;
    round.highestTotal = newTotal;
    round.pointer = (round.order.indexOf(playerId) + 1) % round.order.length;
    round.log.push({ type: 'bid', playerId: playerId, cubes: cubeValues.slice(), total: newTotal });
    return { ok: true };
  }

  function applyPass(round, playerId) {
    if (currentActor(round) !== playerId) {
      return { ok: false, reason: 'not_your_turn' };
    }
    round.active[playerId] = false;
    round.pointer = (round.order.indexOf(playerId) + 1) % round.order.length;
    round.log.push({ type: 'pass', playerId: playerId });
    return { ok: true };
  }

  function isRoundOver(round) {
    return currentActor(round) === null;
  }

  function getRoundResult(round) {
    if (!isRoundOver(round)) return null;
    if (round.highestPlayerId !== null) {
      return { type: 'won', winnerId: round.highestPlayerId, amount: round.highestTotal };
    }
    return { type: 'unsold' };
  }

  function finalizeRound(round, players, item) {
    var result = getRoundResult(round);
    if (!result) throw new Error('라운드가 아직 끝나지 않았습니다');
    if (result.type === 'won') {
      var winner = findPlayer(players, result.winnerId);
      var remainingHand = winner.cubes.slice();
      round.usedCubes[result.winnerId].forEach(function (v) {
        var idx = remainingHand.indexOf(v);
        if (idx !== -1) remainingHand.splice(idx, 1);
      });
      winner.cubes = remainingHand;
      winner.wonItems.push({ itemId: item.id, itemName: item.item_name, value: item.value, memo: item.memo || null });
    }
    return result;
  }

  function nextStartPlayer(order, previousStartId, roundResult) {
    if (roundResult.type === 'won') return roundResult.winnerId;
    var i = order.indexOf(previousStartId);
    return order[(i + 1) % order.length];
  }

  function pickMinimalRaise(availableCubeValues, extraNeeded) {
    if (extraNeeded <= 0) return [];
    var sorted = availableCubeValues.slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < sorted.length; i++) {
      if (sorted[i] >= extraNeeded) return [sorted[i]];
    }
    var desc = sorted.slice().reverse();
    var chosen = [];
    var sum = 0;
    for (var j = 0; j < desc.length; j++) {
      chosen.push(desc[j]);
      sum += desc[j];
      if (sum >= extraNeeded) return chosen;
    }
    return null;
  }

  function createAiProfiles(rng) {
    var random = rng || Math.random;
    var profiles = {};
    ['ai1', 'ai2', 'ai3', 'ai4'].forEach(function (id) {
      profiles[id] = { aggressiveness: 0.8 + random() * 0.5 };
    });
    return profiles;
  }

  function computeAiWillingness(profile, poolTotal, rng) {
    var random = rng || Math.random;
    var avg = poolTotal / POOL_SIZE;
    var jitter = 0.85 + random() * 0.3;
    return avg * profile.aggressiveness * jitter;
  }

  function decideAiAction(player, round, profile, poolTotal, remainingRounds, rng) {
    var willingness = computeAiWillingness(profile, poolTotal, rng);
    var remaining = remainingCubesInRound(player, round);
    var remainingHandTotal = remaining.reduce(function (a, b) { return a + b; }, 0);
    var budgetCap = remainingRounds > 0 ? (remainingHandTotal / remainingRounds) * 1.6 : remainingHandTotal;
    var maxWillingness = Math.min(willingness, budgetCap);
    var extraNeeded = round.highestTotal - round.submitted[player.id] + 1;
    var prospectiveTotal = round.submitted[player.id] + extraNeeded;
    if (prospectiveTotal > maxWillingness) {
      return { action: 'pass' };
    }
    var cubes = pickMinimalRaise(remaining, extraNeeded);
    if (!cubes) return { action: 'pass' };
    return { action: 'bid', cubes: cubes };
  }

  function computeFinalRanking(players) {
    return players
      .map(function (p) {
        var total = p.wonItems.reduce(function (sum, it) { return sum + it.value; }, 0);
        return { id: p.id, total: total, wonItems: p.wonItems.slice() };
      })
      .sort(function (a, b) { return b.total - a.total; });
  }

  var api = {
    CUBE_VALUES: CUBE_VALUES,
    CUBE_TOTAL: CUBE_TOTAL,
    PLAYER_ORDER: PLAYER_ORDER,
    TOTAL_ROUNDS: TOTAL_ROUNDS,
    POOL_SIZE: POOL_SIZE,
    createPlayers: createPlayers,
    findPlayer: findPlayer,
    shuffle: shuffle,
    pickGamePool: pickGamePool,
    rotateOrder: rotateOrder,
    createRound: createRound,
    currentActor: currentActor,
    remainingCubesInRound: remainingCubesInRound,
    applyBid: applyBid,
    applyPass: applyPass,
    isRoundOver: isRoundOver,
    getRoundResult: getRoundResult,
    finalizeRound: finalizeRound,
    nextStartPlayer: nextStartPlayer,
    pickMinimalRaise: pickMinimalRaise,
    createAiProfiles: createAiProfiles,
    computeAiWillingness: computeAiWillingness,
    decideAiAction: decideAiAction,
    computeFinalRanking: computeFinalRanking
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.BlindAuctionLogic = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: 테스트 실행해서 전부 통과 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: PASS — 모든 테스트 통과 (18개 테스트)

- [ ] **Step 5: 커밋**

```bash
git add blind-auction-logic.js blind-auction-logic.test.js
git commit -m "feat: 블라인드 경매 순수 게임 로직 모듈 추가"
```

---

## Task 3: 관리자 페이지에 "경매 물품 관리" 탭 추가

**Files:**
- Create: `admin-auction-parse.js`
- Create: `admin-auction-parse.test.js`
- Modify: `admin.html`

**Interfaces:**
- Consumes: 없음 (Task 3는 독립)
- Produces: 브라우저 전역 `window.AdminAuctionParse.parseAuctionBulkText(text) => { items: Array<{item_name, value, memo}>, failedCount: number }`. `admin.html`이 `auction_items` 테이블에 대해 anon insert/select/delete를 수행할 수 있게 함 (Task 4에서 게임이 같은 테이블을 select로 읽음).

- [ ] **Step 1: 파서 테스트 작성**

`admin-auction-parse.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAuctionBulkText } = require('./admin-auction-parse.js');

test('parses well-formed lines with and without memo', () => {
  const text = '금시계, 18, 스위스제\n광대열론, 3\n';
  const { items, failedCount } = parseAuctionBulkText(text);
  assert.equal(failedCount, 0);
  assert.deepEqual(items, [
    { item_name: '금시계', value: 18, memo: '스위스제' },
    { item_name: '광대열론', value: 3, memo: null },
  ]);
});

test('skips blank lines', () => {
  const { items } = parseAuctionBulkText('금시계, 18\n\n\n광대열론, 3');
  assert.equal(items.length, 2);
});

test('counts lines with a non-numeric or missing value as failures', () => {
  const { items, failedCount } = parseAuctionBulkText('금시계, 열여덟\n광대열론, 3\n이름없음,');
  assert.equal(items.length, 1);
  assert.equal(failedCount, 2);
});

test('counts a line with no item name as a failure', () => {
  const { items, failedCount } = parseAuctionBulkText(', 10');
  assert.equal(items.length, 0);
  assert.equal(failedCount, 1);
});

test('rejects non-integer values', () => {
  const { items, failedCount } = parseAuctionBulkText('금시계, 18.5');
  assert.equal(items.length, 0);
  assert.equal(failedCount, 1);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test admin-auction-parse.test.js`
Expected: FAIL — `Cannot find module './admin-auction-parse.js'`

- [ ] **Step 3: `admin-auction-parse.js` 구현**

```js
// admin-auction-parse.js
// "물품명, 가치, 메모" 붙여넣기 텍스트를 파싱하는 순수 함수. DOM/네트워크 의존성 없음.
(function (root) {
  'use strict';

  function parseAuctionBulkText(text) {
    var lines = text.split('\n');
    var items = [];
    var failedCount = 0;
    lines.forEach(function (rawLine) {
      var line = rawLine.trim();
      if (!line) return;
      var parts = line.split(',').map(function (s) { return s.trim(); });
      var itemName = parts[0];
      var valueStr = parts[1];
      var memo = parts[2] || null;
      var value = valueStr !== undefined ? Number(valueStr) : NaN;
      if (!itemName || valueStr === undefined || !Number.isFinite(value) || !Number.isInteger(value)) {
        failedCount++;
        return;
      }
      items.push({ item_name: itemName, value: value, memo: memo });
    });
    return { items: items, failedCount: failedCount };
  }

  var api = { parseAuctionBulkText: parseAuctionBulkText };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.AdminAuctionParse = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: 테스트 실행해서 전부 통과 확인**

Run: `node --test admin-auction-parse.test.js`
Expected: PASS — 모든 테스트 통과 (5개 테스트)

- [ ] **Step 5: `admin.html`에 탭 바 추가 (CSS)**

`admin.html`의 `</style>` 바로 앞에 다음을 추가:

```css
  .tab-bar { display: flex; gap: 8px; }
  .tab-btn {
    flex: 1; font-size: 13px; font-weight: 700; padding: 10px 12px;
    border-radius: 10px; border: 1px solid var(--border-strong);
    background: var(--panel-light); color: var(--text-dim); cursor: pointer;
  }
  .tab-btn.active { background: rgba(95,184,176,.16); color: var(--text); border-color: var(--accent); }
  .tab-panel.hidden { display: none; }

  .auction-form-card {
    display: flex; flex-direction: column; gap: 8px;
    background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px;
  }
  .card-title { font-size: 13px; font-weight: 700; }
  .card-hint { font-size: 11.5px; color: var(--text-dimmer); }
  .auction-form-card input, .auction-form-card textarea {
    background: var(--panel-light); border: 1px solid var(--border-strong); color: var(--text);
    border-radius: 8px; padding: 9px 10px; font-size: 13.5px; font-family: inherit; resize: vertical;
  }
```

- [ ] **Step 6: `admin.html`에 파서 스크립트 로드 추가**

Modify `admin.html:8-9` (기존 Pretendard `<link>` 다음 줄) — 다음 줄을 추가:

```html
<script src="./admin-auction-parse.js"></script>
```

- [ ] **Step 7: `admin.html` body에 탭 바 + 기존 콘텐츠를 `tab-elim` 패널로 감싸기**

`admin.html:174-192`의 다음 블록을:

```html
    <div class="header-row">
      <div>
        <div class="title">탈락자 관리</div>
        <div class="subtitle">매주 탈락자를 처리하면 예측 페이지에 바로 반영됩니다.</div>
      </div>
      <div class="nav-links">
        <a class="btn" href="./predict.html">예측</a>
        <a class="btn" href="https://pgamex.vercel.app/">홈</a>
      </div>
    </div>

    <div class="week-box">
      <label for="week-input">이번 탈락 처리 주차</label>
      <input id="week-input" type="number" min="1" value="1">
    </div>

    <div class="status-banner" id="status-banner"></div>

    <div id="teams"></div>
```

다음으로 교체:

```html
    <div class="header-row">
      <div>
        <div class="title" id="page-title">탈락자 관리</div>
        <div class="subtitle" id="page-subtitle">매주 탈락자를 처리하면 예측 페이지에 바로 반영됩니다.</div>
      </div>
      <div class="nav-links">
        <a class="btn" href="https://pgamex.vercel.app/">홈</a>
      </div>
    </div>

    <div class="tab-bar">
      <button type="button" class="tab-btn active" data-tab="elim">탈락자 관리</button>
      <button type="button" class="tab-btn" data-tab="auction">경매 물품 관리</button>
    </div>

    <div id="tab-elim" class="tab-panel">
      <div class="week-box">
        <label for="week-input">이번 탈락 처리 주차</label>
        <input id="week-input" type="number" min="1" value="1">
      </div>

      <div class="status-banner" id="status-banner"></div>

      <div id="teams"></div>
    </div>

    <div id="tab-auction" class="tab-panel hidden">
      <div class="status-banner" id="auction-count-banner"></div>

      <div class="auction-form-card">
        <div class="card-title">단건 등록</div>
        <input id="auction-name-input" type="text" placeholder="물품명" maxlength="40">
        <input id="auction-value-input" type="number" placeholder="가치" min="0">
        <input id="auction-memo-input" type="text" placeholder="메모(선택)" maxlength="80">
        <button type="button" class="btn" id="auction-add-btn">등록</button>
      </div>

      <div class="auction-form-card">
        <div class="card-title">여러 건 붙여넣기</div>
        <div class="card-hint">한 줄에 하나씩: 물품명, 가치, 메모(선택)</div>
        <textarea id="auction-bulk-input" rows="6" placeholder="금시계, 18, 스위스제&#10;광대열론, 3"></textarea>
        <button type="button" class="btn" id="auction-bulk-btn">일괄 등록</button>
      </div>

      <div id="auction-list"></div>
    </div>
```

주의: 기존 `<a class="btn" href="./predict.html">예측</a>` 링크는 "탈락자 관리" 탭 전용이었지만, 탭이 하나의 페이지에 공존하게 되므로 헤더에서는 제거하고 "홈" 링크만 남긴다(예측 페이지 링크는 `index.html` 허브에서 이미 접근 가능).

- [ ] **Step 8: `admin.html` 스크립트에 탭 전환 + 경매 물품 CRUD 로직 추가**

`admin.html:378` (`document.getElementById("gate-form")...` 블록이 끝나는 `});` 바로 다음, `})();` 바로 앞)에 다음을 삽입:

```js

  const AUCTION_TABLE = "auction_items";
  let AUCTION_ITEMS = [];
  let auctionTabInitialized = false;

  async function fetchAuctionItems() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${AUCTION_TABLE}?select=id,item_name,value,memo,created_at&order=created_at.desc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) throw new Error("경매 물품 목록 조회 실패");
    AUCTION_ITEMS = await res.json();
  }

  async function insertAuctionItems(items) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${AUCTION_TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error("경매 물품 등록 실패");
    return res.json();
  }

  async function deleteAuctionItem(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${AUCTION_TABLE}?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error("삭제 실패");
  }

  function renderAuctionCountBanner() {
    const el = document.getElementById("auction-count-banner");
    const count = AUCTION_ITEMS.length;
    el.className = "status-banner show " + (count >= 22 ? "ok" : "err");
    el.textContent = count >= 22
      ? `${count}건 등록됨 · 게임 시작 가능`
      : `${count}건 등록됨 · 게임 시작에 ${22 - count}건 더 필요`;
  }

  function renderAuctionList() {
    const wrap = document.getElementById("auction-list");
    wrap.innerHTML = "";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";

    for (const item of AUCTION_ITEMS) {
      const row = document.createElement("div");
      row.className = "participant-row";
      row.innerHTML = `
        <span class="p-name">${item.item_name}</span>
        <span class="p-meta">가치 ${item.value}${item.memo ? " · " + item.memo : ""}</span>
      `;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-danger";
      btn.textContent = "삭제";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await deleteAuctionItem(item.id);
          await fetchAuctionItems();
          renderAuctionCountBanner();
          renderAuctionList();
        } catch (err) {
          showStatus("삭제에 실패했습니다.", true);
          btn.disabled = false;
        }
      });
      row.appendChild(btn);
      wrap.appendChild(row);
    }
  }

  async function initAuctionTab() {
    try {
      await fetchAuctionItems();
    } catch (err) {
      showStatus("경매 물품 목록을 불러오지 못했습니다.", true);
    }
    renderAuctionCountBanner();
    renderAuctionList();

    document.getElementById("auction-add-btn").addEventListener("click", async () => {
      const nameInput = document.getElementById("auction-name-input");
      const valueInput = document.getElementById("auction-value-input");
      const memoInput = document.getElementById("auction-memo-input");
      const name = nameInput.value.trim();
      const value = Number(valueInput.value);
      if (!name || !Number.isFinite(value) || !Number.isInteger(value)) {
        showStatus("물품명과 정수 가치를 입력해주세요.", true);
        return;
      }
      try {
        await insertAuctionItems([{ item_name: name, value, memo: memoInput.value.trim() || null }]);
        nameInput.value = "";
        valueInput.value = "";
        memoInput.value = "";
        await fetchAuctionItems();
        renderAuctionCountBanner();
        renderAuctionList();
        showStatus(`${name}을(를) 등록했습니다.`);
      } catch (err) {
        showStatus("등록에 실패했습니다.", true);
      }
    });

    document.getElementById("auction-bulk-btn").addEventListener("click", async () => {
      const textarea = document.getElementById("auction-bulk-input");
      const { items, failedCount } = window.AdminAuctionParse.parseAuctionBulkText(textarea.value);
      if (items.length === 0) {
        showStatus("등록할 수 있는 줄이 없습니다.", true);
        return;
      }
      try {
        await insertAuctionItems(items);
        textarea.value = "";
        await fetchAuctionItems();
        renderAuctionCountBanner();
        renderAuctionList();
        showStatus(`${items.length}건 등록 완료` + (failedCount ? ` (형식 오류 ${failedCount}건 제외)` : ""));
      } catch (err) {
        showStatus("일괄 등록에 실패했습니다.", true);
      }
    });
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("tab-elim").classList.toggle("hidden", tab !== "elim");
      document.getElementById("tab-auction").classList.toggle("hidden", tab !== "auction");
      if (tab === "auction" && !auctionTabInitialized) {
        auctionTabInitialized = true;
        initAuctionTab();
      }
    });
  });
```

- [ ] **Step 9: 브라우저에서 수동 검증**

로컬 정적 서버를 실행:

Run: `python -m http.server 8787` (프로젝트 루트에서)

브라우저로 `http://localhost:8787/admin.html` 접속 → 비밀번호(`dbqlgusejr1234`) 입력 → "경매 물품 관리" 탭 클릭 → 단건 등록 폼으로 1건 등록 → 배너에 등록 건수가 반영되는지 확인 → 붙여넣기 박스에 `테스트A, 5\n테스트B, 열, 잘못된값` 입력 후 일괄 등록 → "1건 등록 완료 (형식 오류 1건 제외)" 같은 메시지 확인 → 방금 등록한 항목들 삭제 버튼으로 제거 → "탈락자 관리" 탭으로 돌아가 기존 기능이 여전히 동작하는지 확인.

Expected: 탭 전환, 등록, 붙여넣기 파싱, 삭제가 모두 정상 동작하고 기존 탈락자 관리 기능에 회귀가 없음.

- [ ] **Step 10: 커밋**

```bash
git add admin.html admin-auction-parse.js admin-auction-parse.test.js
git commit -m "feat: 관리자 페이지에 경매 물품 관리 탭 추가"
```

---

## Task 4: `blind-auction.html` 뼈대 — 시작 화면 + 합계 공개 화면

**Files:**
- Create: `blind-auction.html`

**Interfaces:**
- Consumes: `blind-auction-logic.js`의 `window.BlindAuctionLogic` (Task 2), `auction_items` 테이블 select (Task 1)
- Produces: `#screen-start`, `#screen-reveal` 화면 전환이 동작하는 페이지. 이후 태스크가 `#screen-auction`, `#modal-resolve`, `#screen-results`를 이어서 채운다.

- [ ] **Step 1: 전체 뼈대 작성**

`blind-auction.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>블라인드 경매 - 피의 게임 X 시뮬레이터</title>
<link rel="icon" type="image/png" href="./assets/favicon.png">
<style>
  :root {
    --bg: #0f0f12;
    --panel: #15181c;
    --panel-light: #1c2024;
    --border: rgba(255,255,255,.08);
    --text: #e7ebee;
    --text-dim: #8992a0;
    --accent: #5fb8b0;
    --accent-hover: #7fcac3;
    --danger: #e0786f;
    --gold: #ffd166;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); min-height: 100vh; }
  a { color: var(--accent); text-decoration: none; }
  #app {
    min-height: 100vh; display: flex; justify-content: center;
    padding: 24px 16px 48px;
    font-family: -apple-system, "Pretendard", "Segoe UI", "Malgun Gothic", sans-serif;
    color: var(--text);
  }
  .col { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 16px; }
  .header-row { display: flex; align-items: center; justify-content: space-between; }
  .home-link { font-size: 12.5px; font-weight: 700; color: var(--text-dim); }
  .title { font-size: 18px; font-weight: 800; }

  .screen { display: flex; flex-direction: column; gap: 16px; }
  .screen.hidden { display: none; }

  .rules-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
  .rules-title { font-size: 13px; font-weight: 700; color: var(--accent); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em; }
  .rules-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-dim); line-height: 1.5; }

  .status-banner { border-radius: 12px; padding: 10px 14px; font-size: 12.5px; font-weight: 600; display: none; }
  .status-banner.show { display: block; }
  .status-banner.ok { background: rgba(95,184,176,.12); border: 1px solid rgba(95,184,176,.35); color: var(--accent-hover); }
  .status-banner.err { background: rgba(224,120,111,.14); border: 1px solid rgba(224,120,111,.4); color: #f0a89f; }

  .btn-primary { background: var(--accent); color: #0f1214; font-size: 14px; font-weight: 700; border: none; padding: 12px 18px; border-radius: 12px; cursor: pointer; }
  .btn-primary:disabled { opacity: .4; cursor: not-allowed; }
  .btn-secondary { background: var(--panel-light); color: var(--text); font-size: 13.5px; font-weight: 700; border: 1px solid var(--border); padding: 11px 16px; border-radius: 12px; cursor: pointer; text-align: center; }
  .btn-secondary:disabled { opacity: .4; cursor: not-allowed; }
  .action-row { display: flex; gap: 10px; }
  .action-row > * { flex: 1; }

  .reveal-card { background: var(--panel); border: 1px solid var(--border); border-radius: 18px; padding: 28px; text-align: center; display: flex; flex-direction: column; gap: 6px; }
  .reveal-label { font-size: 12.5px; color: var(--text-dim); }
  .reveal-total { font-size: 38px; font-weight: 800; }
  .reveal-hint { font-size: 12px; color: var(--text-dim); }

  .round-header { display: flex; flex-direction: column; gap: 2px; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; }
  #round-counter { font-size: 11.5px; color: var(--text-dim); font-weight: 700; }
  #item-name-label { font-size: 19px; font-weight: 800; }

  .players-bar { display: flex; flex-wrap: wrap; gap: 8px; }
  .player-chip { flex: 1 1 auto; min-width: 90px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; }
  .player-chip.leading { border-color: var(--gold); background: rgba(255,209,102,.1); }
  .player-chip.passed { opacity: .45; }
  .player-name { font-weight: 700; font-size: 12.5px; }
  .player-status { color: var(--text-dim); }
  .player-cubes { color: var(--text-dim); }

  .highest-card { display: flex; align-items: baseline; gap: 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; }
  .highest-label { font-size: 11.5px; color: var(--text-dim); }
  .highest-value { font-size: 22px; font-weight: 800; }
  .highest-bidder { font-size: 12.5px; color: var(--accent); font-weight: 700; }

  .turn-banner { text-align: center; font-size: 13px; font-weight: 700; color: var(--gold); min-height: 18px; }

  .cube-tray { display: flex; flex-wrap: wrap; gap: 8px; }
  .cube-btn { width: 52px; height: 52px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel-light); color: var(--text); font-size: 15px; font-weight: 700; cursor: pointer; }
  .cube-btn.selected { background: var(--accent); color: #0f1214; border-color: var(--accent); }
  .cube-btn.used { opacity: .25; cursor: not-allowed; }
  .selected-sum { font-size: 12.5px; color: var(--text-dim); text-align: center; }

  .log-card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px; max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .log-line { font-size: 12px; color: var(--text-dim); }

  .modal { position: fixed; inset: 0; background: rgba(6,7,9,.75); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
  .modal.hidden { display: none; }
  .modal-box { background: var(--panel); border: 1px solid var(--border); border-radius: 20px; padding: 28px 24px; max-width: 340px; width: 100%; display: flex; flex-direction: column; gap: 10px; text-align: center; }
  .modal-item-name { font-size: 19px; font-weight: 800; }
  .modal-value { font-size: 26px; font-weight: 800; color: var(--gold); }
  .modal-memo { font-size: 12.5px; color: var(--text-dim); }
  .modal-winner { font-size: 13.5px; font-weight: 700; color: var(--accent); }

  .results-title { font-size: 19px; font-weight: 800; text-align: center; }
  .ranking-row { display: flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; font-size: 12.5px; }
  .ranking-row.winner { border-color: var(--gold); background: rgba(255,209,102,.08); }
  .rank-no { width: 18px; font-weight: 800; color: var(--text-dim); }
  .rank-name { width: 44px; font-weight: 700; }
  .rank-total { width: 50px; font-weight: 800; color: var(--accent-hover); }
  .rank-items { flex: 1; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .nickname-row { display: flex; gap: 8px; align-items: center; }
  .nickname-row label { font-size: 12.5px; color: var(--text-dim); flex-shrink: 0; }
  #nickname-input { flex: 1; background: var(--panel-light); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 9px 10px; font-size: 13.5px; }

  #leaderboard-section { display: flex; flex-direction: column; gap: 8px; }
  .leaderboard-title { font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .06em; text-align: center; }
  .leaderboard-row { display: flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; font-size: 12.5px; }
  .lb-rank { width: 18px; color: var(--text-dim); font-weight: 700; }
  .lb-nickname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lb-score { font-weight: 800; color: var(--gold); }
</style>
</head>
<body>
<div id="app">
  <div class="col">
    <div class="header-row">
      <a href="./index.html" class="home-link">← 홈</a>
      <span class="title">블라인드 경매</span>
    </div>

    <div id="screen-start" class="screen">
      <div class="rules-card">
        <div class="rules-title">규칙</div>
        <ul class="rules-list">
          <li>물품 22개 중 실제로 경매에 오르는 건 11개뿐입니다.</li>
          <li>물품의 실제 가치는 낙찰 전까지 비공개입니다.</li>
          <li>큐브(1,2,3,4,6,8,10,12,15,20,25)를 조합해 입찰하세요.</li>
          <li>한 번 낸 큐브는 이번 경매가 끝날 때까지 회수할 수 없습니다.</li>
          <li>11라운드 종료 후 낙찰 물품 가치 합계가 가장 높은 사람이 승리합니다.</li>
        </ul>
      </div>
      <div id="start-status" class="status-banner"></div>
      <button type="button" class="btn-primary" id="start-btn" disabled>게임 시작</button>
    </div>

    <div id="screen-reveal" class="screen hidden">
      <div class="reveal-card">
        <div class="reveal-label">물품 22개 가치 총합</div>
        <div class="reveal-total" id="reveal-total-value">0</div>
        <div class="reveal-hint">이 중 11개만 경매에 오릅니다.</div>
      </div>
      <button type="button" class="btn-primary" id="reveal-continue-btn">경매 시작</button>
    </div>

    <div id="screen-auction" class="screen hidden">
      <div class="round-header">
        <span id="round-counter">1 / 11 라운드</span>
        <span id="item-name-label">?</span>
      </div>

      <div class="players-bar" id="players-bar"></div>

      <div class="highest-card">
        <span class="highest-label">현재 최고가</span>
        <span class="highest-value" id="highest-value">0</span>
        <span class="highest-bidder" id="highest-bidder">-</span>
      </div>

      <div class="turn-banner" id="turn-banner"></div>

      <div class="cube-tray" id="cube-tray"></div>
      <div class="selected-sum" id="selected-sum-label"></div>

      <div class="action-row">
        <button type="button" class="btn-primary" id="bid-btn" disabled>입찰</button>
        <button type="button" class="btn-secondary" id="pass-btn" disabled>포기</button>
      </div>

      <div class="log-card" id="log-list"></div>
    </div>

    <div id="screen-results" class="screen hidden">
      <div class="results-title">최종 결과</div>
      <div id="ranking-list"></div>
      <div class="nickname-row">
        <label for="nickname-input">닉네임</label>
        <input id="nickname-input" type="text" maxlength="12" placeholder="리더보드에 표시할 이름">
        <button type="button" class="btn-primary" id="submit-score-btn">리더보드 등록</button>
      </div>
      <div id="leaderboard-section">
        <div class="leaderboard-title">리더보드</div>
        <div id="leaderboard-list"></div>
      </div>
      <div class="action-row">
        <button type="button" class="btn-secondary" id="restart-btn">다시하기</button>
        <a class="btn-secondary" href="./index.html">홈으로</a>
      </div>
    </div>
  </div>
</div>

<div id="modal-resolve" class="modal hidden">
  <div class="modal-box">
    <div class="modal-item-name" id="resolve-item-name"></div>
    <div class="modal-value" id="resolve-value"></div>
    <div class="modal-memo" id="resolve-memo"></div>
    <div class="modal-winner" id="resolve-winner"></div>
    <button type="button" class="btn-primary" id="resolve-next-btn">다음 물품</button>
  </div>
</div>

<script src="./blind-auction-logic.js"></script>
<script>
(function () {
  "use strict";

  const SUPABASE_URL = "https://paktzmofotvwfdxcpmzv.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW";
  const ITEMS_TABLE = "auction_items";

  const L = window.BlindAuctionLogic;

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
  }

  let state = null;

  function resetGame() {
    state = {
      players: L.createPlayers(),
      aiProfiles: L.createAiProfiles(),
      pool: null,
      poolTotal: 0,
      playQueue: [],
      roundIndex: 0,
      startPlayerId: L.PLAYER_ORDER[Math.floor(Math.random() * L.PLAYER_ORDER.length)],
      round: null,
      currentItem: null,
      selectedCubes: [],
    };
  }

  async function fetchAllItems() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${ITEMS_TABLE}?select=id,item_name,value,memo`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) throw new Error("물품 목록 조회 실패");
    return res.json();
  }

  async function initStartScreen() {
    const statusEl = document.getElementById("start-status");
    const startBtn = document.getElementById("start-btn");
    startBtn.disabled = true;
    try {
      const items = await fetchAllItems();
      if (items.length < L.POOL_SIZE) {
        statusEl.className = "status-banner show err";
        statusEl.textContent = `등록된 물품이 ${items.length}개뿐입니다. ${L.POOL_SIZE}개 이상 필요합니다. 관리자 페이지에서 등록해주세요.`;
        return;
      }
      statusEl.className = "status-banner show ok";
      statusEl.textContent = `${items.length}개 등록됨 · 게임 시작 가능`;
      startBtn.disabled = false;
      startBtn.onclick = () => beginGame(items);
    } catch (err) {
      statusEl.className = "status-banner show err";
      statusEl.textContent = "물품 목록을 불러오지 못했습니다. 새로고침 해주세요.";
    }
  }

  function beginGame(items) {
    resetGame();
    const { pool, poolTotal, playQueue } = L.pickGamePool(items);
    state.pool = pool;
    state.poolTotal = poolTotal;
    state.playQueue = playQueue;
    document.getElementById("reveal-total-value").textContent = poolTotal;
    showScreen("screen-reveal");
  }

  document.getElementById("restart-btn").addEventListener("click", () => {
    showScreen("screen-start");
    initStartScreen();
  });

  initStartScreen();
})();
</script>
</body>
</html>
```

- [ ] **Step 2: 브라우저에서 시작~합계공개 화면 수동 검증**

Run: `python -m http.server 8787` (프로젝트 루트에서, 이미 실행 중이 아니라면)

`http://localhost:8787/blind-auction.html` 접속.

Expected: Task 1~3에서 22건 이상 등록해뒀다면 "N개 등록됨 · 게임 시작 가능" 배너와 함께 "게임 시작" 버튼이 활성화됨. 클릭 시 합계 공개 화면으로 전환되고 총합 숫자가 표시됨. (22건 미만이면 차단 메시지가 뜨는지도 admin에서 몇 건 지워서 확인)

- [ ] **Step 3: 커밋**

```bash
git add blind-auction.html
git commit -m "feat: 블라인드 경매 시작/합계공개 화면 뼈대 추가"
```

---

## Task 5: 메인 경매 화면 — 턴 진행, 큐브 트레이, AI 자동 진행

**Files:**
- Modify: `blind-auction.html`

**Interfaces:**
- Consumes: `blind-auction-logic.js`의 `createRound/currentActor/applyBid/applyPass/isRoundOver/decideAiAction/remainingCubesInRound` (Task 2), Task 4의 `state`/`showScreen`/`beginGame`
- Produces: `startNextRound()` 함수 — Task 6(낙찰/유찰 모달)이 이 함수를 라운드 종료 후 재호출해 다음 라운드로 넘어감

- [ ] **Step 1: `beginGame` 다음에 라운드 진행 함수 삽입**

`blind-auction.html`의 `<script>` 블록에서 `document.getElementById("restart-btn")...` 줄 바로 앞에 다음을 삽입:

```js
  function startNextRound() {
    if (state.roundIndex >= state.playQueue.length) {
      showResults();
      return;
    }
    state.currentItem = state.playQueue[state.roundIndex];
    state.round = L.createRound(state.startPlayerId);
    state.selectedCubes = [];
    showScreen("screen-auction");
    renderAuctionScreen();
    maybeRunAiTurn();
  }

  function renderPlayersBar() {
    const wrap = document.getElementById("players-bar");
    wrap.innerHTML = "";
    L.PLAYER_ORDER.forEach((id) => {
      const player = L.findPlayer(state.players, id);
      const active = state.round.active[id];
      const isLeader = state.round.highestPlayerId === id;
      const div = document.createElement("div");
      div.className = "player-chip" + (active ? "" : " passed") + (isLeader ? " leading" : "");
      const cubesLabel = id === "user" ? `큐브 ${player.cubes.reduce((a, b) => a + b, 0)}` : "";
      div.innerHTML = `<span class="player-name">${PLAYER_LABELS[id]}</span><span class="player-status">${active ? (isLeader ? "최고가" : "대기") : "포기"}</span><span class="player-cubes">${cubesLabel}</span>`;
      wrap.appendChild(div);
    });
  }

  function renderCubeTray() {
    const wrap = document.getElementById("cube-tray");
    wrap.innerHTML = "";
    const user = L.findPlayer(state.players, "user");
    const remaining = L.remainingCubesInRound(user, state.round);
    L.CUBE_VALUES.forEach((v) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cube-btn";
      btn.textContent = v;
      const held = remaining.includes(v);
      if (!held) {
        btn.disabled = true;
        btn.classList.add("used");
      }
      if (state.selectedCubes.includes(v)) {
        btn.classList.add("selected");
      }
      btn.addEventListener("click", () => {
        const idx = state.selectedCubes.indexOf(v);
        if (idx === -1) state.selectedCubes.push(v);
        else state.selectedCubes.splice(idx, 1);
        renderAuctionScreen();
      });
      wrap.appendChild(btn);
    });
  }

  function renderLog() {
    const wrap = document.getElementById("log-list");
    wrap.innerHTML = "";
    state.round.log.slice().reverse().forEach((entry) => {
      const line = document.createElement("div");
      line.className = "log-line";
      line.textContent = entry.type === "bid"
        ? `${PLAYER_LABELS[entry.playerId]} → ${entry.total} (+${entry.cubes.join(",")})`
        : `${PLAYER_LABELS[entry.playerId]} 포기`;
      wrap.appendChild(line);
    });
  }

  function renderAuctionScreen() {
    document.getElementById("round-counter").textContent = `${state.roundIndex + 1} / ${L.TOTAL_ROUNDS} 라운드`;
    document.getElementById("item-name-label").textContent = state.currentItem.item_name;
    document.getElementById("highest-value").textContent = state.round.highestTotal;
    document.getElementById("highest-bidder").textContent =
      state.round.highestPlayerId ? PLAYER_LABELS[state.round.highestPlayerId] : "-";

    renderPlayersBar();
    renderCubeTray();
    renderLog();

    const actor = L.currentActor(state.round);
    const isUserTurn = actor === "user";
    const selectedSum = state.selectedCubes.reduce((a, b) => a + b, 0);
    const prospective = state.round.submitted.user + selectedSum;

    document.getElementById("selected-sum-label").textContent =
      selectedSum > 0 ? `선택한 큐브 합계: ${selectedSum} (누적 ${prospective})` : "큐브를 선택해 입찰액을 만드세요";

    const turnBanner = document.getElementById("turn-banner");
    turnBanner.textContent = isUserTurn ? "당신의 차례입니다" : (actor ? `${PLAYER_LABELS[actor]} 진행 중...` : "");

    document.getElementById("bid-btn").disabled = !isUserTurn || selectedSum === 0 || prospective <= state.round.highestTotal;
    document.getElementById("pass-btn").disabled = !isUserTurn;
  }

  function handleUserBid() {
    if (state.selectedCubes.length === 0) return;
    const res = L.applyBid(state.round, state.players, "user", state.selectedCubes.slice());
    if (!res.ok) return;
    state.selectedCubes = [];
    afterAction();
  }

  function handleUserPass() {
    L.applyPass(state.round, "user");
    state.selectedCubes = [];
    afterAction();
  }

  function afterAction() {
    if (L.isRoundOver(state.round)) {
      resolveRound();
      return;
    }
    renderAuctionScreen();
    maybeRunAiTurn();
  }

  function maybeRunAiTurn() {
    const actor = L.currentActor(state.round);
    if (!actor || actor === "user") return;
    setTimeout(() => {
      const player = L.findPlayer(state.players, actor);
      const profile = state.aiProfiles[actor];
      const remainingRounds = L.TOTAL_ROUNDS - state.roundIndex;
      const decision = L.decideAiAction(player, state.round, profile, state.poolTotal, remainingRounds);
      if (decision.action === "bid") {
        L.applyBid(state.round, state.players, actor, decision.cubes);
      } else {
        L.applyPass(state.round, actor);
      }
      afterAction();
    }, 550);
  }

  document.getElementById("bid-btn").addEventListener("click", handleUserBid);
  document.getElementById("pass-btn").addEventListener("click", handleUserPass);
  document.getElementById("reveal-continue-btn").addEventListener("click", startNextRound);

```

`PLAYER_LABELS` 상수를 `const L = window.BlindAuctionLogic;` 바로 다음 줄에 추가:

```js
  const PLAYER_LABELS = { user: "나", ai1: "AI 1", ai2: "AI 2", ai3: "AI 3", ai4: "AI 4" };
```

- [ ] **Step 2: 브라우저에서 한 라운드 수동 검증**

`http://localhost:8787/blind-auction.html`에서 게임 시작 → 합계 공개 → "경매 시작" 클릭.

Expected: 경매 화면이 뜨고, 선 플레이어가 유저가 아니면 잠시 후 AI가 자동으로 입찰/포기하며 로그에 쌓임. 유저 차례가 되면 "당신의 차례입니다" 배너와 함께 큐브 버튼들이 활성화되고, 큐브를 선택하면 "선택한 큐브 합계"가 갱신되며, 현재 최고가를 넘기지 못하면 "입찰" 버튼이 비활성 상태로 유지됨. 큐브를 선택해 최고가를 넘기면 "입찰" 버튼이 활성화되고 클릭 시 로그에 반영되며 다음 차례로 넘어감.

(주의: 이 시점에는 라운드가 끝나도 `resolveRound`/`showResults`가 아직 없어 콘솔 에러가 날 수 있음 — Task 6에서 해결. 라운드 진행 자체만 검증하고, 낙찰 직전 단계에서 확인을 마쳐도 무방함.)

- [ ] **Step 3: 커밋**

```bash
git add blind-auction.html
git commit -m "feat: 블라인드 경매 메인 경매 화면 + AI 자동 진행 추가"
```

---

## Task 6: 낙찰/유찰 모달 + 결과 화면 + 리더보드

**Files:**
- Modify: `blind-auction.html`

**Interfaces:**
- Consumes: `blind-auction-logic.js`의 `finalizeRound/nextStartPlayer/computeFinalRanking` (Task 2), `blind_auction_leaderboard` 테이블 (Task 1), Task 5의 `startNextRound`
- Produces: 완결된 게임 루프 (시작 → 11라운드 → 결과 → 리더보드 → 다시하기)

- [ ] **Step 1: `resolveRound`, `showResults`, 리더보드 함수 추가**

`blind-auction.html`의 `<script>` 블록에서 `document.getElementById("reveal-continue-btn")...` 줄 바로 다음에 삽입:

```js

  function resolveRound() {
    const result = L.finalizeRound(state.round, state.players, state.currentItem);
    const modal = document.getElementById("modal-resolve");
    document.getElementById("resolve-item-name").textContent = state.currentItem.item_name;
    document.getElementById("resolve-value").textContent = `실제 가치: ${state.currentItem.value}`;
    document.getElementById("resolve-memo").textContent = state.currentItem.memo || "";
    document.getElementById("resolve-winner").textContent =
      result.type === "won"
        ? `${PLAYER_LABELS[result.winnerId]}님이 ${result.amount}에 낙찰받았습니다.`
        : "유찰 — 아무도 낙찰받지 못했습니다.";
    modal.classList.remove("hidden");

    state.startPlayerId = L.nextStartPlayer(L.PLAYER_ORDER, state.startPlayerId, result);
    state.roundIndex += 1;
  }

  document.getElementById("resolve-next-btn").addEventListener("click", () => {
    document.getElementById("modal-resolve").classList.add("hidden");
    startNextRound();
  });

  const LEADERBOARD_TABLE = "blind_auction_leaderboard";
  const NICKNAME_KEY = "blindAuctionNickname";

  async function fetchLeaderboard() {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${LEADERBOARD_TABLE}?select=id,nickname,score,created_at&order=score.desc,created_at.asc&limit=10`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) throw new Error("리더보드 조회 실패");
    return res.json();
  }

  async function submitScore(score, nickname) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${LEADERBOARD_TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ score, nickname }),
    });
    if (!res.ok) throw new Error("리더보드 등록 실패");
    return res.json();
  }

  function renderLeaderboard(rows) {
    const wrap = document.getElementById("leaderboard-list");
    wrap.innerHTML = "";
    rows.forEach((row, i) => {
      const line = document.createElement("div");
      line.className = "leaderboard-row";
      line.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-nickname">${row.nickname || "익명"}</span><span class="lb-score">${row.score}</span>`;
      wrap.appendChild(line);
    });
  }

  async function showResults() {
    showScreen("screen-results");
    const ranking = L.computeFinalRanking(state.players);
    const wrap = document.getElementById("ranking-list");
    wrap.innerHTML = "";
    ranking.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "ranking-row" + (i === 0 ? " winner" : "");
      const items = entry.wonItems.map((it) => it.itemName).join(", ") || "낙찰 없음";
      row.innerHTML = `<span class="rank-no">${i + 1}</span><span class="rank-name">${PLAYER_LABELS[entry.id]}</span><span class="rank-total">${entry.total}</span><span class="rank-items">${items}</span>`;
      wrap.appendChild(row);
    });

    const userEntry = ranking.find((r) => r.id === "user");
    const nicknameInput = document.getElementById("nickname-input");
    nicknameInput.value = localStorage.getItem(NICKNAME_KEY) || "";

    document.getElementById("submit-score-btn").onclick = async () => {
      const nickname = nicknameInput.value.trim() || "익명";
      localStorage.setItem(NICKNAME_KEY, nickname);
      try {
        await submitScore(userEntry.total, nickname);
        const rows = await fetchLeaderboard();
        renderLeaderboard(rows);
      } catch (err) {
        alert("리더보드 등록에 실패했습니다.");
      }
    };

    try {
      const rows = await fetchLeaderboard();
      renderLeaderboard(rows);
    } catch (err) {
      // 리더보드 조회 실패는 결과 화면 표시 자체를 막지 않음
    }
  }
```

- [ ] **Step 2: 브라우저에서 전체 11라운드 플로우 수동 검증**

`http://localhost:8787/blind-auction.html`에서 게임을 시작해 11라운드를 끝까지 진행(입찰과 포기를 섞어가며 플레이).

Expected: 각 라운드 종료 시 낙찰/유찰 모달이 뜨고, "다음 물품" 클릭 시 다음 라운드로 넘어감. 11라운드가 모두 끝나면 결과 화면에 순위표(참가자별 낙찰 물품 목록 + 합계)가 표시되고, 승자 행에 강조 스타일이 적용됨. 닉네임을 입력하고 "리더보드 등록"을 누르면 목록에 반영됨. "다시하기"를 누르면 시작 화면으로 돌아가 새 게임을 시작할 수 있음.

- [ ] **Step 3: Supabase에서 실제 리더보드 데이터 확인**

`mcp__claude_ai_Supabase__execute_sql`로 `select * from public.blind_auction_leaderboard order by created_at desc limit 5;` 실행.
Expected: 방금 등록한 닉네임/점수 행이 보임.

- [ ] **Step 4: 커밋**

```bash
git add blind-auction.html
git commit -m "feat: 블라인드 경매 낙찰/유찰 모달 및 결과/리더보드 화면 추가"
```

---

## Task 7: 허브에 카드 추가 + 전체 플로우 최종 점검

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: 없음
- Produces: 허브 홈에서 블라인드 경매로 진입 가능

- [ ] **Step 1: `index.html`의 `GAMES` 배열에 카드 추가**

`index.html:186-192`의 다음 블록:

```js
    {
      name: '3단 오목',
      desc: '삼각 격자 91교점에서 흑/백 돌을 놓고 3층까지 쌓으세요',
      href: './gomoku-stack.html',
      target: '_self',
      quads: ['#1c1c1c', '#f0ece2', '#1c1c1c', '#f0ece2'],
    },
```

다음으로 교체 (기존 항목 유지 + 새 항목 추가):

```js
    {
      name: '3단 오목',
      desc: '삼각 격자 91교점에서 흑/백 돌을 놓고 3층까지 쌓으세요',
      href: './gomoku-stack.html',
      target: '_self',
      quads: ['#1c1c1c', '#f0ece2', '#1c1c1c', '#f0ece2'],
    },
    {
      name: '블라인드 경매',
      desc: '가격이 비공개된 물품을 큐브로 낙찰받아 최고가를 노려보세요',
      href: './blind-auction.html',
      target: '_self',
      emoji: '🔨',
    },
```

- [ ] **Step 2: 브라우저에서 허브 → 게임 진입 경로 검증**

`http://localhost:8787/index.html` 접속.
Expected: 게임 목록에 "블라인드 경매" 카드가 🔨 아이콘과 함께 표시되고, 클릭 시 `blind-auction.html`로 이동함. 게임 화면의 "← 홈" 링크로 다시 `index.html`로 돌아올 수 있음.

- [ ] **Step 3: 전체 로직 테스트 재실행 (회귀 확인)**

Run: `node --test blind-auction-logic.test.js admin-auction-parse.test.js`
Expected: PASS — 두 파일의 테스트가 모두 통과 (23개 테스트)

- [ ] **Step 4: 커밋**

```bash
git add index.html
git commit -m "feat: 게임 허브에 블라인드 경매 카드 추가"
```

---

## 완료 후 후속 작업 (이 플랜 범위 밖)

- 실제 경매 물품 데이터를 `admin.html`에서 22건 이상 등록해야 게임을 플레이할 수 있음 — 사용자가 직접 입력.
- 배포(Vercel `game-hub` 모노레포 반영)는 이 플랜에 포함되지 않음 — 별도로 요청 시 진행.
