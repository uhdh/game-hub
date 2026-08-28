# 카드체스 (Card Chess) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5×5 보드, 카드 5장 순환, 미니맥스 AI를 갖춘 1인 vs AI 보드게임 "카드체스"를 기존 게임 허브에 추가한다.

**Architecture:** 게임 규칙(보드/카드 이동/승리 판정)과 미니맥스 AI를 DOM에 의존하지 않는 순수 로직 파일(`card-chess-engine.js`, UMD 모듈)로 분리하고, `card-chess.html`이 그 로직을 불러와 렌더링·입력 처리·Supabase 리더보드 연동을 담당한다. `gomoku-board.js`/`gomoku-ai.js` 분리 패턴과 동일한 구조.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 도구 없음), Supabase REST API(anon key, raw fetch), Node.js 내장 테스트 러너(`node:test`, `node:assert/strict`).

**Spec:** `docs/superpowers/specs/2026-08-28-card-chess-design.md`

## Global Constraints

- 완전정보 게임: 양쪽 손패(카드 2장)와 대기존 카드가 항상 공개 상태 — 히든 정보 없음, 화면에 상대(AI) 카드도 항상 표시한다.
- 보드는 5열(col 0~4) × 5행(row 0~4). P1(사람, 항상 왼쪽/col 0 시작) vs P2(AI, 항상 오른쪽/col 4 시작). 사람은 항상 P1, AI는 항상 P2 — 화면 좌우 배치는 고정하되, 선(먼저 움직임)/후(드래프트 주도) 역할만 매 게임 무작위로 P1·P2 중 배정한다.
- 성(castle): P1의 목표 = `(col 4, row 2)`, P2의 목표 = `(col 0, row 2)`. 시작 시 그 칸엔 그 진영 자신의 말이 이미 서 있다.
- 카드 5종 이동 규칙, 점퍼→퀸 영구 전환 조건(총 말 2개 이하), 드래프트 순서, 승리 판정(전멸/성 점령 후 상대 턴 1회 생존)은 스펙 문서에 정의된 그대로 구현한다 — 임의로 규칙을 바꾸지 않는다.
- 다크 테마(배경 `#0f0f12`, 패널 `#15181c`/`#1c2024`, 강조색 `#5fb8b0`), Pretendard/시스템 폰트, 모바일 우선(`max-width: 480px` 컬럼) — 기존 게임 파일들과 동일 컨벤션.
- Supabase 접근은 SDK 없이 anon publishable key로 raw `fetch`만 사용. 프로젝트: `paktzmofotvwfdxcpmzv`.
- 새 파일은 프로젝트 루트에 평평하게 둔다 (기존 구조와 동일).
- AI 미니맥스 탐색 깊이는 기본 4플라이 고정. 실기기에서 응답이 1.5초를 넘으면 3플라이로 낮춘다(Task 10에서 측정).

---

## Task 1: Supabase 테이블 생성 (`card_chess_leaderboard`)

**Files:** 없음 (Supabase 인프라 변경, MCP 도구로 직접 적용)

**Interfaces:**
- Produces: REST 엔드포인트 `https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/card_chess_leaderboard` (컬럼: `id, nickname, rating, wins, losses, updated_at`). Task 10이 이 테이블에 select/insert/update로 접근한다.

- [ ] **Step 1: 마이그레이션 적용**

`mcp__claude_ai_Supabase__apply_migration` 도구를 다음 인자로 호출한다.

```
project_id: "paktzmofotvwfdxcpmzv"
name: "create_card_chess_leaderboard"
query:
```
```sql
create table public.card_chess_leaderboard (
  id bigint generated always as identity primary key,
  nickname text not null,
  rating integer not null default 1200,
  wins integer not null default 0,
  losses integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.card_chess_leaderboard enable row level security;

create policy "card_chess_leaderboard_select_anon" on public.card_chess_leaderboard
  for select to anon using (true);

create policy "card_chess_leaderboard_insert_anon" on public.card_chess_leaderboard
  for insert to anon with check (true);

create policy "card_chess_leaderboard_update_anon" on public.card_chess_leaderboard
  for update to anon using (true) with check (true);
```

- [ ] **Step 2: 테이블 생성 확인**

`mcp__claude_ai_Supabase__list_tables`를 `project_id: "paktzmofotvwfdxcpmzv"`, `schemas: ["public"]`, `verbose: true`로 호출.
Expected: `public.card_chess_leaderboard`가 컬럼 `id, nickname, rating, wins, losses, updated_at`, `rls_enabled: true`로 나타남.

- [ ] **Step 3: anon 권한으로 insert/select/update 동작 확인**

`mcp__claude_ai_Supabase__execute_sql`로 실행:

```sql
insert into public.card_chess_leaderboard (nickname, rating, wins, losses) values ('테스트유저', 1200, 0, 0) returning id;
```

반환된 `id`를 메모하고:

```sql
select count(*) from public.card_chess_leaderboard where nickname = '테스트유저';
update public.card_chess_leaderboard set rating = 1216, wins = 1 where nickname = '테스트유저';
select rating, wins from public.card_chess_leaderboard where nickname = '테스트유저';
delete from public.card_chess_leaderboard where nickname = '테스트유저';
```

Expected: insert 성공, count=1, update 후 rating=1216/wins=1로 조회됨. 검증용 행이므로 반드시 delete까지 완료한다.

---

## Task 2: 엔진 — 보드/상태 기본기 (`card-chess-engine.js` 시작)

**Files:**
- Create: `card-chess-engine.js`
- Test: `card-chess-engine.test.js`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: 브라우저 전역 `window.CardChessEngine`, Node `module.exports`. 이 태스크에서 노출:
  - `CARD_IDS: string[]` = `['rook','bishop','attacker','knight','jumper']`
  - `CASTLE: { P1: {col:4,row:2}, P2: {col:0,row:2} }`
  - `other(player: 'P1'|'P2') => 'P1'|'P2'`
  - `countAlive(state, player) => number`
  - `isHoldingCastle(state, player) => boolean`
  - `createInitialState(first: 'P1'|'P2') => state`
    - `state = { pieces: Array<{id,owner,col,row,facing}>, hands:{P1:[],P2:[]}, waiting:null, turn, turnCount:0, castleFlag:{P1:false,P2:false}, jumperConverted:false, winner:null, winReason:null }`

- [ ] **Step 1: 테스트 파일 작성**

`card-chess-engine.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./card-chess-engine.js');

test('createInitialState places 5 pieces per side facing each other', () => {
  const state = E.createInitialState('P1');
  const p1 = state.pieces.filter(p => p.owner === 'P1');
  const p2 = state.pieces.filter(p => p.owner === 'P2');
  assert.equal(p1.length, 5);
  assert.equal(p2.length, 5);
  assert.ok(p1.every(p => p.col === 0 && p.facing === 1));
  assert.ok(p2.every(p => p.col === 4 && p.facing === -1));
  assert.deepEqual(p1.map(p => p.row).sort(), [0, 1, 2, 3, 4]);
  assert.equal(state.turn, 'P1');
  assert.equal(state.turnCount, 0);
  assert.equal(state.jumperConverted, false);
  assert.deepEqual(state.hands, { P1: [], P2: [] });
});

test('other() flips player', () => {
  assert.equal(E.other('P1'), 'P2');
  assert.equal(E.other('P2'), 'P1');
});

test('countAlive counts only that owner\'s pieces', () => {
  const state = E.createInitialState('P1');
  assert.equal(E.countAlive(state, 'P1'), 5);
  assert.equal(E.countAlive(state, 'P2'), 5);
});

test('isHoldingCastle is false at game start (castle cell holds owner\'s own piece)', () => {
  const state = E.createInitialState('P1');
  assert.equal(E.isHoldingCastle(state, 'P1'), false);
  assert.equal(E.isHoldingCastle(state, 'P2'), false);
});

test('isHoldingCastle is true once a player\'s piece sits on its own target castle cell', () => {
  const state = E.createInitialState('P1');
  state.pieces.push({ id: 'test', owner: 'P1', col: 4, row: 2, facing: 1 });
  assert.equal(E.isHoldingCastle(state, 'P1'), true);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test card-chess-engine.test.js`
Expected: FAIL — `Cannot find module './card-chess-engine.js'`

- [ ] **Step 3: 구현 작성**

`card-chess-engine.js`:

