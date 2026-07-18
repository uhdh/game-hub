# 랜덤 닉네임 자동 배정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 닉네임을 비워둔 사용자에게 기기별로 고유하게 유지되는 랜덤 닉네임을 자동 배정해서, 리더보드에서 서로 다른 사용자의 전적이 하나의 `"익명"` 행으로 뭉치지 않게 한다.

**Architecture:** `gomoku-stack.html`, `rearrange.html`, `blind-auction.html` 세 파일은 공유 JS가 없고 각자 인라인 `<script>`에 닉네임 로직을 갖고 있다(기존 프로젝트 구조). 각 파일에 동일한 이름 풀 + 두 개의 순수/부수효과 함수(`randomNickname`, `getOrCreateStoredNickname`)를 `// ---- 랜덤 닉네임 시작/끝 ----` 마커로 감싸 복제해 넣고, 기존에 `localStorage.getItem(KEY) || ""`(초기값 채우기)와 `.value.trim() || "익명"`(제출 시 폴백) 두 지점을 이 함수 호출로 교체한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 도구, 테스트 프레임워크, npm 의존성 없음). 검증은 Node.js(`vm` 모듈)로 각 파일의 `<script>`에서 마커 블록만 추출해 실행하는 임시 스크립트를 사용.

## Global Constraints

- 이름 풀은 정확히 이 21개, 이 순서로: `이상민, 정근우, 박지민, 이태균, 하승진, 현성주, 윤비, 이진형, 홍진호, 서출구, 최혜선, 허성범, 김경훈, 김유현, 김남희, 강지후, 곽범, 이관희, 신승용, 최연청, 덕후`
- 생성 형식은 `단어#숫자`, 숫자는 1~999 사이 정수 (예: `이상민#57`)
- 적용 범위는 `gomoku-stack.html`, `rearrange.html`, `blind-auction.html` 세 파일뿐. 다른 파일(`predict.html`, `color-connect.html` 등)은 건드리지 않는다.
- 리더보드 렌더링 시 DB에서 읽어온 값이 비어 있을 때 표시용으로 쓰는 `|| "익명"` 폴백(예: `rearrange.html:571`의 `nickname.textContent = e.nickname || "익명"`, `blind-auction.html:533`의 `row.nickname || "익명"`)은 과거 데이터 표시용이므로 건드리지 않는다. 오직 "새 닉네임을 만들어내는" 두 지점(초기값 채우기, 제출 시 폴백)만 교체한다.
- 과거에 이미 `"익명"`으로 저장된 `localStorage` 값이나 Supabase 행은 그대로 둔다(소급 수정 없음) — `getOrCreateStoredNickname`은 기존 저장값이 있으면 그 값을 그대로 반환한다.
- 이 로컬 저장소는 배포본이 아니다(`docs/superpowers/specs/2026-07-18-random-nickname-design.md`의 "배포 관련 참고" 참고). 이 플랜은 로컬 파일 수정 + 커밋까지만 다루고, `game-hub` 반영은 범위 밖.

---

## Task 1: 검증용 Node 스크립트 작성

세 파일 모두 같은 마커(`// ---- 랜덤 닉네임 시작/끝 ----`)로 감싼 동일한 코드 블록을 갖게 된다. 이 스크립트는 파일 경로를 인자로 받아 그 블록만 정규식으로 추출하고, `vm` 모듈로 실행한 뒤 `randomNickname`/`getOrCreateStoredNickname`의 동작을 검증한다. Task 2~4에서 재사용한다.

**Files:**
- Create: `scratchpad/verify-nickname-block.js` (스크래치패드 경로: `C:\Users\maktu\AppData\Local\Temp\claude\C--Users-maktu-OneDrive-Desktop-project-------\9dd2cbf1-701a-46e5-9539-f712f569067d\scratchpad\verify-nickname-block.js`)

