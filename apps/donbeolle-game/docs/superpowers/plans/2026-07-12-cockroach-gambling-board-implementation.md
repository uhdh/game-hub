# 바퀴벌레 도박판 (Cockroach Gambling Board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the "바퀴벌레 도박판" physics-gambling prototype as a production React + TypeScript web app with faithful Matter.js physics, and deploy it to Firebase Hosting.

**Architecture:** Single-page React app (Vite). Game rules live in a pure `useReducer` (`gameReducer`) that is fully unit-testable; Matter.js physics lives entirely inside one custom hook (`usePhysicsEngine`) that owns the canvas, walls, planks, exit sensors and the bug, and talks to React only through a `phase` prop (in) and an `onEscape` callback (out). Per-tick physics values (`noiseTime`, `stuckTimer`, `isPlaying`) live in refs inside that hook, never in React state. `coins` / `exitStats` / `history` are persisted to `localStorage`; plank rotation state lives only inside the physics engine's Matter bodies and is not persisted (resets to the default layout on reload, matching the spec).

**Tech Stack:** React 18, TypeScript, Vite, Matter.js, Vitest + @testing-library/react (for pure-logic tests only), plain CSS (custom properties for design tokens), Firebase Hosting.

## Global Constraints

- Board/plank/exit coordinates are exact, load-bearing data digitized from the physical board — reuse `BOARD_DATA`, `EXIT_META`, `EXIT_Y`, wall rectangles, `PLANK_LENGTH`/`PLANK_THICK`/`PIVOT_OFFSET` verbatim from `docs/superpowers/specs/2026-07-12-cockroach-gambling-board-design.md` (sourced from `_extracted/design_handoff_cockroach_gambling_board/README.md`).
- Physics/logic coordinate space is fixed at 1000×1000 logical units; the on-screen canvas size is responsive via CSS only (never change hit-testing math to match display size).
- Off-center plank pivot rotation must use `Body.setCentre` with a world offset derived from `PIVOT_OFFSET = 9`, not the plank's bounding-box center.
- Bug visual must be the capsule + 6 leg-pairs + antennae silhouette (never a plain circle).
- `noiseTime` / `stuckTimer` / `isPlaying` must never be React state (spec requirement — they change every physics tick).
- `coins`, `exitStats`, `history` persist to `localStorage`; plank rotation does not persist.
- Layout must be responsive from the start (stacks vertically below ~900px viewport width); desktop layout caps the board at 560×560 CSS px.
- Board/plank/bug colors are the literal photo-matched palette (`#4a3525`, `#2b1d11`, `#8b7355`/`#5c4033`, `#5c2a1a`/`#2a1006` etc.) — never themed to the dark UI palette.
- Dark UI chrome uses the design tokens from the spec (`#0f0f12`, `#15181c`, `#5fb8b0`, `#5b8fc4`, `#c96a63`, etc.).
- No backend/server — everything runs client-side; deploy target is Firebase Hosting as a static SPA.

---

### Task 1: Project scaffolding (Vite + React + TypeScript + Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `src/main.tsx`
- Create: `src/App.tsx` (placeholder)
- Create: `src/styles/tokens.css` (placeholder, filled in Task 2)
- Create: `src/styles/global.css` (placeholder, filled in Task 2)

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run test` scripts that every later task relies on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "cockroach-gambling-board",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "matter-js": "^0.19.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.1",
    "@types/matter-js": "^0.19.7",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://cdn.jsdelivr.net" />
    <link
      href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css"
      rel="stylesheet"
    />
    <title>바퀴벌레 도박판</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.firebase/
*.local
```

- [ ] **Step 6: Write placeholder `src/styles/tokens.css` and `src/styles/global.css`**

`src/styles/tokens.css`:
```css
:root {
}
```

`src/styles/global.css`:
```css
body {
  margin: 0;
}
```

- [ ] **Step 7: Write `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Write placeholder `src/App.tsx`**

```tsx
function App() {
  return <div>바퀴벌레 도박판 - 로딩 중</div>;
}

export default App;
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: installs without errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 10: Verify the toolchain builds and tests run**

Run: `npm run build`
Expected: exits 0, produces `dist/index.html` and `dist/assets/*`.