```js
// card-chess-engine.js
// 카드체스 규칙 엔진 + 미니맥스 AI. DOM/네트워크 의존성 없는 순수 함수만 포함.
// 브라우저에서는 <script src="./card-chess-engine.js"></script>로 로드되고,
// Node 테스트에서는 require('./card-chess-engine.js')로 로드된다.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CardChessEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  "use strict";

  const CARD_IDS = ['rook', 'bishop', 'attacker', 'knight', 'jumper'];
  const CASTLE = { P1: { col: 4, row: 2 }, P2: { col: 0, row: 2 } };

  function other(player) { return player === 'P1' ? 'P2' : 'P1'; }

  function countAlive(state, player) {
    return state.pieces.filter(function (p) { return p.owner === player; }).length;
  }

  function isHoldingCastle(state, player) {
    const cell = CASTLE[player];
    return state.pieces.some(function (p) {
      return p.owner === player && p.col === cell.col && p.row === cell.row;
    });
  }

  function createInitialState(first) {
    const pieces = [];
    for (let row = 0; row < 5; row++) {
      pieces.push({ id: 'P1-' + row, owner: 'P1', col: 0, row: row, facing: 1 });
      pieces.push({ id: 'P2-' + row, owner: 'P2', col: 4, row: row, facing: -1 });
    }
    return {
      pieces: pieces,
      hands: { P1: [], P2: [] },
      waiting: null,
      turn: first,
      turnCount: 0,
      castleFlag: { P1: false, P2: false },
      jumperConverted: false,
      winner: null,
      winReason: null,
    };
  }

  return {
    CARD_IDS: CARD_IDS,
    CASTLE: CASTLE,
    other: other,
    countAlive: countAlive,
    isHoldingCastle: isHoldingCastle,
    createInitialState: createInitialState,
  };
});
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node --test card-chess-engine.test.js`
Expected: PASS — 5개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add card-chess-engine.js card-chess-engine.test.js
git commit -m "feat: 카드체스 엔진 - 보드/상태 기본기"
```

---

## Task 3: 엔진 — 카드별 이동 후보 생성 (`getLegalMoves`)

**Files:**
- Modify: `card-chess-engine.js`
- Modify: `card-chess-engine.test.js`

**Interfaces:**
- Consumes: Task 2의 `CASTLE`, `createInitialState` 등 내부 헬퍼
- Produces: `getLegalMoves(state, cardId, player?) => Array<{pieceId, from:{col,row}, to:{col,row}}>` — `player` 생략 시 `state.turn` 사용. `jumperConverted`가 true면 `cardId==='jumper'`도 퀸 규칙으로 계산.

- [ ] **Step 1: 테스트 추가**

`card-chess-engine.test.js`에 추가:

```js
function emptyState(turn) {
  const s = E.createInitialState(turn || 'P1');
  s.pieces = [];
  return s;
}

test('rook: orthogonal 1-step only, blocked by own piece, captures enemy', () => {
  const s = emptyState();
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P1', col: 3, row: 2, facing: 1 },
    { id: 'c', owner: 'P2', col: 2, row: 1, facing: -1 },
  ];
  const moves = E.getLegalMoves(s, 'rook', 'P1').filter(m => m.pieceId === 'a');
  const dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['1,2', '2,1', '2,3']);
});

test('bishop: diagonal 1-step only', () => {
  const s = emptyState();
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  const moves = E.getLegalMoves(s, 'bishop', 'P1');
  const dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['1,1', '1,3', '3,1', '3,3']);
});

test('knight: 8 L-shaped destinations, jumps over pieces', () => {
  const s = emptyState();
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'block', owner: 'P2', col: 2, row: 3, facing: -1 },
  ];
  const moves = E.getLegalMoves(s, 'knight', 'P1').filter(m => m.pieceId === 'a');
  assert.equal(moves.length, 8);
});

test('jumper: only jumps over an adjacent occupied cell, lands 2 away, hopped piece survives', () => {
  const s = emptyState();
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'hop', owner: 'P2', col: 3, row: 2, facing: -1 },
  ];
  const moves = E.getLegalMoves(s, 'jumper', 'P1').filter(m => m.pieceId === 'a');
  assert.deepEqual(moves.map(m => m.to), [{ col: 4, row: 2 }]);
});

test('jumper: no move in a direction with no adjacent piece', () => {
  const s = emptyState();
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  const moves = E.getLegalMoves(s, 'jumper', 'P1').filter(m => m.pieceId === 'a');
  assert.equal(moves.length, 0);
});

test('jumper converts to queen movement once total pieces on board <= 2', () => {
  const s = emptyState();
  s.jumperConverted = true;
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 4, row: 4, facing: -1 },
  ];
  const moves = E.getLegalMoves(s, 'jumper', 'P1').filter(m => m.pieceId === 'a');
  const dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['1,1', '1,2', '1,3', '2,1', '2,3', '3,1', '3,2', '3,3']);
});

test('attacker: forward 1/2 cells straight (blocked by any piece in between) plus forward-diagonal 1 cell', () => {
  const s = emptyState();
  s.pieces = [{ id: 'a', owner: 'P1', col: 1, row: 2, facing: 1 }];
  let moves = E.getLegalMoves(s, 'attacker', 'P1').filter(m => m.pieceId === 'a');
  let dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['2,1', '2,2', '2,3', '3,2']);

  s.pieces.push({ id: 'block', owner: 'P2', col: 2, row: 2, facing: -1 });
  moves = E.getLegalMoves(s, 'attacker', 'P1').filter(m => m.pieceId === 'a');
  dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  // 2칸 전진(3,2)은 중간(2,2)이 막혀서 사라지고, 1칸 전진은 상대말 포획으로 남음
  assert.deepEqual(dests, ['2,1', '2,2', '2,3']);
});

test('attacker uses facing to determine forward direction', () => {
  const s = emptyState();
  s.pieces = [{ id: 'a', owner: 'P2', col: 3, row: 2, facing: -1 }];
  const moves = E.getLegalMoves(s, 'attacker', 'P2').filter(m => m.pieceId === 'a');
  const dests = moves.map(m => m.to.col + ',' + m.to.row).sort();
  assert.deepEqual(dests, ['1,2', '2,1', '2,2', '2,3']);
});