**Interfaces:**
- Consumes: 없음 (독립 실행 스크립트)
- Produces: CLI로 `node verify-nickname-block.js <html파일경로>` 실행 시, 대상 파일에 마커 블록이 없으면 종료 코드 1과 `"BLOCK NOT FOUND"`를 출력. 있으면 풀 크기/형식/영속성을 검증하고 통과 시 `OK <생성된예시닉네임>`을 출력, 실패 시 에러를 던지고 종료 코드 1.

- [ ] **Step 1: 스크립트 작성**

```js
// scratchpad/verify-nickname-block.js
const fs = require("fs");
const vm = require("vm");

const target = process.argv[2];
if (!target) {
  console.error("usage: node verify-nickname-block.js <html-file>");
  process.exit(1);
}

const src = fs.readFileSync(target, "utf8");
const match = src.match(/\/\/ ---- 랜덤 닉네임 시작 ----([\s\S]*?)\/\/ ---- 랜덤 닉네임 끝 ----/);
if (!match) {
  console.error("BLOCK NOT FOUND");
  process.exit(1);
}

const store = {};
const localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = v; },
};
const sandbox = { localStorage, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox);

// 주의: vm 컨텍스트에서 top-level const/let은 컨텍스트 객체(sandbox)의
// own property로 붙지 않는다(함수 선언과 다름). 반드시 vm.runInContext로
// 식별자를 다시 평가해서 값을 꺼내야 한다 (예: sandbox.NICKNAME_POOL은 undefined).
const POOL = vm.runInContext("NICKNAME_POOL", sandbox);
const randomNickname = vm.runInContext("randomNickname", sandbox);
const getOrCreateStoredNickname = vm.runInContext("getOrCreateStoredNickname", sandbox);

if (!Array.isArray(POOL) || POOL.length !== 21) {
  throw new Error("이름 풀 크기가 21이 아님: " + (POOL && POOL.length));
}
const EXPECTED = [
  "이상민", "정근우", "박지민", "이태균", "하승진", "현성주", "윤비", "이진형", "홍진호", "서출구",
  "최혜선", "허성범", "김경훈", "김유현", "김남희", "강지후", "곽범", "이관희", "신승용", "최연청", "덕후",
];
if (JSON.stringify(POOL) !== JSON.stringify(EXPECTED)) {
  throw new Error("이름 풀 내용이 스펙과 다름: " + JSON.stringify(POOL));
}

for (let i = 0; i < 500; i++) {
  const n = randomNickname();
  const parts = n.split("#");
  if (parts.length !== 2) throw new Error("형식 오류(word#num 아님): " + n);
  if (!POOL.includes(parts[0])) throw new Error("풀에 없는 단어: " + n);
  const num = Number(parts[1]);
  if (!Number.isInteger(num) || num < 1 || num > 999) throw new Error("숫자 범위 오류: " + n);
}

const first = getOrCreateStoredNickname("testKey");
const second = getOrCreateStoredNickname("testKey");
if (first !== second) throw new Error("영속성 실패: " + first + " vs " + second);
if (store.testKey !== first) throw new Error("localStorage에 저장 안 됨");

console.log("OK", first);
```

이 스크립트는 사전에 실제 fake HTML 블록과 gomoku-stack.html(마커 없는 상태)에 대해 직접 실행해 동작을 확인했다(통과/BLOCK NOT FOUND 각각 정상 확인됨).

- [ ] **Step 2: 대상 파일이 아직 마커를 갖고 있지 않은 상태에서 실행해 실패를 확인**

Run: `node "scratchpad/verify-nickname-block.js" gomoku-stack.html`
Expected: `BLOCK NOT FOUND` 출력, 종료 코드 1 (Task 2에서 마커 블록을 추가하기 전이므로 아직 실패해야 정상)

- [ ] **Step 3: 커밋 없음**

이 스크립트는 임시 검증 도구이므로 저장소에 커밋하지 않는다(git add 하지 않음). Task 2~4에서 계속 재사용한다.

---

## Task 2: `gomoku-stack.html`에 랜덤 닉네임 적용

**Files:**
- Modify: `gomoku-stack.html:1245` 부근(새 블록 삽입), `gomoku-stack.html:1265`, `gomoku-stack.html:1428-1431`

