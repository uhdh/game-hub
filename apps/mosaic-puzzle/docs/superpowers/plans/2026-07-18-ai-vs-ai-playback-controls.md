# AI vs AI 관전 모드 재생 컨트롤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gomoku-stack.html`의 "AI vs AI 관전" 모드에 자동재생 ON/OFF, 한 수씩 재생, 되감기 컨트롤을 추가하고, 대국이 끝난 뒤 처음부터 다시 볼 수 있게 한다.

**Architecture:** `ai_vs_ai` 모드 전용으로 파기하지 않는 스냅샷 배열(`aiVsAiSnapshots`)과 현재 보고 있는 위치(`aiVsAiCursor`)를 새로 둔다. 매 수가 실제로 계산되어 적용될 때마다 스냅샷을 하나 추가한다. 되감기/재생(이미 아는 미래로 이동)은 스냅샷 배열만 읽어서 즉시 화면을 갱신하고, 라이브 최신 지점에서만 실제로 기존 AI 탐색(Web Worker)을 새로 돌린다. 사람이 개입할 수 있는 경로는 이미 다 막혀 있으므로 그대로 둔다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 도구 없음). Playwright로 로컬 검증.

## Global Constraints

- `aiVsAiSnapshots`는 되감기해도 절대 지우지 않는다(파기 없는 스크러빙).
- 실제 AI 탐색(시간이 걸리는 연산)은 커서가 스냅샷 배열의 맨 끝(라이브 최신 지점)에 있고, 아직 승부가 안 났고, 이미 다른 탐색이 진행 중이 아닐 때만 시작한다.
- 되감기 버튼과 "재생(한 수)" 버튼은 `state.aiThinking`이 참일 때 비활성화한다(탐색 도중 커서를 건드리면 결과가 엉뚱한 위치에 반영되는 경쟁 상태를 막기 위함 — 이 규칙 하나로 그 경쟁 상태가 원천 차단된다).
- "재생(한 수)" 버튼은 자동재생이 켜져 있을 때는 비활성화한다(자동재생이 이미 계속 진행 중이므로).
- 대상 파일은 `gomoku-stack.html` 하나뿐. `gameMode === "ai"`(사람 vs AI)의 기존 "한 수 무르기" 로직은 절대 건드리지 않는다.

---

## Task 1: HTML/CSS — 컨트롤 바 + 다시보기 버튼 추가

**Files:**
- Modify: `gomoku-stack.html` (HTML, CSS)

**Interfaces:**
- Produces: `#ai-vs-ai-controls`(`#aivsai-rewind-btn`, `#aivsai-autoplay-btn`, `#aivsai-step-btn`), `#win-replay-btn` — Task 2의 JS가 이 DOM ID들을 그대로 사용함

- [ ] **Step 1: 버튼 disabled 스타일 추가**

`gomoku-stack.html`에서 다음 부분을 찾는다:

```css
  .mode-btn.active { background: rgba(95,184,176,.16); color: #e7ebee; }
  .mode-btn.hidden { display: none; }
```

바로 뒤에 추가:

```css
  .mode-btn:disabled { opacity: .35; cursor: default; }
```

- [ ] **Step 2: 컨트롤 바 hidden 스타일 + 다시보기 버튼 hidden 스타일 추가**

`.btn-restart` 스타일 바로 뒤(다음 부분을 찾는다):

```css
  .btn-restart {
    margin-top: 6px; background: #5fb8b0; color: #0f1214; font-size: 14px; font-weight: 700;
    border: none; padding: 11px 22px; border-radius: 10px; cursor: pointer; width: 100%;
  }
```

바로 뒤에 추가:

```css
  .btn-restart.hidden { display: none; }
  .btn-restart.secondary { background: #15181c; color: #c7ccd4; border: 1px solid rgba(255,255,255,.1); }
  #ai-vs-ai-controls.hidden { display: none; }
```

- [ ] **Step 3: 모드 바 아래에 컨트롤 바 HTML 추가**

다음 부분을 찾는다:

