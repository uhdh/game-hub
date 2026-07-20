# 3단 오목 자가학습 신경망 AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gomoku-stack.html`(3단 오목)에 AlphaZero 방식(정책+가치 신경망 + PUCT MCTS + 반복 자가대국)으로 처음부터 자가학습시킨 신경망 AI를, 기존 minimax 난이도를 건드리지 않고 새로운 최상위 난이도로 추가한다.

**Architecture:** 순수 게임 규칙을 `gomoku-stack-logic.js`로 추출해 브라우저(`gomoku-stack.html`)와 Node 학습 도구가 공유하는 단일 소스로 만든다. 이를 기준으로 Python(`training/`)에 룰 엔진 포트 + PUCT MCTS + ResNet(정책/가치) + 자가대국/학습 루프를 구현하고, 로컬 GPU(RTX 5080)에서 반복 학습시킨다. 완성된 체크포인트를 ONNX로 내보내고, 동일한 MCTS/인코딩 로직을 JS로 재구현해 `onnxruntime-web`으로 브라우저에서 추론한다.

**Tech Stack:** 순수 HTML/CSS/JS(프런트, 번들러 없음), Node `node:test`(JS 테스트), Python 3.12 + PyTorch + onnxruntime + pytest(학습 파이프라인), onnxruntime-web(브라우저 추론, 로컬 vendor).

## Global Constraints

- 헥스 보드는 axial 좌표 반지름 5, 코너 6칸 제외 → **정확히 85칸** (검증됨: `RAW_BOARD.length === 85`)
- 행동 공간 크기 = 85(배치) + 85×6(이동) = **595**
- 플레이어당 서플라이(돌 공급) 25개, 칸당 최대 3층
- 기존 minimax 기반 난이도(easy/medium/hard/extreme)는 로직·UI 모두 절대 수정하지 않는다
- 학습 파이프라인(`training/`)은 로컬 전용, 배포 대상 아님 — 산출물은 ONNX 파일 하나뿐
- 서버 기반 추론 없음 — 항상 브라우저 내 onnxruntime-web 추론, 실패 시 기존 `extreme` 난이도(minimax)로 폴백
- JS 테스트는 이 저장소의 기존 관행(`blind-auction-logic.test.js` 참고)을 따라 `node:test` + `require()`로 작성, 저장소 루트에 `*.test.js`로 배치
- Python 테스트는 `pytest`, `training/tests/`에 배치

---

### Task 1: 순수 게임 로직을 `gomoku-stack-logic.js`로 추출

`gomoku-stack.html`은 IIFE(`(function () { "use strict"; ... })();`, 285번 줄 시작) 안에 순수 룰 로직과 렌더링 코드가 함께 있다. 순수 로직만 별도 파일로 빼서 브라우저(`<script src>`)와 Node 양쪽에서 재사용 가능하게 만든다. 렌더링용 `RAW_BOARD`/`BOARD_MAP`(픽셀 좌표 포함)은 손대지 않고 그대로 둔다 — 이름 충돌을 피하기 위해 추출 파일의 보드 상수는 `GOMOKU_CELLS`/`GOMOKU_BOARD_MAP`로 이름을 바꾼다(로직상 100% 동일, 렌더링과 무관하므로 안전).

또한 초기 배치 단계(`INITIAL_STEPS`) 턴 흐름 관리 함수(`createInitialGameState`/`legalMovesOf`/`applyGameMove`)도 여기서 새로 뽑아낸다 — 원본 UI 코드(`onCellClick`/`applyAIMove`, 1478~1568번 줄)에 있던 것과 동일한 분기 로직을 재구현한 것으로, **원본 UI 코드는 전혀 수정하지 않는다** (이 신규 함수들은 학습 도구와 이후 신경망 AI 모듈에서만 쓰인다).

**Files:**
- Create: `gomoku-stack-logic.js`
- Create: `gomoku-stack-logic.test.js`
- Modify: `gomoku-stack.html:292-296` (NEIGHBOR_DIRS/LINE_DIRS 선언 제거)
- Modify: `gomoku-stack.html:350-470` (순수 로직 함수 블록 제거 — `// ---- 순수 로직 ----` 주석부터 `getAllLegalMainMoves` 끝까지)
- Modify: `gomoku-stack.html:283-284` (`<script src="./gomoku-stack-logic.js"></script>` 삽입)

**Interfaces:**
- Produces: `GOMOKU_CELLS`(Array<{q,r,s,key}>, 85개), `GOMOKU_BOARD_MAP`(key→cell), `NEIGHBOR_DIRS`, `LINE_DIRS`, `neighbors(key)`, `topColorOf(stacks,key)`, `isValidInitialPlacementOf(stacks,key,player)`, `isValidMoveTargetOf(stacks,originKey,destKey,player)`, `checkFiveInRowOf`, `checkFiveAtTop3Of`, `checkTriangleTop3Of`, `checkWinOf(stacks,player)→{cells,reason}|null`, `placeStoneOf`, `moveStoneOf`, `applyMoveToStacks`, `getAllLegalMainMoves(stacks,player,supply)→Move[]`, `otherPlayer(p)`, `INITIAL_STEPS`, `createInitialGameState()→GameState`, `legalMovesOf(state)→Move[]`, `applyGameMove(state,move)→GameState`
  - `Move` 형태: `{type:"place",key}` 또는 `{type:"move",origin,dest}`
  - `GameState` 형태: `{stacks, supply:{1,2}, phase:"initial"|"main", stepIndex, placedInStep, turn:1|2, winner:1|2|null, winReason, winCells}`

- [ ] **Step 1: 테스트 작성 (아직 존재하지 않는 모듈에 대해 실패해야 함)**

`gomoku-stack-logic.test.js` (저장소 루트, 기존 `blind-auction-logic.test.js`와 동일한 `node:test` 패턴):

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./gomoku-stack-logic.js');

test('보드는 정확히 85칸이다', () => {
  assert.equal(L.GOMOKU_CELLS.length, 85);
});

test('중앙(0_0)에는 초기 배치를 할 수 없다', () => {
  assert.equal(L.isValidInitialPlacementOf({}, '0_0', 1), false);
});

test('빈 보드에서 인접 없는 칸은 초기 배치 가능하다', () => {
  assert.equal(L.isValidInitialPlacementOf({}, '1_0', 1), true);
});

test('내 색 돌에 인접한 칸은 초기 배치 불가하다', () => {
  const stacks = { '1_0': [1] };
  assert.equal(L.isValidInitialPlacementOf(stacks, '2_0', 1), false);
});

test('같은 높이 이하로만 인접 이동 가능하다 (isValidMoveTargetOf)', () => {
  const stacks = { '1_0': [1, 1], '2_0': [2] };
  assert.equal(L.isValidMoveTargetOf(stacks, '1_0', '2_0', 1), true); // 2층->1층, 이동 후 2층 OK
  const stacksHigh = { '1_0': [1], '2_0': [2, 2] };
  assert.equal(L.isValidMoveTargetOf(stacksHigh, '1_0', '2_0', 1), false); // 1층->2층 불가
});

test('일직선 5개 연결이면 승리 (checkWinOf)', () => {
  const stacks = {};
  for (let q = 0; q < 5; q++) stacks[q + '_0'] = [1];
  const win = L.checkWinOf(stacks, 1);
  assert.ok(win);
  assert.equal(win.reason, '오목 완성 (5개 일직선 연결)');
  assert.equal(win.cells.length, 5);
});

test('createInitialGameState는 초기 단계/서플라이 25로 시작한다', () => {
  const s = L.createInitialGameState();
  assert.equal(s.phase, 'initial');
  assert.deepEqual(s.supply, { 1: 25, 2: 25 });
  assert.equal(s.turn, 1);
});

test('initial 단계는 INITIAL_STEPS 순서(1,2,2,1)대로 turn이 바뀌고 main으로 전환된다', () => {
  let s = L.createInitialGameState();
  const legal1 = L.legalMovesOf(s);
  assert.equal(s.turn, 1);
  s = L.applyGameMove(s, legal1[0]); // player1 1개 배치 완료 -> player2 차례
  assert.equal(s.turn, 2);
  assert.equal(s.phase, 'initial');
  s = L.applyGameMove(s, L.legalMovesOf(s)[0]); // player2 1/2
  assert.equal(s.turn, 2); // count=2라 아직 player2 차례
  s = L.applyGameMove(s, L.legalMovesOf(s)[0]); // player2 2/2 완료 -> player1 차례(count=2 단계)
  assert.equal(s.turn, 1);
  s = L.applyGameMove(s, L.legalMovesOf(s)[0]); // player1 1/2
  s = L.applyGameMove(s, L.legalMovesOf(s)[0]); // player1 2/2 완료 -> player2 차례(count=1 단계)
  assert.equal(s.turn, 2);
  s = L.applyGameMove(s, L.legalMovesOf(s)[0]); // player2 1/1 완료 -> main, turn=otherPlayer(2)=1
  assert.equal(s.phase, 'main');
  assert.equal(s.turn, 1);
  assert.deepEqual(s.supply, { 1: 22, 2: 22 }); // 오프닝 3개씩 소비
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test gomoku-stack-logic.test.js`
Expected: FAIL — `Cannot find module './gomoku-stack-logic.js'`

- [ ] **Step 3: `gomoku-stack-logic.js` 작성**

```js
// gomoku-stack-logic.js
// 3단 오목(gomoku-stack) 순수 게임 로직 (DOM 렌더링/픽셀 좌표 의존성 없음).
// 브라우저에서는 gomoku-stack.html이 <script src="./gomoku-stack-logic.js">로 로드하고,
// Node 테스트/학습 파이프라인 도구에서는 require()로 그대로 재사용한다.
// gomoku-stack.html 자체의 RAW_BOARD/BOARD_MAP(픽셀 좌표 포함, 렌더링 전용)과 이름
// 충돌을 피하기 위해 이 파일의 보드 상수는 GOMOKU_CELLS/GOMOKU_BOARD_MAP로 부른다.

const NEIGHBOR_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];
const LINE_DIRS = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: -1 }];

const GOMOKU_CELLS = [];
for (let q = -5; q <= 5; q++) {
  for (let r = -5; r <= 5; r++) {
    const s = -q - r;
    if (Math.abs(s) > 5) continue;
    const isCorner = [Math.abs(q), Math.abs(r), Math.abs(s)].filter(v => v === 5).length >= 2;
    if (isCorner) continue;
    GOMOKU_CELLS.push({ q, r, s, key: q + "_" + r });
  }
}
const GOMOKU_BOARD_MAP = {};
GOMOKU_CELLS.forEach(c => { GOMOKU_BOARD_MAP[c.key] = c; });

function otherPlayer(p) { return p === 1 ? 2 : 1; }

function neighbors(key) {
  const c = GOMOKU_BOARD_MAP[key];
  return NEIGHBOR_DIRS.map(d => GOMOKU_BOARD_MAP[(c.q + d.q) + "_" + (c.r + d.r)]).filter(Boolean);
}

function topColorOf(stacks, key) {
  const st = stacks[key];
  return st && st.length ? st[st.length - 1] : null;
}

function isValidInitialPlacementOf(stacks, key, player) {
  if (key === "0_0") return false;
  const st = stacks[key];
  if (st && st.length) return false;
  return !neighbors(key).some(n => topColorOf(stacks, n.key) === player);
}

function isValidMoveTargetOf(stacks, originKey, destKey, player) {
  if (originKey === destKey) return false;
  const origin = GOMOKU_BOARD_MAP[originKey];
  const dest = GOMOKU_BOARD_MAP[destKey];
  const isAdj = NEIGHBOR_DIRS.some(d => (origin.q + d.q) === dest.q && (origin.r + d.r) === dest.r);
  if (!isAdj) return false;
  const originH = (stacks[originKey] || []).length;
  const destH = (stacks[destKey] || []).length;
  return destH <= originH && destH + 1 <= 3;
}

function checkFiveInRowOf(stacks, color) {
  for (const key in GOMOKU_BOARD_MAP) {
    if (topColorOf(stacks, key) !== color) continue;
    const c = GOMOKU_BOARD_MAP[key];
    for (const dir of LINE_DIRS) {
      const prevKey = (c.q - dir.q) + "_" + (c.r - dir.r);
      if (topColorOf(stacks, prevKey) === color) continue;
      const run = [key];
      let cq = c.q + dir.q, cr = c.r + dir.r;
      while (topColorOf(stacks, cq + "_" + cr) === color) { run.push(cq + "_" + cr); cq += dir.q; cr += dir.r; }
      if (run.length === 5) return run;
    }
  }
  return null;
}

function checkFiveAtTop3Of(stacks, color) {
  const found = [];
  for (const key in GOMOKU_BOARD_MAP) {
    const st = stacks[key];
    if (st && st.length === 3 && st[2] === color) found.push(key);
  }
  return found.length >= 5 ? found.slice(0, 5) : null;
}

function checkTriangleTop3Of(stacks, color) {
  const isTop3 = k => { const st = stacks[k]; return st && st.length === 3 && st[2] === color; };
  for (const key in GOMOKU_BOARD_MAP) {
    if (!isTop3(key)) continue;
    const c = GOMOKU_BOARD_MAP[key];
    for (let i = 0; i < 6; i++) {
      const d1 = NEIGHBOR_DIRS[i];
      const n1Key = (c.q + d1.q) + "_" + (c.r + d1.r);
      if (!isTop3(n1Key)) continue;
      const n1 = GOMOKU_BOARD_MAP[n1Key];
      for (let j = 0; j < 6; j++) {
        const d2 = NEIGHBOR_DIRS[j];
        const n2Key = (n1.q + d2.q) + "_" + (n1.r + d2.r);
        if (n2Key === key) continue;
        if (isTop3(n2Key)) return [key, n1Key, n2Key];
      }
    }
  }
  return null;
}