**Interfaces:**
- Consumes: Task 1의 `scratchpad/verify-nickname-block.js`
- Produces: 전역 함수 `randomNickname()`, `getOrCreateStoredNickname(key)` — Task 3, 4에서도 각자 파일 안에 동일한 이름으로 복제됨(파일 간 공유 아님, 각자 독립 정의)

- [ ] **Step 1: 마커 블록을 `RANK_CONFIGS` 선언 바로 위에 삽입**

`gomoku-stack.html`에서 다음 부분을 찾는다(약 1244~1246번째 줄):

```js
  // ---- 모드/난이도 UI ----

  const RANK_CONFIGS = {
```

`// ---- 모드/난이도 UI ----`와 `const RANK_CONFIGS = {` 사이에 다음 블록을 삽입한다:

```js
  // ---- 랜덤 닉네임 시작 ----
  const NICKNAME_POOL = [
    "이상민", "정근우", "박지민", "이태균", "하승진", "현성주", "윤비", "이진형", "홍진호", "서출구",
    "최혜선", "허성범", "김경훈", "김유현", "김남희", "강지후", "곽범", "이관희", "신승용", "최연청", "덕후",
  ];

  function randomNickname() {
    const word = NICKNAME_POOL[Math.floor(Math.random() * NICKNAME_POOL.length)];
    const num = Math.floor(Math.random() * 999) + 1;
    return `${word}#${num}`;
  }

  function getOrCreateStoredNickname(key) {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
    const generated = randomNickname();
    localStorage.setItem(key, generated);
    return generated;
  }
  // ---- 랜덤 닉네임 끝 ----

```

- [ ] **Step 2: 검증 스크립트 실행해 통과 확인**

Run: `node "scratchpad/verify-nickname-block.js" gomoku-stack.html`
Expected: `OK <단어>#<숫자>` 형식 출력, 종료 코드 0

- [ ] **Step 3: 초기값 채우기 지점 교체**

`gomoku-stack.html:1265`(현재 줄 번호는 Step 1 삽입으로 약간 밀림, 텍스트로 찾을 것):

교체 전:
```js
      document.getElementById("rank-nickname-input").value = localStorage.getItem(config.nicknameKey) || "";
```

교체 후:
```js
      document.getElementById("rank-nickname-input").value = getOrCreateStoredNickname(config.nicknameKey);
```

- [ ] **Step 4: 제출 시 폴백 지점 교체**

교체 전:
```js
  document.getElementById("rank-submit-btn").addEventListener("click", () => {
    const nickname = document.getElementById("rank-nickname-input").value.trim() || "익명";
    submitRankResult(nickname);
  });
```

교체 후:
```js
  document.getElementById("rank-submit-btn").addEventListener("click", () => {
    const config = currentRankConfig();
    const nickname = document.getElementById("rank-nickname-input").value.trim()
      || (config ? getOrCreateStoredNickname(config.nicknameKey) : randomNickname());
    submitRankResult(nickname);
  });
```

- [ ] **Step 5: 브라우저 수동 확인**

`gomoku-stack.html`을 브라우저로 연다(파일 직접 열기로 충분). 개발자 도구 콘솔에서 `localStorage.removeItem("gomokuHardRankingNickname")` 실행 후 페이지 새로고침 → 모드를 "AI 대전" · 난이도 "상"으로 선택 → 랭킹 패널을 열었을 때 닉네임 입력창에 `단어#숫자` 형식 값이 자동으로 채워지는지 확인. 다시 새로고침해도 같은 값이 유지되는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add gomoku-stack.html
git commit -m "$(cat <<'EOF'
feat: 오목 랭킹 닉네임 미입력 시 랜덤 닉네임 자동 배정