Run: `npm run test`
Expected: exits 0, prints something like `No test files found, exiting with code 0` (because of `--passWithNoTests`).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html .gitignore src/
git commit -m "Scaffold Vite + React + TypeScript + Vitest project"
```

---

### Task 2: Design tokens & global layout CSS

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: CSS custom properties (`--color-*`, `--font-family`, `--radius-*`) and class names consumed by every component task (`.app-shell`, `.app-header*`, `.board-row`, `.exit-column`, `.exit-chip*`, `.board-stage`, `.board-canvas`, `.running-pill`, `.result-overlay`, `.result-card*`, `.side-panel`, `.card*`, `.betting-panel*`, `.bet-stepper*`, `.bet-cta`, `.stats-*`, `.history-*`, `.hint-caption`).

- [ ] **Step 1: Write `src/styles/tokens.css`**

```css
:root {
  --color-bg: #0f0f12;
  --color-card: #15181c;
  --color-input: #1c2024;
  --color-input-alt: #242a30;
  --color-text: #e7ebee;
  --color-text-muted: #8992a0;
  --color-text-faint: #66707c;
  --color-text-faintest: #4c545e;
  --color-accent-teal: #5fb8b0;
  --color-accent-blue: #5b8fc4;
  --color-loss: #c96a63;
  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-soft: rgba(255, 255, 255, 0.06);
  --font-family: 'Pretendard', -apple-system, 'Segoe UI', sans-serif;
  --radius-sm: 9px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --radius-pill: 999px;
}
```

- [ ] **Step 2: Write `src/styles/global.css`**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-family);
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 28px 20px 60px;
}

.app-header {
  width: 100%;
  max-width: 1180px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background: var(--color-card);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  padding: 16px 22px;
  flex-wrap: wrap;
}

.app-header__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.app-header__title {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.app-header__subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
}
.app-header__controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.phase-pill {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background: var(--color-input-alt);
  color: var(--color-accent-teal);
  border: 1px solid var(--color-border-soft);
}

.coin-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-input-alt);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  padding: 7px 16px;
}
.coin-pill__label {
  font-size: 13px;
  color: var(--color-text-muted);
}
.coin-pill__value {
  font-size: 18px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.refill-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 9px 14px;
  min-height: 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-input);
  color: var(--color-text-muted);
  cursor: pointer;
}

.app-body {
  width: 100%;
  max-width: 1180px;
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
}

.board-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.exit-column {
  position: relative;
  width: 100px;
  height: clamp(280px, 90vw, 560px);
  flex-shrink: 0;
}

.exit-chip {
  position: absolute;
  left: 0;
  width: 100px;
  min-height: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: var(--radius-sm);
  background: var(--color-input);
  border: 1.5px solid var(--color-border);
  transition: box-shadow 0.15s, border-color 0.15s;
  cursor: pointer;
  font-family: inherit;
}
.exit-chip:disabled {
  cursor: default;
}
.exit-chip--selected {
  background: rgba(95, 184, 176, 0.16);
  border-color: var(--color-accent-teal);
  box-shadow: 0 0 0 2px rgba(95, 184, 176, 0.35);
}
.exit-chip__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
}
.exit-chip__odds {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-accent-teal);
}

.board-stage {
  position: relative;
  width: clamp(280px, 90vw, 560px);
  height: clamp(280px, 90vw, 560px);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--color-border-soft);
  flex-shrink: 0;
}
.board-canvas {
  width: 100%;
  height: 100%;
}

.running-pill {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.55);
  color: #ffcc66;
  animation: gam-pulse 1s infinite;
}

@keyframes gam-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@keyframes gam-pop {
  0% {
    transform: scale(0.92);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.result-overlay {
  position: absolute;
  inset: 0;
  background: rgba(10, 10, 14, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  padding: 20px;
}

.result-card {
  background: var(--color-input);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 26px 24px;
  max-width: 280px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: gam-pop 0.18s ease;
}
.result-card h2 {
  margin: 0 0 8px;
  font-size: 20px;
}
.result-exit {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}
.result-payout {
  font-size: 38px;
  font-weight: 800;
  margin: 10px 0;
  font-variant-numeric: tabular-nums;
}
.result-next-btn {
  font-size: 14px;
  font-weight: 600;
  padding: 12px 24px;
  min-height: 44px;
  border-radius: var(--radius-sm);
  border: none;
  background: linear-gradient(90deg, var(--color-accent-teal), var(--color-accent-blue));
  color: #0f1214;
  cursor: pointer;
  width: 100%;
}

.side-panel {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: var(--color-card);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  padding: 18px;
}
.card__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-muted);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.betting-panel__selection {
  font-size: 13px;
  margin-bottom: 10px;
}
.betting-panel__selection-value {
  color: var(--color-accent-teal);
}
.betting-panel__hint {
  font-size: 12.5px;
  color: var(--color-text-faint);
}

.bet-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--color-input);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin-bottom: 12px;
}
.bet-stepper__label {
  font-size: 12.5px;
  color: var(--color-text-muted);
}
.bet-stepper__controls {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bet-stepper__controls button {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-input-alt);
  color: var(--color-text);
  font-size: 16px;
  cursor: pointer;
}
.bet-stepper__value {
  font-size: 17px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  min-width: 24px;
  text-align: center;
}

.betting-panel__potential {
  font-size: 12px;
  color: var(--color-text-faint);
  margin-bottom: 14px;
}
.betting-panel__potential b {
  color: var(--color-accent-teal);
}

.bet-cta {
  font-size: 14.5px;
  font-weight: 700;
  padding: 13px 20px;
  min-height: 46px;
  border-radius: var(--radius-sm);
  border: none;
  width: 100%;
  cursor: pointer;
  background: linear-gradient(90deg, var(--color-accent-teal), var(--color-accent-blue));
  color: #0f1214;
}
.bet-cta:disabled {
  cursor: not-allowed;
  background: var(--color-input-alt);
  color: var(--color-text-faint);
  opacity: 0.7;
}

.betting-panel__gameover {
  margin-top: 12px;
  font-size: 12.5px;
  color: var(--color-loss);
  text-align: center;
}

.stats-panel__bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stats-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stats-bar__label {
  font-size: 11.5px;
  color: var(--color-text-muted);
  width: 38px;
  flex-shrink: 0;
}
.stats-bar__track {
  flex: 1;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-input-alt);
  overflow: hidden;
}
.stats-bar__fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--color-accent-blue);
}
.stats-bar__count {
  font-size: 11.5px;
  width: 20px;
  text-align: right;
  flex-shrink: 0;
}

.history-panel__rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 9px;
}
.history-row--win {
  background: rgba(95, 184, 176, 0.1);
  border: 1px solid rgba(95, 184, 176, 0.25);
}
.history-row--loss {
  background: rgba(201, 106, 99, 0.08);
  border: 1px solid rgba(201, 106, 99, 0.2);
}
.history-row__icon {
  font-size: 12px;
  font-weight: 700;
}
.history-row--win .history-row__icon,
.history-row--win .history-row__delta {
  color: var(--color-accent-teal);
}
.history-row--loss .history-row__icon,
.history-row--loss .history-row__delta {
  color: var(--color-loss);
}
.history-row__label {
  flex: 1;
  font-size: 12.5px;
}
.history-row__delta {
  font-size: 12.5px;
  font-weight: 700;
}
.history-panel__empty {
  font-size: 12.5px;
  color: var(--color-text-faint);
}

.hint-caption {
  font-size: 11.5px;
  color: var(--color-text-faintest);
  line-height: 1.6;
  padding: 0 4px;
}

@media (max-width: 900px) {
  .app-body {
    flex-direction: column;
    align-items: center;
  }
  .board-row {
    flex-wrap: wrap;
    justify-content: center;
  }
  .side-panel {
    width: 100%;
    max-width: 560px;
  }
}
```

- [ ] **Step 3: Verify build still passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/styles/
git commit -m "Add design tokens and global layout CSS"
```

---

### Task 3: Game types and constants (exact board data)

**Files:**
- Create: `src/game/types.ts`
- Create: `src/game/constants.ts`

**Interfaces:**
- Produces: `Phase`, `PlankData`, `ExitMeta`, `HistoryEntry`, `LastResult`, `GameState`, `GameAction` (types) and `WIDTH`, `HEIGHT`, `PLANK_LENGTH`, `PLANK_THICK`, `PIVOT_OFFSET`, `STARTING_COINS`, `BUG_SPEED`, `BOARD_DATA`, `EXIT_Y`, `EXIT_META`, `WALL_RECTS` (constants), consumed by every subsequent game/component task.

- [ ] **Step 1: Write `src/game/types.ts`**

```ts
export type Phase = 'setup' | 'running' | 'result';

export interface PlankData {
  x: number;
  y: number;
  state: 0 | 1;
}

export interface ExitMeta {
  id: number;
  side: 'left' | 'right';
  y: number;
  label: string;
  odds: number;
}

export interface HistoryEntry {
  id: number;
  betLabel: string;
  actualLabel: string;
  win: boolean;
  payout: number;
  bet: number;
}

export interface LastResult {
  win: boolean;
  payout: number;
  exitLabel: string;
}

export interface GameState {
  coins: number;
  selectedExitId: number | null;
  betAmount: number;
  phase: Phase;
  pendingBet: number;
  lastResult: LastResult | null;
  exitStats: Record<number, number>;
  history: HistoryEntry[];
}

export type GameAction =
  | { type: 'SELECT_EXIT'; id: number }
  | { type: 'SET_BET_AMOUNT'; amount: number }
  | { type: 'PLACE_BET' }
  | { type: 'RESOLVE_ROUND'; exit: ExitMeta }
  | { type: 'NEXT_ROUND' }
  | { type: 'REFILL_COINS'; amount: number };
```

- [ ] **Step 2: Write `src/game/constants.ts`**

```ts
import type { ExitMeta, PlankData } from './types';

export const WIDTH = 1000;
export const HEIGHT = 1000;

export const PLANK_LENGTH = 169;
export const PLANK_THICK = 56;
// the crossbar/pivot slot on the real board sits off the bar's geometric middle
// (measured ~9 units closer to one end, out of a 169-unit bar)
export const PIVOT_OFFSET = 9;

export const STARTING_COINS = 15;
export const BUG_SPEED = 0.0032;

