# Handoff: 바퀴벌레 도박판 (Cockroach Gambling Board)

## Overview
A single-player gambling prototype inspired by the board game "La Cucaracha," built on top of a **real physical wood board** the user owns. The board has 15 rotatable wooden planks embedded in slots; before each round the player freely rotates planks (vertical ↔ horizontal) to shape the maze, then bets coins on which of 6 side exits a bug will escape through. The bug is released, physics carries it through the maze, and whichever exit it reaches settles the bet against that exit's payout odds.

## About the Design Files
The bundled file is a **design reference prototype built in HTML** (using Matter.js for 2D physics), not production code to copy verbatim. The task is to **recreate this design and its behavior in the target codebase's existing environment** (React Native, native iOS/Android, Unity, a web stack, etc.) using that codebase's established patterns, physics/animation libraries, and component conventions — or, if no environment/stack exists yet, choose the most appropriate one for a small physics-based single-player casino-style game and implement it there.

The prototype is authored in a proprietary component template format (`{{ }}` template holes, `<sc-for>`/`<sc-if>` loop/conditional tags, a `DCLogic` class with a `renderVals()` method) used only by this design tool. **Do not attempt to run or import this format as-is** — read it as pseudocode/reference for structure, state, and behavior, then reimplement using plain JS/TS + your framework of choice. The inline `<script>` at the bottom of the file (`class Component extends DCLogic`) contains the entire physics + game-logic implementation and is the most important part to port faithfully.

## Fidelity
**High-fidelity for the board/plank layout and physics; mid-fidelity for the surrounding UI chrome.**
- The board dimensions, all 15 plank positions/sizes, the off-center rotation pivot, and the 6 exit sensor positions were digitized pixel-by-pixel from photos of the user's physical board and should be treated as exact, load-bearing data — do not "clean up" or re-space them.
- The betting panel, stats panel, history panel, and header are a reasonable first-pass UI in a dark theme borrowed from this project's existing design system; the developer should feel free to restyle these to fit the target app's design system, as long as the functional structure (bet flow, exit selection, coin balance, stats, history) is preserved.

## The Board (exact reference data — reuse as-is)

All coordinates live in a **1000 × 1000 logical unit square** representing the board's inner playing surface (this maps to a 560×560px canvas in the prototype via pure CSS scaling — the physics/logic coordinate space itself must stay 1000×1000 so hit-testing and photo-fidelity are preserved).

### Planks (15 total)
Each plank is a rectangle `PLANK_THICK` (56 units) × `PLANK_LENGTH` (169 units), static (does not move on its own), that the player can rotate 90° by clicking/tapping it during the betting/setup phase only.

```js
const PLANK_LENGTH = 169, PLANK_THICK = 56;
const PIVOT_OFFSET = 9; // see "Off-center pivot" below

const BOARD_DATA = [
  { x: 128, y: 110, state: 0 }, { x: 511, y: 107, state: 0 }, { x: 883, y: 105, state: 1 },
  { x: 408, y: 296, state: 0 }, { x: 787, y: 296, state: 0 },
  { x: 128, y: 494, state: 0 }, { x: 301, y: 497, state: 0 }, { x: 694, y: 494, state: 1 }, { x: 888, y: 494, state: 1 },
  { x: 222, y: 705, state: 0 }, { x: 399, y: 705, state: 0 }, { x: 785, y: 702, state: 1 },
  { x: 128, y: 911, state: 0 }, { x: 701, y: 911, state: 0 }, { x: 888, y: 911, state: 0 }
];
// state 0 = vertical (angle 0), state 1 = horizontal (angle 90°/PI/2)
// x,y = the plank's geometric center in its default (state 0, vertical) orientation
```

### Off-center pivot (important, easy to get wrong)
On the real board, each plank pivots on a hinge/crossbar slot that sits **off the plank's visual center** — measured at ~9 units off-center out of the 169-unit length (i.e. one arm is noticeably longer than the other). When a plank rotates 90°, it must swing around this true pivot point, not around its own geometric middle, or the rotated position won't match the physical board.

Reference implementation (Matter.js): create the rectangle centered at the plank's default geometric center as normal, then shift only the body's center-of-mass/rotation-origin (not its drawn geometry) toward the pivot:
```js
const angle = data.state === 1 ? Math.PI / 2 : 0;
const plank = Bodies.rectangle(data.x, data.y, PLANK_THICK, PLANK_LENGTH, { isStatic: true, angle, ... });
const cos = Math.cos(angle), sin = Math.sin(angle);
const localOffset = { x: 0, y: -PIVOT_OFFSET }; // pivot is 9 units toward the "top" in local/unrotated space
const worldOffset = { x: localOffset.x*cos - localOffset.y*sin, y: localOffset.x*sin + localOffset.y*cos };
Body.setCentre(plank, worldOffset, true); // moves rotation origin only, geometry stays put
```
In whatever physics/animation system the target stack uses, replicate this as: "rotate each plank 90° around a point offset 9 units from its center along its own length axis," not around its bounding-box center.