test('queen movement (post-conversion) covers all 8 adjacent cells from board center', () => {
  const s = emptyState();
  s.jumperConverted = true;
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  const moves = E.getLegalMoves(s, 'jumper', 'P1');
  assert.equal(moves.length, 8);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test card-chess-engine.test.js`
Expected: FAIL — `E.getLegalMoves is not a function`

- [ ] **Step 3: 구현 추가**

`card-chess-engine.js`의 `return` 문 앞에 추가:

```js
  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ALL8 = ORTHO.concat(DIAG);
  const KNIGHT_OFFSETS = [[1, 2], [1, -2], [-1, 2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]];

  function inBounds(col, row) { return col >= 0 && col < 5 && row >= 0 && row < 5; }

  function pieceAt(state, col, row) {
    return state.pieces.find(function (p) { return p.col === col && p.row === row; }) || null;
  }

  function effectiveCard(state, cardId) {
    if (cardId === 'jumper' && state.jumperConverted) return 'queen';
    return cardId;
  }

  function destinationsFor(state, piece, kind) {
    const out = [];
    function ownAt(c, r) { const p = pieceAt(state, c, r); return !!p && p.owner === piece.owner; }
    function anyAt(c, r) { return !!pieceAt(state, c, r); }

    if (kind === 'rook' || kind === 'bishop' || kind === 'queen') {
      const dirs = kind === 'rook' ? ORTHO : kind === 'bishop' ? DIAG : ALL8;
      dirs.forEach(function (d) {
        const c = piece.col + d[0], r = piece.row + d[1];
        if (inBounds(c, r) && !ownAt(c, r)) out.push({ col: c, row: r });
      });
    } else if (kind === 'knight') {
      KNIGHT_OFFSETS.forEach(function (d) {
        const c = piece.col + d[0], r = piece.row + d[1];
        if (inBounds(c, r) && !ownAt(c, r)) out.push({ col: c, row: r });
      });
    } else if (kind === 'jumper') {
      ALL8.forEach(function (d) {
        const mc = piece.col + d[0], mr = piece.row + d[1];
        if (!inBounds(mc, mr) || !anyAt(mc, mr)) return;
        const c = piece.col + 2 * d[0], r = piece.row + 2 * d[1];
        if (inBounds(c, r) && !ownAt(c, r)) out.push({ col: c, row: r });
      });
    } else if (kind === 'attacker') {
      const f = piece.facing;
      const oneC = piece.col + f, oneR = piece.row;
      if (inBounds(oneC, oneR) && !ownAt(oneC, oneR)) out.push({ col: oneC, row: oneR });
      const twoC = piece.col + 2 * f, twoR = piece.row;
      if (inBounds(twoC, twoR) && !anyAt(oneC, oneR) && !ownAt(twoC, twoR)) out.push({ col: twoC, row: twoR });
      [1, -1].forEach(function (dr) {
        const dc = piece.col + f, drow = piece.row + dr;
        if (inBounds(dc, drow) && !ownAt(dc, drow)) out.push({ col: dc, row: drow });
      });
    }
    return out;
  }

  function getLegalMoves(state, cardId, player) {
    player = player || state.turn;
    const kind = effectiveCard(state, cardId);
    const moves = [];
    state.pieces.filter(function (p) { return p.owner === player; }).forEach(function (piece) {
      destinationsFor(state, piece, kind).forEach(function (d) {
        moves.push({ pieceId: piece.id, from: { col: piece.col, row: piece.row }, to: d });
      });
    });
    return moves;
  }
```

`return` 객체에 `getLegalMoves: getLegalMoves,`를 추가한다.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

먼저 Step 1에서 지시한 대로 placeholder 테스트(`'queen: 8-direction 1-step'`)를 테스트 파일에서 제거한 뒤 실행.

Run: `node --test card-chess-engine.test.js`
Expected: PASS — 이전 5개 + 이번 9개 = 14개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add card-chess-engine.js card-chess-engine.test.js
git commit -m "feat: 카드체스 엔진 - 카드별 이동 후보 생성"
```

---

## Task 4: 엔진 — 드래프트 (`applyDraft`, `chooseAiDraft`)

**Files:**
- Modify: `card-chess-engine.js`
- Modify: `card-chess-engine.test.js`

**Interfaces:**
- Consumes: Task 2의 `CARD_IDS`, `other`
- Produces:
  - `applyDraft(state, secondCards: [string,string], firstCards: [string,string]) => state` — `state.turn`을 선(first)으로 보고, `other(state.turn)`을 후(second)로 취급. 후공 손에 `secondCards`, 선공 손에 `firstCards`, 나머지 1장은 `waiting`.
  - `chooseAiDraft() => { secondCards: [string,string], firstCards: [string,string] }` — 카드 파워 순위(나이트>점퍼>어태커>비숍>록)로 상위 2장을 자기 몫, 다음 2장을 상대 몫으로 고정 배정.

- [ ] **Step 1: 테스트 추가**

```js
test('applyDraft assigns hands and leaves exactly one waiting card', () => {
  const s = E.createInitialState('P1'); // P1=선, P2=후
  const next = E.applyDraft(s, ['knight', 'jumper'], ['attacker', 'bishop']);
  assert.deepEqual(next.hands.P2, ['knight', 'jumper']);
  assert.deepEqual(next.hands.P1, ['attacker', 'bishop']);
  assert.equal(next.waiting, 'rook');
});

test('applyDraft throws on duplicate or wrong-count cards', () => {
  const s = E.createInitialState('P1');
  assert.throws(() => E.applyDraft(s, ['knight', 'knight'], ['attacker', 'bishop']));
  assert.throws(() => E.applyDraft(s, ['knight'], ['attacker', 'bishop']));
});

test('chooseAiDraft ranks knight/jumper for self, attacker/bishop for opponent, rook waits', () => {
  const draft = E.chooseAiDraft();
  assert.deepEqual(draft.secondCards.slice().sort(), ['jumper', 'knight']);
  assert.deepEqual(draft.firstCards.slice().sort(), ['attacker', 'bishop']);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test card-chess-engine.test.js`
Expected: FAIL — `E.applyDraft is not a function`

- [ ] **Step 3: 구현 추가**

`card-chess-engine.js`에 추가 (return 문 앞):

```js
  const CARD_POWER = { knight: 5, jumper: 4, attacker: 3, bishop: 2, rook: 1 };

  function cloneState(state) {
    return {
      pieces: state.pieces.map(function (p) { return Object.assign({}, p); }),
      hands: { P1: state.hands.P1.slice(), P2: state.hands.P2.slice() },
      waiting: state.waiting,
      turn: state.turn,
      turnCount: state.turnCount,
      castleFlag: Object.assign({}, state.castleFlag),
      jumperConverted: state.jumperConverted,
      winner: state.winner,
      winReason: state.winReason,
    };
  }

  function applyDraft(state, secondCards, firstCards) {
    const used = secondCards.concat(firstCards);
    if (used.length !== 4) throw new Error('secondCards + firstCards must total 4 cards');
    if (new Set(used).size !== 4) throw new Error('duplicate card in draft');
    const first = state.turn;
    const second = other(first);
    const waiting = CARD_IDS.filter(function (c) { return used.indexOf(c) === -1; })[0];
    const next = cloneState(state);
    next.hands[second] = secondCards.slice();
    next.hands[first] = firstCards.slice();
    next.waiting = waiting;
    return next;
  }

  function chooseAiDraft() {
    const sorted = CARD_IDS.slice().sort(function (a, b) { return CARD_POWER[b] - CARD_POWER[a]; });
    return { secondCards: sorted.slice(0, 2), firstCards: sorted.slice(2, 4) };
  }
```

`return` 객체에 `applyDraft: applyDraft, chooseAiDraft: chooseAiDraft,` 추가. (`cloneState`는 Task 5에서도 재사용한다.)

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node --test card-chess-engine.test.js`
Expected: PASS — 14 + 3 = 17개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add card-chess-engine.js card-chess-engine.test.js
git commit -m "feat: 카드체스 엔진 - 카드 드래프트"
```

---

## Task 5: 엔진 — 이동 적용/턴 진행/승리 판정 (`applyMove`, `applyPass`)

**Files:**
- Modify: `card-chess-engine.js`
- Modify: `card-chess-engine.test.js`

**Interfaces:**
- Consumes: Task 2~4의 모든 헬퍼(`cloneState`, `getLegalMoves`, `isHoldingCastle`, `countAlive`, `other`)
- Produces:
  - `applyMove(state, cardId, from:{col,row}, to:{col,row}) => state` (불변 갱신) — 포획, facing 반전, 카드 순환, `jumperConverted` 갱신, 전멸/성점령 승리 판정까지 전부 처리.
  - `applyPass(state, cardId) => state` — 그 카드로 이동 가능한 수가 하나도 없을 때만 허용, 카드만 순환하고 턴 넘김.

- [ ] **Step 1: 테스트 추가**

```js
function draftedState(first) {
  let s = E.createInitialState(first || 'P1');
  const draft = E.chooseAiDraft(); // 결정적 배분 재사용 (테스트 목적)
  return E.applyDraft(s, draft.secondCards, draft.firstCards);
}

test('applyMove moves the piece and captures an enemy on the destination', () => {
  let s = E.createInitialState('P1');
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 2, row: 1, facing: -1 },
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 2, row: 1 });
  assert.equal(next.pieces.length, 1);
  assert.equal(next.pieces[0].col, 2);
  assert.equal(next.pieces[0].row, 1);
  assert.equal(next.pieces[0].owner, 'P1');
});

test('applyMove cycles cards: used card -> waiting, waiting card -> hand', () => {
  let s = E.createInitialState('P1');
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 2, row: 1 });
  assert.deepEqual(next.hands.P1, ['bishop', 'attacker']);
  assert.equal(next.waiting, 'rook');
});

test('applyMove flips facing when a piece reaches the far edge column', () => {
  let s = E.createInitialState('P1');
  s.pieces = [{ id: 'a', owner: 'P1', col: 3, row: 2, facing: 1 }];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 3, row: 2 }, { col: 4, row: 2 });
  assert.equal(next.pieces[0].facing, -1);
});

test('applyMove throws on an illegal destination', () => {
  let s = E.createInitialState('P1');
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  assert.throws(() => E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 4, row: 4 }));
});

test('applyPass cycles the card and passes the turn when no legal move exists', () => {
  let s = E.createInitialState('P1');
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 4, row: 4, facing: -1 },
  ];
  s.hands = { P1: ['jumper', 'bishop'], P2: ['knight', 'attacker'] };
  s.waiting = 'rook';
  // jumper: 인접 8칸에 아무 말도 없으면 이동 불가 (상대 말은 멀리 떨어져 있어 인접하지 않음)
  const moves = E.getLegalMoves(s, 'jumper', 'P1');
  assert.equal(moves.length, 0);
  const next = E.applyPass(s, 'jumper');
  assert.deepEqual(next.hands.P1, ['bishop', 'rook']);
  assert.equal(next.waiting, 'jumper');
  assert.equal(next.turn, 'P2');
  assert.deepEqual(next.pieces, s.pieces); // 말은 그대로
});

test('applyPass throws if legal moves actually exist for that card', () => {
  let s = E.createInitialState('P1');
  s.pieces = [{ id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 }];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  assert.throws(() => E.applyPass(s, 'rook'));
});

test('capturing the last enemy piece wins immediately by elimination', () => {
  let s = E.createInitialState('P1');
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 2, row: 1, facing: -1 },
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 2, row: 1 });
  assert.equal(next.winner, 'P1');
  assert.equal(next.winReason, 'elimination');
});

test('jumper converts to queen once total pieces drop to 2', () => {
  let s = E.createInitialState('P1');
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'extra', owner: 'P1', col: 0, row: 0, facing: 1 },
    { id: 'b', owner: 'P2', col: 2, row: 1, facing: -1 },
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  assert.equal(s.jumperConverted, false);
  // P1이 P2의 유일한 말을 잡으면: P1 2개(a,extra) vs P2 0개 -> 이미 전멸승, jumperConverted 조건(<=2)도 참이 되지만 승패는 전멸로 먼저 결정됨.
  // jumperConverted 자체를 확인하려면 전멸이 아닌 '총 2개 남는' 상황을 만든다.
  s.pieces = [
    { id: 'a', owner: 'P1', col: 2, row: 2, facing: 1 },
    { id: 'b', owner: 'P2', col: 2, row: 1, facing: -1 },
    { id: 'c', owner: 'P2', col: 0, row: 0, facing: -1 },
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  const next = E.applyMove(s, 'rook', { col: 2, row: 2 }, { col: 2, row: 1 });
  assert.equal(next.pieces.length, 2); // a, c만 생존
  assert.equal(next.winner, null); // 아직 상대(c)가 살아있으니 전멸 아님
  assert.equal(next.jumperConverted, true);
});

test('castle win: opponent piece sits on my castle, and I fail to remove it during my turn', () => {
  // finishTurn의 castleFlag는 "그 플레이어가 자기 턴을 마칠 때" 스냅샷된다. 따라서 승리가 감지되려면
  // 먼저 침입한 쪽(P2)이 성을 점유한 채로 자기 턴을 한 번 마쳐 castleFlag.P2를 세우고, 그다음 상대(P1)가
  // 침입자를 못 잡고 턴을 마쳐야 한다 — 그 두 번째 이동이 끝나 턴이 P2로 넘어가는 순간 승리가 확정된다.
  // 그래서 이 시나리오는 P2가 먼저 두는 것으로 시작해야 한다(P1이 먼저 두면 한 번 더 왕복해야 함).
  let s = E.createInitialState('P2'); // 이 테스트 한정으로 P2가 먼저 둔다
  // P2 말 하나를 P2의 성(0,2)에 미리 세워둔다 (원래 그 자리에 있던 P1 말은 비워둔 것으로 취급)
  s.pieces = s.pieces.filter(p => !(p.owner === 'P1' && p.row === 2));
  s.pieces = s.pieces.map(p => p.owner === 'P2' && p.row === 2 ? Object.assign({}, p, { col: 0, row: 2 }) : p);
  s.hands = { P1: ['rook', 'bishop'], P2: ['knight', 'jumper'] };
  s.waiting = 'attacker';
  // P2 턴: 성 점유와 무관한 수를 둬서 castleFlag.P2를 세운다
  const p2Mover = s.pieces.find(p => p.owner === 'P2' && p.row === 4);
  let next = E.applyMove(s, 'knight', { col: p2Mover.col, row: p2Mover.row }, E.getLegalMoves(s, 'knight', 'P2').find(m => m.pieceId === p2Mover.id).to);
  assert.equal(next.winner, null); // 아직 P1 턴이 안 끝났으니 승리 아님
  assert.equal(next.turn, 'P1');
  // P1 턴: 침입자를 못 잡는 무관한 수를 둔다 (성 칸 유지)
  const p1Mover = next.pieces.find(p => p.owner === 'P1' && p.row === 4);
  next = E.applyMove(next, 'rook', { col: p1Mover.col, row: p1Mover.row }, { col: p1Mover.col + 1, row: p1Mover.row });
  assert.equal(next.winner, 'P2');
  assert.equal(next.winReason, 'castle');
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test card-chess-engine.test.js`
Expected: FAIL — `E.applyMove is not a function`

- [ ] **Step 3: 구현 추가**

`card-chess-engine.js`에 추가 (return 문 앞):

```js
  function cycleCards(state, cardId, mover) {
    const hand = state.hands[mover];
    if (hand.indexOf(cardId) === -1) throw new Error('card not in hand');
    const remaining = hand.filter(function (c) { return c !== cardId; });
    state.hands[mover] = [remaining[0], state.waiting];
    state.waiting = cardId;
  }

  function finishTurn(state, mover) {
    const opp = other(mover);
    if (!state.jumperConverted && (countAlive(state, 'P1') + countAlive(state, 'P2')) <= 2) {
      state.jumperConverted = true;
    }
    if (countAlive(state, opp) === 0) {
      state.winner = mover;
      state.winReason = 'elimination';
      return state;
    }
    state.castleFlag[mover] = isHoldingCastle(state, mover);
    state.turn = opp;
    state.turnCount += 1;
    if (state.castleFlag[opp] && isHoldingCastle(state, opp)) {
      state.winner = opp;
      state.winReason = 'castle';
    }
    return state;
  }

  function applyMove(state, cardId, from, to) {
    const legal = getLegalMoves(state, cardId);
    const match = legal.find(function (m) {
      return m.from.col === from.col && m.from.row === from.row && m.to.col === to.col && m.to.row === to.row;
    });
    if (!match) throw new Error('illegal move');
    const mover = state.turn;
    const next = cloneState(state);
    const piece = next.pieces.find(function (p) { return p.col === from.col && p.row === from.row && p.owner === mover; });
    next.pieces = next.pieces.filter(function (p) { return !(p.col === to.col && p.row === to.row); });
    piece.col = to.col;
    piece.row = to.row;
    if (piece.facing === 1 && piece.col === 4) piece.facing = -1;
    else if (piece.facing === -1 && piece.col === 0) piece.facing = 1;
    cycleCards(next, cardId, mover);
    return finishTurn(next, mover);
  }

  function applyPass(state, cardId) {
    const mover = state.turn;
    const legal = getLegalMoves(state, cardId);
    if (legal.length !== 0) throw new Error('cannot pass: legal moves exist for this card');
    const next = cloneState(state);
    cycleCards(next, cardId, mover);
    return finishTurn(next, mover);
  }
```

`return` 객체에 `applyMove: applyMove, applyPass: applyPass,` 추가.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node --test card-chess-engine.test.js`
Expected: PASS — 17 + 9 = 26개 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add card-chess-engine.js card-chess-engine.test.js
git commit -m "feat: 카드체스 엔진 - 이동 적용, 카드 순환, 승리 판정"
```

---

## Task 6: 엔진 — 미니맥스 AI (`chooseAiMove`)

**Files:**
- Modify: `card-chess-engine.js`
- Modify: `card-chess-engine.test.js`

**Interfaces:**
- Consumes: Task 2~5의 모든 함수
- Produces: `chooseAiMove(state, depth?) => {cardId, from, to} | {cardId, pass:true}` (depth 기본값 4). `evaluate(state, forPlayer)`도 테스트 편의를 위해 함께 노출.

- [ ] **Step 1: 테스트 추가**

```js
test('chooseAiMove takes an immediate winning capture over anything else', () => {
  let s = E.createInitialState('P2'); // P2 차례
  s.pieces = [
    { id: 'ai', owner: 'P2', col: 2, row: 2, facing: -1 },
    { id: 'human', owner: 'P1', col: 2, row: 1, facing: 1 }, // 유일한 상대 말
  ];
  s.hands = { P1: ['rook', 'bishop'], P2: ['rook', 'knight'] };
  s.waiting = 'attacker';
  const action = E.chooseAiMove(s, 2);
  assert.equal(action.cardId, 'rook');
  assert.deepEqual(action.to, { col: 2, row: 1 });
  const next = E.applyMove(s, action.cardId, action.from, action.to);
  assert.equal(next.winner, 'P2');
});

test('chooseAiMove prefers capturing a free enemy piece over an unrelated move', () => {
  let s = E.createInitialState('P2');
  s.pieces = [
    { id: 'ai1', owner: 'P2', col: 2, row: 2, facing: -1 },
    { id: 'ai2', owner: 'P2', col: 0, row: 4, facing: -1 },
    { id: 'prey', owner: 'P1', col: 2, row: 1, facing: 1 },
    { id: 'safe', owner: 'P1', col: 0, row: 0, facing: 1 },
  ];
  s.hands = { P1: ['bishop', 'attacker'], P2: ['rook', 'knight'] };
  s.waiting = 'jumper';
  const action = E.chooseAiMove(s, 2);
  const next = E.applyMove(s, action.cardId, action.from, action.to);
  assert.equal(E.countAlive(next, 'P1'), 1); // prey가 사라졌어야 함
});

test('evaluate returns a large positive number for a state where forPlayer has already won', () => {
  let s = E.createInitialState('P1');
  s.winner = 'P1';
  assert.ok(E.evaluate(s, 'P1') > 100000);
  assert.ok(E.evaluate(s, 'P2') < -100000);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test card-chess-engine.test.js`
Expected: FAIL — `E.chooseAiMove is not a function`

- [ ] **Step 3: 구현 추가**

`card-chess-engine.js`에 추가 (return 문 앞):

```js
  function chebyshev(a, b) { return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)); }

  function countMobility(state, player) {
    return state.hands[player].reduce(function (sum, cardId) {
      return sum + getLegalMoves(state, cardId, player).length;
    }, 0);
  }

  function evaluate(state, forPlayer) {
    if (state.winner) return state.winner === forPlayer ? 1000000 : -1000000;
    const opp = other(forPlayer);
    const myPieces = state.pieces.filter(function (p) { return p.owner === forPlayer; });
    const oppPieces = state.pieces.filter(function (p) { return p.owner === opp; });
    let score = (myPieces.length - oppPieces.length) * 100;
    const myDist = Math.min.apply(null, myPieces.map(function (p) { return chebyshev(p, CASTLE[forPlayer]); }));
    const oppDist = Math.min.apply(null, oppPieces.map(function (p) { return chebyshev(p, CASTLE[opp]); }));
    score += 5 * (oppDist - myDist);
    if (isHoldingCastle(state, forPlayer)) score += 50;
    if (isHoldingCastle(state, opp)) score -= 50;
    score += countMobility(state, forPlayer) - countMobility(state, opp);
    return score;
  }

  function allActions(state) {
    const player = state.turn;
    const actions = [];
    state.hands[player].forEach(function (cardId) {
      const moves = getLegalMoves(state, cardId, player);
      if (moves.length === 0) {
        actions.push({ cardId: cardId, pass: true });
      } else {
        moves.forEach(function (mv) {
          actions.push({ cardId: cardId, from: mv.from, to: mv.to });
        });
      }
    });
    return actions;
  }

  function applyAction(state, action) {
    if (action.pass) return applyPass(state, action.cardId);
    return applyMove(state, action.cardId, action.from, action.to);
  }

  function minimax(state, depth, alpha, beta, rootPlayer) {
    if (state.winner || depth === 0) return evaluate(state, rootPlayer);
    const maximizing = state.turn === rootPlayer;
    const actions = allActions(state);
    let best = maximizing ? -Infinity : Infinity;
    for (let i = 0; i < actions.length; i++) {
      const next = applyAction(state, actions[i]);
      const val = minimax(next, depth - 1, alpha, beta, rootPlayer);
      if (maximizing) {
        if (val > best) best = val;
        if (best > alpha) alpha = best;
      } else {
        if (val < best) best = val;
        if (best < beta) beta = best;
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  function chooseAiMove(state, depth) {
    depth = depth || 4;
    const rootPlayer = state.turn;
    const actions = allActions(state);
    let bestVal = -Infinity;
    let bestActions = [];
    actions.forEach(function (action) {
      const next = applyAction(state, action);
      const val = minimax(next, depth - 1, -Infinity, Infinity, rootPlayer);
      if (val > bestVal) {
        bestVal = val;
        bestActions = [action];
      } else if (val === bestVal) {
        bestActions.push(action);
      }
    });
    return bestActions[Math.floor(Math.random() * bestActions.length)];
  }
```

`return` 객체에 `evaluate: evaluate, chooseAiMove: chooseAiMove,` 추가.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node --test card-chess-engine.test.js`
Expected: PASS — 26 + 3 = 29개 테스트 통과. (`chooseAiMove` 테스트가 실행 시간이 길게 느껴지면 depth를 2로 낮춰 호출하고 있는지 확인 — 위 테스트는 이미 depth 2로 작성됨)

- [ ] **Step 5: 커밋**

```bash
git add card-chess-engine.js card-chess-engine.test.js
git commit -m "feat: 카드체스 엔진 - 미니맥스 AI"
```

---

## Task 7: 엔진 — Elo 레이팅 헬퍼

**Files:**
- Modify: `card-chess-engine.js`
- Modify: `card-chess-engine.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `computeExpectedScore(aiRating, playerRating) => number`, `computeNewRating(currentRating, actual, aiRating, kFactor) => number` — `gomoku-rating.js`와 동일한 공식(계산식만 이 파일 안에 인라인, 별도 파일 의존 없음).

- [ ] **Step 1: 테스트 추가**

```js
test('computeExpectedScore returns 0.5 when ratings are equal', () => {
  assert.equal(E.computeExpectedScore(1500, 1500), 0.5);
});

test('computeNewRating increases rating on a win against a higher-rated AI', () => {
  const newRating = E.computeNewRating(1200, 1, 1500, 32);
  assert.ok(newRating > 1200);
});

test('computeNewRating decreases rating on a loss against a lower-rated AI', () => {
  const newRating = E.computeNewRating(1600, 0, 1500, 32);
  assert.ok(newRating < 1600);
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `node --test card-chess-engine.test.js`
Expected: FAIL — `E.computeExpectedScore is not a function`

- [ ] **Step 3: 구현 추가**

`card-chess-engine.js`에 추가 (return 문 앞):

```js
  function computeExpectedScore(aiRating, playerRating) {
    return 1 / (1 + Math.pow(10, (aiRating - playerRating) / 400));
  }

  function computeNewRating(currentRating, actual, aiRating, kFactor) {
    const expected = computeExpectedScore(aiRating, currentRating);
    return Math.round(currentRating + kFactor * (actual - expected));
  }
```

`return` 객체에 `computeExpectedScore: computeExpectedScore, computeNewRating: computeNewRating,` 추가.

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `node --test card-chess-engine.test.js`
Expected: PASS — 29 + 3 = 32개 테스트 통과 (엔진 전체 완료)

- [ ] **Step 5: 커밋**

```bash
git add card-chess-engine.js card-chess-engine.test.js
git commit -m "feat: 카드체스 엔진 - Elo 레이팅 헬퍼"
```

---

## Task 8: `card-chess.html` 뼈대 — 시작 화면 + 보드/카드 정적 렌더링

**Files:**
- Create: `card-chess.html`

**Interfaces:**
- Consumes: `card-chess-engine.js`의 `window.CardChessEngine` (Task 2~7)
- Produces: `#screen-start`(닉네임 입력 → 게임 시작) → `#screen-game`(보드 5×5 + 좌/우 카드 슬롯 + 상단 대기 카드 슬롯이 현재 상태에 맞춰 그려짐). 이 태스크에서는 클릭 상호작용 없이 "게임 시작" 시 초기 상태(드래프트 포함)를 만들어 화면에 반영하는 것까지만 다룬다.

- [ ] **Step 1: 전체 뼈대 작성**

`card-chess.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>카드체스 - 피의 게임 X 시뮬레이터</title>
<link rel="icon" type="image/png" href="./assets/favicon.png">
<script src="./card-chess-engine.js"></script>
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
  .col { width: 100%; max-width: 460px; display: flex; flex-direction: column; gap: 16px; }
  .header-row { display: flex; align-items: center; justify-content: space-between; }
  .home-link { font-size: 12.5px; font-weight: 700; color: var(--text-dim); }
  .title { font-size: 18px; font-weight: 800; }

  .screen { display: flex; flex-direction: column; gap: 16px; }
  .screen.hidden { display: none; }

  .rules-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
  .rules-title { font-size: 13px; font-weight: 700; color: var(--accent); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .04em; }
  .rules-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-dim); line-height: 1.5; }

  .nickname-row { display: flex; gap: 8px; align-items: center; }
  .nickname-row label { font-size: 12.5px; color: var(--text-dim); flex-shrink: 0; }
  #nickname-input { flex: 1; background: var(--panel-light); border: 1px solid var(--border); color: var(--text); border-radius: 10px; padding: 9px 10px; font-size: 13.5px; }

  .btn-primary { background: var(--accent); color: #0f1214; font-size: 14px; font-weight: 700; border: none; padding: 12px 18px; border-radius: 12px; cursor: pointer; }
  .btn-primary:disabled { opacity: .4; cursor: not-allowed; }
  .btn-secondary { background: var(--panel-light); color: var(--text); font-size: 13.5px; font-weight: 700; border: 1px solid var(--border); padding: 10px 14px; border-radius: 12px; cursor: pointer; }

  .status-bar { text-align: center; font-size: 13px; font-weight: 700; color: var(--gold); min-height: 18px; }

  .table-layout {
    display: grid;
    grid-template-columns: 62px 1fr 62px;
    grid-template-rows: auto auto;
    gap: 10px;
    align-items: center;
    justify-items: center;
  }
  .wait-slot-wrap { grid-column: 1 / 4; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .hand-left { grid-column: 1; grid-row: 2; display: flex; flex-direction: column; gap: 10px; }
  .hand-right { grid-column: 3; grid-row: 2; display: flex; flex-direction: column; gap: 10px; }
  .board-wrap { grid-column: 2; grid-row: 2; }

  .card-slot {
    width: 58px; height: 82px;
    background: var(--panel-light);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-size: 10.5px; font-weight: 700; text-align: center; gap: 4px;
    padding: 4px;
    cursor: default;
  }
  .card-slot.selectable { cursor: pointer; border-color: var(--accent); }
  .card-slot.selected { background: rgba(95,184,176,.22); border-color: var(--accent); }
  .card-slot .card-icon { font-size: 18px; }
  .card-slot .card-label-tiny { font-size: 9px; color: var(--text-dim); }

  .board {
    display: grid;
    grid-template-columns: repeat(5, 50px);
    grid-template-rows: repeat(5, 50px);
    gap: 2px;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 2px;
  }
  .cell {
    background: var(--panel);
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .cell.castle { background: rgba(255,209,102,.10); box-shadow: inset 0 0 0 2px rgba(255,209,102,.5); }
  .cell.highlight-piece { box-shadow: inset 0 0 0 2px var(--accent); cursor: pointer; }
  .cell.highlight-dest { background: rgba(95,184,176,.22); cursor: pointer; }
  .piece {
    width: 34px; height: 34px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800;
    border: 2px solid rgba(0,0,0,.3);
  }
  .piece.owner-P1 { background: #5fb8b0; color: #0f1214; }
  .piece.owner-P2 { background: #e0786f; color: #23090a; }

  .rules-summary { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; font-size: 11.5px; color: var(--text-dim); line-height: 1.6; }

  .modal { position: fixed; inset: 0; background: rgba(6,7,9,.75); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
  .modal.hidden { display: none; }
  .modal-box { background: var(--panel); border: 1px solid var(--border); border-radius: 20px; padding: 28px 24px; max-width: 320px; width: 100%; display: flex; flex-direction: column; gap: 10px; text-align: center; }
  .modal-title { font-size: 20px; font-weight: 800; }
  .modal-reason { font-size: 13px; color: var(--text-dim); }
</style>
</head>
<body>
<div id="app">
  <div class="col">
    <div class="header-row">
      <a href="./index.html" class="home-link">← 게임 허브</a>
      <span class="title">카드체스</span>
      <button type="button" class="btn-secondary" id="new-game-btn" style="display:none;">새 게임</button>
    </div>

    <div id="screen-start" class="screen">
      <div class="rules-card">
        <div class="rules-title">규칙 요약</div>
        <ul class="rules-list">
          <li>5×5 보드, 말 5개씩. 매 턴 카드 2장 중 하나로 말 1개를 이동합니다.</li>
          <li>록: 상하좌우 1칸 · 비숍: 대각선 1칸 · 나이트: 체스 나이트 이동 · 어태커: 전진 1~2칸 또는 대각선-전진 1칸 · 점퍼: 인접한 말을 넘어 2칸 이동(말 2개 남으면 퀸으로 전환)</li>
          <li>상대 말을 모두 잡거나, 상대 성 칸에 말을 올리고 상대가 한 턴 동안 쫓아내지 못하면 승리합니다.</li>
        </ul>
      </div>
      <div class="nickname-row">
        <label for="nickname-input">닉네임</label>
        <input type="text" id="nickname-input" maxlength="20" placeholder="비워두면 랜덤 배정">
      </div>
      <button type="button" class="btn-primary" id="start-btn">게임 시작</button>
    </div>

    <div id="screen-game" class="screen hidden">
      <div class="status-bar" id="status-bar"></div>
      <div class="table-layout">
        <div class="wait-slot-wrap">
          <span class="card-label-tiny">대기</span>
          <div class="card-slot" id="wait-slot"></div>
        </div>
        <div class="hand-left" id="hand-P1"></div>
        <div class="board-wrap">
          <div class="board" id="board"></div>
        </div>
        <div class="hand-right" id="hand-P2"></div>
      </div>
      <div class="rules-summary">
        록: 상하좌우 1칸 · 비숍: 대각선 1칸 · 어태커: 전진 1~2칸/대각선-전진 1칸 · 나이트: 체스 나이트 · 점퍼: 인접 말 넘어 2칸(말 2개 남으면 퀸: 8방향 1칸)
      </div>
    </div>
  </div>
</div>

<div id="win-modal" class="modal hidden">
  <div class="modal-box">
    <div class="modal-title" id="win-title"></div>
    <div class="modal-reason" id="win-reason"></div>
    <button type="button" class="btn-primary" id="win-restart-btn">새 게임</button>
  </div>
</div>

<script>
  const E = window.CardChessEngine;
  const CARD_LABELS = { rook: ['♜', '록'], bishop: ['♝', '비숍'], attacker: ['⚔️', '어태커'], knight: ['♞', '나이트'], jumper: ['⛓️', '점퍼'], queen: ['♛', '퀸'] };

  function cardDisplay(state, cardId) {
    const kind = (cardId === 'jumper' && state.jumperConverted) ? 'queen' : cardId;
    return CARD_LABELS[kind];
  }

  let state = null;

  function randomNickname() {
    const pool = ['이상민', '정근우', '박지민', '이태균', '하승진', '현성주', '윤비', '이진형', '홍진호', '서출구', '최혜선', '허성범', '김경훈', '김유현', '김남희', '강지후', '곽범', '이관희', '신승용', '덕후'];
    const word = pool[Math.floor(Math.random() * pool.length)];
    return `${word}#${Math.floor(Math.random() * 999) + 1}`;
  }

  const nicknameInput = document.getElementById('nickname-input');
  const savedNickname = localStorage.getItem('cardChessNickname');
  nicknameInput.value = savedNickname || '';

  function startGame() {
    const nickname = nicknameInput.value.trim() || randomNickname();
    localStorage.setItem('cardChessNickname', nickname);
    window.cardChessNickname = nickname;

    const first = Math.random() < 0.5 ? 'P1' : 'P2';
    state = E.createInitialState(first);
    const second = E.other(first);
    if (second === 'P2') {
      const draft = E.chooseAiDraft();
      state = E.applyDraft(state, draft.secondCards, draft.firstCards);
    }
    // second === 'P1'(사람)인 경우의 드래프트 UI는 Task 9에서 추가한다. 이 태스크에서는
    // AI가 후공(second==='P2')인 케이스만 즉시 진행하고, 사람이 후공인 케이스는 그대로
    // 게임 화면에 진입하되 손패가 비어 있는 상태로 보여준다(Task 9에서 드래프트 UI로 채움).

    document.getElementById('screen-start').classList.add('hidden');
    document.getElementById('screen-game').classList.remove('hidden');
    document.getElementById('new-game-btn').style.display = '';
    render();
  }

  function render() {
    renderCardSlot('wait-slot', state.waiting, false);
    renderHand('hand-P1', 'P1');
    renderHand('hand-P2', 'P2');
    renderBoard();
    document.getElementById('status-bar').textContent = state.hands.P1.length === 0
      ? '카드 배분 대기 중'
      : (state.turn === 'P1' ? '당신의 차례' : 'AI 차례');
  }

  function renderCardSlot(elId, cardId, selectable) {
    const el = document.getElementById(elId);
    if (!cardId) { el.innerHTML = ''; return; }
    const [icon, label] = cardDisplay(state, cardId);
    el.innerHTML = `<span class="card-icon">${icon}</span><span class="card-label-tiny">${label}</span>`;
    el.classList.toggle('selectable', !!selectable);
  }

  function renderHand(elId, player) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    (state.hands[player] || []).forEach(function (cardId, idx) {
      const slot = document.createElement('div');
      slot.className = 'card-slot';
      const [icon, label] = cardDisplay(state, cardId);
      slot.innerHTML = `<span class="card-icon">${icon}</span><span class="card-label-tiny">${label}</span>`;
      el.appendChild(slot);
    });
  }

  function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.col = col;
        cell.dataset.row = row;
        const isCastle = (E.CASTLE.P1.col === col && E.CASTLE.P1.row === row) || (E.CASTLE.P2.col === col && E.CASTLE.P2.row === row);
        if (isCastle) cell.classList.add('castle');
        const piece = state.pieces.find(function (p) { return p.col === col && p.row === row; });
        if (piece) {
          const div = document.createElement('div');
          div.className = 'piece owner-' + piece.owner;
          div.textContent = piece.owner === 'P1' ? (piece.facing === 1 ? '▶' : '◀') : (piece.facing === 1 ? '▶' : '◀');
          cell.appendChild(div);
        }
        boardEl.appendChild(cell);
      }
    }
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('new-game-btn').addEventListener('click', function () {
    document.getElementById('screen-game').classList.add('hidden');
    document.getElementById('screen-start').classList.remove('hidden');
    document.getElementById('new-game-btn').style.display = 'none';
  });