// plank centers digitized directly from the physical board photo (pixel-grid measured, normalized to 0-1000)
// x,y = the bar's geometric center in its default (state 0) orientation, exactly as it sits in the photo
export const BOARD_DATA: PlankData[] = [
  { x: 128, y: 110, state: 0 },
  { x: 511, y: 107, state: 0 },
  { x: 883, y: 105, state: 1 },
  { x: 408, y: 296, state: 0 },
  { x: 787, y: 296, state: 0 },
  { x: 128, y: 494, state: 0 },
  { x: 301, y: 497, state: 0 },
  { x: 694, y: 494, state: 1 },
  { x: 888, y: 494, state: 1 },
  { x: 222, y: 705, state: 0 },
  { x: 399, y: 705, state: 0 },
  { x: 785, y: 702, state: 1 },
  { x: 128, y: 911, state: 0 },
  { x: 701, y: 911, state: 0 },
  { x: 888, y: 911, state: 0 },
];

export const EXIT_Y = [200, 500, 800];

export const EXIT_META: ExitMeta[] = [
  { id: 1, side: 'left', y: 200, label: '출구1', odds: 3 },
  { id: 2, side: 'left', y: 500, label: '출구2', odds: 2 },
  { id: 3, side: 'left', y: 800, label: '출구3', odds: 4 },
  { id: 4, side: 'right', y: 200, label: '출구4', odds: 3 },
  { id: 5, side: 'right', y: 500, label: '출구5', odds: 2 },
  { id: 6, side: 'right', y: 800, label: '출구6', odds: 6 },
];

export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const WALL_RECTS: WallRect[] = [
  { x: 500, y: 13, width: 1000, height: 26 },
  { x: 500, y: 987, width: 1000, height: 26 },
  { x: 13, y: 72, width: 26, height: 118 },
  { x: 13, y: 350, width: 26, height: 188 },
  { x: 13, y: 650, width: 26, height: 188 },
  { x: 13, y: 928, width: 26, height: 118 },
  { x: 987, y: 72, width: 26, height: 118 },
  { x: 987, y: 350, width: 26, height: 188 },
  { x: 987, y: 650, width: 26, height: 188 },
  { x: 987, y: 928, width: 26, height: 118 },
];
```

- [ ] **Step 3: Verify build still passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/game/types.ts src/game/constants.ts
git commit -m "Add game types and exact board/plank/exit constants"
```

---

### Task 4: Off-center pivot rotation math (TDD)

**Files:**
- Create: `src/game/pivot.ts`
- Test: `src/game/pivot.test.ts`

**Interfaces:**
- Consumes: `PIVOT_OFFSET` from `src/game/constants.ts` (Task 3).
- Produces: `computePivotOffset(angle: number): { x: number; y: number }`, consumed by `usePhysicsEngine` (Task 7).

- [ ] **Step 1: Write the failing test — `src/game/pivot.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { computePivotOffset } from './pivot';

describe('computePivotOffset', () => {
  it('returns an offset straight up for angle 0 (vertical plank)', () => {
    const offset = computePivotOffset(0);
    expect(offset.x).toBeCloseTo(0);
    expect(offset.y).toBeCloseTo(-9);
  });

  it('rotates the offset 90 degrees for horizontal state', () => {
    const offset = computePivotOffset(Math.PI / 2);
    expect(offset.x).toBeCloseTo(9);
    expect(offset.y).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/pivot.test.ts`
Expected: FAIL with "Failed to resolve import ./pivot" or "computePivotOffset is not a function".

- [ ] **Step 3: Write `src/game/pivot.ts`**

```ts
import { PIVOT_OFFSET } from './constants';

/**
 * The plank's hinge sits PIVOT_OFFSET units off its geometric center, toward the
 * "top" in the plank's own unrotated local space. Rotating this local offset by
 * the plank's current angle gives the world-space offset to feed into
 * Matter.Body.setCentre so the plank swings around its true physical pivot.
 */
export function computePivotOffset(angle: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localOffset = { x: 0, y: -PIVOT_OFFSET };
  return {
    x: localOffset.x * cos - localOffset.y * sin,
    y: localOffset.x * sin + localOffset.y * cos,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/pivot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/pivot.ts src/game/pivot.test.ts
git commit -m "Add off-center plank pivot rotation math with tests"
```

---

### Task 5: Game reducer (TDD)

**Files:**
- Create: `src/game/gameReducer.ts`
- Test: `src/game/gameReducer.test.ts`

**Interfaces:**
- Consumes: `EXIT_META`, `STARTING_COINS` from `src/game/constants.ts`; `GameState`, `GameAction` from `src/game/types.ts` (Task 3).
- Produces: `createInitialState(startingCoins?: number): GameState`, `gameReducer(state: GameState, action: GameAction): GameState`, consumed by `useGameState` (Task 6) and `App.tsx` (Task 16).

