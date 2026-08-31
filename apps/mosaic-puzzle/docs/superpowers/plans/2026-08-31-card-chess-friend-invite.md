# Card Chess Friend Invite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add invitation-link WebRTC friend matches to Card Chess without leaderboard updates.

**Architecture:** Reuse `ring-the-bell-p2p.js` for signaling and DataChannel setup. Keep deterministic online action and perspective helpers in one small UMD module, then adapt the existing Card Chess page around a `localPlayer` value.

**Tech Stack:** Plain HTML/CSS/JavaScript, Node built-in test runner, WebRTC, existing Supabase REST signaling.

**Spec:** `docs/superpowers/specs/2026-08-31-card-chess-friend-invite-design.md`

## Global Constraints

- Host is P1 and guest is P2.
- Each player sees their own side at the bottom.
- Online results never update the leaderboard.
- Reuse the existing signaling transport and database table.

---

### Task 1: Deterministic online helpers

**Files:**
- Create: `card-chess-online.js`
- Create: `card-chess-online.test.js`

**Interfaces:**
- Consumes: `CardChessEngine.applyMove`, `CardChessEngine.applyPass`
- Produces: `CardChessOnline.applyAction(state, action, engine)`, `CardChessOnline.toEngineCell(visualRow, visualCol, localPlayer)`, `CardChessOnline.checksum(state)`

- [ ] Write tests proving P1/P2 perspective mapping, move/pass application, and stable checksums.
- [ ] Run `node card-chess-online.test.js` and confirm failure because the module is missing.
- [ ] Add the minimal UMD helper implementation.
- [ ] Run `node card-chess-online.test.js` and confirm all tests pass.

### Task 2: Card Chess online session UI and controller

**Files:**
- Modify: `card-chess.html`

**Interfaces:**
- Consumes: `window.CardChessOnline`, `window.RingBellP2P`
- Produces: invite modal, host initialization, replicated actions, local perspective rendering, disconnect/sync-error handling

- [ ] Add a static integration check that asserts the page loads both modules and contains the online-mode guards.
- [ ] Run the check and confirm it fails before page changes.
- [ ] Add the invite button/modal flow and online state variables.
- [ ] Route local move/pass actions through one sender and apply incoming actions through the engine helper.
- [ ] Make hands, board direction, status, winner copy, controls, AI scheduling, and leaderboard recording respect online mode.
- [ ] Run all Card Chess and P2P tests.

### Task 3: Documentation and browser verification

**Files:**
- Modify: `HISTORY.md`

**Interfaces:**
- Consumes: completed implementation
- Produces: handoff record for the next agent

- [ ] Open the page locally and verify normal AI mode still starts.
- [ ] Open host and guest URLs in separate browser contexts and verify connection, opposite perspectives, one synchronized move, and no online leaderboard write.
- [ ] Add the newest `HISTORY.md` entry with changed files, deployment state, and remaining work.
- [ ] Run the full verification commands and inspect `git diff`.
