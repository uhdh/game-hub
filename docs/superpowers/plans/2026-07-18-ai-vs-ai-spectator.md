# 오목 AI vs AI 관전 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gomoku-stack.html`에 최상 난이도 AI 두 개가 서로 대국하는 것을 사용자가 볼 수 있는 "AI vs AI" 모드를 추가하고, 그 대국의 기보를 Supabase에 저장해 나중에 사람 기보처럼 리플레이 분석할 수 있게 한다.

**Architecture:** 새 탐색 로직은 만들지 않는다. 기존 `AI_PLAYER`/`HUMAN_PLAYER` 전역 변수를 매 턴마다 "지금 둘 차례인 쪽"으로 임시 재할당한 뒤, 기존 `computeAIMove()`(초반 배치: `computeAIInitialMove`, 본게임: 최상이면 Web Worker `computeAIMainMoveHardAsync`)를 그대로 호출해서 양쪽 다 AI가 두게 만든다. 기존 `scheduleAIIfNeeded`/`performAIMove`/`applyAIMove` 파이프라인을 최소한만 확장한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 도구 없음), Supabase REST(anon key, 기존 프로젝트 `paktzmofotvwfdxcpmzv`), Playwright(로컬 검증용).

## Global Constraints

- 새 모드는 `gameMode` 값 `"ai_vs_ai"`로 식별한다.
- 이 모드는 항상 최상(`aiDifficulty === "extreme"`) 고정 — 난이도 선택 UI를 노출하지 않는다.
- 사람이 개입할 수 있는 경로(보드 클릭, 무르기)를 전부 막는다.
- 랭킹(`gomoku_hard_ranking`/`gomoku_extreme_ranking`) 등록·표시는 이 모드에서 절대 발생하면 안 된다.
- 기보는 기존 `gomoku_game_log` 테이블에 `game_type: "ai_vs_ai"`, `human_player: null`, `nickname: null`로 저장한다.
- 과거 사람 대국 데이터·로직(2인/AI 대전 모드)은 전혀 건드리지 않는다 — 회귀 없어야 함.
- 대상 파일은 `gomoku-stack.html` 하나뿐(로컬 `모자이크퍼즐` 저장소 기준). 다른 게임 파일은 범위 밖.

---

## Task 1: Supabase 스키마 마이그레이션

`gomoku_game_log`가 현재 `human_player`를 `NOT NULL`로 요구해서(`CHECK human_player = ANY(ARRAY[1,2])`), 사람이 없는 AI vs AI 대국을 저장할 수 없다. 추가적(additive) 마이그레이션으로 이를 허용한다.

**Files:** 없음 (Supabase 프로젝트 `paktzmofotvwfdxcpmzv`에 직접 적용)

**Interfaces:**
- Consumes: 없음
- Produces: `gomoku_game_log` 테이블에 nullable `human_player`, 새 컬럼 `game_type text NOT NULL DEFAULT 'human'` — Task 3에서 이 스키마로 INSERT함

- [ ] **Step 1: 마이그레이션 적용**

`mcp__claude_ai_Supabase__apply_migration` 도구를 프로젝트 `paktzmofotvwfdxcpmzv`에 대해 다음 SQL로 호출한다:

```sql
ALTER TABLE gomoku_game_log ALTER COLUMN human_player DROP NOT NULL;
ALTER TABLE gomoku_game_log ADD COLUMN game_type text NOT NULL DEFAULT 'human';
```

- [ ] **Step 2: 스키마 반영 확인**

`mcp__claude_ai_Supabase__list_tables`(project_id: `paktzmofotvwfdxcpmzv`, verbose: true)를 다시 호출해서 `gomoku_game_log`의 `human_player` 컬럼에 `"nullable"` 옵션이 생겼는지, `game_type` 컬럼(`text`, default `'human'`)이 추가됐는지 확인한다.

- [ ] **Step 3: 기존 데이터 무결성 확인**

`mcp__claude_ai_Supabase__execute_sql`로 다음을 실행해 기존 1000여 개 행이 전부 `game_type = 'human'`으로 채워졌고 `human_player`가 여전히 1 또는 2인지 확인한다:

```sql
select game_type, count(*), count(human_player) as with_human_player
from gomoku_game_log
group by game_type;
```

Expected: 한 행만 나오고 `game_type='human'`, `count(*) = with_human_player`(기존 행은 전부 human_player가 채워져 있어야 함).