</script>
</body>
</html>
```

- [ ] **Step 2: 브라우저에서 수동 검증**

Run: `python -m http.server 8787` (프로젝트 루트에서)

브라우저로 `http://localhost:8787/card-chess.html` 접속 → 규칙 요약과 닉네임 입력란이 보이는지 확인 → "게임 시작" 클릭.

Expected: 게임 화면으로 전환되고 5×5 보드에 양쪽 말 5개씩(색 다름, 방향 화살표 표시)이 보임. 성 칸(각 진영 시작열 가운데 칸, 정확히는 자기 진영 시작열 3번째 행) 배경이 강조 표시됨. AI(P2)가 후공으로 뽑히면(약 50% 확률) 우측 카드 슬롯 2장과 대기 슬롯 1장이 즉시 채워짐 — 여러 번 새로고침해 양쪽 경우(사람이 후공일 때는 카드 슬롯이 비어 보이는 것)를 모두 확인.

---

## Task 9: 드래프트 UI + 턴 상호작용 (카드 → 말 → 목적지 선택, 패스 처리)

**Files:**
- Modify: `card-chess.html`

**Interfaces:**
- Consumes: Task 8의 `state`/`render()`/`E`
- Produces: 사람이 후공일 때 5장 중 2장(자기) → 나머지 3장 중 2장(선공) 클릭으로 드래프트 완료. 이후 사람 차례에 카드 클릭 → 말 클릭 → 목적지 클릭으로 `E.applyMove` 호출, 이동 가능한 말이 없는 카드는 확인창 후 `E.applyPass` 호출.