- [ ] **Step 1: Write the failing tests — `src/game/gameReducer.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from './gameReducer';
import { EXIT_META } from './constants';

describe('createInitialState', () => {
  it('starts in setup phase with the given coin amount and zeroed stats', () => {
    const state = createInitialState(15);
    expect(state.coins).toBe(15);
    expect(state.phase).toBe('setup');
    expect(state.selectedExitId).toBeNull();
    expect(state.betAmount).toBe(1);
    expect(state.history).toEqual([]);
    for (const exit of EXIT_META) {
      expect(state.exitStats[exit.id]).toBe(0);
    }
  });
});

describe('gameReducer', () => {
  it('SELECT_EXIT sets the selected exit during setup', () => {
    const state = createInitialState(15);
    const next = gameReducer(state, { type: 'SELECT_EXIT', id: 3 });
    expect(next.selectedExitId).toBe(3);
  });

  it('SELECT_EXIT is ignored outside of setup', () => {
    const state = { ...createInitialState(15), phase: 'running' as const };
    const next = gameReducer(state, { type: 'SELECT_EXIT', id: 3 });
    expect(next.selectedExitId).toBeNull();
  });

  it('SET_BET_AMOUNT clamps between 1 and current coins', () => {
    const state = createInitialState(5);
    expect(gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 0 }).betAmount).toBe(1);
    expect(gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 99 }).betAmount).toBe(5);
    expect(gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 3 }).betAmount).toBe(3);
  });

  it('PLACE_BET deducts coins, escrows pendingBet, and moves to running', () => {
    let state = createInitialState(15);
    state = gameReducer(state, { type: 'SELECT_EXIT', id: 2 });
    state = gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 4 });
    const next = gameReducer(state, { type: 'PLACE_BET' });
    expect(next.coins).toBe(11);
    expect(next.pendingBet).toBe(4);
    expect(next.phase).toBe('running');
  });

  it('PLACE_BET is a no-op without a selected exit', () => {
    const state = createInitialState(15);
    const next = gameReducer(state, { type: 'PLACE_BET' });
    expect(next.phase).toBe('setup');
    expect(next.coins).toBe(15);
  });

  it('PLACE_BET is a no-op when the bet exceeds current coins', () => {
    let state = createInitialState(5);
    state = gameReducer(state, { type: 'SELECT_EXIT', id: 2 });
    state = { ...state, betAmount: 999 };
    const next = gameReducer(state, { type: 'PLACE_BET' });
    expect(next.phase).toBe('setup');
    expect(next.coins).toBe(5);
  });

  it('RESOLVE_ROUND credits the payout on a win and records history/stats', () => {
    let state = createInitialState(15);
    state = gameReducer(state, { type: 'SELECT_EXIT', id: 2 }); // odds x2
    state = gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 4 });
    state = gameReducer(state, { type: 'PLACE_BET' }); // coins 15 -> 11, pendingBet 4
    const exit = EXIT_META.find((e) => e.id === 2)!;
    const next = gameReducer(state, { type: 'RESOLVE_ROUND', exit });
    expect(next.phase).toBe('result');
    expect(next.coins).toBe(19); // 11 + 4*2
    expect(next.lastResult).toEqual({ win: true, payout: 8, exitLabel: '출구2' });
    expect(next.exitStats[2]).toBe(1);
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ betLabel: '출구2', actualLabel: '출구2', win: true, payout: 8, bet: 4 });
  });

  it('RESOLVE_ROUND keeps the bet lost on a loss and records history/stats', () => {
    let state = createInitialState(15);
    state = gameReducer(state, { type: 'SELECT_EXIT', id: 2 });
    state = gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 4 });
    state = gameReducer(state, { type: 'PLACE_BET' }); // coins 15 -> 11
    const exit = EXIT_META.find((e) => e.id === 5)!;
    const next = gameReducer(state, { type: 'RESOLVE_ROUND', exit });
    expect(next.coins).toBe(11);
    expect(next.lastResult).toEqual({ win: false, payout: 0, exitLabel: '출구5' });
    expect(next.exitStats[5]).toBe(1);
    expect(next.history[0]).toMatchObject({ betLabel: '출구2', actualLabel: '출구5', win: false, payout: 0, bet: 4 });
  });

  it('RESOLVE_ROUND keeps only the most recent 8 history entries', () => {
    let state = createInitialState(1000);
    const exit = EXIT_META[0];
    for (let i = 0; i < 10; i++) {
      state = gameReducer(state, { type: 'SELECT_EXIT', id: exit.id });
      state = gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 1 });
      state = gameReducer(state, { type: 'PLACE_BET' });
      state = gameReducer(state, { type: 'RESOLVE_ROUND', exit });
      state = gameReducer(state, { type: 'NEXT_ROUND' });
    }
    expect(state.history).toHaveLength(8);
    expect(state.exitStats[exit.id]).toBe(10);
  });

  it('NEXT_ROUND returns to setup and preserves the selected exit', () => {
    let state = createInitialState(15);
    state = gameReducer(state, { type: 'SELECT_EXIT', id: 2 });
    state = gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 4 });
    state = gameReducer(state, { type: 'PLACE_BET' });
    state = gameReducer(state, { type: 'RESOLVE_ROUND', exit: EXIT_META[1] });
    const next = gameReducer(state, { type: 'NEXT_ROUND' });
    expect(next.phase).toBe('setup');
    expect(next.selectedExitId).toBe(2);
  });

  it('REFILL_COINS resets coins and the bet amount', () => {
    let state = createInitialState(15);
    state = { ...state, coins: 0, betAmount: 1 };
    const next = gameReducer(state, { type: 'REFILL_COINS', amount: 15 });
    expect(next.coins).toBe(15);
    expect(next.betAmount).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/gameReducer.test.ts`
Expected: FAIL (module `./gameReducer` does not exist).

- [ ] **Step 3: Write `src/game/gameReducer.ts`**

```ts
import { EXIT_META, STARTING_COINS } from './constants';
import type { GameAction, GameState } from './types';

export function createInitialState(startingCoins: number = STARTING_COINS): GameState {
  return {
    coins: startingCoins,
    selectedExitId: null,
    betAmount: 1,
    phase: 'setup',
    pendingBet: 0,
    lastResult: null,
    exitStats: Object.fromEntries(EXIT_META.map((e) => [e.id, 0])),
    history: [],
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SELECT_EXIT': {
      if (state.phase !== 'setup') return state;
      return { ...state, selectedExitId: action.id };
    }

    case 'SET_BET_AMOUNT': {
      const upperBound = Math.max(state.coins, 1);
      const clamped = Math.max(1, Math.min(action.amount, upperBound));
      return { ...state, betAmount: clamped };
    }

    case 'PLACE_BET': {
      const { phase, selectedExitId, betAmount, coins } = state;
      if (phase !== 'setup' || !selectedExitId || betAmount < 1 || betAmount > coins) {
        return state;
      }
      return {
        ...state,
        coins: coins - betAmount,
        pendingBet: betAmount,
        phase: 'running',
      };
    }

    case 'RESOLVE_ROUND': {
      const { exit } = action;
      const win = state.selectedExitId === exit.id;
      const payout = win ? state.pendingBet * exit.odds : 0;
      const bettingExit = EXIT_META.find((e) => e.id === state.selectedExitId);

      const entry = {
        id: Date.now(),
        betLabel: bettingExit ? bettingExit.label : '-',
        actualLabel: exit.label,
        win,
        payout,
        bet: state.pendingBet,
      };

      return {
        ...state,
        coins: state.coins + payout,
        phase: 'result',
        lastResult: { win, payout, exitLabel: exit.label },
        exitStats: {
          ...state.exitStats,
          [exit.id]: (state.exitStats[exit.id] || 0) + 1,
        },
        history: [entry, ...state.history].slice(0, 8),
      };
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'result') return state;
      return { ...state, phase: 'setup' };
    }

    case 'REFILL_COINS': {
      return { ...state, coins: action.amount, betAmount: 1 };
    }

    default:
      return state;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/gameReducer.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/gameReducer.ts src/game/gameReducer.test.ts
git commit -m "Add game reducer with full round-resolution test coverage"
```

---

### Task 6: localStorage persistence hook (TDD)

**Files:**
- Create: `src/hooks/useLocalStorage.ts`
- Test: `src/hooks/useLocalStorage.test.ts`

**Interfaces:**
- Produces: `useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void]`, consumed by `useGameState` (Task 7).