---

## Task 2: AI vs AI 모드 구현 (`gomoku-stack.html`)

**Files:**
- Modify: `gomoku-stack.html` (HTML 모드 버튼, CSS, 여러 JS 함수)

**Interfaces:**
- Consumes: Task 1에서 추가된 `gomoku_game_log.game_type`/nullable `human_player`
- Produces: `gameMode === "ai_vs_ai"`일 때 동작하는 전체 흐름 — Task 3(배포)이 이 커밋을 그대로 game-hub에 복사함

- [ ] **Step 1: 무르기 버튼용 hidden 스타일 추가**

`gomoku-stack.html`에서 다음 부분을 찾는다(약 45~49번째 줄):

```css
  .btn-undo {
    background: #15181c; border: 1px solid rgba(255,255,255,.1); color: #c7ccd4;
    font-size: 13px; font-weight: 600; padding: 9px 14px; border-radius: 10px; cursor: pointer;
  }
  .btn-undo:disabled { opacity: .4; cursor: default; }
```

바로 뒤에 추가:

```css
  .btn-undo.hidden { display: none; }
```

- [ ] **Step 2: "AI vs AI" 모드 버튼 추가**

다음 부분을 찾는다:

```html
      <div class="mode-group" id="mode-group">
        <button class="mode-btn" data-mode="2p">2인 플레이</button>
        <button class="mode-btn" data-mode="ai">AI와 대결</button>
      </div>
```

교체:

```html
      <div class="mode-group" id="mode-group">
        <button class="mode-btn" data-mode="2p">2인 플레이</button>
        <button class="mode-btn" data-mode="ai">AI와 대결</button>
        <button class="mode-btn" data-mode="ai_vs_ai">AI vs AI 관전</button>
      </div>
```

- [ ] **Step 3: 모드 버튼 클릭 핸들러에서 최상 난이도 강제 + 무르기 버튼 숨김**

다음 부분을 찾는다(`updateModeUI` 아래, 모드 버튼 이벤트 리스너):

```js
  document.querySelectorAll("#mode-group .mode-btn").forEach(b => {
    b.addEventListener("click", () => { gameMode = b.dataset.mode; updateModeUI(); resetGame(); });
  });
```

교체:

```js
  document.querySelectorAll("#mode-group .mode-btn").forEach(b => {
    b.addEventListener("click", () => {
      gameMode = b.dataset.mode;
      if (gameMode === "ai_vs_ai") aiDifficulty = "extreme";
      updateModeUI();
      resetGame();
    });
  });
```

그리고 `updateModeUI()` 함수 안, `document.getElementById("difficulty-group").classList.toggle("hidden", gameMode !== "ai");` 바로 다음 줄에 추가:

```js
    document.getElementById("undo-btn").classList.toggle("hidden", gameMode === "ai_vs_ai");
```

(참고: `difficulty-group`와 `rank-toggle-btn`은 이미 `gameMode !== "ai"`/`gameMode === "ai" ? ... : null` 조건으로 걸려있어서 `ai_vs_ai`일 때 자동으로 숨겨진다 — 별도 처리 불필요.)

- [ ] **Step 4: 사람의 개입 경로 차단 — `onCellClick`, `canUndo`**

`onCellClick(key)` 함수 맨 앞부분:

```js
  function onCellClick(key) {
    if (state.winner) return;
    if (state.aiThinking) return;
    if (gameMode === "ai" && state.turn === AI_PLAYER) return;
```

교체:

```js
  function onCellClick(key) {
    if (state.winner) return;
    if (state.aiThinking) return;
    if (gameMode === "ai_vs_ai") return;
    if (gameMode === "ai" && state.turn === AI_PLAYER) return;
```

`canUndo()` 함수:

```js
  function canUndo() {
    if (state.winner) return false;
    if (state.aiThinking) return false;
    if (gameMode === "ai") {
      if (state.turn !== HUMAN_PLAYER) return false;
      return history.some(h => h.turn === HUMAN_PLAYER);
    }
    return history.length >= 1;
  }
```

교체:

```js
  function canUndo() {
    if (state.winner) return false;
    if (state.aiThinking) return false;
    if (gameMode === "ai_vs_ai") return false;
    if (gameMode === "ai") {
      if (state.turn !== HUMAN_PLAYER) return false;
      return history.some(h => h.turn === HUMAN_PLAYER);
    }
    return history.length >= 1;
  }
```