- [ ] **Step 1: 드래프트 UI + 턴 상호작용 스크립트 추가**

`card-chess.html`의 `</script>` 직전, `render()` 함수 정의 및 관련 로직을 아래 내용으로 교체/보강한다 (기존 `startGame`의 드래프트 관련 주석과 `renderHand`를 이 내용으로 대체):

```js
  let selection = { cardId: null, from: null };
  let draftState = null; // { pending: string[], self: string[], picking: 'self'|'opponent' }

  function startGame() {
    const nickname = nicknameInput.value.trim() || randomNickname();
    localStorage.setItem('cardChessNickname', nickname);
    window.cardChessNickname = nickname;

    const first = Math.random() < 0.5 ? 'P1' : 'P2';
    state = E.createInitialState(first);
    selection = { cardId: null, from: null };

    document.getElementById('screen-start').classList.add('hidden');
    document.getElementById('screen-game').classList.remove('hidden');
    document.getElementById('new-game-btn').style.display = '';

    const second = E.other(first);
    if (second === 'P2') {
      const draft = E.chooseAiDraft();
      state = E.applyDraft(state, draft.secondCards, draft.firstCards);
      draftState = null;
      afterStateChange();
    } else {
      draftState = { pending: E.CARD_IDS.slice(), self: [], picking: 'self' };
      render();
    }
  }

  function renderCardSlot(elId, cardId, selectable) {
    const el = document.getElementById(elId);
    if (!cardId) { el.innerHTML = ''; el.classList.remove('selectable', 'selected'); return; }
    const [icon, label] = cardDisplay(state, cardId);
    el.innerHTML = `<span class="card-icon">${icon}</span><span class="card-label-tiny">${label}</span>`;
    el.classList.toggle('selectable', !!selectable);
    el.classList.toggle('selected', selection.cardId === cardId);
  }

  function renderHand(elId, player) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    (state.hands[player] || []).forEach(function (cardId) {
      const slot = document.createElement('div');
      slot.className = 'card-slot';
      const [icon, label] = cardDisplay(state, cardId);
      slot.innerHTML = `<span class="card-icon">${icon}</span><span class="card-label-tiny">${label}</span>`;
      const isMyTurnCard = player === 'P1' && state.turn === 'P1' && !state.winner;
      if (isMyTurnCard) {
        slot.classList.add('selectable');
        if (selection.cardId === cardId) slot.classList.add('selected');
        slot.addEventListener('click', function () { onCardClick(cardId); });
      }
      el.appendChild(slot);
    });
  }

  function onCardClick(cardId) {
    selection = { cardId: cardId, from: null };
    const moves = E.getLegalMoves(state, cardId, 'P1');
    if (moves.length === 0) {
      const ok = window.confirm('이 카드로 이동할 수 있는 말이 없습니다. 그대로 턴을 넘길까요?');
      if (ok) {
        state = E.applyPass(state, cardId);
        selection = { cardId: null, from: null };
        afterStateChange();
      } else {
        selection = { cardId: null, from: null };
        render();
      }
      return;
    }
    render();
  }

  function onCellClick(col, row) {
    if (state.winner) return;
    if (draftState) return;
    if (state.turn !== 'P1') return;
    if (!selection.cardId) return;
    const moves = E.getLegalMoves(state, selection.cardId, 'P1');
    if (!selection.from) {
      const hasMoveFromHere = moves.some(function (m) { return m.from.col === col && m.from.row === row; });
      if (hasMoveFromHere) { selection.from = { col: col, row: row }; render(); }
      return;
    }
    const isDest = moves.some(function (m) {
      return m.from.col === selection.from.col && m.from.row === selection.from.row && m.to.col === col && m.to.row === row;
    });
    if (isDest) {
      state = E.applyMove(state, selection.cardId, selection.from, { col: col, row: row });
      selection = { cardId: null, from: null };
      afterStateChange();
    } else {
      selection.from = null;
      render();
    }
  }

  function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    const moves = (selection.cardId && !draftState) ? E.getLegalMoves(state, selection.cardId, 'P1') : [];
    const pieceCells = new Set(moves.map(function (m) { return m.from.col + ',' + m.from.row; }));
    const destCells = selection.from ? moves.filter(function (m) {
      return m.from.col === selection.from.col && m.from.row === selection.from.row;
    }).map(function (m) { return m.to.col + ',' + m.to.row; }) : [];

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const key = col + ',' + row;
        const isCastle = (E.CASTLE.P1.col === col && E.CASTLE.P1.row === row) || (E.CASTLE.P2.col === col && E.CASTLE.P2.row === row);
        if (isCastle) cell.classList.add('castle');
        if (!selection.from && pieceCells.has(key)) cell.classList.add('highlight-piece');
        if (destCells.indexOf(key) !== -1) cell.classList.add('highlight-dest');
        cell.addEventListener('click', function () { onCellClick(col, row); });
        const piece = state.pieces.find(function (p) { return p.col === col && p.row === row; });
        if (piece) {
          const div = document.createElement('div');
          div.className = 'piece owner-' + piece.owner;
          div.textContent = piece.facing === 1 ? '▶' : '◀';
          cell.appendChild(div);
        }
        boardEl.appendChild(cell);
      }
    }
  }

  function renderDraftOverlay() {
    const el = document.getElementById('status-bar');
    if (!draftState) return;
    el.textContent = draftState.picking === 'self'
      ? '카드 5장 중 자신이 가질 카드 2장을 선택하세요'
      : '남은 카드 중 상대(선)에게 줄 카드 2장을 선택하세요';
  }

  function render() {
    renderCardSlot('wait-slot', state.waiting, false);
    renderHand('hand-P1', 'P1');
    renderHand('hand-P2', 'P2');
    renderBoard();
    if (draftState) {
      renderDraftOverlay();
      renderDraftPicker();
    } else {
      document.getElementById('draft-picker') && document.getElementById('draft-picker').remove();
      document.getElementById('status-bar').textContent = state.turn === 'P1' ? '당신의 차례' : 'AI 차례';
    }
  }

  function renderDraftPicker() {
    let picker = document.getElementById('draft-picker');
    if (!picker) {
      picker = document.createElement('div');
      picker.id = 'draft-picker';
      picker.style.display = 'flex';
      picker.style.gap = '8px';
      picker.style.justifyContent = 'center';
      picker.style.flexWrap = 'wrap';
      document.getElementById('screen-game').insertBefore(picker, document.querySelector('.table-layout'));
    }
    picker.innerHTML = '';
    draftState.pending.forEach(function (cardId) {
      const slot = document.createElement('div');
      slot.className = 'card-slot selectable';
      const [icon, label] = cardDisplay(state, cardId);
      slot.innerHTML = `<span class="card-icon">${icon}</span><span class="card-label-tiny">${label}</span>`;
      slot.addEventListener('click', function () { onDraftPick(cardId); });
      picker.appendChild(slot);
    });
  }

  function onDraftPick(cardId) {
    if (draftState.picking === 'self') {
      draftState.self.push(cardId);
      draftState.pending = draftState.pending.filter(function (c) { return c !== cardId; });
      if (draftState.self.length === 2) { draftState.picking = 'opponent'; draftState.opponent = []; }
      render();
      return;
    }
    draftState.opponent.push(cardId);
    draftState.pending = draftState.pending.filter(function (c) { return c !== cardId; });
    if (draftState.opponent.length === 2) {
      state = E.applyDraft(state, draftState.self, draftState.opponent);
      draftState = null;
      afterStateChange();
      return;
    }
    render();
  }

  function afterStateChange() {
    render();
    if (state.winner) { showWinModal(); return; }
    if (state.turn === 'P2') scheduleAiTurn();
  }

  function scheduleAiTurn() {
    document.getElementById('status-bar').textContent = 'AI가 생각하는 중...';
    setTimeout(function () {
      const action = E.chooseAiMove(state, 4);
      state = action.pass ? E.applyPass(state, action.cardId) : E.applyMove(state, action.cardId, action.from, action.to);
      afterStateChange();
    }, 600);
  }

  function showWinModal() {
    // Task 10에서 구현
  }
```