### Exits (6 total — where the bug can escape)
Exit sensors sit just outside the left/right walls at three heights each:
```js
const EXIT_Y = [200, 500, 800]; // same 3 heights used on both sides
// left exits sit at x = -5, right exits at x = WIDTH + 5 (i.e. WIDTH=1000)
// each exit sensor is 40 (width) x 110 (height, along the wall)
```
Exit metadata (labels/odds are game-design choices, freely adjustable):
```js
const EXIT_META = [
  { id: 1, side: 'left',  y: 200, label: '출구1', odds: 3 },
  { id: 2, side: 'left',  y: 500, label: '출구2', odds: 2 },
  { id: 3, side: 'left',  y: 800, label: '출구3', odds: 4 },
  { id: 4, side: 'right', y: 200, label: '출구4', odds: 3 },
  { id: 5, side: 'right', y: 500, label: '출구5', odds: 2 },
  { id: 6, side: 'right', y: 800, label: '출구6', odds: 6 },
];
```

### Walls
Board is 1000×1000. Top/bottom are solid 26-unit-thick bars spanning the full width. Left/right walls are each split into 4 solid segments with 3 gaps (the exits) between them:
```js
// top/bottom
Bodies.rectangle(500, 13, 1000, 26, wallOptions);
Bodies.rectangle(500, 987, 1000, 26, wallOptions);
// left wall segments (x=13): y-center/height pairs
[[72,118], [350,188], [650,188], [928,118]].forEach(([y,h]) => Bodies.rectangle(13, y, 26, h, wallOptions));
// right wall segments (x=987): identical y/height pairs
[[72,118], [350,188], [650,188], [928,118]].forEach(([y,h]) => Bodies.rectangle(987, y, 26, h, wallOptions));
```

### The bug
- Physics collider: a simple circle, radius 14, frictionless, `restitution: 0.5`, centered at board center `(500,500)` at the start of each round, given a random starting angle.
- Visual: **do not use a plain circle for the visual.** Drawn as an elongated capsule body (58 long × 17 wide) with 6 pairs of legs (each leg a short line from the body edge outward, with a per-frame sine-wave "wiggle" for a walking effect) and two antennae at the front. See the `afterRender` drawing code in the bundled file for exact proportions — port the same silhouette (long body, many legs, antennae) rather than reusing a simple shape.
- Movement each physics tick while running: apply a small forward force along the bug's current facing angle (`bugSpeed`, default **0.0032**, tunable range 0.0015–0.008 — this was deliberately slowed down from an earlier faster default of 0.006 per user request), plus a small angular "wobble" (`sin(t)*cos(0.8t)*0.035` added to angular velocity every tick) so it doesn't travel in a perfectly straight line.
- Anti-stuck rule: if the bug's velocity magnitude stays under 0.5 for more than 40 ticks (i.e. it's wedged in a corner), flip its angle ~180° (± some randomness) and give it a small random kick, then reset the stuck timer.
- Escape detection: every tick, test the bug's position against all 6 exit sensor bounds; the first one it enters ends the round.

## Screens / Views
There is one screen with three phases (`setup` → `running` → `result`, looping back to `setup`).

### Header
- Left: title "바퀴벌레 도박판" + subtitle "출구를 골라 베팅하고, 벌레를 출발시키세요".
- Right: a phase pill (베팅 대기 / 진행 중 / 결과), a coin balance pill, and a "코인 리필" (refill coins) button that resets the balance to the starting amount (default 15) at any time — a dev/test convenience, keep or gate behind a debug flag as appropriate for production.

### Main board area
Layout: `[left exit column (100px)] [board canvas, 560×560] [right exit column (100px)]`, all vertically centered as one row.
- Each exit column stacks its 3 exits absolutely positioned by `(y/1000)*560 - 24` px from the top of the column, so they visually line up with the exit's height on the board.
- Each exit chip shows its label (출구N) and payout odds (×N), is clickable only during `setup`, and highlights (teal border + soft glow + tinted background) when selected.
- The board itself is the physics canvas (see "The Board" above). Planks are clickable/tappable only during `setup` to rotate 90°.
- During `running`, a floating pill "벌레 이동 중..." pulses at the top of the board.
- During `result`, a modal overlay covers the board: shows "적중!" (win, teal) or "탈락" (loss, red), which exit the bug escaped through, the payout/loss amount, and a "다음 라운드" button that returns to `setup` (keeping current plank rotations).