- [ ] **Step 5: 양쪽 턴 모두 AI가 두도록 `scheduleAIIfNeeded`/`performAIMove` 확장**

```js
  function scheduleAIIfNeeded() {
    if (gameMode !== "ai") return;
    if (state.winner) return;
    if (state.turn !== AI_PLAYER) return;
    if (state.aiThinking) return;
    state.aiThinking = true;
    render();
    const epoch = gameEpoch;
    setTimeout(() => {
      if (epoch !== gameEpoch) return;
      performAIMove(epoch);
    }, 300 + Math.random() * 350);
  }

  async function performAIMove(epoch) {
    const move = await computeAIMove();
    if (epoch !== gameEpoch) return; // 그 사이 게임이 리셋/전환됐으면 이 결과는 버린다
    state.aiThinking = false;
    applyAIMove(move);
  }
```

교체:

```js
  function scheduleAIIfNeeded() {
    if (gameMode !== "ai" && gameMode !== "ai_vs_ai") return;
    if (state.winner) return;
    if (gameMode === "ai" && state.turn !== AI_PLAYER) return;
    if (state.aiThinking) return;
    state.aiThinking = true;
    render();
    const epoch = gameEpoch;
    setTimeout(() => {
      if (epoch !== gameEpoch) return;
      performAIMove(epoch);
    }, 300 + Math.random() * 350);
  }

  async function performAIMove(epoch) {
    // AI vs AI 모드: 새로 탐색 로직을 만들지 않고, 지금 둘 차례인 쪽을 임시로
    // AI_PLAYER로 놓고 기존 탐색 함수를 그대로 재사용한다. scheduleAIIfNeeded가
    // state.aiThinking으로 항상 한 번에 하나의 performAIMove만 진행되게 막아주므로
    // 이 재할당이 다른 진행 중인 탐색과 겹칠 일은 없다.
    if (gameMode === "ai_vs_ai") {
      AI_PLAYER = state.turn;
      HUMAN_PLAYER = otherPlayer(state.turn);
    }
    const move = await computeAIMove();
    if (epoch !== gameEpoch) return; // 그 사이 게임이 리셋/전환됐으면 이 결과는 버린다
    state.aiThinking = false;
    applyAIMove(move);
  }
```

- [ ] **Step 6: `setState`의 랭킹/기보 저장 분기 수정**

```js
  function setState(patch) {
    const wasWinner = state.winner;
    state = Object.assign({}, state, patch);
    if (gameMode === "ai" && !wasWinner && state.winner) {
      humanIsBlackNext = state.winner === AI_PLAYER; // 패자가 다음 판 흑돌
      autoSubmitRankIfReturningPlayer();
      submitGameLog();
    }
    render();
    scheduleAIIfNeeded();
  }
```

교체:

```js
  function setState(patch) {
    const wasWinner = state.winner;
    state = Object.assign({}, state, patch);
    if ((gameMode === "ai" || gameMode === "ai_vs_ai") && !wasWinner && state.winner) {
      if (gameMode === "ai") {
        humanIsBlackNext = state.winner === AI_PLAYER; // 패자가 다음 판 흑돌
        autoSubmitRankIfReturningPlayer();
      }
      submitGameLog();
    }
    render();
    scheduleAIIfNeeded();
  }
```

(`humanIsBlackNext`/`autoSubmitRankIfReturningPlayer`는 `ai_vs_ai`에서 AI_PLAYER가 매턴 바뀌므로 절대 실행하면 안 된다 — 사람의 다음 "AI와 대결" 판 흑/백 배정이나 사람 랭킹에 엉뚱하게 영향을 주게 됨.)

- [ ] **Step 7: `submitGameLog`가 AI vs AI 대국을 올바른 필드로 저장하도록 수정**

```js
  async function submitGameLog() {
    const config = currentRankConfig();
    if (!config) return;
    const nickname = localStorage.getItem(config.nicknameKey) || null;
    try {
      await fetch(`${RANK_SUPABASE_URL}/rest/v1/gomoku_game_log`, {
        method: "POST",
        headers: {
          apikey: RANK_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${RANK_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          difficulty: aiDifficulty,
          nickname,
          human_player: HUMAN_PLAYER,
          winner: state.winner,
          win_reason: state.winReason,
          used_undo: usedUndo,
          moves: moveLog,
        }),
      });
    } catch (e) {
      // 기보 저장 실패는 게임 진행에 영향을 주지 않도록 조용히 무시한다
    }
  }
```