function checkWinOf(stacks, player) {
  const row = checkFiveInRowOf(stacks, player);
  if (row) return { cells: row, reason: "오목 완성 (5개 일직선 연결)" };
  const top5 = checkFiveAtTop3Of(stacks, player);
  if (top5) return { cells: top5, reason: "돌 5개 3층 쌓기 완성" };
  const tri = checkTriangleTop3Of(stacks, player);
  if (tri) return { cells: tri, reason: "인접한 돌 3개 3층 쌓기 완성" };
  return null;
}

function placeStoneOf(stacks, key, player) {
  const next = Object.assign({}, stacks);
  next[key] = (next[key] || []).concat([player]);
  return next;
}

function moveStoneOf(stacks, originKey, destKey, player) {
  const next = Object.assign({}, stacks);
  const originStack = next[originKey].slice();
  originStack.pop();
  next[originKey] = originStack;
  next[destKey] = (next[destKey] || []).concat([player]);
  return next;
}

function applyMoveToStacks(stacks, move, player) {
  return move.type === "place" ? placeStoneOf(stacks, move.key, player) : moveStoneOf(stacks, move.origin, move.dest, player);
}

function getAllLegalMainMoves(stacks, player, supply) {
  const moves = [];
  if (supply > 0) {
    GOMOKU_CELLS.forEach(c => {
      const st = stacks[c.key];
      if (!st || !st.length) moves.push({ type: "place", key: c.key });
    });
  }
  GOMOKU_CELLS.forEach(c => {
    if (topColorOf(stacks, c.key) !== player) return;
    neighbors(c.key).forEach(n => {
      if (isValidMoveTargetOf(stacks, c.key, n.key, player)) moves.push({ type: "move", origin: c.key, dest: n.key });
    });
  });
  return moves;
}

// ---- 턴/단계 흐름 (gomoku-stack.html의 onCellClick/applyAIMove, 1478~1568번 줄과
// 동일한 분기를 재구현한 것. 원본 UI 코드는 그대로 두고 건드리지 않는다 — 이 함수들은
// 학습 도구/신경망 AI 모듈 전용.) ----

const INITIAL_STEPS = [
  { player: 1, count: 1 }, { player: 2, count: 2 },
  { player: 1, count: 2 }, { player: 2, count: 1 },
];

function createInitialGameState() {
  return {
    stacks: {}, supply: { 1: 25, 2: 25 }, phase: "initial",
    stepIndex: 0, placedInStep: 0, turn: 1,
    winner: null, winReason: "", winCells: [],
  };
}

function legalMovesOf(state) {
  if (state.winner) return [];
  if (state.phase === "initial") {
    return GOMOKU_CELLS
      .filter(c => isValidInitialPlacementOf(state.stacks, c.key, state.turn))
      .map(c => ({ type: "place", key: c.key }));
  }
  return getAllLegalMainMoves(state.stacks, state.turn, state.supply[state.turn]);
}

function applyGameMove(state, move) {
  const player = state.turn;
  if (state.phase === "initial") {
    const stacks = placeStoneOf(state.stacks, move.key, player);
    const supply = Object.assign({}, state.supply, { [player]: state.supply[player] - 1 });
    let stepIndex = state.stepIndex, placedInStep = state.placedInStep + 1;
    let phase = "initial", turn = player;
    if (placedInStep >= INITIAL_STEPS[stepIndex].count) {
      stepIndex++; placedInStep = 0;
      if (stepIndex >= INITIAL_STEPS.length) {
        phase = "main";
        turn = otherPlayer(INITIAL_STEPS[INITIAL_STEPS.length - 1].player);
      } else {
        turn = INITIAL_STEPS[stepIndex].player;
      }
    }
    return { stacks, supply, phase, stepIndex, placedInStep, turn, winner: null, winReason: "", winCells: [] };
  }
  const stacks = applyMoveToStacks(state.stacks, move, player);
  const supply = move.type === "place"
    ? Object.assign({}, state.supply, { [player]: state.supply[player] - 1 })
    : state.supply;
  const win = checkWinOf(stacks, player);
  return {
    stacks, supply, phase: "main", stepIndex: state.stepIndex, placedInStep: state.placedInStep,
    turn: win ? state.turn : otherPlayer(player),
    winner: win ? player : null, winReason: win ? win.reason : "", winCells: win ? win.cells : [],
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NEIGHBOR_DIRS, LINE_DIRS, GOMOKU_CELLS, GOMOKU_BOARD_MAP, otherPlayer,
    neighbors, topColorOf, isValidInitialPlacementOf, isValidMoveTargetOf,
    checkFiveInRowOf, checkFiveAtTop3Of, checkTriangleTop3Of, checkWinOf,
    placeStoneOf, moveStoneOf, applyMoveToStacks, getAllLegalMainMoves,
    INITIAL_STEPS, createInitialGameState, legalMovesOf, applyGameMove,
  };
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node --test gomoku-stack-logic.test.js`
Expected: 모든 테스트 PASS

- [ ] **Step 5: `gomoku-stack.html`에서 중복 정의 제거하고 외부 파일 로드**

먼저 `Read gomoku-stack.html`로 283~296번 줄과 350~471번 줄의 현재 내용을 확인한다(직전 커밋 이후 다른 수정이 없었다면 아래와 일치해야 함).

`gomoku-stack.html:283-284` 사이에 삽입 (기존 `<script>` 태그 앞):

```diff
 </div>

+<script src="./gomoku-stack-logic.js"></script>
 <script>
 (function () {
   "use strict";
```

`gomoku-stack.html:292-296` — 아래 5줄을 통째로 삭제(빈 줄 하나만 남기고, 바로 다음 `function toPixel...`는 그대로 유지):

```
  const NEIGHBOR_DIRS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  const LINE_DIRS = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: -1 }];
```

`gomoku-stack.html:350-470` — `// ---- 순수 로직 (임의의 stacks 스냅샷에 대해 동작 — AI 시뮬레이션에도 재사용) ----` 주석 줄부터 `getAllLegalMainMoves` 함수의 닫는 `}`까지(바로 다음 줄이 `// ---- AI 평가 함수 ----` 주석) 통째로 삭제한다. `neighbors`, `topColorOf`, `isValidInitialPlacementOf`, `isValidMoveTargetOf`, `checkFiveInRowOf`, `checkFiveAtTop3Of`, `checkTriangleTop3Of`, `checkWinOf`, `placeStoneOf`, `moveStoneOf`, `applyMoveToStacks`, `getAllLegalMainMoves` 함수 전체가 이 범위에 포함된다. **주의**: 이 함수들 이후에 나오는 `evaluatePosition`/`minimax`/UI 코드는 이제 외부 스크립트가 정의한 동일 이름의 전역 함수를 그대로 호출하게 되므로 호출부는 단 한 줄도 수정하지 않는다.

- [ ] **Step 6: 브라우저 수동 확인**

`gomoku-stack.html`을 로컬 서버로 열고(예: `npx serve .` 또는 기존에 쓰던 방식) "AI와 대결" 모드로 하 난이도 상대로 몇 수 두어, 초기 배치 단계 → 본 게임 전환, 돌 놓기/쌓기, 승리 판정까지 기존과 동일하게 동작하는지 확인한다. 콘솔에 `ReferenceError`가 없는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add gomoku-stack-logic.js gomoku-stack-logic.test.js gomoku-stack.html
git commit -m "refactor: 3단 오목 순수 게임 로직을 gomoku-stack-logic.js로 추출"
```

---

### Task 2: 기준 대국 생성기 (Node) — Python 포팅 대조용 fixture

**Files:**
- Create: `training/tools/gen_reference_games.js`
- Create: `training/fixtures/reference_games.jsonl` (생성물, 커밋 대상)

**Interfaces:**
- Consumes: Task 1의 `gomoku-stack-logic.js` (`createInitialGameState`, `legalMovesOf`, `applyGameMove`)
- Produces: `training/fixtures/reference_games.jsonl` — 한 줄에 게임 하나, `{"steps":[{beforeStacks,beforeSupply,phase,stepIndex,placedInStep,turn,legalMoves,chosenMove,afterStacks,afterSupply,winnerAfter,winReasonAfter,winCellsAfter}, ...]}`

- [ ] **Step 1: 생성기 스크립트 작성**

```js
// training/tools/gen_reference_games.js
// gomoku-stack-logic.js로 무작위 합법 대국 N판을 두면서 매 수마다
// (직전 상태, 그 시점의 전체 합법수 목록, 실제 둔 수, 결과 상태, 승리 판정)을
// JSONL로 남긴다. training/tests/test_game.py가 이 파일을 읽어 Python 포팅과 대조한다.
const fs = require('fs');
const path = require('path');
const Logic = require('../../gomoku-stack-logic.js');

function randomInt(n) { return Math.floor(Math.random() * n); }

function playOneGame() {
  let state = Logic.createInitialGameState();
  const steps = [];
  let guard = 0;
  // 이론상 무한루프는 없어야 하지만, fixture 생성 스크립트가 대국 하나 때문에
  // 영원히 멈추는 사고를 막기 위한 방어적 상한선(실제 게임 로직과 무관).
  while (state.winner === null && guard < 2000) {
    guard++;
    const legalMoves = Logic.legalMovesOf(state);
    if (!legalMoves.length) break;
    const chosen = legalMoves[randomInt(legalMoves.length)];
    const before = state;
    const after = Logic.applyGameMove(state, chosen);
    steps.push({
      beforeStacks: before.stacks,
      beforeSupply: before.supply,
      phase: before.phase,
      stepIndex: before.stepIndex,
      placedInStep: before.placedInStep,
      turn: before.turn,
      legalMoves,
      chosenMove: chosen,
      afterStacks: after.stacks,
      afterSupply: after.supply,
      winnerAfter: after.winner,
      winReasonAfter: after.winReason,
      winCellsAfter: after.winCells,
    });
    state = after;
  }
  return steps;
}

function main() {
  const numGames = Number(process.argv[2] || 60);
  const outPath = path.join(__dirname, '..', 'fixtures', 'reference_games.jsonl');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const lines = [];
  const winReasonCounts = {};
  for (let g = 0; g < numGames; g++) {
    const steps = playOneGame();
    lines.push(JSON.stringify({ steps }));
    const last = steps[steps.length - 1];
    if (last && last.winnerAfter) {
      winReasonCounts[last.winReasonAfter] = (winReasonCounts[last.winReasonAfter] || 0) + 1;
    }
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`wrote ${lines.length} games to ${outPath}`);
  console.log('win reason counts:', winReasonCounts);
}

main();
```

- [ ] **Step 2: 실행해서 fixture 생성**

Run: `node training/tools/gen_reference_games.js 60`
Expected: `training/fixtures/reference_games.jsonl` 생성, "win reason counts" 로그 출력(승리 유형이 하나도 안 잡히면 숫자를 120 정도로 올려 재실행 — Task 3 검증의 커버리지를 위해 가능하면 3가지 승리 사유가 최소 1건씩은 나오는 게 좋음)

- [ ] **Step 3: 커밋**

```bash
git add training/tools/gen_reference_games.js training/fixtures/reference_games.jsonl
git commit -m "test: 룰 포팅 대조용 JS 기준 대국 fixture 생성기 추가"
```

---

### Task 3: Python 환경 셋업 + 룰 엔진 포팅 (`training/game.py`)

**Files:**
- Create: `training/requirements.txt`
- Create: `training/__init__.py` (빈 파일, 패키지 인식용)
- Create: `training/tests/__init__.py` (빈 파일)
- Create: `training/game.py`
- Create: `training/tests/test_game.py`

**Interfaces:**
- Consumes: `training/fixtures/reference_games.jsonl` (Task 2 산출물)
- Produces: `CELLS`(List[Tuple[int,int]], 85개), `CELL_KEYS`(List[str]), `NEIGHBOR_DIRS`, `LINE_DIRS`, `other_player(p)`, `neighbors(key)`, `top_color_of`, `is_valid_initial_placement_of`, `is_valid_move_target_of`, `check_win_of(stacks,player)→WinResult|None`, `place_stone_of`, `move_stone_of`, `Move`(dataclass: type,key,origin,dest), `apply_move_to_stacks`, `get_all_legal_main_moves`, `GameState`(dataclass: stacks,supply,phase,step_index,placed_in_step,turn,winner,win_reason,win_cells), `initial_state()`, `legal_moves(state)→List[Move]`, `apply_move(state,move)→GameState`

- [ ] **Step 1: Python 환경 준비**

```bash
cd training
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
```

`training/requirements.txt`:

```
torch>=2.2
numpy>=1.26
onnx>=1.16
onnxruntime>=1.18
pytest>=8.0
```

`training/__init__.py`, `training/tests/__init__.py` — 빈 파일로 생성.

- [ ] **Step 2: 실패하는 테스트 작성**

`training/tests/test_game.py`:

```python
import json
import os
import pytest

from training.game import (
    initial_state, legal_moves, apply_move, Move, CELLS,
)

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "..", "fixtures", "reference_games.jsonl")


def test_cell_count_is_85():
    assert len(CELLS) == 85


def test_initial_state_matches_js_defaults():
    s = initial_state()
    assert s.phase == "initial"
    assert s.supply == {1: 25, 2: 25}
    assert s.turn == 1