`onCellClick`이 `renderBoard`의 클릭 핸들러에서 이미 호출되므로, Task 8에서 만든 정적 `renderBoard`/`render`/`renderCardSlot`/`renderHand`/`startGame` 정의는 이 코드로 완전히 대체한다(중복 정의 금지 — 함수 이름이 같으므로 이 블록 하나만 남긴다).

- [ ] **Step 2: 브라우저에서 드래프트 + 한 턴 수동 검증**

Run: `python -m http.server 8787` (이미 실행 중이 아니면)

`http://localhost:8787/card-chess.html`에서 "게임 시작"을 여러 번 눌러(새로고침 포함) 사람이 후공으로 뽑히는 경우를 만든다.

Expected: 상단에 "카드 5장 중 자신이 가질 카드 2장을 선택하세요" 안내와 카드 5장이 뜸 → 2장 클릭하면 "상대에게 줄 카드 2장을 선택하세요"로 바뀌고 남은 3장이 뜸 → 2장 클릭하면 드래프트 완료되고 정상 게임 화면(카드 2장씩 + 대기 1장)으로 전환됨.

사람이 선공(P1 차례)일 때: 자기 카드 슬롯 하나 클릭 → 이동 가능한 자기 말들이 테두리로 강조됨 → 말 클릭 → 목적지 칸들이 배경색으로 강조됨 → 목적지 클릭하면 말이 이동하고 카드가 순환(사용한 카드는 대기존으로, 대기 카드가 손으로)하며 AI 차례로 넘어가 "AI가 생각하는 중..." 표시 후 자동으로 AI가 수를 둠.