- [ ] **Step 1: Write the failing tests — `src/hooks/useLocalStorage.test.ts`**

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 42));
    expect(result.current[0]).toBe(42);
  });

  it('persists updates to localStorage and reads them back on next mount', () => {
    const { result, unmount } = renderHook(() => useLocalStorage('test-key', 0));

    act(() => {
      result.current[1](99);
    });
    expect(result.current[0]).toBe(99);
    unmount();

    const { result: result2 } = renderHook(() => useLocalStorage('test-key', 0));
    expect(result2.current[0]).toBe(99);
  });

  it('falls back to the initial value when stored JSON is corrupted', () => {
    window.localStorage.setItem('test-key', 'not json');
    const { result } = renderHook(() => useLocalStorage('test-key', 7));
    expect(result.current[0]).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/hooks/useLocalStorage.test.ts`
Expected: FAIL (module `./useLocalStorage` does not exist).

- [ ] **Step 3: Write `src/hooks/useLocalStorage.ts`**

```ts
import { useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setAndPersist = (next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // localStorage unavailable (private mode / quota) - in-memory state still updates
    }
  };

  return [value, setAndPersist];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useLocalStorage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLocalStorage.ts src/hooks/useLocalStorage.test.ts
git commit -m "Add localStorage persistence hook with tests"
```

---

### Task 7: useGameState hook (reducer + persistence wiring)

**Files:**
- Create: `src/game/useGameState.ts`

**Interfaces:**
- Consumes: `createInitialState`, `gameReducer` (Task 5); `useLocalStorage` (Task 6); `STARTING_COINS`, `EXIT_META` (Task 3).
- Produces: `useGameState(): [GameState, React.Dispatch<GameAction>]`, consumed by `App.tsx` (Task 16).

- [ ] **Step 1: Write `src/game/useGameState.ts`**

```ts
import { useEffect, useReducer } from 'react';
import { createInitialState, gameReducer } from './gameReducer';
import { EXIT_META, STARTING_COINS } from './constants';
import { useLocalStorage } from '../hooks/useLocalStorage';
import type { GameState, HistoryEntry } from './types';

const STORAGE_KEY = 'cockroach-gambling-save-v1';

interface PersistedState {
  coins: number;
  exitStats: Record<number, number>;
  history: HistoryEntry[];
}

function defaultPersisted(): PersistedState {
  return {
    coins: STARTING_COINS,
    exitStats: Object.fromEntries(EXIT_META.map((e) => [e.id, 0])),
    history: [],
  };
}

export function useGameState() {
  const [persisted, setPersisted] = useLocalStorage<PersistedState>(STORAGE_KEY, defaultPersisted());

  const [state, dispatch] = useReducer(
    gameReducer,
    persisted,
    (p): GameState => ({
      ...createInitialState(STARTING_COINS),
      coins: p.coins,
      exitStats: p.exitStats,
      history: p.history,
    })
  );

  useEffect(() => {
    setPersisted({ coins: state.coins, exitStats: state.exitStats, history: state.history });
  }, [state.coins, state.exitStats, state.history]);

  return [state, dispatch] as const;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: exits 0. (`useGameState` is not imported anywhere yet, but it must type-check standalone.)

- [ ] **Step 3: Commit**

```bash
git add src/game/useGameState.ts
git commit -m "Add useGameState hook wiring the reducer to localStorage persistence"
```

---

### Task 8: Bug visual renderer

**Files:**
- Create: `src/game/bugRenderer.ts`

**Interfaces:**
- Produces: `drawBug(ctx: CanvasRenderingContext2D, body: Matter.Body, noiseTime: number): void`, consumed by `usePhysicsEngine` (Task 9).

- [ ] **Step 1: Write `src/game/bugRenderer.ts`**

```ts
import type Matter from 'matter-js';

/**
 * Draws the bug as a capsule body with 6 pairs of wiggling legs and antennae,
 * ported 1:1 from the design prototype's afterRender drawing code. Must not be
 * replaced with a plain circle - the physics collider stays circular, but the
 * visual silhouette is this long many-legged shape.
 */
export function drawBug(ctx: CanvasRenderingContext2D, body: Matter.Body, noiseTime: number): void {
  const bodyLength = 58;
  const bodyWidth = 17;

  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);

  const legPairs = 6;
  const legLen = 16;
  ctx.strokeStyle = '#3a1f1a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < legPairs; i++) {
    const t = (i / (legPairs - 1) - 0.5) * (bodyLength * 0.82);
    const wig = Math.sin(noiseTime * 1.5 + i * 1.1) * 5;
    ctx.beginPath();
    ctx.moveTo(t, -bodyWidth / 2 + 2);
    ctx.lineTo(t - 7, -bodyWidth / 2 - legLen + wig);
    ctx.moveTo(t, bodyWidth / 2 - 2);
    ctx.lineTo(t - 7, bodyWidth / 2 + legLen - wig);
    ctx.stroke();
  }

  ctx.fillStyle = '#5c2a1a';
  ctx.strokeStyle = '#2a1006';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth, bodyWidth / 2);
  } else {
    ctx.rect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth);
  }
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = '#3a1810';
  ctx.arc(bodyLength / 2, 0, bodyWidth * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2a1006';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bodyLength / 2, -3);
  ctx.lineTo(bodyLength / 2 + 11, -11);
  ctx.moveTo(bodyLength / 2, 3);
  ctx.lineTo(bodyLength / 2 + 11, 11);
  ctx.stroke();

  ctx.restore();
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/game/bugRenderer.ts
git commit -m "Port bug capsule+legs+antennae canvas renderer"
```

---

### Task 9: Physics engine hook (Matter.js integration)

**Files:**
- Create: `src/game/usePhysicsEngine.ts`

**Interfaces:**
- Consumes: `WIDTH`, `HEIGHT`, `PLANK_LENGTH`, `PLANK_THICK`, `BOARD_DATA`, `EXIT_META`, `WALL_RECTS`, `BUG_SPEED` (Task 3); `computePivotOffset` (Task 4); `drawBug` (Task 8); `Phase`, `ExitMeta` (Task 3).
- Produces: `usePhysicsEngine(options: { containerRef: RefObject<HTMLDivElement>; phase: Phase; onEscape: (exit: ExitMeta) => void }): void`, consumed by `BoardCanvas` (Task 10).

This hook owns the entire physics/render lifecycle: it mounts a Matter `Engine` + `Render` + `Runner` once into `containerRef.current`, builds the static walls/planks/exit-sensor bodies and the bug body, wires plank-click-to-rotate, and drives the bug's forward force / wobble / anti-stuck / exit-detection logic every tick. `noiseTime`, `stuckTimer`, and `isPlaying` are kept in refs, never React state. When `phase` transitions into `'running'`, the bug is reset to board center with a random facing angle and released.

- [ ] **Step 1: Write `src/game/usePhysicsEngine.ts`**

```ts
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import Matter from 'matter-js';
import {
  WIDTH,
  HEIGHT,
  PLANK_LENGTH,
  PLANK_THICK,
  BOARD_DATA,
  EXIT_META,
  WALL_RECTS,
  BUG_SPEED,
} from './constants';
import { computePivotOffset } from './pivot';
import { drawBug } from './bugRenderer';
import type { ExitMeta, Phase } from './types';

const { Engine, Render, Runner, Bodies, Composite, Body, Vector, Events, Bounds } = Matter;

interface UsePhysicsEngineOptions {
  containerRef: RefObject<HTMLDivElement>;
  phase: Phase;
  onEscape: (exit: ExitMeta) => void;
}

export function usePhysicsEngine({ containerRef, phase, onEscape }: UsePhysicsEngineOptions): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const prevPhaseRef = useRef<Phase>(phase);
  const bugRef = useRef<Matter.Body | null>(null);
  const isPlayingRef = useRef(false);
  const noiseTimeRef = useRef(0);
  const stuckTimerRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = Engine.create({ gravity: { x: 0, y: 0 } });

    const render = Render.create({
      element: container,
      engine,
      options: { width: WIDTH, height: HEIGHT, wireframes: false, background: '#4a3525' },
    });
    Render.run(render);
    render.canvas.style.width = '100%';
    render.canvas.style.height = '100%';

    const runner = Runner.create();
    Runner.run(runner, engine);

    const wallOptions = {
      isStatic: true,
      render: { fillStyle: '#2b1d11' },
      friction: 0,
      restitution: 0.5,
    };
    const walls = WALL_RECTS.map((w) => Bodies.rectangle(w.x, w.y, w.width, w.height, wallOptions));
    Composite.add(engine.world, walls);

    const exitSensors = EXIT_META.map((meta) =>
      Bodies.rectangle(meta.side === 'left' ? -5 : WIDTH + 5, meta.y, 40, 110, {
        isStatic: true,
        isSensor: true,
        render: { fillStyle: '#1a1a1a', strokeStyle: '#ffcc00', lineWidth: 1 },
      })
    );
    Composite.add(engine.world, exitSensors);

    const planks = BOARD_DATA.map((data) => {
      const angle = data.state === 1 ? Math.PI / 2 : 0;
      const plank = Bodies.rectangle(data.x, data.y, PLANK_THICK, PLANK_LENGTH, {
        isStatic: true,
        angle,
        friction: 0,
        restitution: 0.4,
        render: { fillStyle: '#8b7355', strokeStyle: '#5c4033', lineWidth: 2 },
      });
      const worldOffset = computePivotOffset(angle);
      Body.setCentre(plank, worldOffset, true);
      return plank;
    });
    Composite.add(engine.world, planks);

    const bug = Bodies.circle(WIDTH / 2, HEIGHT / 2, 14, {
      friction: 0,
      frictionAir: 0,
      restitution: 0.5,
      render: { visible: false },
    });
    Composite.add(engine.world, bug);
    bugRef.current = bug;

    Events.on(render, 'afterRender', () => {
      drawBug(render.context, bug, noiseTimeRef.current);
    });

    Events.on(engine, 'beforeUpdate', () => {
      if (!isPlayingRef.current) return;

      const angle = bug.angle;
      Body.applyForce(bug, bug.position, {
        x: Math.sin(angle) * BUG_SPEED,
        y: -Math.cos(angle) * BUG_SPEED,
      });

      noiseTimeRef.current += 0.25;
      const wobble = Math.sin(noiseTimeRef.current) * Math.cos(noiseTimeRef.current * 0.8) * 0.035;
      Body.setAngularVelocity(bug, bug.angularVelocity + wobble);

      if (Vector.magnitude(bug.velocity) < 0.5) {
        stuckTimerRef.current++;
        if (stuckTimerRef.current > 40) {
          Body.setAngle(bug, bug.angle + Math.PI + (Math.random() - 0.5));
          Body.setVelocity(bug, { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5 });
          stuckTimerRef.current = 0;
        }
      } else {
        stuckTimerRef.current = 0;
      }

      exitSensors.forEach((sensor, i) => {
        if (Bounds.contains(sensor.bounds, bug.position)) {
          isPlayingRef.current = false;
          Body.setVelocity(bug, { x: 0, y: 0 });
          onEscapeRef.current(EXIT_META[i]);
        }
      });
    });

    render.canvas.addEventListener('click', (e) => {
      if (phaseRef.current !== 'setup') return;
      const rect = render.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (WIDTH / rect.width);
      const my = (e.clientY - rect.top) * (HEIGHT / rect.height);
      planks.forEach((plank) => {
        if (Bounds.contains(plank.bounds, { x: mx, y: my })) {
          Body.setAngle(plank, plank.angle + Math.PI / 2);
        }
      });
    });

    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Engine.clear(engine);
      render.canvas.remove();
    };
  }, [containerRef]);

  useEffect(() => {
    if (phase === 'running' && prevPhaseRef.current !== 'running') {
      const bug = bugRef.current;
      if (bug) {
        Body.setPosition(bug, { x: WIDTH / 2, y: HEIGHT / 2 });
        Body.setAngle(bug, Math.random() * Math.PI * 2);
        Body.setVelocity(bug, { x: 0, y: 0 });
        noiseTimeRef.current = 0;
        stuckTimerRef.current = 0;
        isPlayingRef.current = true;
      }
    }
    prevPhaseRef.current = phase;
  }, [phase]);
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/game/usePhysicsEngine.ts
git commit -m "Add Matter.js physics engine hook (walls, planks, exits, bug behavior)"
```

---

### Task 10: ResultModal and BoardCanvas components

**Files:**
- Create: `src/components/ResultModal.tsx`
- Create: `src/components/BoardCanvas.tsx`

**Interfaces:**
- Consumes: `usePhysicsEngine` (Task 9); `LastResult`, `Phase`, `ExitMeta` (Task 3); CSS classes `.board-stage`, `.board-canvas`, `.running-pill`, `.result-overlay`, `.result-card*`, `.result-next-btn` (Task 2).
- Produces: `<BoardCanvas phase={Phase} onEscape={(exit: ExitMeta) => void} lastResult={LastResult | null} pendingBet={number} onNextRound={() => void} />`, consumed by `App.tsx` (Task 16).

- [ ] **Step 1: Write `src/components/ResultModal.tsx`**

```tsx
import type { LastResult } from '../game/types';

interface ResultModalProps {
  visible: boolean;
  result: LastResult | null;
  pendingBet: number;
  onNext: () => void;
}

export function ResultModal({ visible, result, pendingBet, onNext }: ResultModalProps) {
  if (!visible || !result) return null;

  const title = result.win ? '적중!' : '탈락';
  const titleColor = result.win ? '#5fb8b0' : '#c96a63';
  const payoutLabel = result.win ? `+${result.payout}` : `-${pendingBet}`;

  return (
    <div className="result-overlay">
      <div className="result-card">
        <h2 style={{ color: titleColor }}>{title}</h2>
        <div className="result-exit">
          벌레가 <b>{result.exitLabel}</b>(으)로 탈출
        </div>
        <div className="result-payout" style={{ color: titleColor }}>
          {payoutLabel}
        </div>
        <button type="button" className="result-next-btn" onClick={onNext}>
          다음 라운드
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/BoardCanvas.tsx`**

```tsx
import { useRef } from 'react';
import { usePhysicsEngine } from '../game/usePhysicsEngine';
import { ResultModal } from './ResultModal';
import type { ExitMeta, LastResult, Phase } from '../game/types';

interface BoardCanvasProps {
  phase: Phase;
  onEscape: (exit: ExitMeta) => void;
  lastResult: LastResult | null;
  pendingBet: number;
  onNextRound: () => void;
}

export function BoardCanvas({ phase, onEscape, lastResult, pendingBet, onNextRound }: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  usePhysicsEngine({ containerRef, phase, onEscape });

  return (
    <div className="board-stage">
      <div ref={containerRef} className="board-canvas" />
      {phase === 'running' && <div className="running-pill">벌레 이동 중...</div>}
      <ResultModal visible={phase === 'result'} result={lastResult} pendingBet={pendingBet} onNext={onNextRound} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/ResultModal.tsx src/components/BoardCanvas.tsx
git commit -m "Add ResultModal and BoardCanvas components"
```

---

### Task 11: ExitColumn and Header components

**Files:**
- Create: `src/components/ExitColumn.tsx`
- Create: `src/components/Header.tsx`

**Interfaces:**
- Consumes: `ExitMeta`, `Phase` (Task 3); CSS classes `.exit-column`, `.exit-chip*`, `.app-header*`, `.phase-pill`, `.coin-pill*`, `.refill-btn` (Task 2).
- Produces: `<ExitColumn exits={ExitMeta[]} selectedExitId={number | null} phase={Phase} onSelect={(id: number) => void} />` and `<Header phase={Phase} coins={number} onRefill={() => void} />`, consumed by `App.tsx` (Task 16).

- [ ] **Step 1: Write `src/components/ExitColumn.tsx`**

```tsx
import type { ExitMeta, Phase } from '../game/types';

interface ExitColumnProps {
  exits: ExitMeta[];
  selectedExitId: number | null;
  phase: Phase;
  onSelect: (id: number) => void;
}

export function ExitColumn({ exits, selectedExitId, phase, onSelect }: ExitColumnProps) {
  return (
    <div className="exit-column">
      {exits.map((exit) => {
        const selected = selectedExitId === exit.id;
        return (
          <button
            key={exit.id}
            type="button"
            className={`exit-chip${selected ? ' exit-chip--selected' : ''}`}
            style={{ top: `calc(${exit.y} / 1000 * 100% - 24px)` }}
            disabled={phase !== 'setup'}
            onClick={() => onSelect(exit.id)}
          >
            <span className="exit-chip__label">{exit.label}</span>
            <span className="exit-chip__odds">x{exit.odds}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/Header.tsx`**

```tsx
import type { Phase } from '../game/types';

interface HeaderProps {
  phase: Phase;
  coins: number;
  onRefill: () => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  setup: '베팅 대기',
  running: '진행 중',
  result: '결과',
};

export function Header({ phase, coins, onRefill }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__titles">
        <span className="app-header__title">바퀴벌레 도박판</span>
        <span className="app-header__subtitle">출구를 골라 베팅하고, 벌레를 출발시키세요</span>
      </div>
      <div className="app-header__controls">
        <span className="phase-pill">{PHASE_LABEL[phase]}</span>
        <div className="coin-pill">
          <span className="coin-pill__label">코인</span>
          <span className="coin-pill__value">{coins}</span>
        </div>
        <button type="button" className="refill-btn" onClick={onRefill}>
          코인 리필
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/ExitColumn.tsx src/components/Header.tsx
git commit -m "Add ExitColumn and Header components"
```

---

### Task 12: BettingPanel component

**Files:**
- Create: `src/components/BettingPanel.tsx`

**Interfaces:**
- Consumes: `ExitMeta`, `Phase` (Task 3); CSS classes `.card`, `.card__title`, `.betting-panel*`, `.bet-stepper*`, `.bet-cta` (Task 2).
- Produces: `<BettingPanel coins={number} selectedExit={ExitMeta | null} betAmount={number} phase={Phase} onIncBet={() => void} onDecBet={() => void} onPlaceBet={() => void} />`, consumed by `App.tsx` (Task 16).

- [ ] **Step 1: Write `src/components/BettingPanel.tsx`**

```tsx
import type { ExitMeta, Phase } from '../game/types';

interface BettingPanelProps {
  coins: number;
  selectedExit: ExitMeta | null;
  betAmount: number;
  phase: Phase;
  onIncBet: () => void;
  onDecBet: () => void;
  onPlaceBet: () => void;
}

export function BettingPanel({
  coins,
  selectedExit,
  betAmount,
  phase,
  onIncBet,
  onDecBet,
  onPlaceBet,
}: BettingPanelProps) {
  const betDisabled = phase !== 'setup' || !selectedExit || betAmount < 1 || betAmount > coins || coins < 1;
  const gameOver = coins < 1 && phase === 'setup';
  const betButtonLabel =
    phase === 'running' ? '진행 중...' : phase === 'result' ? '결과 확인 중' : '베팅하고 출발!';
  const potentialWin = selectedExit ? betAmount * selectedExit.odds : 0;

  return (
    <section className="card betting-panel">
      <div className="card__title">베팅</div>
      <div className="betting-panel__selection">
        선택한 출구:{' '}
        {selectedExit ? (
          <b className="betting-panel__selection-value">
            {selectedExit.label} (x{selectedExit.odds})
          </b>
        ) : (
          <span className="betting-panel__hint">판 옆의 출구를 클릭해 선택하세요</span>
        )}
      </div>

      <div className="bet-stepper">
        <span className="bet-stepper__label">베팅 코인</span>
        <div className="bet-stepper__controls">
          <button type="button" onClick={onDecBet} disabled={phase !== 'setup'}>
            −
          </button>
          <span className="bet-stepper__value">{betAmount}</span>
          <button type="button" onClick={onIncBet} disabled={phase !== 'setup'}>
            +
          </button>
        </div>
      </div>

      <div className="betting-panel__potential">
        예상 수익: 적중 시 <b>{potentialWin}</b> 코인
      </div>

      <button type="button" className="bet-cta" disabled={betDisabled} onClick={onPlaceBet}>
        {betButtonLabel}
      </button>

      {gameOver && (
        <div className="betting-panel__gameover">코인이 부족합니다. 상단의 '코인 리필'을 눌러 계속하세요.</div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/BettingPanel.tsx
git commit -m "Add BettingPanel component"
```

---

### Task 13: StatsPanel and HistoryPanel components

**Files:**
- Create: `src/components/StatsPanel.tsx`
- Create: `src/components/HistoryPanel.tsx`

**Interfaces:**
- Consumes: `EXIT_META` (Task 3); `HistoryEntry` (Task 3); CSS classes `.card`, `.stats-*`, `.history-*` (Task 2).
- Produces: `<StatsPanel exitStats={Record<number, number>} />` and `<HistoryPanel history={HistoryEntry[]} />`, consumed by `App.tsx` (Task 16).

- [ ] **Step 1: Write `src/components/StatsPanel.tsx`**

```tsx
import { EXIT_META } from '../game/constants';

interface StatsPanelProps {
  exitStats: Record<number, number>;
}

export function StatsPanel({ exitStats }: StatsPanelProps) {
  const counts = EXIT_META.map((e) => exitStats[e.id] ?? 0);
  const maxStat = Math.max(1, ...counts);

  return (
    <section className="card stats-panel">
      <div className="card__title">출구별 누적 통계</div>
      <div className="stats-panel__bars">
        {EXIT_META.map((exit) => {
          const count = exitStats[exit.id] ?? 0;
          const pct = Math.round((count / maxStat) * 100);
          return (
            <div key={exit.id} className="stats-bar">
              <span className="stats-bar__label">{exit.label}</span>
              <div className="stats-bar__track">
                <div className="stats-bar__fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="stats-bar__count">{count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Write `src/components/HistoryPanel.tsx`**

```tsx
import type { HistoryEntry } from '../game/types';

interface HistoryPanelProps {
  history: HistoryEntry[];
}

export function HistoryPanel({ history }: HistoryPanelProps) {
  return (
    <section className="card history-panel">
      <div className="card__title">최근 결과</div>
      {history.length > 0 ? (
        <div className="history-panel__rows">
          {history.map((h) => (
            <div key={h.id} className={`history-row${h.win ? ' history-row--win' : ' history-row--loss'}`}>
              <span className="history-row__icon">{h.win ? '▲' : '▼'}</span>
              <span className="history-row__label">
                {h.betLabel} → {h.actualLabel}
              </span>
              <span className="history-row__delta">{h.win ? `+${h.payout}` : `-${h.bet}`}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="history-panel__empty">아직 라운드 기록이 없습니다.</div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/StatsPanel.tsx src/components/HistoryPanel.tsx
git commit -m "Add StatsPanel and HistoryPanel components"
```

---

### Task 14: Wire App.tsx (full gameplay loop)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useGameState` (Task 7); `Header` (Task 11); `ExitColumn` (Task 11); `BoardCanvas` (Task 10); `BettingPanel` (Task 12); `StatsPanel`, `HistoryPanel` (Task 13); `EXIT_META`, `STARTING_COINS` (Task 3); CSS classes `.app-shell`, `.app-body`, `.board-row`, `.side-panel`, `.hint-caption` (Task 2).

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { useGameState } from './game/useGameState';
import { EXIT_META, STARTING_COINS } from './game/constants';
import { Header } from './components/Header';
import { ExitColumn } from './components/ExitColumn';
import { BoardCanvas } from './components/BoardCanvas';
import { BettingPanel } from './components/BettingPanel';
import { StatsPanel } from './components/StatsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import type { ExitMeta } from './game/types';

const LEFT_EXITS = EXIT_META.filter((e) => e.side === 'left');
const RIGHT_EXITS = EXIT_META.filter((e) => e.side === 'right');

function App() {
  const [state, dispatch] = useGameState();
  const selectedExit = EXIT_META.find((e) => e.id === state.selectedExitId) ?? null;

  const handleEscape = (exit: ExitMeta) => {
    dispatch({ type: 'RESOLVE_ROUND', exit });
  };

  return (
    <div className="app-shell">
      <Header
        phase={state.phase}
        coins={state.coins}
        onRefill={() => dispatch({ type: 'REFILL_COINS', amount: STARTING_COINS })}
      />

      <div className="app-body">
        <div className="board-row">
          <ExitColumn
            exits={LEFT_EXITS}
            selectedExitId={state.selectedExitId}
            phase={state.phase}
            onSelect={(id) => dispatch({ type: 'SELECT_EXIT', id })}
          />
          <BoardCanvas
            phase={state.phase}
            onEscape={handleEscape}
            lastResult={state.lastResult}
            pendingBet={state.pendingBet}
            onNextRound={() => dispatch({ type: 'NEXT_ROUND' })}
          />
          <ExitColumn
            exits={RIGHT_EXITS}
            selectedExitId={state.selectedExitId}
            phase={state.phase}
            onSelect={(id) => dispatch({ type: 'SELECT_EXIT', id })}
          />
        </div>

        <div className="side-panel">
          <BettingPanel
            coins={state.coins}
            selectedExit={selectedExit}
            betAmount={state.betAmount}
            phase={state.phase}
            onIncBet={() => dispatch({ type: 'SET_BET_AMOUNT', amount: state.betAmount + 1 })}
            onDecBet={() => dispatch({ type: 'SET_BET_AMOUNT', amount: state.betAmount - 1 })}
            onPlaceBet={() => dispatch({ type: 'PLACE_BET' })}
          />
          <StatsPanel exitStats={state.exitStats} />
          <HistoryPanel history={state.history} />
          <p className="hint-caption">
            판 위의 나무 판자를 클릭하면 가로/세로로 회전합니다 (베팅 전에만 가능).
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Verify the full test suite still passes**

Run: `npm run test`
Expected: exits 0, all previously-written tests (pivot, gameReducer, useLocalStorage) still PASS.

- [ ] **Step 4: Manual verification in the browser**

Run: `npm run dev`, open the printed local URL.

Check by hand:
- The wood board renders with 15 tan planks and the dark wall frame.
- Clicking a plank rotates it 90° around its off-center pivot (the plank visibly swings around one end, not its middle).
- Clicking an exit chip highlights it (teal border/glow).
- The bet stepper respects `[1, coins]` bounds.
- Pressing "베팅하고 출발!" starts the bug moving from center with legs wiggling; the "벌레 이동 중..." pill pulses.
- When the bug reaches an exit, the result modal shows "적중!" or "탈락" with the correct payout, and history/stats update.
- "다음 라운드" returns to setup; plank rotations from before the round are still in place.
- "코인 리필" resets coins to 15.
- Resize the browser window below ~900px width: the side panel stacks below the board instead of beside it, and the board shrinks without losing click accuracy.
- Reload the page: coins/stats/history persist; plank rotations reset to the default layout.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "Wire full gameplay loop in App.tsx"
```

---

### Task 15: Firebase Hosting setup and deploy

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc` (generated by `firebase init`, committed after)

**Interfaces:**
- Consumes: `dist/` output of `npm run build` (Task 1 script).

This task requires an interactive one-time setup with the Firebase CLI under the developer's own Google account, so the steps below are CLI prompts/answers rather than files to author blindly. Confirm with the user before running the actual `firebase deploy` (per the spec: "배포 실행 자체는 구현 완료 후 사용자 확인을 받고 진행한다").

- [ ] **Step 1: Install the Firebase CLI if not already available**

Run: `npm install -g firebase-tools`
Expected: exits 0. Verify with `firebase --version` (any 13.x or later is fine).

- [ ] **Step 2: Log in**

Run: `firebase login`
Expected: opens a browser window for Google account login; terminal prints "Success! Logged in as <email>".

- [ ] **Step 3: Initialize Hosting**

Run: `firebase init hosting` from the project root and answer the prompts:
- "Please select an option" → **Create a new project**
- Project name/ID → choose a unique id, e.g. `cockroach-gambling-board` (append digits if taken)
- "What do you want to use as your public directory?" → `dist`
- "Configure as a single-page app (rewrite all urls to /index.html)?" → **Yes**
- "Set up automatic builds and deploys with GitHub?" → **No**
- "File dist/index.html already exists. Overwrite?" (only if `dist/` exists from a prior build) → **No**

Expected: creates `firebase.json` and `.firebaserc` in the project root.

- [ ] **Step 4: Verify the generated `firebase.json` matches this shape**

Open `firebase.json` and confirm it looks like:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

If the CLI generated something materially different (e.g. missing the rewrite rule), edit it to match — the SPA rewrite is required or client-side routing/refresh on any URL other than `/` will 404.

- [ ] **Step 5: Build and deploy (confirm with the user first)**

Run: `npm run build`
Expected: exits 0, refreshes `dist/`.

Ask the user to confirm before running the next command (it publishes a public URL).

Run: `firebase deploy --only hosting`
Expected: exits 0, prints a Hosting URL like `https://<project-id>.web.app`.

- [ ] **Step 6: Verify the deployed site loads**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://<project-id>.web.app` (substitute the real project id from Step 5's output)
Expected: prints `200`.

- [ ] **Step 7: Commit the Firebase config**

```bash
git add firebase.json .firebaserc
git commit -m "Add Firebase Hosting configuration"
```

---

## Self-Review Notes

- **Spec coverage:** board/plank/pivot data (Task 3, 4), exit sensors + escape detection (Task 9), bug physics + visual (Task 8, 9), betting/history/stats state machine (Task 5), localStorage persistence for coins/exitStats/history only — not plank rotation (Task 6, 7), responsive layout (Task 2), dark theme tokens vs. literal board palette (Task 2, 9), Firebase Hosting deploy (Task 15) — all covered.
- **Type consistency:** `ExitMeta`, `Phase`, `GameState`, `GameAction`, `HistoryEntry`, `LastResult` defined once in Task 3 and reused verbatim (same names/shapes) through every later task; `gameReducer`/`createInitialState` (Task 5), `useLocalStorage` (Task 6), `useGameState` (Task 7), `drawBug` (Task 8), `usePhysicsEngine` (Task 9) signatures match how they're called in Task 10 and Task 14.
- **No placeholders:** every step contains complete, runnable code or exact CLI commands with expected output; Task 15's CLI prompts are genuinely interactive (project creation/login) rather than a disguised TBD.
