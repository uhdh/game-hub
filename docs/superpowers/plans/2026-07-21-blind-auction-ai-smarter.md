# 블라인드 경매 AI 고도화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 블라인드 경매(`blind-auction.html`)의 AI 4명에게 서로 다른 성격(아키타입)을 부여하고, 큐브 자원 관리와 라운드 내 반응성을 개선해 더 똑똑하고 다채롭게 행동하도록 만든다.

**Architecture:** 순수 로직은 전부 `blind-auction-logic.js`(DOM/네트워크 의존성 없는 모듈, Node `node:test`로 테스트됨)에만 추가한다. `blind-auction.html`은 이미 존재하는 `state.aiProfiles`를 그대로 사용해 AI 이름 옆에 성격 배지만 노출한다. `decideAiAction`의 함수 시그니처는 바꾸지 않고 내부 계산만 단계적으로 강화한다.

**Tech Stack:** 순수 JavaScript(ES5 스타일, 기존 코드와 통일), Node.js 내장 `node:test` + `node:assert/strict`.

## Global Constraints

- `decideAiAction(player, round, profile, poolTotal, remainingRounds, rng)` 시그니처는 절대 바꾸지 않는다. `blind-auction.html`의 `maybeRunAiTurn` 호출부는 수정하지 않는다.
- AI는 물품의 실제 가치를 모르는 상태를 유지한다 — 계산에 쓰는 값은 오직 `poolTotal / POOL_SIZE`(공개된 22개 평균)뿐이다.
- 아키타입 4종의 파라미터는 다음 값을 정확히 사용한다:
  | 아키타입 | aggressiveness 범위 | pressureThreshold | paceCoefficient | gambleChance | 증폭 배율 |
  |---|---|---|---|---|---|
  | 테토남 | 1.05~1.3 | 1.4 | 0.4 | 0 | - |
  | 에겐남 | 0.75~0.95 | 1.05 | 0.4 | 0 | - |
  | 욜로족 | 0.9~1.1 | 1.4 | 0 | 0.15 | ×1.8~2.2 |
  | 안정형 | 0.9~1.1 | 1.2 | 1.0 | 0 | - |
- 과열도(`pressureRatio = round.highestTotal / (poolTotal/POOL_SIZE)`)가 아키타입 임계값을 넘으면 willingness를 `×0.6`(40% 삭감) 한다.
- 활성 경쟁자 수 반영: 기준점 2명, 1명 차이당 `±4%`, 전체 조정폭은 `±16%`로 clamp.
- 큐브 예산 페이스 보정: `roundsPlayedSoFar = TOTAL_ROUNDS - remainingRounds`가 0보다 클 때만 적용하고, 조정폭은 `±30%`로 clamp.
- `remainingRounds <= 2`일 때 `budgetCap`을 `max(budgetCap, remainingHandTotal * 0.9)`로 완화한다.
- `pickMinimalRaise(availableCubeValues, extraNeeded)`의 시그니처와 반환 형식(cube 배열 또는 `null`)은 유지하되, 내부를 완전탐색(최대 11개 큐브, 2^11=2048가지)으로 교체해 "합계가 extraNeeded 이상이면서 가장 작은 조합(동점이면 개수가 적은 조합)"을 반환한다.
- 이번 계획은 코드 변경만 다룬다. 사이트 공지사항(`site_announcement_history`)에 업데이트 항목을 추가하는 것은 실제 배포가 끝난 뒤 `admin.html`에서 수동으로 처리하며, 이 계획의 태스크에는 포함하지 않는다.

---

### Task 1: AI 성격 아키타입 4종 부여

**Files:**
- Modify: `blind-auction-logic.js:191-198` (`createAiProfiles` 함수와 그 위쪽 상수 영역)
- Modify: `blind-auction-logic.js:232-257` (`api` export 객체)
- Test: `blind-auction-logic.test.js` (파일 끝에 추가)

**Interfaces:**
- Consumes: 기존 `shuffle(arr, rng)` (파일 내부 함수, 이미 정의됨).
- Produces: `createAiProfiles(rng)`가 반환하는 각 프로필 객체는 이제 `{ archetype, aggressiveness, pressureThreshold, paceCoefficient, gambleChance }` 형태. `api.AI_ARCHETYPES`(배열), `api.ARCHETYPE_DESCRIPTIONS`(객체, archetype→설명 문자열) 신규 export. 이후 Task 3~5가 `profile.pressureThreshold`/`profile.paceCoefficient`/`profile.gambleChance`를 사용하고, Task 6이 `api.ARCHETYPE_DESCRIPTIONS`를 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`blind-auction-logic.test.js` 맨 끝에 추가:

```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 새로 추가한 3개 테스트가 FAIL (`profiles[id].archetype`가 `undefined`이라 `L.AI_ARCHETYPES.includes(undefined)` 등이 실패).

- [ ] **Step 3: 최소 구현**

`blind-auction-logic.js`의 `var CUBE_VALUES = ...` 근처(파일 상단, 12번째 줄 `var POOL_SIZE = 22;` 바로 아래)에 추가:

```js
var AI_ARCHETYPES = ['테토남', '에겐남', '욜로족', '안정형'];

var ARCHETYPE_PARAMS = {
  '테토남': { aggressivenessMin: 1.05, aggressivenessMax: 1.3, pressureThreshold: 1.4, paceCoefficient: 0.4, gambleChance: 0 },
  '에겐남': { aggressivenessMin: 0.75, aggressivenessMax: 0.95, pressureThreshold: 1.05, paceCoefficient: 0.4, gambleChance: 0 },
  '욜로족': { aggressivenessMin: 0.9, aggressivenessMax: 1.1, pressureThreshold: 1.4, paceCoefficient: 0, gambleChance: 0.15 },
  '안정형': { aggressivenessMin: 0.9, aggressivenessMax: 1.1, pressureThreshold: 1.2, paceCoefficient: 1.0, gambleChance: 0 }
};

var ARCHETYPE_DESCRIPTIONS = {
  '테토남': '경쟁자가 많아도 잘 버팁니다.',
  '에겐남': '판이 과열되면 빠르게 손을 뗍니다.',
  '욜로족': '가끔 몰빵을 합니다.',
  '안정형': '성과에 따라 스스로 페이스를 조절합니다.'
};
```

기존 `createAiProfiles` 함수(191~198번째 줄)를 통째로 교체:

```js
function createAiProfiles(rng) {
  var random = rng || Math.random;
  var order = shuffle(AI_ARCHETYPES, random);
  var profiles = {};
  ['ai1', 'ai2', 'ai3', 'ai4'].forEach(function (id, idx) {
    var archetype = order[idx];
    var params = ARCHETYPE_PARAMS[archetype];
    profiles[id] = {
      archetype: archetype,
      aggressiveness: params.aggressivenessMin + random() * (params.aggressivenessMax - params.aggressivenessMin),
      pressureThreshold: params.pressureThreshold,
      paceCoefficient: params.paceCoefficient,
      gambleChance: params.gambleChance
    };
  });
  return profiles;
}
```

`api` 객체(232~257번째 줄)에 두 줄 추가 (`createAiProfiles: createAiProfiles,` 바로 위 또는 아래 어디든):

```js
    AI_ARCHETYPES: AI_ARCHETYPES,
    ARCHETYPE_DESCRIPTIONS: ARCHETYPE_DESCRIPTIONS,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 전체 PASS (기존 테스트 포함).

- [ ] **Step 5: 커밋**

```bash
git add blind-auction-logic.js blind-auction-logic.test.js
git commit -m "feat: 블라인드 경매 AI에 성격 아키타입 4종(테토남/에겐남/욜로족/안정형) 부여"
```

---

### Task 2: `pickMinimalRaise` 완전탐색으로 교체

**Files:**
- Modify: `blind-auction-logic.js:174-189` (`pickMinimalRaise` 함수)
- Modify: `blind-auction-logic.test.js:141-143` (기존 테스트 갱신)
- Test: `blind-auction-logic.test.js` (새 테스트 추가)

**Interfaces:**
- Consumes: 없음 (독립 함수).
- Produces: `pickMinimalRaise(availableCubeValues, extraNeeded)` — 반환값은 여전히 큐브 값 배열 또는 `null`이지만, 이제 "합계가 extraNeeded 이상인 조합 중 합계 최소(동점이면 개수 최소)"를 정확히 찾는다. Task 3~5의 `decideAiAction`이 그대로 호출해서 쓴다.

- [ ] **Step 1: 기존 테스트를 새 기대값으로 갱신 + 새 테스트 추가**

`blind-auction-logic.test.js`의 141~143번째 줄(`pickMinimalRaise prefers the single smallest cube that clears the target`)을 교체:

```js
test('pickMinimalRaise prefers the combination with the smallest total that clears the target, even over a single larger cube', () => {
  // {3,4}=7이 정확히 맞아떨어지므로, 초과분이 1인 단일 큐브 8보다 우선한다.
  assert.deepEqual(L.pickMinimalRaise([1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25], 7), [3, 4]);
});

test('pickMinimalRaise breaks a same-total tie by choosing fewer cubes', () => {
  // 목표 4: 단일 큐브 [4]와 조합 [1,3]이 둘 다 합계가 정확히 4로 동일하다 -> 큐브 개수가 적은 [4]를 선택한다.
  assert.deepEqual(L.pickMinimalRaise([1, 3, 4], 4), [4]);
});
```

`pickMinimalRaise falls back to a combination when no single cube suffices`(145~148번째 줄)와 `pickMinimalRaise returns null when no combination can reach the target`(150~152번째 줄)는 이미 결과의 성질만 검증하므로 그대로 둔다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 방금 갱신/추가한 2개 테스트가 FAIL (현재 구현은 `[7]`을 만족하는 첫 단일 큐브 `[8]`을 반환하므로 `[3,4]`와 다름).

- [ ] **Step 3: 최소 구현**

`blind-auction-logic.js`의 `pickMinimalRaise` 함수(174~189번째 줄)를 통째로 교체:

```js
  function pickMinimalRaise(availableCubeValues, extraNeeded) {
    if (extraNeeded <= 0) return [];
    var n = availableCubeValues.length;
    var best = null;
    for (var mask = 1; mask < (1 << n); mask++) {
      var sum = 0;
      var count = 0;
      for (var i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          sum += availableCubeValues[i];
          count++;
        }
      }
      if (sum >= extraNeeded && (!best || sum < best.sum || (sum === best.sum && count < best.count))) {
        best = { sum: sum, count: count, mask: mask };
      }
    }
    if (!best) return null;
    var chosen = [];
    for (var j = 0; j < n; j++) {
      if (best.mask & (1 << j)) chosen.push(availableCubeValues[j]);
    }
    return chosen;
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add blind-auction-logic.js blind-auction-logic.test.js
git commit -m "feat: pickMinimalRaise를 완전탐색으로 교체해 최소 초과분 큐브 조합 선택"
```

---

### Task 3: 라운드 내 반응성 (과열도 + 활성 경쟁자 수)

**Files:**
- Modify: `blind-auction-logic.js:207-221` (`decideAiAction` 함수, 이후 태스크에서도 계속 수정됨)
- Test: `blind-auction-logic.test.js` (새 테스트 추가)

**Interfaces:**
- Consumes: `computeAiWillingness`, `activeIds`, `remainingCubesInRound`, `pickMinimalRaise` (모두 파일 내부에 이미 존재).
- Produces: `decideAiAction`은 이제 `profile.pressureThreshold`(없으면 기본값 1.2)를 읽어 과열 컷을 적용하고, 라운드의 활성 경쟁자 수를 반영한다. 시그니처는 그대로.

- [ ] **Step 1: 실패하는 테스트 작성**

`blind-auction-logic.test.js` 끝에 추가:

```js
test('decideAiAction applies the archetype pressure cut once highestTotal exceeds the pressure threshold', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 13; // avg=10 -> pressureRatio=1.3
  const profile = { aggressiveness: 2.0, pressureThreshold: 1.2 };
  const action = L.decideAiAction(ai1, round, profile, 220, 11, () => 1);
  assert.equal(action.action, 'pass');
});

test('decideAiAction does not apply the pressure cut below the archetype threshold', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 13;
  const profile = { aggressiveness: 2.0, pressureThreshold: 999 };
  const action = L.decideAiAction(ai1, round, profile, 220, 11, () => 1);
  assert.equal(action.action, 'bid');
});

test('decideAiAction becomes more willing to bid when fewer rivals remain active this round', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 9; // extraNeeded = 10
  const profile = { aggressiveness: 1.0 };

  const crowdedAction = L.decideAiAction(ai1, round, profile, 220, 11, () => 0.5);
  assert.equal(crowdedAction.action, 'pass');

  round.active.ai2 = false;
  round.active.ai3 = false;
  round.active.ai4 = false;
  const lenientAction = L.decideAiAction(ai1, round, profile, 220, 11, () => 0.5);
  assert.equal(lenientAction.action, 'bid');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 방금 추가한 3개 테스트가 FAIL (현재 `decideAiAction`은 과열도/경쟁자 수를 전혀 반영하지 않음).

- [ ] **Step 3: 최소 구현**

`pickMinimalRaise` 함수 바로 위(또는 아래)에 헬퍼 추가:

```js
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
```

`decideAiAction` 함수(207~221번째 줄)를 통째로 교체:

```js
  function decideAiAction(player, round, profile, poolTotal, remainingRounds, rng) {
    var random = rng || Math.random;
    var willingness = computeAiWillingness(profile, poolTotal, random);

    var avgValue = poolTotal / POOL_SIZE;
    var pressureThreshold = profile.pressureThreshold != null ? profile.pressureThreshold : 1.2;
    var pressureRatio = avgValue > 0 ? round.highestTotal / avgValue : 0;
    if (pressureRatio > pressureThreshold) {
      willingness = willingness * 0.6;
    }

    var rivals = activeIds(round).filter(function (id) { return id !== player.id; }).length;
    var rivalsAdjustment = clamp((2 - rivals) * 0.04, -0.16, 0.16);
    willingness = willingness * (1 + rivalsAdjustment);

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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 전체 PASS (기존 `decideAiAction` 테스트 2개 포함).

- [ ] **Step 5: 커밋**

```bash
git add blind-auction-logic.js blind-auction-logic.test.js
git commit -m "feat: decideAiAction에 과열도·활성 경쟁자 수 기반 반응성 추가"
```

---

### Task 4: 욜로족 몰빵 모드 (gambleChance)

**Files:**
- Modify: `blind-auction-logic.js` (`decideAiAction` 함수, Task 3에서 만든 버전을 이어서 수정)
- Test: `blind-auction-logic.test.js` (새 테스트 추가)

**Interfaces:**
- Consumes: Task 3의 `decideAiAction` 본문, `profile.gambleChance`.
- Produces: `round.gambleRolls`(객체, `{ [playerId]: boolean }`) — 라운드가 끝날 때까지 유지되는 내부 상태. `round`는 이미 `applyBid`/`applyPass`가 자유롭게 필드를 추가하는 mutable 객체이므로 새로운 필드 추가는 기존 패턴과 일치.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('decideAiAction amplifies willingness when the gamble roll succeeds for a gambleChance archetype', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 10; // extraNeeded = 11
  round.active.ai2 = false;
  round.active.ai3 = false;
  round.active.ai4 = false;
  const profile = { aggressiveness: 1.0, pressureThreshold: 999, gambleChance: 0.5 };
  let calls = 0;
  const rng = () => { calls++; return calls === 1 ? 0.5 : (calls === 2 ? 0.1 : 0.5); };
  const action = L.decideAiAction(ai1, round, profile, 220, 11, rng);
  assert.equal(action.action, 'bid');
});