```html
      <button class="mode-btn rank-toggle-btn hidden" id="rank-toggle-btn">🏆 <span id="rank-toggle-label">상</span> 난이도 랭킹</button>
    </div>

    <div class="rank-panel hidden" id="rank-panel">
```

`</div>`(mode-bar 닫는 태그)와 `<div class="rank-panel hidden" id="rank-panel">` 사이에 다음을 삽입:

```html

    <div class="mode-bar hidden" id="ai-vs-ai-controls">
      <div class="mode-group">
        <button class="mode-btn" id="aivsai-rewind-btn">◀ 되감기</button>
        <button class="mode-btn" id="aivsai-autoplay-btn">⏸ 자동재생</button>
        <button class="mode-btn" id="aivsai-step-btn">재생 ▶</button>
      </div>
    </div>
```

- [ ] **Step 4: 승리 화면에 "처음부터 다시보기" 버튼 추가**

다음 부분을 찾는다:

```html
    <span class="undo-rank-note hidden" id="undo-rank-note">무르기를 사용해 이번 판 결과는 랭킹에 등록할 수 없습니다.</span>

    <button class="btn-restart" id="win-close-btn">종료</button>
```

교체:

```html
    <span class="undo-rank-note hidden" id="undo-rank-note">무르기를 사용해 이번 판 결과는 랭킹에 등록할 수 없습니다.</span>

    <button class="btn-restart secondary hidden" id="win-replay-btn">처음부터 다시보기</button>
    <button class="btn-restart" id="win-close-btn">종료</button>
```

- [ ] **Step 5: 정적 확인**

Run:
```bash
grep -c 'id="ai-vs-ai-controls"' gomoku-stack.html
grep -c 'id="win-replay-btn"' gomoku-stack.html
grep -c 'id="aivsai-rewind-btn"' gomoku-stack.html
grep -c 'id="aivsai-autoplay-btn"' gomoku-stack.html
grep -c 'id="aivsai-step-btn"' gomoku-stack.html
```
Expected: 전부 `1`.

- [ ] **Step 6: 커밋**

```bash
git add gomoku-stack.html
git commit -m "$(cat <<'EOF'
feat: AI vs AI 재생 컨트롤용 HTML/CSS 뼈대 추가

EOF
)"
```

---

## Task 2: JS — 스냅샷 기반 재생 엔진 구현

**Files:**
- Modify: `gomoku-stack.html` (JS)

**Interfaces:**
- Consumes: Task 1의 DOM 요소들
- Produces: `aiVsAiSnapshots`, `aiVsAiCursor`, `aiVsAiAutoplay`, `showAiVsAiSnapshot(cursor)`, `aiVsAiStepBack()`, `aiVsAiStepForward()` — 전부 이 파일 내부에서만 쓰임

- [ ] **Step 1: 상태 변수 추가**

다음 부분을 찾는다:

```js
  let history = []; // 무르기용: 각 수를 두기 직전 state 스냅샷
  let usedUndo = false; // 이번 판에서 무르기를 사용했는지 (사용 시 랭킹 등록 불가)
  let moveLog = []; // 기보 기록용: history와 항상 1:1로 push/pop되는 수순 목록
```

바로 뒤에 추가:

```js

  // ---- AI vs AI 재생 컨트롤 ----
  // history/undoMove와 달리 되감기해도 아무것도 지우지 않는다(스크러빙 전용).
  let aiVsAiSnapshots = []; // 매 수 직후 전체 state 스냅샷, append-only
  let aiVsAiCursor = 0;     // 지금 화면에 표시 중인 스냅샷 인덱스
  let aiVsAiAutoplay = true; // 자동재생 ON/OFF
```

- [ ] **Step 2: `resetGame()`에서 재생 상태 초기화**

다음 부분을 찾는다:

```js
  function resetGame() {
    gameEpoch++;
    rankSubmittedForThisGame = false;
    history = [];
    usedUndo = false;
    moveLog = [];
    document.getElementById("rank-register-result").classList.add("hidden");
    document.getElementById("rank-nickname-input").disabled = false;
    document.getElementById("rank-submit-btn").disabled = false;
    document.getElementById("rank-submit-btn").textContent = "등록";
    HUMAN_PLAYER = humanIsBlackNext ? 1 : 2;
    AI_PLAYER = otherPlayer(HUMAN_PLAYER);
    setState({
      stacks: {}, turn: 1, phase: "initial", stepIndex: 0, placedInStep: 0,
      supply: { 1: 25, 2: 25 }, selected: null, winner: null, winReason: "", winCells: [], aiThinking: false, lastCell: null,
    });
  }
```

교체:

```js
  function resetGame() {
    gameEpoch++;
    rankSubmittedForThisGame = false;
    history = [];
    usedUndo = false;
    moveLog = [];
    aiVsAiSnapshots = [];
    aiVsAiCursor = 0;
    aiVsAiAutoplay = true;
    document.getElementById("rank-register-result").classList.add("hidden");
    document.getElementById("rank-nickname-input").disabled = false;
    document.getElementById("rank-submit-btn").disabled = false;
    document.getElementById("rank-submit-btn").textContent = "등록";
    HUMAN_PLAYER = humanIsBlackNext ? 1 : 2;
    AI_PLAYER = otherPlayer(HUMAN_PLAYER);
    setState({
      stacks: {}, turn: 1, phase: "initial", stepIndex: 0, placedInStep: 0,
      supply: { 1: 25, 2: 25 }, selected: null, winner: null, winReason: "", winCells: [], aiThinking: false, lastCell: null,
    });
    if (gameMode === "ai_vs_ai") {
      aiVsAiSnapshots.push(Object.assign({}, state));
      aiVsAiCursor = 0;
    }
  }
```

- [ ] **Step 3: `scheduleAIIfNeeded`를 모드별로 분리하고 ai_vs_ai 전용 스케줄러 추가**

다음 부분을 찾는다:

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
```

교체:

```js
  function scheduleAIIfNeeded() {
    if (gameMode === "ai") {
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
      return;
    }
    if (gameMode === "ai_vs_ai") {
      scheduleAiVsAiAutoAdvance();
    }
  }

  // 자동재생이 켜져 있을 때만, 그리고 진행 중인 탐색이 없을 때만 다음 한 수를 예약한다.
  // 실제 "한 수 진행"은 aiVsAiStepForward가 전담한다(이미 아는 미래면 즉시 표시,
  // 라이브 끝이면 그때만 새로 탐색).
  function scheduleAiVsAiAutoAdvance() {
    if (!aiVsAiAutoplay) return;
    if (state.winner) return;
    if (state.aiThinking) return;
    const epoch = gameEpoch;
    setTimeout(() => {
      if (epoch !== gameEpoch) return;
      aiVsAiStepForward();
    }, 300 + Math.random() * 350);
  }
```

- [ ] **Step 4: `applyAIMove`가 스냅샷을 기록하도록 수정**

다음 부분을 찾는다:

```js
  function applyAIMove(move) {
    const player = AI_PLAYER;
    history.push(state);
    if (state.phase === "initial") {
      moveLog.push({ player, type: "place", key: move.key });
      const stacks = placeStoneOf(state.stacks, move.key, player);
      const supply = Object.assign({}, state.supply, { [player]: state.supply[player] - 1 });
      let stepIndex = state.stepIndex, placedInStep = state.placedInStep;
      placedInStep++;
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
      setState({ stacks, supply, stepIndex, placedInStep, phase, turn, lastCell: move.key });
      return;
    }
    moveLog.push(move.type === "place" ? { player, type: "place", key: move.key } : { player, type: "move", origin: move.origin, dest: move.dest });
    const stacks = applyMoveToStacks(state.stacks, move, player);
    const supply = move.type === "place" ? Object.assign({}, state.supply, { [player]: state.supply[player] - 1 }) : state.supply;
    const win = checkWinOf(stacks, player);
    const lastCell = move.type === "place" ? move.key : move.dest;
    setState({ stacks, supply, selected: null, turn: win ? state.turn : otherPlayer(player), winner: win ? player : null, winReason: win ? win.reason : "", winCells: win ? win.cells : [], lastCell });
  }