EOF
)"
```

---

## Task 3: `rearrange.html`에 랜덤 닉네임 적용

**Files:**
- Modify: `rearrange.html:175` 부근(새 블록 삽입), `rearrange.html:454`, `rearrange.html:597`

**Interfaces:**
- Consumes: Task 1의 `scratchpad/verify-nickname-block.js`
- Produces: 이 파일 안에서만 쓰이는 `randomNickname()`, `getOrCreateStoredNickname(key)` (Task 2와 동일한 코드, 독립 복제)

- [ ] **Step 1: 마커 블록을 `NICKNAME_KEY` 선언 바로 뒤에 삽입**

`rearrange.html`에서 다음 부분을 찾는다:

```js
  const NICKNAME_KEY = "rearrangeNickname";

  const BOARDS = {
```

`const NICKNAME_KEY = "rearrangeNickname";`와 `const BOARDS = {` 사이에 다음 블록을 삽입한다:

```js

  // ---- 랜덤 닉네임 시작 ----
  const NICKNAME_POOL = [
    "이상민", "정근우", "박지민", "이태균", "하승진", "현성주", "윤비", "이진형", "홍진호", "서출구",
    "최혜선", "허성범", "김경훈", "김유현", "김남희", "강지후", "곽범", "이관희", "신승용", "최연청", "덕후",
  ];

  function randomNickname() {
    const word = NICKNAME_POOL[Math.floor(Math.random() * NICKNAME_POOL.length)];
    const num = Math.floor(Math.random() * 999) + 1;
    return `${word}#${num}`;
  }

  function getOrCreateStoredNickname(key) {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
    const generated = randomNickname();
    localStorage.setItem(key, generated);
    return generated;
  }
  // ---- 랜덤 닉네임 끝 ----
```

- [ ] **Step 2: 검증 스크립트 실행해 통과 확인**

Run: `node "scratchpad/verify-nickname-block.js" rearrange.html`
Expected: `OK <단어>#<숫자>` 형식 출력, 종료 코드 0

- [ ] **Step 3: 초기값 채우기 지점 교체**

교체 전:
```js
  document.getElementById("nickname-input").value = localStorage.getItem(NICKNAME_KEY) || "";
```

교체 후:
```js
  document.getElementById("nickname-input").value = getOrCreateStoredNickname(NICKNAME_KEY);
```

- [ ] **Step 4: 제출 시 폴백 지점 교체**

교체 전:
```js
  async function registerScore() {
    const result = computeScore();
    const nicknameInput = document.getElementById("nickname-input");
    const nickname = nicknameInput.value.trim() || "익명";
    localStorage.setItem(NICKNAME_KEY, nickname);
```

교체 후:
```js
  async function registerScore() {
    const result = computeScore();
    const nicknameInput = document.getElementById("nickname-input");
    const nickname = nicknameInput.value.trim() || getOrCreateStoredNickname(NICKNAME_KEY);
    localStorage.setItem(NICKNAME_KEY, nickname);
```

- [ ] **Step 5: 브라우저 수동 확인**

`rearrange.html`을 브라우저로 연다. 콘솔에서 `localStorage.removeItem("rearrangeNickname")` 실행 후 새로고침 → 닉네임 입력창에 `단어#숫자` 형식 값이 자동으로 채워지는지 확인. 다시 새로고침해도 유지되는지 확인. 리더보드에 표시되는 기존 항목들의 닉네임(있다면 `익명` 포함)이 그대로인지도 확인(표시용 폴백은 건드리지 않았으므로 영향 없어야 함).

- [ ] **Step 6: 커밋**

```bash
git add rearrange.html
git commit -m "$(cat <<'EOF'
feat: 피의게임 재배치 리더보드 닉네임 미입력 시 랜덤 닉네임 자동 배정

EOF
)"
```

---

## Task 4: `blind-auction.html`에 랜덤 닉네임 적용

**Files:**
- Modify: `blind-auction.html:501` 부근(새 블록 삽입), `blind-auction.html:553`, `blind-auction.html:555-557`

**Interfaces:**
- Consumes: Task 1의 `scratchpad/verify-nickname-block.js`
- Produces: 이 파일 안에서만 쓰이는 `randomNickname()`, `getOrCreateStoredNickname(key)` (Task 2와 동일한 코드, 독립 복제)

- [ ] **Step 1: 마커 블록을 `NICKNAME_KEY` 선언 바로 뒤에 삽입**

`blind-auction.html`에서 다음 부분을 찾는다:

```js
  const LEADERBOARD_TABLE = "blind_auction_leaderboard";
  const NICKNAME_KEY = "blindAuctionNickname";

  async function fetchLeaderboard() {
```

`const NICKNAME_KEY = "blindAuctionNickname";`와 `async function fetchLeaderboard() {` 사이에 다음 블록을 삽입한다:

```js

  // ---- 랜덤 닉네임 시작 ----
  const NICKNAME_POOL = [
    "이상민", "정근우", "박지민", "이태균", "하승진", "현성주", "윤비", "이진형", "홍진호", "서출구",
    "최혜선", "허성범", "김경훈", "김유현", "김남희", "강지후", "곽범", "이관희", "신승용", "최연청", "덕후",
  ];

  function randomNickname() {
    const word = NICKNAME_POOL[Math.floor(Math.random() * NICKNAME_POOL.length)];
    const num = Math.floor(Math.random() * 999) + 1;
    return `${word}#${num}`;
  }

  function getOrCreateStoredNickname(key) {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
    const generated = randomNickname();
    localStorage.setItem(key, generated);
    return generated;
  }
  // ---- 랜덤 닉네임 끝 ----
```

- [ ] **Step 2: 검증 스크립트 실행해 통과 확인**

Run: `node "scratchpad/verify-nickname-block.js" blind-auction.html`
Expected: `OK <단어>#<숫자>` 형식 출력, 종료 코드 0

- [ ] **Step 3: 초기값 채우기 지점 교체**

교체 전:
```js
    const nicknameInput = document.getElementById("nickname-input");
    nicknameInput.value = localStorage.getItem(NICKNAME_KEY) || "";
```

교체 후:
```js
    const nicknameInput = document.getElementById("nickname-input");
    nicknameInput.value = getOrCreateStoredNickname(NICKNAME_KEY);
```

- [ ] **Step 4: 제출 시 폴백 지점 교체**

교체 전:
```js
    document.getElementById("submit-score-btn").onclick = async () => {
      const nickname = nicknameInput.value.trim() || "익명";
      localStorage.setItem(NICKNAME_KEY, nickname);
```

교체 후:
```js
    document.getElementById("submit-score-btn").onclick = async () => {
      const nickname = nicknameInput.value.trim() || getOrCreateStoredNickname(NICKNAME_KEY);
      localStorage.setItem(NICKNAME_KEY, nickname);
```

- [ ] **Step 5: 브라우저 수동 확인**

`blind-auction.html`을 브라우저로 연다. 콘솔에서 `localStorage.removeItem("blindAuctionNickname")` 실행 후 게임을 한 판 끝까지 진행해 결과 화면(`showResults`)까지 도달 → 닉네임 입력창에 `단어#숫자` 형식 값이 자동으로 채워지는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add blind-auction.html
git commit -m "$(cat <<'EOF'
feat: 블라인드 경매 리더보드 닉네임 미입력 시 랜덤 닉네임 자동 배정

EOF
)"
```

---

## Task 5: 정리

**Files:**
- Delete (파일시스템에서만, git 대상 아님): `scratchpad/verify-nickname-block.js`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (정리 작업)

- [ ] **Step 1: 세 파일 모두 마커 블록·교체 지점이 정확히 반영됐는지 최종 확인**

Run:
```bash
node "scratchpad/verify-nickname-block.js" gomoku-stack.html
node "scratchpad/verify-nickname-block.js" rearrange.html
node "scratchpad/verify-nickname-block.js" blind-auction.html
git log --oneline -3
```
Expected: 세 번 모두 `OK ...` 출력, `git log`에 Task 2~4의 커밋 3개가 보임

- [ ] **Step 2: 임시 검증 스크립트 삭제(선택)**

임시 스크립트는 스크래치패드 디렉터리에 있어 저장소에 영향 없음 — 삭제는 선택 사항이며 안 지워도 무방하다.