def _move_key(m):
    if m["type"] == "place":
        return ("place", m["key"])
    return ("move", m["origin"], m["dest"])


def _py_move_key(m: Move):
    if m.type == "place":
        return ("place", m.key)
    return ("move", m.origin, m.dest)


def _move_from_json(m) -> Move:
    if m["type"] == "place":
        return Move(type="place", key=m["key"])
    return Move(type="move", origin=m["origin"], dest=m["dest"])


@pytest.fixture(scope="module")
def reference_games():
    if not os.path.exists(FIXTURE_PATH):
        pytest.skip(f"{FIXTURE_PATH} not found — run `node training/tools/gen_reference_games.js` first")
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def test_fixture_has_games(reference_games):
    assert len(reference_games) > 0


def test_python_matches_js_reference_step_by_step(reference_games):
    for game in reference_games:
        state = initial_state()
        for step in game["steps"]:
            assert state.stacks == step["beforeStacks"]
            assert state.supply == {int(k): v for k, v in step["beforeSupply"].items()}
            assert state.turn == step["turn"]

            py_moves = legal_moves(state)
            py_move_set = {_py_move_key(m) for m in py_moves}
            js_move_set = {_move_key(m) for m in step["legalMoves"]}
            assert py_move_set == js_move_set, (
                f"legal move mismatch at turn={state.turn} phase={state.phase} "
                f"only_in_py={py_move_set - js_move_set} only_in_js={js_move_set - py_move_set}"
            )

            chosen = _move_from_json(step["chosenMove"])
            state = apply_move(state, chosen)

            assert state.stacks == step["afterStacks"]
            assert state.supply == {int(k): v for k, v in step["afterSupply"].items()}
            assert state.winner == step["winnerAfter"]
            if step["winnerAfter"] is not None:
                assert state.win_reason == step["winReasonAfter"]
                assert set(state.win_cells) == set(step["winCellsAfter"])
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_game.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.game'`

- [ ] **Step 4: `training/game.py` 작성**

```python
"""Python port of gomoku-stack.html's pure rule engine (gomoku-stack-logic.js).
Must stay behaviorally identical to the JS reference — see tests/test_game.py
for cross-validation against JSONL fixtures generated by the JS engine.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

NEIGHBOR_DIRS: List[Tuple[int, int]] = [
    (1, 0), (1, -1), (0, -1),
    (-1, 0), (-1, 1), (0, 1),
]
LINE_DIRS: List[Tuple[int, int]] = [(1, 0), (0, 1), (1, -1)]


def _build_cells() -> List[Tuple[int, int]]:
    cells = []
    for q in range(-5, 6):
        for r in range(-5, 6):
            s = -q - r
            if abs(s) > 5:
                continue
            is_corner = sum(1 for v in (abs(q), abs(r), abs(s)) if v == 5) >= 2
            if is_corner:
                continue
            cells.append((q, r))
    return cells


CELLS: List[Tuple[int, int]] = _build_cells()
CELL_KEYS: List[str] = [f"{q}_{r}" for q, r in CELLS]
CELL_SET = set(CELL_KEYS)

assert len(CELLS) == 85, f"expected 85 board cells, got {len(CELLS)}"

Stacks = Dict[str, List[int]]


def other_player(p: int) -> int:
    return 2 if p == 1 else 1


def key_of(q: int, r: int) -> str:
    return f"{q}_{r}"


def neighbors(key: str) -> List[str]:
    q, r = (int(x) for x in key.split("_"))
    result = []
    for dq, dr in NEIGHBOR_DIRS:
        nk = key_of(q + dq, r + dr)
        if nk in CELL_SET:
            result.append(nk)
    return result


def top_color_of(stacks: Stacks, key: str) -> Optional[int]:
    st = stacks.get(key)
    return st[-1] if st else None


def is_valid_initial_placement_of(stacks: Stacks, key: str, player: int) -> bool:
    if key == "0_0":
        return False
    st = stacks.get(key)
    if st:
        return False
    return not any(top_color_of(stacks, n) == player for n in neighbors(key))


def is_valid_move_target_of(stacks: Stacks, origin_key: str, dest_key: str, player: int) -> bool:
    if origin_key == dest_key:
        return False
    oq, orr = (int(x) for x in origin_key.split("_"))
    dq, dr = (int(x) for x in dest_key.split("_"))
    is_adj = any((oq + ddq) == dq and (orr + ddr) == dr for ddq, ddr in NEIGHBOR_DIRS)
    if not is_adj:
        return False
    origin_h = len(stacks.get(origin_key, []))
    dest_h = len(stacks.get(dest_key, []))
    return dest_h <= origin_h and dest_h + 1 <= 3


def check_five_in_row_of(stacks: Stacks, color: int) -> Optional[List[str]]:
    for key in CELL_KEYS:
        if top_color_of(stacks, key) != color:
            continue
        q, r = (int(x) for x in key.split("_"))
        for dq, dr in LINE_DIRS:
            prev_key = key_of(q - dq, r - dr)
            if top_color_of(stacks, prev_key) == color:
                continue
            run = [key]
            cq, cr = q + dq, r + dr
            while top_color_of(stacks, key_of(cq, cr)) == color:
                run.append(key_of(cq, cr))
                cq += dq
                cr += dr
            if len(run) == 5:
                return run
    return None


def check_five_at_top3_of(stacks: Stacks, color: int) -> Optional[List[str]]:
    found = [key for key in CELL_KEYS if len(stacks.get(key, [])) == 3 and stacks[key][2] == color]
    return found[:5] if len(found) >= 5 else None


def check_triangle_top3_of(stacks: Stacks, color: int) -> Optional[List[str]]:
    def is_top3(k: str) -> bool:
        st = stacks.get(k)
        return bool(st) and len(st) == 3 and st[2] == color

    for key in CELL_KEYS:
        if not is_top3(key):
            continue
        q, r = (int(x) for x in key.split("_"))
        for dq1, dr1 in NEIGHBOR_DIRS:
            n1_key = key_of(q + dq1, r + dr1)
            if not is_top3(n1_key):
                continue
            nq, nr = (int(x) for x in n1_key.split("_"))
            for dq2, dr2 in NEIGHBOR_DIRS:
                n2_key = key_of(nq + dq2, nr + dr2)
                if n2_key == key:
                    continue
                if is_top3(n2_key):
                    return [key, n1_key, n2_key]
    return None


@dataclass
class WinResult:
    cells: List[str]
    reason: str


def check_win_of(stacks: Stacks, player: int) -> Optional[WinResult]:
    row = check_five_in_row_of(stacks, player)
    if row:
        return WinResult(row, "오목 완성 (5개 일직선 연결)")
    top5 = check_five_at_top3_of(stacks, player)
    if top5:
        return WinResult(top5, "돌 5개 3층 쌓기 완성")
    tri = check_triangle_top3_of(stacks, player)
    if tri:
        return WinResult(tri, "인접한 돌 3개 3층 쌓기 완성")
    return None


def place_stone_of(stacks: Stacks, key: str, player: int) -> Stacks:
    next_stacks = dict(stacks)
    next_stacks[key] = stacks.get(key, []) + [player]
    return next_stacks


def move_stone_of(stacks: Stacks, origin_key: str, dest_key: str, player: int) -> Stacks:
    next_stacks = dict(stacks)
    origin_stack = list(stacks[origin_key])
    origin_stack.pop()
    next_stacks[origin_key] = origin_stack
    next_stacks[dest_key] = stacks.get(dest_key, []) + [player]
    return next_stacks


@dataclass
class Move:
    type: str  # "place" | "move"
    key: Optional[str] = None
    origin: Optional[str] = None
    dest: Optional[str] = None


def apply_move_to_stacks(stacks: Stacks, move: Move, player: int) -> Stacks:
    if move.type == "place":
        return place_stone_of(stacks, move.key, player)
    return move_stone_of(stacks, move.origin, move.dest, player)


def get_all_legal_main_moves(stacks: Stacks, player: int, supply: int) -> List[Move]:
    moves: List[Move] = []
    if supply > 0:
        for key in CELL_KEYS:
            st = stacks.get(key)
            if not st:
                moves.append(Move(type="place", key=key))
    for key in CELL_KEYS:
        if top_color_of(stacks, key) != player:
            continue
        for n in neighbors(key):
            if is_valid_move_target_of(stacks, key, n, player):
                moves.append(Move(type="move", origin=key, dest=n))
    return moves


INITIAL_STEPS: List[Tuple[int, int]] = [(1, 1), (2, 2), (1, 2), (2, 1)]  # (player, count)


@dataclass
class GameState:
    stacks: Stacks
    supply: Dict[int, int]
    phase: str  # "initial" | "main"
    step_index: int
    placed_in_step: int
    turn: int
    winner: Optional[int] = None
    win_reason: str = ""
    win_cells: List[str] = field(default_factory=list)


def initial_state() -> GameState:
    return GameState(stacks={}, supply={1: 25, 2: 25}, phase="initial",
                      step_index=0, placed_in_step=0, turn=1)


def legal_moves(state: GameState) -> List[Move]:
    if state.winner is not None:
        return []
    if state.phase == "initial":
        return [Move(type="place", key=k) for k in CELL_KEYS
                if is_valid_initial_placement_of(state.stacks, k, state.turn)]
    return get_all_legal_main_moves(state.stacks, state.turn, state.supply[state.turn])


def apply_move(state: GameState, move: Move) -> GameState:
    player = state.turn
    if state.phase == "initial":
        stacks = place_stone_of(state.stacks, move.key, player)
        supply = dict(state.supply)
        supply[player] -= 1
        step_index, placed_in_step = state.step_index, state.placed_in_step + 1
        phase, turn = "initial", player
        step_count = INITIAL_STEPS[step_index][1]
        if placed_in_step >= step_count:
            step_index += 1
            placed_in_step = 0
            if step_index >= len(INITIAL_STEPS):
                phase = "main"
                turn = other_player(INITIAL_STEPS[-1][0])
            else:
                turn = INITIAL_STEPS[step_index][0]
        return GameState(stacks=stacks, supply=supply, phase=phase,
                          step_index=step_index, placed_in_step=placed_in_step, turn=turn)

    stacks = apply_move_to_stacks(state.stacks, move, player)
    supply = state.supply
    if move.type == "place":
        supply = dict(state.supply)
        supply[player] -= 1
    win = check_win_of(stacks, player)
    return GameState(
        stacks=stacks, supply=supply, phase="main",
        step_index=state.step_index, placed_in_step=state.placed_in_step,
        turn=state.turn if win else other_player(player),
        winner=(player if win else None),
        win_reason=(win.reason if win else ""),
        win_cells=(win.cells if win else []),
    )
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_game.py -v`
Expected: 모든 테스트 PASS (특히 `test_python_matches_js_reference_step_by_step` — 이게 실패하면 이후 모든 작업이 무의미하므로 반드시 원인을 찾아 고칠 것)

- [ ] **Step 6: 커밋**

```bash
git add training/requirements.txt training/__init__.py training/tests/__init__.py training/game.py training/tests/test_game.py
git commit -m "feat: 3단 오목 룰 엔진 Python 포팅 + JS 기준 대국 대조 검증"
```

---

### Task 4: 상태/행동 인코딩 (`training/encoding.py`)

**Files:**
- Create: `training/encoding.py`
- Create: `training/tests/test_encoding.py`

**Interfaces:**
- Consumes: `training.game.CELLS`, `CELL_KEYS`, `NEIGHBOR_DIRS`, `GameState`, `Move`, `other_player`
- Produces: `GRID_SIZE=11`, `NUM_CHANNELS=10`, `NUM_CELLS=85`, `NUM_MOVE_DIRS=6`, `ACTION_SPACE_SIZE=595`, `encode_state(state)→np.ndarray shape(10,11,11)`, `action_index_of(move)→int`, `move_from_action_index(idx)→Move`, `legal_action_mask(state, legal_moves)→np.ndarray shape(595,)`

- [ ] **Step 1: 실패하는 테스트 작성**

`training/tests/test_encoding.py`:

```python
import numpy as np
from training.game import initial_state, legal_moves, apply_move, Move
from training.encoding import (
    encode_state, action_index_of, move_from_action_index,
    legal_action_mask, ACTION_SPACE_SIZE, NUM_CHANNELS, GRID_SIZE,
)


def test_action_space_size_is_595():
    assert ACTION_SPACE_SIZE == 595


def test_encode_state_shape():
    state = initial_state()
    x = encode_state(state)
    assert x.shape == (NUM_CHANNELS, GRID_SIZE, GRID_SIZE)


def test_action_index_roundtrip_for_all_initial_legal_moves():
    state = initial_state()
    for m in legal_moves(state):
        idx = action_index_of(m)
        assert 0 <= idx < ACTION_SPACE_SIZE
        back = move_from_action_index(idx)
        assert back.type == m.type
        assert back.key == m.key


def test_action_index_roundtrip_for_a_move_action():
    # 초기 6수를 아무렇게나 두어 main 단계로 진입시킨 뒤, "move" 종류 행동도 확인
    state = initial_state()
    while state.phase == "initial":
        state = apply_move(state, legal_moves(state)[0])
    moves = [m for m in legal_moves(state) if m.type == "move"]
    assert moves, "main 단계 진입 후 move 종류 합법수가 없으면 테스트 스텝을 늘려야 함"
    m = moves[0]
    idx = action_index_of(m)
    back = move_from_action_index(idx)
    assert back.type == "move"
    assert back.origin == m.origin
    assert back.dest == m.dest


def test_legal_action_mask_matches_legal_moves_exactly():
    state = initial_state()
    moves = legal_moves(state)
    mask = legal_action_mask(state, moves)
    assert mask.sum() == len(moves)
    for m in moves:
        assert mask[action_index_of(m)] == 1.0
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_encoding.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.encoding'`