```

교체:

```js
  function recordAiVsAiSnapshotIfNeeded() {
    if (gameMode !== "ai_vs_ai") return;
    aiVsAiSnapshots.push(Object.assign({}, state, { aiThinking: false }));
    aiVsAiCursor = aiVsAiSnapshots.length - 1;
  }

  function applyAIMove(move) {
    const player = AI_PLAYER;
    history.push(state);
    if (state.phase === "initial") {
      moveLog.push({ player, type: "place", key: move.key });
      const stacks = placeStoneOf(state.stacks, move.key, player);
      const supply = Object.assign({}, state.supply, { [player]: state.supply[player] - 1 });
      let stepIndex = state.stepIndex, placedInStep = state.placedInStep;
      placedInStep++;
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
      setState({ stacks, supply, stepIndex, placedInStep, phase, turn, lastCell: move.key });
      recordAiVsAiSnapshotIfNeeded();
      return;
    }
    moveLog.push(move.type === "place" ? { player, type: "place", key: move.key } : { player, type: "move", origin: move.origin, dest: move.dest });
    const stacks = applyMoveToStacks(state.stacks, move, player);
    const supply = move.type === "place" ? Object.assign({}, state.supply, { [player]: state.supply[player] - 1 }) : state.supply;
    const win = checkWinOf(stacks, player);
    const lastCell = move.type === "place" ? move.key : move.dest;
    setState({ stacks, supply, selected: null, turn: win ? state.turn : otherPlayer(player), winner: win ? player : null, winReason: win ? win.reason : "", winCells: win ? win.cells : [], lastCell });
    recordAiVsAiSnapshotIfNeeded();
  }
```

- [ ] **Step 5: 스냅샷 이동 함수 + 한 수 재생 함수 추가**

`applyAIMove`/`recordAiVsAiSnapshotIfNeeded` 바로 뒤(즉 `onCellClick` 함수 시작 전)에 추가:

```js
  function showAiVsAiSnapshot(cursor) {
    aiVsAiCursor = cursor;
    state = aiVsAiSnapshots[cursor];
    render();
  }

  function aiVsAiStepBack() {
    if (aiVsAiCursor <= 0 || state.aiThinking) return;
    aiVsAiAutoplay = false;
    showAiVsAiSnapshot(aiVsAiCursor - 1);
  }

  // 이미 아는 미래(스냅샷)가 있으면 그걸 그대로 보여주고, 라이브 끝에 도달했을 때만
  // 실제로 AI 탐색을 한 번 새로 돌린다. scheduleAiVsAiAutoAdvance(자동재생)와
  // "재생 ▶" 버튼 둘 다 이 함수 하나로 처리한다.
  async function aiVsAiStepForward() {
    if (aiVsAiCursor < aiVsAiSnapshots.length - 1) {
      showAiVsAiSnapshot(aiVsAiCursor + 1);
      scheduleAIIfNeeded();
      return;
    }
    if (state.winner || state.aiThinking) return;
    AI_PLAYER = state.turn;
    HUMAN_PLAYER = otherPlayer(state.turn);
    state.aiThinking = true;
    render();
    const epoch = gameEpoch;
    const move = await computeAIMove();
    if (epoch !== gameEpoch) return;
    state.aiThinking = false;
    applyAIMove(move);
  }
```

- [ ] **Step 6: `onCellClick`에서 인간 개입 차단은 이미 되어 있음을 확인**

`gameMode === "ai_vs_ai"` 조건으로 이미 `onCellClick` 맨 앞에서 막혀 있다(이전 작업에서 추가됨). 이 단계는 코드 변경 없음 — 아래 grep으로 존재만 재확인한다:

Run: `grep -n 'if (gameMode === "ai_vs_ai") return;' gomoku-stack.html`
Expected: `onCellClick` 함수 안에서 최소 1곳 매치.

- [ ] **Step 7: `updateModeUI()`에서 컨트롤 바 표시/숨김**

다음 부분을 찾는다:

```js
    document.getElementById("undo-btn").classList.toggle("hidden", gameMode === "ai_vs_ai");