교체:

```js
  async function submitGameLog() {
    const config = currentRankConfig();
    if (!config) return;
    const isAiVsAi = gameMode === "ai_vs_ai";
    const nickname = isAiVsAi ? null : (localStorage.getItem(config.nicknameKey) || null);
    try {
      await fetch(`${RANK_SUPABASE_URL}/rest/v1/gomoku_game_log`, {
        method: "POST",
        headers: {
          apikey: RANK_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${RANK_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          difficulty: aiDifficulty,
          nickname,
          human_player: isAiVsAi ? null : HUMAN_PLAYER,
          game_type: isAiVsAi ? "ai_vs_ai" : "human",
          winner: state.winner,
          win_reason: state.winReason,
          used_undo: usedUndo,
          moves: moveLog,
        }),
      });
    } catch (e) {
      // 기보 저장 실패는 게임 진행에 영향을 주지 않도록 조용히 무시한다
    }
  }
```

- [ ] **Step 8: `render()`의 상태 문구를 AI vs AI에 맞게 조정**

`render()` 함수 맨 앞부분(`const { stacks, turn, ... } = state;` 바로 다음 줄)에 있는 `aiTurnActive` 정의부터 수정한다 — 이게 `ai_vs_ai`에서 항상 참이 되어야 legalTargets 숨김/사고중 표시/phaseLabel이 전부 올바르게 동작한다:

```js
    const aiTurnActive = gameMode === "ai" && turn === AI_PLAYER && !winner;
```

교체:

```js
    const aiTurnActive = ((gameMode === "ai" && turn === AI_PLAYER) || gameMode === "ai_vs_ai") && !winner;
```

그다음, 함수 뒤쪽의 `phaseLabel` 계산부(위 `aiTurnActive` 정의와는 별개 위치, 보드 렌더링 루프 이후에 있음):

```js
    let phaseLabel;
    if (aiTurnActive) {
      phaseLabel = phase === "initial" ? "AI가 배치하는 중..." : "AI가 생각하는 중...";
    } else if (phase === "initial") {
```

교체:

```js
    let phaseLabel;
    if (aiTurnActive) {
      const aiLabel = gameMode === "ai_vs_ai" ? `${colorName(turn)} AI` : "AI";
      phaseLabel = phase === "initial" ? `${aiLabel}가 배치하는 중...` : `${aiLabel}가 생각하는 중...`;
    } else if (phase === "initial") {
```

그리고 바로 몇 줄 아래에 있는 공급량 표시 두 줄:

```js
    supply1El.textContent = gameMode === "ai" ? `흑${HUMAN_PLAYER === 1 ? "(나)" : "(AI)"} ${supply[1]}` : `흑 ${supply[1]}`;
    supply2El.textContent = gameMode === "ai" ? `백${HUMAN_PLAYER === 2 ? "(나)" : "(AI)"} ${supply[2]}` : `백 ${supply[2]}`;
```

교체:

```js
    supply1El.textContent = gameMode === "ai" ? `흑${HUMAN_PLAYER === 1 ? "(나)" : "(AI)"} ${supply[1]}` : gameMode === "ai_vs_ai" ? `흑(AI) ${supply[1]}` : `흑 ${supply[1]}`;
    supply2El.textContent = gameMode === "ai" ? `백${HUMAN_PLAYER === 2 ? "(나)" : "(AI)"} ${supply[2]}` : gameMode === "ai_vs_ai" ? `백(AI) ${supply[2]}` : `백 ${supply[2]}`;
```

- [ ] **Step 9: 버전 태그 갱신**

```html
        <span class="title">3단 오목 <span class="version-tag">v0.4</span></span>
```

교체:

```html
        <span class="title">3단 오목 <span class="version-tag">v0.5</span></span>
```

- [ ] **Step 10: 정적 확인**

Run:
```bash
grep -c 'data-mode="ai_vs_ai"' gomoku-stack.html
grep -c 'gameMode === "ai_vs_ai"' gomoku-stack.html
```
Expected: 첫 번째 명령 `1`(모드 버튼 정의 1곳), 두 번째 명령 `8` 이상(Step 3~8에서 추가한 조건 분기 전부 — 정확한 개수보다 "0이 아님"만 확인하면 충분).