test('decideAiAction keeps the gamble roll fixed for the rest of the round once decided', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 5;
  const profile = { aggressiveness: 1.0, gambleChance: 0.5 };

  L.decideAiAction(ai1, round, profile, 220, 11, () => 0.1);
  assert.equal(round.gambleRolls.ai1, true);

  L.decideAiAction(ai1, round, profile, 220, 11, () => 0.9);
  assert.equal(round.gambleRolls.ai1, true);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 위 2개 테스트 FAIL (`round.gambleRolls`가 아직 존재하지 않음, 첫 번째 테스트는 증폭이 없어 `extraNeeded=11 > willingness`이므로 `pass`가 나와 기대값 `bid`와 불일치).

- [ ] **Step 3: 최소 구현**

`decideAiAction` 함수에서 `rivalsAdjustment` 계산 다음, `remainingCubesInRound` 호출 이전에 블록 삽입:

```js
  function decideAiAction(player, round, profile, poolTotal, remainingRounds, rng) {
    var random = rng || Math.random;
    var willingness = computeAiWillingness(profile, poolTotal, random);

    var avgValue = poolTotal / POOL_SIZE;
    var pressureThreshold = profile.pressureThreshold != null ? profile.pressureThreshold : 1.2;
    var pressureRatio = avgValue > 0 ? round.highestTotal / avgValue : 0;
    if (pressureRatio > pressureThreshold) {
      willingness = willingness * 0.6;
    }

    var rivals = activeIds(round).filter(function (id) { return id !== player.id; }).length;
    var rivalsAdjustment = clamp((2 - rivals) * 0.04, -0.16, 0.16);
    willingness = willingness * (1 + rivalsAdjustment);

    if (profile.gambleChance) {
      if (!round.gambleRolls) round.gambleRolls = {};
      if (round.gambleRolls[player.id] === undefined) {
        round.gambleRolls[player.id] = random() < profile.gambleChance;
      }
      if (round.gambleRolls[player.id]) {
        willingness = willingness * (1.8 + random() * 0.4);
      }
    }

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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

```bash
git add blind-auction-logic.js blind-auction-logic.test.js
git commit -m "feat: 욜로족 아키타입에 라운드당 1회 몰빵 모드(gambleChance) 추가"
```

---

### Task 5: 큐브 예산 페이스 보정 + 막판 완화

**Files:**
- Modify: `blind-auction-logic.js` (`decideAiAction` 함수, Task 4에서 만든 버전을 이어서 수정 — 이번 태스크가 최종 버전)
- Test: `blind-auction-logic.test.js` (새 테스트 추가)

**Interfaces:**
- Consumes: Task 4의 `decideAiAction` 본문, `profile.paceCoefficient`, `player.wonItems`, `TOTAL_ROUNDS`, `PLAYER_ORDER`.
- Produces: 최종 `decideAiAction` — 이후 태스크 없음, `blind-auction.html`이 그대로 호출.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('decideAiAction raises the effective budget cap for an AI that is behind its expected win pace', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  ai1.wonItems = [];
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 31; // extraNeeded = 32
  round.active.ai2 = false;
  round.active.ai3 = false;
  round.active.ai4 = false;
  const profile = { aggressiveness: 5.0, pressureThreshold: 999, paceCoefficient: 1.0 };
  const action = L.decideAiAction(ai1, round, profile, 220, 6, () => 1);
  assert.equal(action.action, 'bid');
});

test('decideAiAction lowers the effective budget cap for an AI that is ahead of its expected win pace', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  ai1.wonItems = [
    { itemId: 1, itemName: 'a', value: 5 },
    { itemId: 2, itemName: 'b', value: 5 },
  ];
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 24; // extraNeeded = 25
  round.active.ai2 = false;
  round.active.ai3 = false;
  round.active.ai4 = false;
  const profile = { aggressiveness: 5.0, pressureThreshold: 999, paceCoefficient: 1.0 };
  const action = L.decideAiAction(ai1, round, profile, 220, 6, () => 1);
  assert.equal(action.action, 'pass');
});

test('decideAiAction relaxes the budget cap during the final two rounds', () => {
  const players = L.createPlayers();
  const ai1 = L.findPlayer(players, 'ai1');
  const round = L.createRound('user');
  round.highestPlayerId = 'user';
  round.highestTotal = 89; // extraNeeded = 90
  round.active.ai2 = false;
  round.active.ai3 = false;
  round.active.ai4 = false;
  const profile = { aggressiveness: 10.0, pressureThreshold: 999, paceCoefficient: 0 };
  const action = L.decideAiAction(ai1, round, profile, 220, 2, () => 1);
  assert.equal(action.action, 'bid');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 위 3개 테스트 FAIL (현재는 `budgetCap`이 페이스/막판 보정 없이 `(remainingHandTotal/remainingRounds)*1.6`로 고정이라 각 시나리오가 설계와 반대로 나옴).

- [ ] **Step 3: 최소 구현**

`decideAiAction` 함수에서 `budgetCap` 계산 이후, `maxWillingness` 계산 이전에 블록 삽입 (최종 전체 함수):

```js
  function decideAiAction(player, round, profile, poolTotal, remainingRounds, rng) {
    var random = rng || Math.random;
    var willingness = computeAiWillingness(profile, poolTotal, random);

    var avgValue = poolTotal / POOL_SIZE;
    var pressureThreshold = profile.pressureThreshold != null ? profile.pressureThreshold : 1.2;
    var pressureRatio = avgValue > 0 ? round.highestTotal / avgValue : 0;
    if (pressureRatio > pressureThreshold) {
      willingness = willingness * 0.6;
    }

    var rivals = activeIds(round).filter(function (id) { return id !== player.id; }).length;
    var rivalsAdjustment = clamp((2 - rivals) * 0.04, -0.16, 0.16);
    willingness = willingness * (1 + rivalsAdjustment);

    if (profile.gambleChance) {
      if (!round.gambleRolls) round.gambleRolls = {};
      if (round.gambleRolls[player.id] === undefined) {
        round.gambleRolls[player.id] = random() < profile.gambleChance;
      }
      if (round.gambleRolls[player.id]) {
        willingness = willingness * (1.8 + random() * 0.4);
      }
    }

    var remaining = remainingCubesInRound(player, round);
    var remainingHandTotal = remaining.reduce(function (a, b) { return a + b; }, 0);
    var budgetCap = remainingRounds > 0 ? (remainingHandTotal / remainingRounds) * 1.6 : remainingHandTotal;

    var roundsPlayedSoFar = TOTAL_ROUNDS - remainingRounds;
    if (roundsPlayedSoFar > 0) {
      var paceCoefficient = profile.paceCoefficient != null ? profile.paceCoefficient : 1.0;
      var expectedWinsSoFar = roundsPlayedSoFar / PLAYER_ORDER.length;
      var paceRatio = player.wonItems.length / expectedWinsSoFar;
      var paceAdjustment = clamp((1 - paceRatio) * paceCoefficient, -0.3, 0.3);
      budgetCap = budgetCap * (1 + paceAdjustment);
    }

    if (remainingRounds <= 2) {
      budgetCap = Math.max(budgetCap, remainingHandTotal * 0.9);
    }

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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test blind-auction-logic.test.js`
Expected: 전체 PASS (Task 1~5에서 추가한 모든 테스트 + 기존 테스트, 총 이전 24개 + 신규 약 12개).

- [ ] **Step 5: 커밋**

```bash
git add blind-auction-logic.js blind-auction-logic.test.js
git commit -m "feat: 큐브 예산에 딴 물품 수 기반 페이스 보정과 막판 완화 추가"
```

---

### Task 6: AI 성격 배지 UI 노출

**Files:**
- Modify: `blind-auction.html:77` (CSS, `.player-name` 근처)
- Modify: `blind-auction.html:350-365` (`renderPlayersBar` 함수)

**Interfaces:**
- Consumes: `state.aiProfiles[id].archetype` (Task 1에서 생성됨), `L.ARCHETYPE_DESCRIPTIONS` (Task 1에서 export됨).
- Produces: 없음 (UI 말단, 이후 태스크 없음).

- [ ] **Step 1: CSS 추가**

`blind-auction.html` 77번째 줄(`.player-name { font-weight: 700; font-size: 12.5px; }`) 바로 아래에 추가:

```css
  .player-archetype { display: inline-block; margin-left: 4px; font-size: 10px; font-weight: 700; color: var(--accent-hover); background: rgba(95,184,176,.14); border-radius: 6px; padding: 1px 5px; cursor: help; }
```

- [ ] **Step 2: `renderPlayersBar` 수정**

`blind-auction.html`의 `renderPlayersBar` 함수(350~365번째 줄)를 통째로 교체:

```js
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
      const submitted = state.round.usedCubes[id] || [];
      const tilesHtml = submitted.map((v) => `<span class="submitted-cube-tile">${v}</span>`).join("");
      const archetype = id !== "user" ? state.aiProfiles[id].archetype : null;
      const badgeHtml = archetype
        ? `<span class="player-archetype" title="${L.ARCHETYPE_DESCRIPTIONS[archetype]}">${archetype}</span>`
        : "";
      div.innerHTML = `<span class="player-name">${PLAYER_LABELS[id]}</span>${badgeHtml}<span class="player-status">${active ? (isLeader ? "최고가" : "대기") : "포기"}</span><span class="player-cubes">${cubesLabel}</span><div class="submitted-cubes">${tilesHtml}</div>`;
      wrap.appendChild(div);
    });
  }
```

- [ ] **Step 3: 수동 검증**

이 파일은 인라인 스크립트라 Node 테스트 대상이 아니므로 브라우저에서 직접 확인한다:
1. `blind-auction.html`을 브라우저로 연다 (예: `npx serve .` 또는 파일 직접 열기).
2. "게임 시작" → 진행하면서 `players-bar`의 AI 1~4 이름 옆에 서로 다른 배지(테토남/에겐남/욜로족/안정형 중 4개, 중복 없이)가 뜨는지 확인.
3. 배지에 마우스를 올려 툴팁(성격 설명)이 뜨는지 확인.
4. "다시하기"로 재시작해서 배지 조합이 매번 랜덤하게 바뀌는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add blind-auction.html
git commit -m "feat: 블라인드 경매 AI 이름 옆에 성격 배지·툴팁 노출"
```

## 최종 확인

전체 태스크 완료 후:

```bash
node --test blind-auction-logic.test.js admin-auction-parse.test.js
```

Expected: 전부 PASS. 이후 배포(game-hub subtree pull + push)와 `admin.html` 공지사항 등록은 이 계획 밖의 별도 승인 단계(사용자 확인 후 진행)로 남겨둔다.