- [ ] **Step 3: `training/encoding.py` 작성**

```python
"""State/action encoding. This is conceptually mirrored in the browser by
gomoku-stack-neural-encoding.js — any change here MUST be mirrored there and
re-verified with the cross-language parity test (Task 13).
"""
import numpy as np
from typing import List

from training.game import CELLS, CELL_KEYS, NEIGHBOR_DIRS, GameState, Move, other_player

GRID_SIZE = 11
GRID_OFFSET = 5  # q,r in [-5,5] -> grid index in [0,10]
NUM_CHANNELS = 10
NUM_CELLS = len(CELL_KEYS)  # 85
NUM_MOVE_DIRS = len(NEIGHBOR_DIRS)  # 6
ACTION_SPACE_SIZE = NUM_CELLS + NUM_CELLS * NUM_MOVE_DIRS  # 595

CELL_INDEX = {key: i for i, key in enumerate(CELL_KEYS)}


def _grid_rc(q: int, r: int):
    return r + GRID_OFFSET, q + GRID_OFFSET


def encode_state(state: GameState) -> np.ndarray:
    """Channels (canonical perspective -- 'me' is always state.turn):
    0/1 bottom layer me/opp, 2/3 mid layer me/opp, 4/5 top layer me/opp,
    6 valid-cell mask, 7 my supply/25, 8 opp supply/25, 9 phase-is-initial flag.
    """
    me, opp = state.turn, other_player(state.turn)
    x = np.zeros((NUM_CHANNELS, GRID_SIZE, GRID_SIZE), dtype=np.float32)
    for (q, r), key in zip(CELLS, CELL_KEYS):
        row, col = _grid_rc(q, r)
        x[6, row, col] = 1.0
        st = state.stacks.get(key, [])
        for h, owner in enumerate(st[:3]):
            base = h * 2
            x[base + (0 if owner == me else 1), row, col] = 1.0
    x[7, :, :] = state.supply[me] / 25.0
    x[8, :, :] = state.supply[opp] / 25.0
    x[9, :, :] = 1.0 if state.phase == "initial" else 0.0
    return x


def action_index_for_place(key: str) -> int:
    return CELL_INDEX[key]


def action_index_for_move(origin_key: str, dir_index: int) -> int:
    return NUM_CELLS + CELL_INDEX[origin_key] * NUM_MOVE_DIRS + dir_index


def action_index_of(move: Move) -> int:
    if move.type == "place":
        return action_index_for_place(move.key)
    oq, orr = (int(v) for v in move.origin.split("_"))
    dq, dr = (int(v) for v in move.dest.split("_"))
    dir_index = NEIGHBOR_DIRS.index((dq - oq, dr - orr))
    return action_index_for_move(move.origin, dir_index)


def move_from_action_index(idx: int) -> Move:
    """Only valid for indices that came from an actually-legal move (the
    destination cell is not range-checked here)."""
    if idx < NUM_CELLS:
        return Move(type="place", key=CELL_KEYS[idx])
    rem = idx - NUM_CELLS
    cell_i, dir_i = divmod(rem, NUM_MOVE_DIRS)
    origin_key = CELL_KEYS[cell_i]
    oq, orr = (int(v) for v in origin_key.split("_"))
    dq, dr = NEIGHBOR_DIRS[dir_i]
    dest_key = f"{oq + dq}_{orr + dr}"
    return Move(type="move", origin=origin_key, dest=dest_key)


def legal_action_mask(state: GameState, moves: List[Move]) -> np.ndarray:
    mask = np.zeros(ACTION_SPACE_SIZE, dtype=np.float32)
    for m in moves:
        mask[action_index_of(m)] = 1.0
    return mask
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_encoding.py -v`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add training/encoding.py training/tests/test_encoding.py
git commit -m "feat: 3단 오목 신경망 상태/행동 인코딩 추가"
```

---

### Task 5: 신경망 (`training/model.py`)

**Files:**
- Create: `training/model.py`
- Create: `training/tests/test_model.py`

**Interfaces:**
- Consumes: `training.encoding.NUM_CHANNELS`, `GRID_SIZE`, `ACTION_SPACE_SIZE`
- Produces: `GomokuStackNet(channels=64, num_blocks=6)` — `forward(x: Tensor[B,10,11,11]) -> (policy_logits: Tensor[B,595], value: Tensor[B])`

- [ ] **Step 1: 실패하는 테스트 작성**

`training/tests/test_model.py`:

```python
import torch
from training.model import GomokuStackNet
from training.encoding import NUM_CHANNELS, GRID_SIZE, ACTION_SPACE_SIZE