```

바로 뒤에 추가:

```js
    document.getElementById("ai-vs-ai-controls").classList.toggle("hidden", gameMode !== "ai_vs_ai");
```

- [ ] **Step 8: 버튼 이벤트 리스너 등록**

다음 부분을 찾는다:

```js
  document.getElementById("reset-btn").addEventListener("click", resetGame);
  document.getElementById("undo-btn").addEventListener("click", undoMove);
  document.getElementById("win-close-btn").addEventListener("click", () => {
    winOverlayEl.classList.remove("show");
  });
```

교체:

```js
  document.getElementById("reset-btn").addEventListener("click", resetGame);
  document.getElementById("undo-btn").addEventListener("click", undoMove);
  document.getElementById("win-close-btn").addEventListener("click", () => {
    winOverlayEl.classList.remove("show");
  });
  document.getElementById("aivsai-rewind-btn").addEventListener("click", aiVsAiStepBack);
  document.getElementById("aivsai-step-btn").addEventListener("click", () => {
    if (aiVsAiAutoplay) return;
    aiVsAiStepForward();
  });
  document.getElementById("aivsai-autoplay-btn").addEventListener("click", () => {
    aiVsAiAutoplay = !aiVsAiAutoplay;
    render();
    scheduleAIIfNeeded();
  });
  document.getElementById("win-replay-btn").addEventListener("click", () => {
    winOverlayEl.classList.remove("show");
    aiVsAiAutoplay = true;
    showAiVsAiSnapshot(0);
    scheduleAIIfNeeded();
  });
```

- [ ] **Step 9: `render()`에서 컨트롤 버튼 상태 갱신 + 다시보기 버튼 표시**

다음 부분을 찾는다:

```js
    boardCardEl.classList.toggle("thinking", aiTurnActive);

    document.getElementById("undo-btn").disabled = !canUndo();
```

교체:

```js
    boardCardEl.classList.toggle("thinking", aiTurnActive);

    document.getElementById("undo-btn").disabled = !canUndo();
    if (gameMode === "ai_vs_ai") {
      const autoplayBtn = document.getElementById("aivsai-autoplay-btn");
      autoplayBtn.textContent = aiVsAiAutoplay ? "⏸ 자동재생" : "▶ 자동재생";
      autoplayBtn.classList.toggle("active", aiVsAiAutoplay);
      document.getElementById("aivsai-rewind-btn").disabled = aiVsAiCursor <= 0 || aiThinking;
      const canStepForward = !aiVsAiAutoplay && !aiThinking && (aiVsAiCursor < aiVsAiSnapshots.length - 1 || !winner);
      document.getElementById("aivsai-step-btn").disabled = !canStepForward;
    }