- [ ] **Step 11: 브라우저에서 실전 검증**

로컬 정적 서버로 `gomoku-stack.html`을 띄운다:
```bash
node -e "
const http = require('http');
const fs = require('fs');
const path = require('path');
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(process.cwd(), p), (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200); res.end(data);
  });
}).listen(8940, () => console.log('listening on 8940'));
"
```

Playwright(`mcp__plugin_playwright_playwright__browser_navigate`)로 `http://localhost:8940/gomoku-stack.html`을 열고:

1. `document.querySelector('#mode-group .mode-btn[data-mode="ai_vs_ai"]').click()` 실행.
2. `#difficulty-group`가 `hidden` 클래스를 갖는지, `#undo-btn`이 `hidden` 클래스를 갖는지 확인.
3. `document.querySelectorAll('.cell-wrap')[10].click()`처럼 보드를 직접 클릭해봐도 돌이 놓이지 않는지 확인(사람 개입 차단 검증).
4. 5~10초 대기하며 폴링해서 흑/백 돌이 번갈아 자동으로 늘어나는지 확인(`document.querySelectorAll('.stone').filter(s => s.style.background)`의 개수 변화 관찰).
5. `mcp__plugin_playwright_playwright__browser_console_messages`(level: "error")로 에러 없는지 확인.

Expected: 난이도바/무르기 버튼 숨겨짐, 보드 클릭 무시됨, 별도 조작 없이 돌이 계속 늘어남(자동 진행), 콘솔 에러 없음.

- [ ] **Step 12: 커밋**

```bash
git add gomoku-stack.html
git commit -m "$(cat <<'EOF'
feat: 오목에 AI vs AI 관전 모드 추가, 최상 난이도 대국 기보 기록

EOF
)"
```

---

## Task 3: 배포

Task 2까지 로컬 저장소에는 반영됐지만, 실제 서비스(`pgamex.vercel.app`)는 `game-hub` 모노레포 기준이다. `gomoku-stack.html`은 `game-hub` 쪽에서 별도 히스토리로 발전해 왔으므로(subtree pull 대상 아님 — add/add 충돌 발생 이력 있음), 로컬 파일을 `game-hub/apps/mosaic-puzzle/gomoku-stack.html`에 직접 덮어써서 그쪽에서 커밋+푸시한다.

**Files:**
- Modify: `game-hub/apps/mosaic-puzzle/gomoku-stack.html` (로컬 파일을 그대로 복사)

**Interfaces:**
- Consumes: Task 2에서 완성된 로컬 `gomoku-stack.html`, Task 1에서 적용된 Supabase 스키마
- Produces: `pgamex.vercel.app/gomoku-stack.html`에 배포된 최종 결과물

- [ ] **Step 1: 두 파일이 이번 변경사항만큼만 다른지 확인**

```bash
diff <(tr -d '\r' < "../game-hub/apps/mosaic-puzzle/gomoku-stack.html") <(tr -d '\r' < "gomoku-stack.html")
```

Expected: Task 2의 diff와 일치하는 내용만 출력(그 외 예상 못한 차이가 있으면 먼저 사용자에게 확인할 것 — game-hub 쪽이 로컬보다 앞서 있을 가능성).

- [ ] **Step 2: 복사 + game-hub에서 커밋 + 푸시**

```bash
cp "gomoku-stack.html" "../game-hub/apps/mosaic-puzzle/gomoku-stack.html"
cd "../game-hub"
git add apps/mosaic-puzzle/gomoku-stack.html
git commit -m "$(cat <<'EOF'
feat: 오목에 AI vs AI 관전 모드 추가, 최상 난이도 대국 기보 기록

EOF
)"
git push origin master
```

- [ ] **Step 3: Vercel 자동 배포 확인**

`mcp__claude_ai_Vercel__list_deployments`(projectId: `prj_XxYWMNoa5uCbojXGopzIWAvOAZyA`, teamId: `maktubhd-4121s-projects`)로 최신 배포의 `githubCommitSha`가 방금 커밋과 일치하고 `state: "READY"`인지 확인. 필요하면 배포가 끝날 때까지 잠시 기다렸다가 재조회.

- [ ] **Step 4: 라이브 스모크 테스트**

```bash
curl -s "https://pgamex.vercel.app/gomoku-stack.html" | grep -c 'data-mode="ai_vs_ai"'
```

Expected: `1` 이상.