def test_forward_shapes():
    model = GomokuStackNet(channels=8, num_blocks=1)
    x = torch.zeros(4, NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
    policy_logits, value = model(x)
    assert policy_logits.shape == (4, ACTION_SPACE_SIZE)
    assert value.shape == (4,)


def test_value_is_bounded_by_tanh():
    model = GomokuStackNet(channels=8, num_blocks=1)
    x = torch.randn(2, NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
    _, value = model(x)
    assert torch.all(value.abs() <= 1.0)
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_model.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.model'`

- [ ] **Step 3: `training/model.py` 작성**

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

from training.encoding import NUM_CHANNELS, GRID_SIZE, ACTION_SPACE_SIZE


class ResidualBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x):
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return F.relu(out + residual)


class GomokuStackNet(nn.Module):
    def __init__(self, channels: int = 64, num_blocks: int = 6):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Conv2d(NUM_CHANNELS, channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(channels),
            nn.ReLU(inplace=True),
        )
        self.blocks = nn.Sequential(*[ResidualBlock(channels) for _ in range(num_blocks)])

        self.policy_conv = nn.Conv2d(channels, 2, 1, bias=False)
        self.policy_bn = nn.BatchNorm2d(2)
        self.policy_fc = nn.Linear(2 * GRID_SIZE * GRID_SIZE, ACTION_SPACE_SIZE)

        self.value_conv = nn.Conv2d(channels, 1, 1, bias=False)
        self.value_bn = nn.BatchNorm2d(1)
        self.value_fc1 = nn.Linear(GRID_SIZE * GRID_SIZE, 64)
        self.value_fc2 = nn.Linear(64, 1)

    def forward(self, x: torch.Tensor):
        x = self.stem(x)
        x = self.blocks(x)

        p = F.relu(self.policy_bn(self.policy_conv(x)))
        p = p.flatten(1)
        policy_logits = self.policy_fc(p)

        v = F.relu(self.value_bn(self.value_conv(x)))
        v = v.flatten(1)
        v = F.relu(self.value_fc1(v))
        value = torch.tanh(self.value_fc2(v)).squeeze(-1)

        return policy_logits, value
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_model.py -v`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add training/model.py training/tests/test_model.py
git commit -m "feat: 3단 오목 신경망(정책+가치 ResNet) 추가"
```

---

### Task 6: PUCT MCTS (`training/mcts.py`)

이 게임은 승리해도 `state.turn`을 뒤집지 않는다(Task 1의 `applyGameMove`/Task 3의 `apply_move` 참고 — `turn: win ? state.turn : otherPlayer(player)`). 즉 부모→자식 간 "턴이 항상 번갈아 바뀐다"는 표준 가정이 승리 전이 엣지에서만 깨진다. 따라서 MCTS의 backprop/PUCT 선택에서 단순히 매 depth마다 부호를 뒤집는 방식은 틀리고, 매 노드의 `state.turn`을 기준 플레이어와 직접 비교해서 관점을 결정해야 한다.

**Files:**
- Create: `training/mcts.py`
- Create: `training/tests/test_mcts.py`

**Interfaces:**
- Consumes: `training.game.GameState`, `apply_move`, `legal_moves`; `training.encoding.encode_state`, `legal_action_mask`, `action_index_of`, `move_from_action_index`; `training.model.GomokuStackNet`
- Produces: `Node`(state,prior,children,visit_count,value_sum, `.value` property), `evaluate(model,state)→(policy:dict[int,float], value:float)`, `run_mcts(model,root_state,num_simulations,dirichlet_alpha=None,dirichlet_frac=0.25)→Node`, `visit_count_policy(root,temperature=1.0)→dict[int,float]`

- [ ] **Step 1: 실패하는 테스트 작성**

`training/tests/test_mcts.py` — 무작위 초기화된 신경망이어도 MCTS 자체가 "한 수만 두면 이기는 상황에서 그 수를 고른다"와 "다음에 상대가 바로 이기는 수는 피한다"를 만족해야 한다(이 두 시나리오가 정확히 Task 6 설명의 퍼스펙티브 버그를 잡아낸다):

```python
import torch
from training.game import GameState, Move, apply_move
from training.model import GomokuStackNet
from training.mcts import run_mcts, visit_count_policy
from training.encoding import action_index_of, move_from_action_index


def _make_model():
    torch.manual_seed(0)
    return GomokuStackNet(channels=8, num_blocks=1)


def test_mcts_finds_immediate_winning_move():
    # player 1이 (0,0 제외) 가로줄에 4개 연속, 양 끝이 비어 있어 한 수로 5개 완성 가능
    stacks = {}
    for q in [1, 2, 3, 4]:
        stacks[f"{q}_0"] = [1]
    state = GameState(stacks=stacks, supply={1: 20, 2: 20}, phase="main",
                       step_index=4, placed_in_step=0, turn=1)
    model = _make_model()
    root = run_mcts(model, state, num_simulations=64)
    policy = visit_count_policy(root, temperature=0.0)
    best_action = max(policy, key=policy.get)
    best_move = move_from_action_index(best_action)
    result_state = apply_move(state, best_move)
    assert result_state.winner == 1, f"MCTS did not pick the immediate winning move, picked {best_move}"


def test_mcts_avoids_move_that_lets_opponent_win_next():
    # player 2가 다음 수에 바로 이길 수 있는 상황(가로줄 4개, 한쪽 끝만 비어 즉시 완성 가능).
    # player 1(지금 둘 차례)은 그 칸을 반드시 막아야 한다 -- 두 턴 앞을 내다봐야 하므로
    # 이 테스트가 통과하려면 백프로파게이션 관점 처리가 올바라야 한다.
    stacks = {}
    for q in [1, 2, 3, 4]:
        stacks[f"{q}_0"] = [2]
    # 막을 수 있는 유일한 칸: "0_0"은 초기배치 금지 규칙과 무관(이미 main 단계)하지만
    # checkFiveInRowOf 로직상 실제 위험 칸은 0_0과 5_0 두 곳 -- 단순화를 위해 0_0만
    # 비우고 5_0은 player1 돌로 미리 막아 위험 칸을 하나로 고정한다.
    stacks["5_0"] = [1]
    state = GameState(stacks=stacks, supply={1: 20, 2: 20}, phase="main",
                       step_index=4, placed_in_step=0, turn=1)
    model = _make_model()
    root = run_mcts(model, state, num_simulations=128)
    policy = visit_count_policy(root, temperature=0.0)
    best_action = max(policy, key=policy.get)
    best_move = move_from_action_index(best_action)
    assert best_move.type == "place" and best_move.key == "0_0", (
        f"MCTS did not block the opponent's immediate win, picked {best_move}"
    )
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_mcts.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.mcts'`

- [ ] **Step 3: `training/mcts.py` 작성**

```python
"""PUCT MCTS guided by GomokuStackNet.

Perspective convention: Node.value (value_sum/visit_count) is always expressed
relative to `node.state.turn` -- "how good this position is for whoever is
about to move here". This game's terminal-on-win state does NOT flip `turn`
(mirrors gomoku-stack.html's own state machine), so backprop and PUCT selection
compare `state.turn` between nodes explicitly instead of assuming strict
alternation between parent and child.
"""
import math
from typing import Dict, Optional
import numpy as np
import torch

from training.game import GameState, apply_move, legal_moves as game_legal_moves
from training.encoding import encode_state, legal_action_mask, action_index_of, move_from_action_index

C_PUCT = 1.5


class Node:
    __slots__ = ("state", "prior", "children", "visit_count", "value_sum", "is_expanded")

    def __init__(self, state: GameState, prior: float = 0.0):
        self.state = state
        self.prior = prior
        self.children: Dict[int, "Node"] = {}
        self.visit_count = 0
        self.value_sum = 0.0
        self.is_expanded = False

    @property
    def value(self) -> float:
        return self.value_sum / self.visit_count if self.visit_count else 0.0


@torch.no_grad()
def evaluate(model, state: GameState):
    """Returns (policy: dict[action_idx -> prob] over legal moves,
    value: float relative to `state.turn`). Assumes state is non-terminal."""
    moves = game_legal_moves(state)
    if not moves:
        return {}, 0.0
    model.eval()
    x = torch.from_numpy(encode_state(state)).unsqueeze(0)
    logits, value = model(x)
    logits = logits.squeeze(0).numpy()
    mask = legal_action_mask(state, moves)
    masked_logits = np.where(mask > 0, logits, -1e9)
    probs = np.exp(masked_logits - masked_logits.max())
    probs = probs * mask
    probs = probs / probs.sum()
    policy = {action_index_of(m): float(probs[action_index_of(m)]) for m in moves}
    return policy, float(value.item())


def run_mcts(model, root_state: GameState, num_simulations: int,
             dirichlet_alpha: Optional[float] = None, dirichlet_frac: float = 0.25) -> Node:
    root = Node(root_state)
    policy, _ = evaluate(model, root_state)
    _expand(root, policy)
    if dirichlet_alpha is not None and root.children:
        _add_dirichlet_noise(root, dirichlet_alpha, dirichlet_frac)

    for _ in range(num_simulations):
        path = [root]
        node = root
        while node.is_expanded and node.children:
            node = _select_child(node)
            path.append(node)

        leaf = path[-1]
        if leaf.state.winner is not None:
            leaf_value, leaf_perspective = 1.0, leaf.state.winner
        else:
            policy, leaf_value = evaluate(model, leaf.state)
            leaf_perspective = leaf.state.turn
            _expand(leaf, policy)

        _backpropagate(path, leaf_value, leaf_perspective)

    return root


def _expand(node: Node, policy: Dict[int, float]):
    node.is_expanded = True
    for action_idx, prob in policy.items():
        move = move_from_action_index(action_idx)
        child_state = apply_move(node.state, move)
        node.children[action_idx] = Node(child_state, prior=prob)


def _value_for(node: Node, perspective_state: GameState) -> float:
    return node.value if node.state.turn == perspective_state.turn else -node.value


def _select_child(node: Node) -> Node:
    total_n = sum(c.visit_count for c in node.children.values())
    best_score, best_child = -1e18, None
    for child in node.children.values():
        q = _value_for(child, node.state)
        u = C_PUCT * child.prior * math.sqrt(total_n + 1) / (1 + child.visit_count)
        score = q + u
        if score > best_score:
            best_score, best_child = score, child
    return best_child


def _add_dirichlet_noise(root: Node, alpha: float, frac: float):
    actions = list(root.children.keys())
    noise = np.random.dirichlet([alpha] * len(actions))
    for action_idx, n in zip(actions, noise):
        child = root.children[action_idx]
        child.prior = child.prior * (1 - frac) + n * frac


def _backpropagate(path, leaf_value: float, leaf_perspective: int):
    for node in path:
        node.visit_count += 1
        node.value_sum += leaf_value if node.state.turn == leaf_perspective else -leaf_value


def visit_count_policy(root: Node, temperature: float = 1.0) -> Dict[int, float]:
    counts = {a: c.visit_count for a, c in root.children.items()}
    if temperature == 0:
        best_a = max(counts, key=counts.get)
        return {a: (1.0 if a == best_a else 0.0) for a in counts}
    scaled = {a: c ** (1.0 / temperature) for a, c in counts.items()}
    total = sum(scaled.values())
    return {a: v / total for a, v in scaled.items()}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_mcts.py -v`
Expected: 모든 테스트 PASS. 만약 `test_mcts_avoids_move_that_lets_opponent_win_next`가 실패한다면 백프로파게이션/PUCT의 관점 처리가 잘못된 것이니 위 docstring 설명을 다시 확인할 것 (naive하게 매 depth마다 부호만 뒤집는 구현으로 돌아가지 말 것).

- [ ] **Step 5: 커밋**

```bash
git add training/mcts.py training/tests/test_mcts.py
git commit -m "feat: PUCT MCTS 구현 (승리시 turn 유지 규칙에 맞춘 관점 처리 포함)"
```

---

### Task 7: 자가대국 (`training/selfplay.py`)

**Files:**
- Create: `training/selfplay.py`
- Create: `training/tests/test_selfplay.py`

**Interfaces:**
- Consumes: `training.game.initial_state`, `apply_move`; `training.encoding.encode_state`, `ACTION_SPACE_SIZE`, `move_from_action_index`; `training.mcts.run_mcts`, `visit_count_policy`
- Produces: `SelfPlaySample`(dataclass: encoded_state, policy_target, mover), `play_self_play_game(model, num_simulations) → (List[SelfPlaySample], np.ndarray outcomes)`

- [ ] **Step 1: 실패하는 테스트 작성**

`training/tests/test_selfplay.py`:

```python
import torch
from training.model import GomokuStackNet
from training.selfplay import play_self_play_game
from training.encoding import ACTION_SPACE_SIZE, NUM_CHANNELS, GRID_SIZE


def test_self_play_game_completes_and_produces_valid_samples():
    torch.manual_seed(0)
    model = GomokuStackNet(channels=8, num_blocks=1)
    samples, outcomes = play_self_play_game(model, num_simulations=8)

    assert len(samples) > 0
    assert len(samples) == len(outcomes)
    for s in samples:
        assert s.encoded_state.shape == (NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
        assert s.policy_target.shape == (ACTION_SPACE_SIZE,)
        assert abs(s.policy_target.sum() - 1.0) < 1e-4
        assert s.mover in (1, 2)
    assert set(outcomes.tolist()) <= {-1.0, 0.0, 1.0}
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_selfplay.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.selfplay'`

- [ ] **Step 3: `training/selfplay.py` 작성**

```python
from dataclasses import dataclass
from typing import List, Tuple
import numpy as np

from training.game import initial_state, apply_move
from training.encoding import encode_state, ACTION_SPACE_SIZE, move_from_action_index
from training.mcts import run_mcts, visit_count_policy

DIRICHLET_ALPHA = 0.3
TEMPERATURE_MOVES = 12  # 첫 N수는 방문횟수 비례 샘플링, 이후엔 그리디(온도 0)


@dataclass
class SelfPlaySample:
    encoded_state: np.ndarray  # (NUM_CHANNELS, 11, 11)
    policy_target: np.ndarray  # (ACTION_SPACE_SIZE,)
    mover: int  # 이 샘플을 기록한 시점의 state.turn


def play_self_play_game(model, num_simulations: int) -> Tuple[List[SelfPlaySample], np.ndarray]:
    state = initial_state()
    samples: List[SelfPlaySample] = []
    ply = 0
    while state.winner is None:
        root = run_mcts(model, state, num_simulations, dirichlet_alpha=DIRICHLET_ALPHA)
        if not root.children:
            break  # 이 게임 규칙상 실제로는 발생하지 않아야 하지만 방어적으로 처리
        temperature = 1.0 if ply < TEMPERATURE_MOVES else 0.0
        policy = visit_count_policy(root, temperature)

        target = np.zeros(ACTION_SPACE_SIZE, dtype=np.float32)
        for action_idx, prob in policy.items():
            target[action_idx] = prob
        samples.append(SelfPlaySample(encode_state(state), target, state.turn))

        actions = list(policy.keys())
        probs = np.array([policy[a] for a in actions], dtype=np.float64)
        probs /= probs.sum()
        chosen = int(np.random.choice(actions, p=probs))
        state = apply_move(state, move_from_action_index(chosen))
        ply += 1

    outcomes = _build_outcomes(samples, state.winner)
    return samples, outcomes


def _build_outcomes(samples: List[SelfPlaySample], winner) -> np.ndarray:
    outcomes = np.zeros(len(samples), dtype=np.float32)
    if winner is None:
        return outcomes
    for i, s in enumerate(samples):
        outcomes[i] = 1.0 if s.mover == winner else -1.0
    return outcomes
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_selfplay.py -v`
Expected: 모든 테스트 PASS (무작위 초기화 신경망 + 시뮬레이션 8회라 게임이 끝까지 가는 데 몇 초 걸릴 수 있음)

- [ ] **Step 5: 커밋**

```bash
git add training/selfplay.py training/tests/test_selfplay.py
git commit -m "feat: MCTS 기반 자가대국 게임 생성 추가"
```

---

### Task 8: 리플레이 버퍼 + 학습 스텝 (`training/replay_buffer.py`, `training/train.py`)

**Files:**
- Create: `training/replay_buffer.py`
- Create: `training/train.py`
- Create: `training/tests/test_train.py`

**Interfaces:**
- Consumes: `training.model.GomokuStackNet`
- Produces: `ReplayBuffer(capacity=200_000)` — `.add_game(states, policies, outcomes)`, `.sample(batch_size)→(states,policies,values)`, `len()`; `make_optimizer(model,lr=1e-3,weight_decay=1e-4)`, `train_step(model,optimizer,states,policy_targets,value_targets)→dict`, `save_checkpoint(model,path)`, `load_checkpoint(model,path)→model`

- [ ] **Step 1: 실패하는 테스트 작성**

`training/tests/test_train.py`:

```python
import os
import numpy as np
import torch

from training.model import GomokuStackNet
from training.replay_buffer import ReplayBuffer
from training.train import make_optimizer, train_step, save_checkpoint, load_checkpoint
from training.encoding import NUM_CHANNELS, GRID_SIZE, ACTION_SPACE_SIZE


def _fixed_batch(batch_size=16):
    rng = np.random.default_rng(0)
    states = rng.standard_normal((batch_size, NUM_CHANNELS, GRID_SIZE, GRID_SIZE)).astype(np.float32)
    policies = np.zeros((batch_size, ACTION_SPACE_SIZE), dtype=np.float32)
    policies[:, 0] = 1.0  # 항상 action 0을 정답으로 하는 단순한 타깃
    values = np.ones(batch_size, dtype=np.float32)
    return states, policies, values


def test_replay_buffer_add_and_sample():
    buffer = ReplayBuffer(capacity=100)
    states = [np.zeros((NUM_CHANNELS, GRID_SIZE, GRID_SIZE), dtype=np.float32) for _ in range(5)]
    policies = [np.zeros(ACTION_SPACE_SIZE, dtype=np.float32) for _ in range(5)]
    outcomes = np.array([1, -1, 1, -1, 1], dtype=np.float32)
    buffer.add_game(states, policies, outcomes)
    assert len(buffer) == 5
    s, p, v = buffer.sample(3)
    assert s.shape == (3, NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
    assert p.shape == (3, ACTION_SPACE_SIZE)
    assert v.shape == (3,)


def test_train_step_overfits_a_single_fixed_batch():
    torch.manual_seed(0)
    model = GomokuStackNet(channels=8, num_blocks=1)
    optimizer = make_optimizer(model, lr=1e-2)
    states, policies, values = _fixed_batch()

    first = train_step(model, optimizer, states, policies, values)
    last = first
    for _ in range(100):
        last = train_step(model, optimizer, states, policies, values)

    assert last["loss"] < first["loss"] * 0.3, f"loss did not drop enough: {first['loss']} -> {last['loss']}"


def test_checkpoint_save_and_load_roundtrip(tmp_path):
    torch.manual_seed(0)
    model = GomokuStackNet(channels=8, num_blocks=1)
    path = os.path.join(tmp_path, "model.pt")
    save_checkpoint(model, path)

    loaded = GomokuStackNet(channels=8, num_blocks=1)
    load_checkpoint(loaded, path)
    x = torch.randn(1, NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
    model.eval(); loaded.eval()
    with torch.no_grad():
        p1, v1 = model(x)
        p2, v2 = loaded(x)
    assert torch.allclose(p1, p2)
    assert torch.allclose(v1, v2)
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_train.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.replay_buffer'`

- [ ] **Step 3: `training/replay_buffer.py`, `training/train.py` 작성**

`training/replay_buffer.py`:

```python
import random
from collections import deque
from typing import List
import numpy as np


class ReplayBuffer:
    def __init__(self, capacity: int = 200_000):
        self.capacity = capacity
        self.states: deque = deque(maxlen=capacity)
        self.policies: deque = deque(maxlen=capacity)
        self.values: deque = deque(maxlen=capacity)

    def add_game(self, states: List[np.ndarray], policies: List[np.ndarray], outcomes: np.ndarray):
        for s, p, v in zip(states, policies, outcomes):
            self.states.append(s)
            self.policies.append(p)
            self.values.append(float(v))

    def __len__(self):
        return len(self.states)

    def sample(self, batch_size: int):
        idx = random.sample(range(len(self.states)), min(batch_size, len(self.states)))
        states = np.stack([self.states[i] for i in idx])
        policies = np.stack([self.policies[i] for i in idx])
        values = np.array([self.values[i] for i in idx], dtype=np.float32)
        return states, policies, values
```

`training/train.py`:

```python
import torch
import torch.nn.functional as F


def make_optimizer(model, lr: float = 1e-3, weight_decay: float = 1e-4):
    return torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)


def train_step(model, optimizer, states, policy_targets, value_targets) -> dict:
    model.train()
    states_t = torch.from_numpy(states)
    policy_targets_t = torch.from_numpy(policy_targets)
    value_targets_t = torch.from_numpy(value_targets)

    optimizer.zero_grad()
    policy_logits, value_pred = model(states_t)
    log_probs = F.log_softmax(policy_logits, dim=1)
    policy_loss = -(policy_targets_t * log_probs).sum(dim=1).mean()
    value_loss = F.mse_loss(value_pred, value_targets_t)
    loss = policy_loss + value_loss
    loss.backward()
    optimizer.step()

    return {"loss": loss.item(), "policy_loss": policy_loss.item(), "value_loss": value_loss.item()}


def save_checkpoint(model, path: str):
    torch.save(model.state_dict(), path)


def load_checkpoint(model, path: str):
    model.load_state_dict(torch.load(path, map_location="cpu"))
    return model
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_train.py -v`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add training/replay_buffer.py training/train.py training/tests/test_train.py
git commit -m "feat: 리플레이 버퍼 + 학습 스텝(정책/가치 손실) 추가"
```

---

### Task 9: 아레나 평가 + 승격 로직 (`training/arena.py`)

**Files:**
- Create: `training/arena.py`
- Create: `training/tests/test_arena.py`

**Interfaces:**
- Consumes: `training.game.initial_state`, `apply_move`; `training.mcts.run_mcts`, `visit_count_policy`; `training.encoding.move_from_action_index`
- Produces: `play_one_game(model_a, model_b, arena_simulations)→int(0|1|2)`, `play_match(model_a, model_b, num_games, arena_simulations)→(a_wins,b_wins,draws)`, `should_promote(a_wins,b_wins,draws,threshold=0.55)→bool`

- [ ] **Step 1: 실패하는 테스트 작성**

`training/tests/test_arena.py`:

```python
import torch
from training.model import GomokuStackNet
from training.arena import play_match, should_promote


def test_should_promote_uses_decisive_win_rate_threshold():
    assert should_promote(a_wins=6, b_wins=4, draws=0, threshold=0.55) is True
    assert should_promote(a_wins=5, b_wins=5, draws=0, threshold=0.55) is False
    assert should_promote(a_wins=0, b_wins=0, draws=10, threshold=0.55) is False


def test_play_match_alternates_starting_player_and_completes():
    torch.manual_seed(0)
    model_a = GomokuStackNet(channels=8, num_blocks=1)
    model_b = GomokuStackNet(channels=8, num_blocks=1)
    a_wins, b_wins, draws = play_match(model_a, model_b, num_games=2, arena_simulations=8)
    assert a_wins + b_wins + draws == 2
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_arena.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.arena'`

- [ ] **Step 3: `training/arena.py` 작성**

```python
from typing import Tuple

from training.game import initial_state, apply_move
from training.mcts import run_mcts, visit_count_policy
from training.encoding import move_from_action_index

ARENA_SIMULATIONS = 200


def play_one_game(model_a, model_b, arena_simulations: int = ARENA_SIMULATIONS) -> int:
    """model_a는 항상 player 1(선공)으로 둔다.
    반환값: 1이면 model_a측 승리, 2면 model_b측 승리, 0이면 무승부(합법수 소진)."""
    state = initial_state()
    models_by_player = {1: model_a, 2: model_b}
    while state.winner is None:
        model = models_by_player[state.turn]
        root = run_mcts(model, state, arena_simulations)
        if not root.children:
            return 0
        policy = visit_count_policy(root, temperature=0.0)
        chosen = max(policy, key=policy.get)
        state = apply_move(state, move_from_action_index(chosen))
    return state.winner


def play_match(model_a, model_b, num_games: int, arena_simulations: int = ARENA_SIMULATIONS) -> Tuple[int, int, int]:
    """선공 이점을 상쇄하기 위해 매 게임 선공 모델을 번갈아 준다.
    반환값: (a_wins, b_wins, draws)."""
    a_wins = b_wins = draws = 0
    for i in range(num_games):
        a_is_player1 = (i % 2 == 0)
        p1, p2 = (model_a, model_b) if a_is_player1 else (model_b, model_a)
        winner_player = play_one_game(p1, p2, arena_simulations)
        if winner_player == 0:
            draws += 1
        elif (winner_player == 1) == a_is_player1:
            a_wins += 1
        else:
            b_wins += 1
    return a_wins, b_wins, draws


def should_promote(a_wins: int, b_wins: int, draws: int, threshold: float = 0.55) -> bool:
    """a = 후보(신규) 모델, b = 현재 최고 모델. 유의미한 승부(무승부 제외) 중
    후보의 승률이 threshold 이상이면 승격. 전부 무승부면 근거 부족으로 승격 안 함."""
    decisive = a_wins + b_wins
    if decisive == 0:
        return False
    return (a_wins / decisive) >= threshold
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_arena.py -v`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add training/arena.py training/tests/test_arena.py
git commit -m "feat: 아레나 평가 대국 + 모델 승격 판정 로직 추가"
```

---

### Task 10: 학습 오케스트레이터 (`training/run_training.py`)

**Files:**
- Create: `training/run_training.py`
- Create: `training/tests/test_run_training_smoke.py`

**Interfaces:**
- Consumes: Task 5~9의 모든 모듈
- Produces: CLI 스크립트 `training/run_training.py` (인자: `--generations --games-per-generation --simulations --arena-games --arena-simulations --batch-size --train-steps-per-generation --channels --blocks --resume`), 체크포인트를 `training/checkpoints/`에 저장

- [ ] **Step 1: 실패하는 스모크 테스트 작성**

`training/tests/test_run_training_smoke.py` — 아주 작은 설정(작은 net, 시뮬레이션 수 최소화)으로 파이프라인 전체가 에러 없이 한 세대 도는지만 확인한다(실제 강함은 검증하지 않음):

```python
import os
import sys
from training.run_training import build_arg_parser, main


def test_tiny_end_to_end_generation_runs_without_error(tmp_path, monkeypatch):
    checkpoint_dir = str(tmp_path / "checkpoints")
    monkeypatch.setattr("training.run_training.CHECKPOINT_DIR", checkpoint_dir)
    argv = [
        "run_training.py",
        "--generations", "1",
        "--games-per-generation", "2",
        "--simulations", "4",
        "--arena-games", "2",
        "--arena-simulations", "4",
        "--batch-size", "8",
        "--train-steps-per-generation", "2",
        "--channels", "4",
        "--blocks", "1",
    ]
    monkeypatch.setattr(sys, "argv", argv)
    main()
    assert os.path.exists(os.path.join(checkpoint_dir, "best.pt"))


def test_arg_parser_defaults():
    args = build_arg_parser().parse_args([])
    assert args.generations == 50
    assert args.channels == 64
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_run_training_smoke.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.run_training'`

- [ ] **Step 3: `training/run_training.py` 작성**

```python
import argparse
import os

from training.model import GomokuStackNet
from training.replay_buffer import ReplayBuffer
from training.selfplay import play_self_play_game
from training.train import make_optimizer, train_step, save_checkpoint, load_checkpoint
from training.arena import play_match, should_promote

CHECKPOINT_DIR = "training/checkpoints"


def build_arg_parser():
    p = argparse.ArgumentParser()
    p.add_argument("--generations", type=int, default=50)
    p.add_argument("--games-per-generation", type=int, default=50)
    p.add_argument("--simulations", type=int, default=200)
    p.add_argument("--arena-games", type=int, default=40)
    p.add_argument("--arena-simulations", type=int, default=200)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--train-steps-per-generation", type=int, default=200)
    p.add_argument("--channels", type=int, default=64)
    p.add_argument("--blocks", type=int, default=6)
    p.add_argument("--resume", type=str, default=None)
    return p


def main():
    args = build_arg_parser().parse_args()
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

    best_model = GomokuStackNet(channels=args.channels, num_blocks=args.blocks)
    if args.resume:
        load_checkpoint(best_model, args.resume)
    buffer = ReplayBuffer()

    for generation in range(1, args.generations + 1):
        for _ in range(args.games_per_generation):
            samples, outcomes = play_self_play_game(best_model, args.simulations)
            buffer.add_game([s.encoded_state for s in samples], [s.policy_target for s in samples], outcomes)

        candidate = GomokuStackNet(channels=args.channels, num_blocks=args.blocks)
        candidate.load_state_dict(best_model.state_dict())
        optimizer = make_optimizer(candidate)
        for _ in range(args.train_steps_per_generation):
            if len(buffer) < args.batch_size:
                break
            states, policies, values = buffer.sample(args.batch_size)
            train_step(candidate, optimizer, states, policies, values)

        a_wins, b_wins, draws = play_match(candidate, best_model, args.arena_games, args.arena_simulations)
        promoted = should_promote(a_wins, b_wins, draws)
        print(f"generation={generation} buffer={len(buffer)} arena a_wins={a_wins} b_wins={b_wins} "
              f"draws={draws} promoted={promoted}")

        if promoted:
            best_model = candidate
        ckpt_path = os.path.join(CHECKPOINT_DIR, f"gen{generation:04d}_{'promoted' if promoted else 'skipped'}.pt")
        save_checkpoint(candidate, ckpt_path)
        save_checkpoint(best_model, os.path.join(CHECKPOINT_DIR, "best.pt"))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_run_training_smoke.py -v`
Expected: 모든 테스트 PASS (`training/checkpoints/`가 생성됨 — `.gitignore`에 `training/checkpoints/` 추가할 것, 체크포인트는 리포에 커밋하지 않음)

- [ ] **Step 5: `.gitignore`에 체크포인트 디렉터리 추가하고 커밋**

```bash
echo "training/checkpoints/" >> .gitignore
echo "training/.venv/" >> .gitignore
git add training/run_training.py training/tests/test_run_training_smoke.py .gitignore
git commit -m "feat: 자가대국->학습->평가->승격 오케스트레이터(run_training.py) 추가"
```

---

### Task 11: [운영] 실제 장시간 학습 실행

이 태스크는 코드가 아니라 **사용자가 로컬 GPU에서 직접 실행하는 런북**이다 — 에이전트가 자동으로 완료 처리할 수 없다(스펙의 "학습 소요 시간·최종 강함 보장 없음" 항목 참고).

- [ ] **Step 1: GPU 인식 확인**

```bash
cd training && .venv/Scripts/python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

Expected: `True NVIDIA GeForce RTX 5080`

- [ ] **Step 2: 짧은 시험 실행으로 속도 가늠 (1세대)**

```bash
cd training && .venv/Scripts/python run_training.py --generations 1 --games-per-generation 20 --simulations 100 --arena-games 20
```

콘솔에 찍히는 `generation=1 ...` 로그의 소요 시간을 보고, 몇 세대까지 현실적으로 돌릴 수 있을지 가늠한다.

- [ ] **Step 3: 본 학습 실행 (백그라운드)**

```bash
cd training && .venv/Scripts/python run_training.py --generations 200 --games-per-generation 50 --simulations 200 --arena-games 40 > train.log 2>&1 &
```

- [ ] **Step 4: 진행 관찰 및 중단 판단**

`training/train.log`에서 세대별 `arena a_wins/b_wins/draws`와 `promoted` 비율을 관찰한다. 판단 기준 예시:
- 여러 세대 연속으로 `promoted=False`만 나오고 손실도 안 줄어들면 하이퍼파라미터(학습률, 시뮬레이션 수) 조정 검토
- `training/checkpoints/best.pt`를 주기적으로 Task 12(ONNX export)로 내보내 실제 웹 UI에서 기존 `extreme` 난이도와 몇 판 붙여보며 체감 강도 확인 — 이게 "충분히 강하다"고 판단되는 시점이 학습 중단 시점

이 태스크에는 "완료" 기준이 없다 — Task 12로 넘어갈 준비가 됐다고 판단되면(체크포인트 하나 이상 확보) 다음 태스크로 진행한다.

---

### Task 12: ONNX Export + 패리티 검증 (`training/export_onnx.py`)

**Files:**
- Create: `training/export_onnx.py`
- Create: `training/tests/test_export_onnx.py`

**Interfaces:**
- Consumes: `training.model.GomokuStackNet`, `training.train.load_checkpoint`, `training.encoding.NUM_CHANNELS`, `GRID_SIZE`
- Produces: `export(checkpoint_path, output_path, channels, blocks)` — ONNX 파일 생성 + PyTorch/ONNX Runtime 출력 패리티 검증(assert)

- [ ] **Step 1: 실패하는 테스트 작성**

`training/tests/test_export_onnx.py`:

```python
import os
import torch
from training.model import GomokuStackNet
from training.train import save_checkpoint
from training.export_onnx import export


def test_export_produces_onnx_with_matching_outputs(tmp_path):
    torch.manual_seed(0)
    model = GomokuStackNet(channels=8, num_blocks=1)
    ckpt_path = str(tmp_path / "model.pt")
    onnx_path = str(tmp_path / "model.onnx")
    save_checkpoint(model, ckpt_path)

    export(ckpt_path, onnx_path, channels=8, blocks=1)

    assert os.path.exists(onnx_path)
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_export_onnx.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'training.export_onnx'`

- [ ] **Step 3: `training/export_onnx.py` 작성**

```python
import argparse
import numpy as np
import torch
import onnxruntime as ort

from training.model import GomokuStackNet
from training.train import load_checkpoint
from training.encoding import NUM_CHANNELS, GRID_SIZE


def export(checkpoint_path: str, output_path: str, channels: int, blocks: int):
    model = GomokuStackNet(channels=channels, num_blocks=blocks)
    load_checkpoint(model, checkpoint_path)
    model.eval()

    dummy = torch.zeros(1, NUM_CHANNELS, GRID_SIZE, GRID_SIZE)
    torch.onnx.export(
        model, dummy, output_path,
        input_names=["state"], output_names=["policy_logits", "value"],
        dynamic_axes={"state": {0: "batch"}, "policy_logits": {0: "batch"}, "value": {0: "batch"}},
        opset_version=17,
    )
    _verify_parity(model, output_path)


def _verify_parity(torch_model, onnx_path: str, tolerance: float = 1e-4):
    x = np.random.randn(1, NUM_CHANNELS, GRID_SIZE, GRID_SIZE).astype(np.float32)
    with torch.no_grad():
        torch_logits, torch_value = torch_model(torch.from_numpy(x))
    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    onnx_logits, onnx_value = session.run(None, {"state": x})
    max_logit_diff = float(np.abs(torch_logits.numpy() - onnx_logits).max())
    max_value_diff = float(np.abs(torch_value.numpy() - onnx_value).max())
    assert max_logit_diff < tolerance, f"policy parity failed: {max_logit_diff}"
    assert max_value_diff < tolerance, f"value parity failed: {max_value_diff}"
    print(f"parity OK: max_logit_diff={max_logit_diff:.6g} max_value_diff={max_value_diff:.6g}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("checkpoint")
    p.add_argument("output")
    p.add_argument("--channels", type=int, default=64)
    p.add_argument("--blocks", type=int, default=6)
    args = p.parse_args()
    export(args.checkpoint, args.output, args.channels, args.blocks)
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd training && .venv/Scripts/pytest tests/test_export_onnx.py -v`
Expected: 모든 테스트 PASS

- [ ] **Step 5: 실제 최고 체크포인트를 내보내고 웹 자산 위치에 배치**

```bash
mkdir -p assets/models
cd training && .venv/Scripts/python export_onnx.py checkpoints/best.pt ../assets/models/gomoku-stack-net.onnx --channels 64 --blocks 6
```

(Task 10에서 실제 사용한 `--channels`/`--blocks` 값과 반드시 맞출 것)

- [ ] **Step 6: 커밋**

```bash
git add training/export_onnx.py training/tests/test_export_onnx.py assets/models/gomoku-stack-net.onnx
git commit -m "feat: 학습된 체크포인트 ONNX export + 패리티 검증 추가"
```

---

### Task 13: JS 상태/행동 인코딩 미러 (`gomoku-stack-neural-encoding.js`)

`training/encoding.py`(Task 4)와 정확히 동일한 채널/행동 인덱싱을 JS로 재구현한다. Node `require()`와 브라우저 `<script src>` 양쪽에서 쓰여야 하는데, Node의 `require()`는 파일마다 독립된 모듈 스코프라 Task 1처럼 "먼저 로드된 스크립트의 전역을 그냥 참조"하는 방식이 안 통한다 — 그래서 이 파일과 Task 14의 파일은 `typeof module !== 'undefined'`일 때만 `require()`로 의존성을 가져오고, 브라우저에서는 (Task 1의 스크립트가 이미 채워놓은) 전역 식별자를 그대로 쓰는 분기를 둔다. **주의**: 이 분기 안에서 `var GOMOKU_CELLS = ...`처럼 전역과 같은 이름으로 지역 변수를 선언하면 `var` 호이스팅 때문에 브라우저 쪽에서 그 이름이 통째로 `undefined`로 가려진다 — 반드시 다른 지역 이름(`CELLS`, `DIRS` 등)에 담아서 써야 한다.

**Files:**
- Create: `gomoku-stack-neural-encoding.js`
- Create: `gomoku-stack-neural-encoding.test.js`
- Create: `training/tools/export_encoding_fixture.py`
- Create: `training/fixtures/encoding_fixture.json` (생성물, 커밋 대상)

**Interfaces:**
- Consumes: Task 1의 `gomoku-stack-logic.js`(`GOMOKU_CELLS`, `NEIGHBOR_DIRS`, `otherPlayer`, `createInitialGameState`, `legalMovesOf`, `applyGameMove`)
- Produces: `encodeState(state)→Float32Array(10*11*11)`, `actionIndexOf(move)→int`, `moveFromActionIndex(idx)→Move`, `legalActionMask(legalMoves)→Float32Array(595)`, `GRID_SIZE`, `NUM_CHANNELS`, `ACTION_SPACE_SIZE`

- [ ] **Step 1: Python 쪽에서 크로스 패리티 fixture 생성 스크립트 작성**

`training/tools/export_encoding_fixture.py`:

```python
"""JS 인코더(gomoku-stack-neural-encoding.js)가 Python 인코더(training/encoding.py)와
정확히 같은 텐서를 만드는지 대조하기 위한 fixture. 여러 상태(초기, initial phase 중간,
main phase, 3층 스택 있는 상태)를 인코딩해 JSON으로 남긴다.
"""
import json
import os
import numpy as np

from training.game import initial_state, legal_moves, apply_move
from training.encoding import encode_state, action_index_of


def _sample_states():
    states = [initial_state()]
    s = initial_state()
    for _ in range(3):  # initial phase 중간 지점
        s = apply_move(s, legal_moves(s)[0])
    states.append(s)
    while s.phase == "initial":  # main phase 진입 직후
        s = apply_move(s, legal_moves(s)[0])
    states.append(s)
    for _ in range(5):  # main phase에서 몇 수 더 진행 (스택 쌓일 기회)
        moves = legal_moves(s)
        if not moves or s.winner is not None:
            break
        s = apply_move(s, moves[0])
    states.append(s)
    return states


def main():
    out_path = os.path.join(os.path.dirname(__file__), "..", "fixtures", "encoding_fixture.json")
    cases = []
    for s in _sample_states():
        moves = legal_moves(s)
        cases.append({
            "state": {
                "stacks": s.stacks, "supply": s.supply, "phase": s.phase,
                "stepIndex": s.step_index, "placedInStep": s.placed_in_step,
                "turn": s.turn, "winner": s.winner, "winReason": s.win_reason, "winCells": s.win_cells,
            },
            "encoded": encode_state(s).flatten().tolist(),
            "actionIndices": [action_index_of(m) for m in moves],
        })
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(cases, f)
    print(f"wrote {len(cases)} cases to {out_path}")


if __name__ == "__main__":
    main()
```

Run: `cd training && .venv/Scripts/python tools/export_encoding_fixture.py`
Expected: `training/fixtures/encoding_fixture.json` 생성

- [ ] **Step 2: 실패하는 JS 테스트 작성**

`gomoku-stack-neural-encoding.test.js` (저장소 루트):

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Enc = require('./gomoku-stack-neural-encoding.js');

test('ACTION_SPACE_SIZE는 595다', () => {
  assert.equal(Enc.ACTION_SPACE_SIZE, 595);
});

test('Python 인코더와 JS 인코더가 동일한 텐서를 만든다 (크로스 언어 패리티)', () => {
  const fixturePath = path.join(__dirname, 'training', 'fixtures', 'encoding_fixture.json');
  const cases = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  assert.ok(cases.length > 0);
  for (const c of cases) {
    const jsEncoded = Array.from(Enc.encodeState(c.state));
    assert.equal(jsEncoded.length, c.encoded.length);
    for (let i = 0; i < jsEncoded.length; i++) {
      assert.ok(Math.abs(jsEncoded[i] - c.encoded[i]) < 1e-6, `mismatch at index ${i}: js=${jsEncoded[i]} py=${c.encoded[i]}`);
    }
  }
});
```

- [ ] **Step 3: 테스트 실행해서 실패 확인**

Run: `node --test gomoku-stack-neural-encoding.test.js`
Expected: FAIL — `Cannot find module './gomoku-stack-neural-encoding.js'`

- [ ] **Step 4: `gomoku-stack-neural-encoding.js` 작성**

```js
// gomoku-stack-neural-encoding.js
// training/encoding.py의 상태/행동 인코딩을 그대로 미러링한다. 이 파일을 고칠 때는
// 반드시 training/encoding.py도 함께 고치고 training/tools/export_encoding_fixture.py를
// 다시 돌려 gomoku-stack-neural-encoding.test.js로 패리티를 재검증할 것.
(function () {
  'use strict';

  var Logic = (typeof module !== 'undefined' && module.exports) ? require('./gomoku-stack-logic.js') : null;
  // 브라우저에서는 Logic이 null이고, gomoku-stack-logic.js가 먼저 로드해 둔 전역
  // GOMOKU_CELLS/NEIGHBOR_DIRS/otherPlayer를 아래 CELLS/DIRS/otherPlayerFn에 담아 쓴다.
  // (여기서 `var GOMOKU_CELLS = ...`처럼 같은 이름으로 선언하면 var 호이스팅 때문에
  // 브라우저 쪽 전역이 가려지므로 반드시 다른 이름을 쓴다.)
  var CELLS = Logic ? Logic.GOMOKU_CELLS : GOMOKU_CELLS;
  var DIRS = Logic ? Logic.NEIGHBOR_DIRS : NEIGHBOR_DIRS;
  var otherPlayerFn = Logic ? Logic.otherPlayer : otherPlayer;

  var GRID_SIZE = 11;
  var GRID_OFFSET = 5;
  var NUM_CHANNELS = 10;
  var NUM_CELLS = CELLS.length; // 85
  var NUM_MOVE_DIRS = DIRS.length; // 6
  var ACTION_SPACE_SIZE = NUM_CELLS + NUM_CELLS * NUM_MOVE_DIRS; // 595

  var CELL_INDEX = {};
  CELLS.forEach(function (c, i) { CELL_INDEX[c.key] = i; });

  function gridRC(q, r) {
    return [r + GRID_OFFSET, q + GRID_OFFSET];
  }

  function encodeState(state) {
    var me = state.turn, opp = otherPlayerFn(state.turn);
    var x = new Float32Array(NUM_CHANNELS * GRID_SIZE * GRID_SIZE);
    function at(ch, row, col) { return ch * GRID_SIZE * GRID_SIZE + row * GRID_SIZE + col; }

    CELLS.forEach(function (c) {
      var rc = gridRC(c.q, c.r), row = rc[0], col = rc[1];
      x[at(6, row, col)] = 1.0;
      var st = state.stacks[c.key] || [];
      for (var h = 0; h < Math.min(st.length, 3); h++) {
        var owner = st[h];
        var base = h * 2;
        x[at(base + (owner === me ? 0 : 1), row, col)] = 1.0;
      }
    });
    for (var row = 0; row < GRID_SIZE; row++) {
      for (var col = 0; col < GRID_SIZE; col++) {
        x[at(7, row, col)] = state.supply[me] / 25.0;
        x[at(8, row, col)] = state.supply[opp] / 25.0;
        x[at(9, row, col)] = state.phase === "initial" ? 1.0 : 0.0;
      }
    }
    return x;
  }

  function actionIndexForPlace(key) { return CELL_INDEX[key]; }
  function actionIndexForMove(originKey, dirIndex) {
    return NUM_CELLS + CELL_INDEX[originKey] * NUM_MOVE_DIRS + dirIndex;
  }
  function actionIndexOf(move) {
    if (move.type === "place") return actionIndexForPlace(move.key);
    var o = move.origin.split("_").map(Number), oq = o[0], orr = o[1];
    var d = move.dest.split("_").map(Number), dq = d[0], dr = d[1];
    var dirIndex = -1;
    for (var i = 0; i < DIRS.length; i++) {
      if (DIRS[i].q === (dq - oq) && DIRS[i].r === (dr - orr)) { dirIndex = i; break; }
    }
    return actionIndexForMove(move.origin, dirIndex);
  }
  function moveFromActionIndex(idx) {
    if (idx < NUM_CELLS) return { type: "place", key: CELLS[idx].key };
    var rem = idx - NUM_CELLS;
    var cellI = Math.floor(rem / NUM_MOVE_DIRS);
    var dirI = rem % NUM_MOVE_DIRS;
    var origin = CELLS[cellI];
    var dir = DIRS[dirI];
    var dest = (origin.q + dir.q) + "_" + (origin.r + dir.r);
    return { type: "move", origin: origin.key, dest: dest };
  }
  function legalActionMask(legalMoves) {
    var mask = new Float32Array(ACTION_SPACE_SIZE);
    legalMoves.forEach(function (m) { mask[actionIndexOf(m)] = 1.0; });
    return mask;
  }

  var api = {
    GRID_SIZE: GRID_SIZE, NUM_CHANNELS: NUM_CHANNELS, NUM_CELLS: NUM_CELLS,
    NUM_MOVE_DIRS: NUM_MOVE_DIRS, ACTION_SPACE_SIZE: ACTION_SPACE_SIZE,
    encodeState: encodeState, actionIndexOf: actionIndexOf,
    moveFromActionIndex: moveFromActionIndex, legalActionMask: legalActionMask,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.GomokuStackNeuralEncoding = api;
})();
```

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `node --test gomoku-stack-neural-encoding.test.js`
Expected: 모든 테스트 PASS. 패리티 테스트가 실패하면 채널 순서/그리드 매핑/행동 인덱싱 공식이 Python과 어긋난 것이니 `training/encoding.py`와 한 줄씩 대조할 것.

- [ ] **Step 6: 커밋**

```bash
git add gomoku-stack-neural-encoding.js gomoku-stack-neural-encoding.test.js training/tools/export_encoding_fixture.py training/fixtures/encoding_fixture.json
git commit -m "feat: 신경망 상태/행동 인코딩 JS 미러 + Python 대조 패리티 테스트 추가"
```

---

### Task 14: onnxruntime-web 벤더링 + JS MCTS/추론 (`gomoku-stack-neural-ai.js`)

**Files:**
- Create: `assets/vendor/ort/ort.min.js` (+ 동반 `.wasm` 파일, 다운로드 산출물)
- Create: `gomoku-stack-neural-ai.js`

**Interfaces:**
- Consumes: `gomoku-stack-logic.js`(`legalMovesOf`, `applyGameMove`), `gomoku-stack-neural-encoding.js`(`encodeState`, `actionIndexOf`, `moveFromActionIndex`, `legalActionMask`, `NUM_CHANNELS`, `GRID_SIZE`), 전역 `ort`(onnxruntime-web)
- Produces: `GomokuStackNeuralAi.computeNeuralMove(state) → Promise<Move>`

- [ ] **Step 1: onnxruntime-web을 로컬로 vendor**

이 프로젝트는 번들러/npm 의존성이 없는 순수 정적 사이트이므로, onnxruntime-web을 CDN이 아니라 로컬 파일로 내려받아 커밋한다(외부 CDN 장애/차단에 정적 사이트가 영향받지 않도록):

```bash
mkdir -p /tmp/ort-download && cd /tmp/ort-download
npm pack onnxruntime-web@1.19.2
tar -xf onnxruntime-web-1.19.2.tgz
ls package/dist/
```

`package/dist/` 안에서 `ort.min.js`(또는 버전에 따라 `ort.wasm.min.js` 등 이름이 다를 수 있음 — `ls` 결과를 보고 정확한 파일명 확인)와 그와 짝을 이루는 `.wasm` 파일(들)을 찾아 프로젝트로 복사:

```bash
mkdir -p "assets/vendor/ort"
cp /tmp/ort-download/package/dist/ort.min.js "assets/vendor/ort/"
cp /tmp/ort-download/package/dist/*.wasm "assets/vendor/ort/"
```

- [ ] **Step 2: `gomoku-stack-neural-ai.js` 작성**

```js
// gomoku-stack-neural-ai.js
// training/mcts.py를 브라우저에서 onnxruntime-web으로 그대로 재현한다.
// 퍼스펙티브 규약(승리해도 turn을 안 뒤집는 이 게임의 특성 때문에 backprop/PUCT에서
// 매 노드의 state.turn을 직접 비교해야 하는 이유)은 training/mcts.py 상단 설명 참고.
(function () {
  'use strict';

  // 주의(Task 13과 동일한 함정): 아래에서 require() 결과가 없을 때(브라우저) 쓸 폴백
  // 객체 리터럴 안의 `legalMovesOf`/`applyGameMove`는 이 IIFE 안에서 그 이름으로
  // var 선언된 적이 없어야만 바깥(전역) 값을 올바르게 참조한다. 그래서 결과는 항상
  // 별도 이름(...Fn)에 담아서 쓴다 — 같은 이름으로 재선언하면 var 호이스팅 때문에
  // 브라우저 쪽에서 undefined로 가려진다.
  var Logic = (typeof module !== 'undefined' && module.exports) ? require('./gomoku-stack-logic.js') : null;
  var GameLogic = Logic || { legalMovesOf: legalMovesOf, applyGameMove: applyGameMove };
  var legalMovesOfFn = GameLogic.legalMovesOf;
  var applyGameMoveFn = GameLogic.applyGameMove;

  var Encoding = (typeof module !== 'undefined' && module.exports) ? require('./gomoku-stack-neural-encoding.js') : null;
  var NeuralEnc = Encoding || window.GomokuStackNeuralEncoding;
  var encodeState = NeuralEnc.encodeState;
  var actionIndexOf = NeuralEnc.actionIndexOf;
  var moveFromActionIndex = NeuralEnc.moveFromActionIndex;
  var legalActionMask = NeuralEnc.legalActionMask;
  var NUM_CHANNELS = NeuralEnc.NUM_CHANNELS;
  var GRID_SIZE = NeuralEnc.GRID_SIZE;

  var C_PUCT = 1.5;
  var NEURAL_AI_SIMULATIONS = 400;
  var MODEL_URL = './assets/models/gomoku-stack-net.onnx';

  function Node(state, prior) {
    this.state = state;
    this.prior = prior || 0;
    this.children = {};
    this.visitCount = 0;
    this.valueSum = 0;
  }
  Node.prototype.value = function () {
    return this.visitCount ? this.valueSum / this.visitCount : 0;
  };

  async function evaluate(session, state) {
    var moves = legalMovesOfFn(state);
    if (!moves.length) return { policy: {}, value: 0 };
    var input = encodeState(state);
    var tensor = new ort.Tensor('float32', input, [1, NUM_CHANNELS, GRID_SIZE, GRID_SIZE]);
    var output = await session.run({ state: tensor });
    var logits = output.policy_logits.data;
    var value = output.value.data[0];
    var mask = legalActionMask(moves);

    var maxLogit = -Infinity;
    for (var i = 0; i < logits.length; i++) if (mask[i] > 0 && logits[i] > maxLogit) maxLogit = logits[i];
    var expSum = 0;
    var probs = new Float64Array(logits.length);
    for (var j = 0; j < logits.length; j++) {
      if (mask[j] > 0) { probs[j] = Math.exp(logits[j] - maxLogit); expSum += probs[j]; }
    }
    var policy = {};
    moves.forEach(function (m) {
      var idx = actionIndexOf(m);
      policy[idx] = probs[idx] / expSum;
    });
    return { policy: policy, value: value };
  }

  function expand(node, policy) {
    Object.keys(policy).forEach(function (key) {
      var actionIdx = Number(key);
      var move = moveFromActionIndex(actionIdx);
      var childState = applyGameMoveFn(node.state, move);
      node.children[actionIdx] = new Node(childState, policy[actionIdx]);
    });
  }

  function valueFor(node, perspectiveState) {
    return node.state.turn === perspectiveState.turn ? node.value() : -node.value();
  }

  function selectChild(node) {
    var totalN = 0;
    Object.keys(node.children).forEach(function (k) { totalN += node.children[k].visitCount; });
    var bestScore = -Infinity, bestChild = null;
    Object.keys(node.children).forEach(function (k) {
      var child = node.children[k];
      var q = valueFor(child, node.state);
      var u = C_PUCT * child.prior * Math.sqrt(totalN + 1) / (1 + child.visitCount);
      var score = q + u;
      if (score > bestScore) { bestScore = score; bestChild = child; }
    });
    return bestChild;
  }

  function backpropagate(path, leafValue, leafPerspectivePlayer) {
    path.forEach(function (node) {
      node.visitCount++;
      node.valueSum += (node.state.turn === leafPerspectivePlayer) ? leafValue : -leafValue;
    });
  }

  async function runMcts(session, rootState, numSimulations) {
    var root = new Node(rootState);
    var rootEval = await evaluate(session, rootState);
    expand(root, rootEval.policy);

    for (var i = 0; i < numSimulations; i++) {
      var path = [root];
      var node = root;
      while (Object.keys(node.children).length > 0) {
        node = selectChild(node);
        path.push(node);
      }
      var leaf = path[path.length - 1];
      var leafValue, leafPerspective;
      if (leaf.state.winner !== null) {
        leafValue = 1.0;
        leafPerspective = leaf.state.winner;
      } else {
        var leafEval = await evaluate(session, leaf.state);
        leafValue = leafEval.value;
        leafPerspective = leaf.state.turn;
        expand(leaf, leafEval.policy);
      }
      backpropagate(path, leafValue, leafPerspective);
    }
    return root;
  }

  function bestMoveFromRoot(root) {
    var bestAction = null, bestVisits = -1;
    Object.keys(root.children).forEach(function (k) {
      var child = root.children[k];
      if (child.visitCount > bestVisits) { bestVisits = child.visitCount; bestAction = Number(k); }
    });
    return moveFromActionIndex(bestAction);
  }

  var sessionPromise = null;
  function getSession() {
    if (!sessionPromise) {
      sessionPromise = ort.InferenceSession.create(MODEL_URL);
    }
    return sessionPromise;
  }

  // gomoku-stack.html의 computeAIMove()에서 호출하는 진입점.
  // state는 gomoku-stack.html 자체의 게임 상태 객체(stacks/supply/phase/turn/winner
  // 필드를 포함하는 상위 집합)를 그대로 넘기면 된다.
  async function computeNeuralMove(state) {
    var session = await getSession();
    var root = await runMcts(session, state, NEURAL_AI_SIMULATIONS);
    return bestMoveFromRoot(root);
  }

  var api = { computeNeuralMove: computeNeuralMove, runMcts: runMcts, evaluate: evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.GomokuStackNeuralAi = api;
})();
```

- [ ] **Step 3: Node에서 로드만 정상 되는지 확인 (모델 파일 없이도 require는 성공해야 함)**

```bash
node -e "const ai = require('./gomoku-stack-neural-ai.js'); console.log(typeof ai.computeNeuralMove)"
```

Expected: `function`

- [ ] **Step 4: 커밋**

```bash
git add assets/vendor/ort gomoku-stack-neural-ai.js
git commit -m "feat: onnxruntime-web 로컬 vendor + 브라우저용 MCTS/추론 모듈 추가"
```

---

### Task 15: 웹 통합 — 난이도 버튼 + 폴백

**Files:**
- Modify: `gomoku-stack.html:212` (난이도 버튼 추가)
- Modify: `gomoku-stack.html:283-284` 부근 (`<script>` 태그 3개 추가)
- Modify: `gomoku-stack.html:1355-1357` (`computeAIMove` 함수에 "neural" 분기 + 폴백 추가)

**Interfaces:**
- Consumes: Task 1(`gomoku-stack-logic.js`), Task 13(`gomoku-stack-neural-encoding.js`), Task 14(`gomoku-stack-neural-ai.js`, `assets/vendor/ort/ort.min.js`)

- [ ] **Step 1: 난이도 버튼 추가**

`gomoku-stack.html:208-213`, "최상" 버튼(212번 줄) 바로 뒤에 추가:

```diff
       <div class="mode-group" id="difficulty-group">
         <button class="mode-btn" data-diff="easy">하</button>
         <button class="mode-btn" data-diff="medium">중</button>
         <button class="mode-btn" data-diff="hard">상</button>
         <button class="mode-btn" data-diff="extreme">최상</button>
+        <button class="mode-btn" data-diff="neural">신경망</button>
       </div>
```

- [ ] **Step 2: 필요한 스크립트 로드**

`gomoku-stack.html`의 `<head>` 안(예: 기존 `<script defer src="/_vercel/insights/script.js">` 바로 아래)에 onnxruntime-web을 먼저 로드하고, Task 1에서 추가한 `<script src="./gomoku-stack-logic.js">` 바로 뒤에 인코딩/신경망 AI 스크립트를 추가:

```diff
 <script defer src="/_vercel/insights/script.js"></script>
+<script src="./assets/vendor/ort/ort.min.js"></script>
```

```diff
 <script src="./gomoku-stack-logic.js"></script>
+<script src="./gomoku-stack-neural-encoding.js"></script>
+<script src="./gomoku-stack-neural-ai.js"></script>
 <script>
 (function () {
```

- [ ] **Step 3: `computeAIMove`에 신경망 분기 + extreme 폴백 추가**

`gomoku-stack.html:1355-1357`의 기존 코드:

```js
  async function computeAIMove() {
    return state.phase === "initial" ? computeAIInitialMove() : computeAIMainMove();
  }
```

아래로 교체:

```js
  async function computeAIMove() {
    if (aiDifficulty === "neural") {
      try {
        return await GomokuStackNeuralAi.computeNeuralMove(state);
      } catch (err) {
        console.warn("[gomoku-stack] 신경망 AI 실패, extreme 난이도로 폴백:", err);
        const prevDifficulty = aiDifficulty;
        aiDifficulty = "extreme";
        try {
          return state.phase === "initial" ? computeAIInitialMove() : await computeAIMainMove();
        } finally {
          aiDifficulty = prevDifficulty;
        }
      }
    }
    return state.phase === "initial" ? computeAIInitialMove() : computeAIMainMove();
  }
```

- [ ] **Step 4: 브라우저 수동 검증**

로컬 서버로 `gomoku-stack.html`을 열고:
1. "AI와 대결" → 새로 추가된 "신경망" 난이도 버튼이 보이는지, 클릭해서 선택되는지 확인
2. 신경망 난이도로 대국 시작 — 초기 배치 단계와 본 게임 모두에서 AI가 (다소 느리더라도) 합법적인 수를 두는지 확인, 콘솔에 에러 없는지 확인
3. 개발자 도구에서 `assets/models/gomoku-stack-net.onnx` 요청을 실패하게 만든 뒤(예: 파일명을 일시적으로 바꿔서 404 유도) 신경망 난이도로 대국을 시작해, 콘솔에 폴백 경고가 뜨고 extreme 로직으로 정상 진행되는지 확인 — 확인 후 파일명 원복
4. 기존 easy/medium/hard/extreme 난이도로도 몇 수 두어 회귀가 없는지 확인

- [ ] **Step 5: 커밋**

```bash
git add gomoku-stack.html
git commit -m "feat: 3단 오목에 자가학습 신경망 AI 난이도 추가 (extreme 폴백 포함)"
```

## Self-Review 메모

- **스펙 커버리지**: 룰 요약(스펙 §게임 룰) → Task 1/3, 상태 인코딩(§아키텍처-2) → Task 4/13, 신경망(§3) → Task 5, MCTS(§4) → Task 6/14, 학습 루프(§5) → Task 7~11, Export(§6) → Task 12, 웹 통합/폴백(§7) → Task 15, 검증 전략 3가지(§검증) → 룰 포팅 검증(Task 2/3), 스모크 테스트(Task 10), 웹 통합 후 수동 테스트(Task 15) 모두 대응됨.
- **타입/시그니처 일관성**: `Move`(type/key/origin/dest), `GameState`(stacks/supply/phase/step_index·stepIndex/placed_in_step·placedInStep/turn/winner/win_reason·winReason/win_cells·winCells) 필드명이 Python(snake_case)과 JS(camelCase) 각 언어 관례를 따르되 태스크 간 동일 언어 내에서는 일관되게 사용됨을 확인.
- **알려진 리스크**: MCTS 퍼스펙티브 처리(Task 6/14)는 이 게임의 "승리해도 turn 유지" 특성 때문에 일반적인 AlphaZero 구현과 다르다 — Task 6의 두 테스트(즉시 승리 수 찾기, 상대 승리 수 막기)가 이 부분의 실질적 회귀 테스트 역할을 하므로 절대 약화시키지 말 것.