```

그다음, 승리 화면 처리부에서 다음 부분을 찾는다:

```js
    if (winner) {
      winDotEl.style.background = stoneColor(winner);
      winLabelEl.textContent = `${colorName(winner)} 승리!`;
      winReasonEl.textContent = winReason;
      winAiTauntEl.classList.toggle("hidden", !(gameMode === "ai" && winner === HUMAN_PLAYER));
      winOverlayEl.classList.add("show");
```

교체:

```js
    if (winner) {
      winDotEl.style.background = stoneColor(winner);
      winLabelEl.textContent = `${colorName(winner)} 승리!`;
      winReasonEl.textContent = winReason;
      winAiTauntEl.classList.toggle("hidden", !(gameMode === "ai" && winner === HUMAN_PLAYER));
      document.getElementById("win-replay-btn").classList.toggle("hidden", gameMode !== "ai_vs_ai");
      winOverlayEl.classList.add("show");
```

- [ ] **Step 10: 정적 확인**

Run:
```bash
grep -c "aiVsAiSnapshots" gomoku-stack.html
grep -c "aiVsAiStepForward" gomoku-stack.html
grep -c "aiVsAiStepBack" gomoku-stack.html
grep -c "scheduleAiVsAiAutoAdvance" gomoku-stack.html
```
Expected: 전부 2 이상(정의 + 최소 1회 이상 사용).

- [ ] **Step 11: 브라우저 실전 검증**

로컬 정적 서버로 `gomoku-stack.html`을 띄우고 Playwright로 다음을 확인한다:

1. AI vs AI 모드로 전환 → `#ai-vs-ai-controls`가 보이는지, 자동재생 버튼이 "⏸ 자동재생"(ON 상태)으로 보이는지 확인.
2. 자동재생 버튼을 눌러 끈다 → 몇 초 기다려도 돌 개수가 늘지 않는지 확인(자동 진행 멈춤).
3. "재생 ▶" 버튼을 여러 번 눌러 매번 정확히 한 수씩만 늘어나는지 확인.
4. "◀ 되감기"를 두 번 눌러 두 수 전으로 돌아간 뒤, 그 시점의 보드 상태(놓인 돌의 좌표 집합)를 기록.
5. "재생 ▶"을 두 번 눌러 다시 앞으로 이동한 뒤, 보드 상태가 되감기 전과 정확히 동일한지 확인(스냅샷이 파기되지 않았는지 — 이게 이번 기능의 핵심 검증 포인트).
6. 자동재생을 다시 켜고 게임이 끝날 때까지 기다린다 → 승리 화면에 "처음부터 다시보기" 버튼이 보이는지 확인.
7. "처음부터 다시보기"를 누른다 → 보드가 빈 상태로 돌아갔다가 자동으로 다시 처음부터 재생되는지, 새로운 `gomoku_game_log` 행이 또 생기지 않는지(같은 대국을 다시 보는 것뿐이므로) 확인.
8. 전체 과정에서 콘솔 에러가 없는지 확인.
9. 회귀 확인: "AI와 대결" 모드로 전환해서 기존 "한 수 무르기"가 여전히 정상 동작하는지 확인.

- [ ] **Step 12: 커밋**

```bash
git add gomoku-stack.html
git commit -m "$(cat <<'EOF'
feat: AI vs AI 관전 모드에 자동재생/재생/되감기 컨트롤과 다시보기 추가

EOF
)"
```

---

## Task 3: 배포

**Files:**
- Modify: `game-hub/apps/mosaic-puzzle/gomoku-stack.html`

**Interfaces:**
- Consumes: Task 1~2에서 완성된 로컬 `gomoku-stack.html`
- Produces: `pgamex.vercel.app/gomoku-stack.html`에 배포된 결과물

- [ ] **Step 1: 두 파일이 이번 변경사항만큼만 다른지 확인**

```bash
diff <(tr -d '\r' < "../game-hub/apps/mosaic-puzzle/gomoku-stack.html") <(tr -d '\r' < "gomoku-stack.html")
```

- [ ] **Step 2: 복사 + game-hub에서 커밋 + 푸시**

```bash
cp "gomoku-stack.html" "../game-hub/apps/mosaic-puzzle/gomoku-stack.html"
cd "../game-hub"
git add apps/mosaic-puzzle/gomoku-stack.html
git commit -m "$(cat <<'EOF'
feat: AI vs AI 관전 모드에 자동재생/재생/되감기 컨트롤과 다시보기 추가

EOF
)"
git push origin master
```

- [ ] **Step 3: Vercel 자동 배포 확인 + 라이브 스모크 테스트**

`mcp__claude_ai_Vercel__list_deployments`로 최신 배포의 `githubCommitSha`가 방금 커밋과 일치하고 `state: "READY"`인지 확인한 뒤:

```bash
curl -s "https://pgamex.vercel.app/gomoku-stack.html" | grep -c 'id="ai-vs-ai-controls"'
```

Expected: `1` 이상.