이동 가능한 말이 없는 카드를 클릭하면 확인창이 뜨고, 확인 시 턴이 그대로 넘어가는지도 확인.

---

## Task 10: AI 자동 진행 다듬기 + 승리 모달 + Supabase 리더보드

**Files:**
- Modify: `card-chess.html`

**Interfaces:**
- Consumes: Task 1의 `card_chess_leaderboard` 테이블, Task 9의 게임 루프
- Produces: 승리 시 모달 표시(승자/사유), 게임 종료마다 Elo 갱신 후 Supabase에 반영.

- [ ] **Step 1: Supabase 연동 + 승리 모달 구현 추가**

`card-chess.html`의 `showWinModal` 함수를 아래로 교체하고, 그 위에 Supabase 헬퍼들을 추가한다:

```js
  const SUPABASE_URL = 'https://paktzmofotvwfdxcpmzv.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW';
  const AI_RATING = 1500;
  const K_FACTOR = 32;

  function sbHeaders(extra) {
    return Object.assign({ apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, extra || {});
  }

  async function recordResult(won) {
    const nickname = window.cardChessNickname;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/card_chess_leaderboard?select=id,rating,wins,losses&nickname=eq.${encodeURIComponent(nickname)}`, { headers: sbHeaders() });
      const rows = await res.json();
      const existing = rows[0];
      const currentRating = existing ? existing.rating : 1200;
      const newRating = E.computeNewRating(currentRating, won ? 1 : 0, AI_RATING, K_FACTOR);
      const wins = (existing ? existing.wins : 0) + (won ? 1 : 0);
      const losses = (existing ? existing.losses : 0) + (won ? 0 : 1);
      if (existing) {
        await fetch(`${SUPABASE_URL}/rest/v1/card_chess_leaderboard?id=eq.${existing.id}`, {
          method: 'PATCH',
          headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ rating: newRating, wins: wins, losses: losses, updated_at: new Date().toISOString() }),
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/card_chess_leaderboard`, {
          method: 'POST',
          headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ nickname: nickname, rating: newRating, wins: wins, losses: losses }),
        });
      }
    } catch (e) {
      // 리더보드 기록 실패는 게임 결과 표시를 막지 않는다
    }
  }

  function showWinModal() {
    const won = state.winner === 'P1';
    document.getElementById('win-title').textContent = won ? '승리!' : 'AI 승리';
    document.getElementById('win-reason').textContent = state.winReason === 'elimination'
      ? (won ? '상대 말을 모두 잡았습니다' : 'AI가 당신의 말을 모두 잡았습니다')
      : (won ? '상대 성을 점령하고 버텼습니다' : 'AI가 당신의 성을 점령하고 버텼습니다');
    document.getElementById('win-modal').classList.remove('hidden');
    recordResult(won);
  }

  document.getElementById('win-restart-btn').addEventListener('click', function () {
    document.getElementById('win-modal').classList.add('hidden');
    document.getElementById('screen-game').classList.add('hidden');
    document.getElementById('screen-start').classList.remove('hidden');
    document.getElementById('new-game-btn').style.display = 'none';
  });
```

- [ ] **Step 2: 브라우저에서 게임 1판 끝까지 수동 검증**

Run: `python -m http.server 8787` (이미 실행 중이 아니면)

`http://localhost:8787/card-chess.html`에서 전멸승 또는 성 점령승이 나올 때까지 플레이(불리하면 새로고침으로 재시작해 빠르게 승/패 케이스를 만들어도 됨).

Expected: 게임이 끝나면 승리 모달이 뜨고 승자/사유 문구가 정확함. AI 응답 지연이 체감상 1.5초를 넘지 않는지 확인 — 넘으면 `scheduleAiTurn`의 `E.chooseAiMove(state, 4)` 호출을 `E.chooseAiMove(state, 3)`으로 낮춘다.

- [ ] **Step 3: 리더보드 반영 확인**

`mcp__claude_ai_Supabase__execute_sql`로 확인:

```sql
select nickname, rating, wins, losses from public.card_chess_leaderboard order by updated_at desc limit 5;
```

Expected: 방금 플레이한 닉네임 행이 승/패에 맞게 `wins`/`losses`/`rating`이 갱신되어 있음.

---

## Task 11: 허브(`index.html`)에 카드 추가 + 전체 플로우 최종 점검

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 8~10의 `card-chess.html`, Task 1의 `card_chess_leaderboard`
- Produces: 허브 홈에서 카드체스로 진입 가능, 홈 리더보드에 카드체스 섹션 노출.

- [ ] **Step 1: GAMES 배열에 카드 추가**

`index.html`의 `GAMES` 배열(`const GAMES = [ ... ]`)에서 `'블라인드 경매'` 항목 뒤에 추가:

```js
    {
      name: '카드체스',
      desc: '카드로 말을 움직여 상대의 성을 점령하세요',
      href: './card-chess.html',
      target: '_self',
      emoji: '🃏',
    },
```

- [ ] **Step 2: LB_SECTIONS 배열에 카드체스 리더보드 추가**

`index.html`의 `LB_SECTIONS` 배열 마지막(`'모자이크 퍼즐'` 항목 뒤)에 추가:

```js
    {
      label: '카드체스',
      fetch: (limit) => fetchSimpleTop('card_chess_leaderboard', 'nickname,rating,wins,losses', 'rating.desc', limit),
      format: r => `${r.wins}승 ${r.losses}패 · ${r.rating}점`,
    },
```

- [ ] **Step 3: 브라우저에서 허브 → 게임 진입 및 리더보드 노출 검증**

Run: `python -m http.server 8787` (이미 실행 중이 아니면)

브라우저로 `http://localhost:8787/index.html` 접속.

Expected: 게임 목록에 "카드체스" 카드가 🃏 아이콘과 함께 표시되고, 클릭 시 `card-chess.html`로 이동함. 게임 화면의 "← 게임 허브" 링크로 다시 `index.html`로 돌아올 수 있음. 우측 하단 "🏆 리더보드" 버튼을 눌러 "카드체스" 섹션이 보이고, Task 10에서 기록한 닉네임/승패/레이팅이 표시되는지 확인.

- [ ] **Step 4: 전체 엔진 테스트 재실행**

Run: `node --test card-chess-engine.test.js`
Expected: PASS — 32개 테스트 전체 통과

- [ ] **Step 5: 커밋**

```bash
git add index.html
git commit -m "feat: 허브에 카드체스 카드 및 리더보드 섹션 추가"
```

---

## 범위 밖 (스펙 문서와 동일, 재확인용)
- 로컬 2인 동시 플레이, 온라인 실시간 매칭 — 지원하지 않음.
- AI 난이도 다단계 — 미니맥스 깊이 4(필요 시 3) 고정 하나만.
- 무승부 규칙 — 실제 플레이에서 무한 루프가 관측되면 후속 작업으로 별도 처리.
- 리플레이/기보 저장 — 승패 결과 1건만 기록.