### Side panel (320px column, stacked top to bottom)
1. **베팅 (Betting) card** — shows the selected exit + its odds (or a prompt to pick one), a coin stepper (−/+, min 1, max = current coin balance), a computed "예상 수익" (potential payout = bet × odds), and the main CTA button ("베팅하고 출발!" → disabled/relabeled during running/result), plus a low-coins warning when balance hits 0.
2. **출구별 누적 통계 (Per-exit stats) card** — one horizontal bar per exit (6 total) showing how many times the bug has actually escaped through it so far this session, normalized against the max.
3. **최근 결과 (Recent history) card** — up to the last 8 rounds, each row showing bet exit → actual exit, a ▲/▼ icon, and the coin delta (+payout or −bet), color-coded teal/red for win/loss. Falls back to "아직 라운드 기록이 없습니다." when empty.
4. A small caption: "판 위의 나무 판자를 클릭하면 가로/세로로 회전합니다 (베팅 전에만 가능)."

## Interactions & Behavior
- **Rotate a plank**: click/tap anywhere on a plank while `phase === 'setup'` → rotate it 90° in place around its true pivot (see above). No effect during `running`/`result`.
- **Select an exit**: click/tap an exit chip while `phase === 'setup'` → sets it as the bet target (only one at a time).
- **Adjust bet**: +/− stepper, clamped to `[1, coins]`.
- **Place bet**: requires an exit selected, `betAmount` between 1 and current coins, and `phase === 'setup'`. On press: deduct `betAmount` from coins immediately (escrow), reset the bug to board center with a random facing angle, and start the physics simulation (`phase → running`).
- **Round resolution**: first exit sensor the bug touches ends the round. Win = selected exit id matches the actual exit id; payout = `bet × that exit's odds`, credited back to coins. Loss = bet stays deducted, no payout. Either way: record one row in history (max 8 kept), increment that exit's lifetime stat counter, `phase → result`.
- **Next round**: "다음 라운드" button closes the result modal and returns to `setup`. Plank rotations persist between rounds (players can keep re-adjusting the maze each round).
- **Coin refill**: available any time, resets balance to the starting amount — intended as a test/dev affordance; consider gating or removing for a real-money or persistent-currency production version.
- No animation/transition durations beyond simple CSS: exit-chip highlight transitions (`box-shadow`/`border-color`, 0.15s), a small modal pop-in keyframe (`scale 0.92→1`, 0.18s ease), and a pulsing "이동 중" pill (1s ease loop).

## State Management
Session/component state (resets on page reload — nothing is persisted to storage in this prototype):
- `coins` (number, starts at `startingCoins` prop, default 15)
- `selectedExitId` (1–6 or null)
- `betAmount` (number ≥ 1)
- `phase`: `'setup' | 'running' | 'result'`
- `pendingBet` (the bet amount escrowed for the round currently in flight)
- `lastResult`: `{ win: boolean, payout: number, exitLabel: string } | null`
- `exitStats`: `{ [exitId: 1-6]: number }` — lifetime escape counts per exit
- `history`: array of up to 8 `{ id, betLabel, actualLabel, win, payout, bet }`, newest first

Two values live outside React/component state for performance (they change every physics tick and shouldn't trigger re-renders): `isPlaying` (bool), `noiseTime`/`stuckTimer` (wobble/anti-stuck counters). Treat these as internal-to-the-physics-loop, not UI state, in your reimplementation too.

If you want persistence (recommended for a real product): persist `exitStats` and `history` to local storage or a backend; `coins` persistence is a product decision (does the player's balance carry across sessions, or reset each visit?).

## Design Tokens
Dark theme (background chrome), reused from this project's existing design system — the wood/steel board itself uses its own literal photo-matched palette and should NOT be restyled to the dark theme:

**UI chrome:**
- Page background: `#0f0f12`
- Card background: `#15181c`
- Recessed/input background: `#1c2024`, `#242a30`
- Primary text: `#e7ebee`
- Secondary/muted text: `#8992a0`, `#66707c`, `#4c545e`
- Accent teal: `#5fb8b0` (selection, links, win state)
- Accent blue: `#5b8fc4` (used in the primary-action gradient and stat bars)
- Loss/negative: `#c96a63`
- Borders: `rgba(255,255,255,.06–.1)`
- Font: `'Pretendard', -apple-system, 'Segoe UI', sans-serif`
- Radius scale: 8–10px (buttons/inputs), 14–18px (cards/board/modal), 999px (pills)

**Board (photo-matched, literal — do not theme):**
- Board background: `#4a3525`
- Walls: `#2b1d11`
- Planks: fill `#8b7355`, stroke `#5c4033`
- Bug body: fill `#5c2a1a`, stroke `#2a1006`; legs/antennae `#3a1f1a` / `#2a1006`; head `#3a1810`

## Assets
No external image/icon assets — everything is drawn with CSS and 2D canvas (Matter.js render + custom `afterRender` bug drawing). Font is Pretendard, loaded from a CDN in the prototype; substitute your app's existing font if Pretendard isn't already in use.

## Files
- `바퀴벌레 도박판.dc.html` — the full prototype (this design tool's component template format, includes the physics engine setup, game logic, and UI in one file). Read the inline `<script>` block at the bottom for the authoritative game logic; read the markup above it for the UI structure and copy/labels.
