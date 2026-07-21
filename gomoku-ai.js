// gomoku-ai.js
// 3단 오목의 국면 평가·탐색 함수. gomoku-board.js에 의존한다(브라우저/워커에서는
// gomoku-board.js를 먼저 로드해 전역 GomokuBoard를 채워야 하고, Node에서는
// require로 직접 넘겨받는다). 메인 스레드(상 난이도, 동기)와 AI 웹 워커
// (최상 난이도, 반복 심화)가 같은 평가 함수를 쓰도록 공유한다.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./gomoku-board.js'));
  } else {
    root.GomokuAI = factory(root.GomokuBoard);
  }
})(typeof self !== 'undefined' ? self : this, function (Board) {
  "use strict";

  const { BOARD_MAP, LINE_DIRS, NEIGHBOR_DIRS, otherPlayer, topColorOf, checkWinOf,
    isRestackableBlock, applyMoveToStacks, applyMoveWithSupply, getSearchMoves,
    getAllLegalMainMoves } = Board;

  // 탐색 대상 국면이 어느 플레이어 시점인지는 게임마다(선공 교대) 바뀌므로,
  // 매 판/매 라운드 시작 시 setPlayers로 갱신해야 한다.
  let AI_PLAYER = 2, HUMAN_PLAYER = 1;
  function setPlayers(aiPlayer, humanPlayer) {
    AI_PLAYER = aiPlayer;
    HUMAN_PLAYER = humanPlayer;
  }

  function lineThreatScore(stacks, color) {
    let score = 0;
    for (const key in BOARD_MAP) {
      if (topColorOf(stacks, key) !== color) continue;
      const c = BOARD_MAP[key];
      for (const dir of LINE_DIRS) {
        const prevKey = (c.q - dir.q) + "_" + (c.r - dir.r);
        if (topColorOf(stacks, prevKey) === color) continue;
        let length = 1;
        let cq = c.q + dir.q, cr = c.r + dir.r;
        while (topColorOf(stacks, cq + "_" + cr) === color) { length++; cq += dir.q; cr += dir.r; }
        if (length >= 5) continue;
        const afterKey = cq + "_" + cr;
        const beforeOpen = !!BOARD_MAP[prevKey] && (!topColorOf(stacks, prevKey) || isRestackableBlock(stacks, prevKey, color));
        const afterOpen = !!BOARD_MAP[afterKey] && (!topColorOf(stacks, afterKey) || isRestackableBlock(stacks, afterKey, color));
        const openEnds = (beforeOpen ? 1 : 0) + (afterOpen ? 1 : 0);
        const base = [0, 2, 14, 90, 550][length] || 0;
        score += base * (1 + openEnds);
      }
    }
    return score;
  }

  function stackThreatScore(stacks, color) {
    let score = 0;
    const top3Cells = [];
    for (const key in BOARD_MAP) {
      const st = stacks[key];
      if (!st || !st.length) continue;
      const h = st.length;
      if (st[h - 1] !== color) continue;
      if (h === 3) { top3Cells.push(key); score += 30; }
      else if (h === 2) score += 9;
      else score += 1;
    }
    const top3Set = new Set(top3Cells);
    let adjPairs = 0;
    top3Cells.forEach(k => {
      const c = BOARD_MAP[k];
      NEIGHBOR_DIRS.forEach(d => {
        if (top3Set.has((c.q + d.q) + "_" + (c.r + d.r))) adjPairs++;
      });
    });
    score += adjPairs * 25;
    return score;
  }

  function windowThreatScore(stacks, color) {
    let score = 0;
    const WEIGHTS = [0, 0, 10, 70, 450, 3000];
    for (const key in BOARD_MAP) {
      const c = BOARD_MAP[key];
      for (const dir of LINE_DIRS) {
        const cells = [];
        let offBoard = false;
        for (let i = 0; i < 5; i++) {
          const k = (c.q + dir.q * i) + "_" + (c.r + dir.r * i);
          if (!BOARD_MAP[k]) { offBoard = true; break; }
          cells.push(k);
        }
        if (offBoard) continue;
        let mine = 0, blocked = false;
        for (const k of cells) {
          const top = topColorOf(stacks, k);
          if (top === color) mine++;
          else if (top && !isRestackableBlock(stacks, k, color)) {
            blocked = true; break;
          }
        }
        if (blocked) continue;
        score += WEIGHTS[mine];
      }
    }
    return score;
  }

  function evaluatePosition(stacks, forPlayer) {
    const opp = otherPlayer(forPlayer);
    if (checkWinOf(stacks, forPlayer)) return 1e7;
    if (checkWinOf(stacks, opp)) return -1e7;
    const mine = lineThreatScore(stacks, forPlayer) + stackThreatScore(stacks, forPlayer) + windowThreatScore(stacks, forPlayer);
    const theirs = lineThreatScore(stacks, opp) + stackThreatScore(stacks, opp) + windowThreatScore(stacks, opp);
    return mine - theirs * 1.15;
  }

  // 초기 배치 평가: 상대의 위험한 5칸 구간 안에 있는 칸을 선점하는 가치를
  // windowThreatScore만으로는 못 알아보는 문제(2026-07-19, 테스트유저 기보)를
  // 보완하기 위한 가산점.
  function contestedSquareBonus(stacks, key, defender) {
    const opp = otherPlayer(defender);
    const c = BOARD_MAP[key];
    let bonus = 0;
    LINE_DIRS.forEach(dir => {
      for (let start = -4; start <= 0; start++) {
        const cells = [];
        let onBoard = true;
        for (let i = 0; i < 5; i++) {
          const cq = c.q + dir.q * (start + i), cr = c.r + dir.r * (start + i);
          const k2 = cq + "_" + cr;
          if (!BOARD_MAP[k2]) { onBoard = false; break; }
          cells.push(k2);
        }
        if (!onBoard || !cells.includes(key)) continue;
        let oppCount = 0, hasDefenderStone = false;
        cells.forEach(k2 => {
          if (k2 === key) return;
          const top = topColorOf(stacks, k2);
          if (top === opp) oppCount++;
          else if (top === defender) hasDefenderStone = true;
        });
        if (!hasDefenderStone && oppCount >= 3) bonus += oppCount * 40;
      }
    });
    return bonus;
  }

  function orderedCandidates(stacks, player, moves, isMaximizing, limit) {
    const scored = moves.map(m => ({ m, s: evaluatePosition(applyMoveToStacks(stacks, m, player), AI_PLAYER) }));
    scored.sort((a, b) => (isMaximizing ? b.s - a.s : a.s - b.s));
    return scored.slice(0, limit).map(o => o.m);
  }

  const MINIMAX_INNER_BEAM = 8;

  // deadline을 생략하면(기본값 Infinity) 시간 제한 없이 ply 깊이까지만 탐색한다
  // (메인 스레드 "상" 난이도). 워커의 "최상" 난이도는 실제 마감시각을 넘겨
  // 반복 심화 탐색 도중에도 시간 예산을 지키게 한다.
  function minimax(stacks, supply, ply, isMaximizing, alpha, beta, deadline) {
    if (deadline === undefined) deadline = Infinity;
    if (checkWinOf(stacks, AI_PLAYER)) return 1e7 + ply;
    if (checkWinOf(stacks, HUMAN_PLAYER)) return -1e7 - ply;
    if (ply === 0 || Date.now() > deadline) return evaluatePosition(stacks, AI_PLAYER);

    const player = isMaximizing ? AI_PLAYER : HUMAN_PLAYER;
    const rawMoves = getSearchMoves(stacks, player, supply[player]);
    if (!rawMoves.length) return evaluatePosition(stacks, AI_PLAYER);
    const moves = orderedCandidates(stacks, player, rawMoves, isMaximizing, MINIMAX_INNER_BEAM);

    if (isMaximizing) {
      let best = -Infinity;
      for (const m of moves) {
        const r = applyMoveWithSupply(stacks, supply, m, player);
        const val = minimax(r.stacks, r.supply, ply - 1, false, alpha, beta, deadline);
        if (val > best) best = val;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
        if (Date.now() > deadline) break;
      }
      return best;
    }
    let best = Infinity;
    for (const m of moves) {
      const r = applyMoveWithSupply(stacks, supply, m, player);
      const val = minimax(r.stacks, r.supply, ply - 1, true, alpha, beta, deadline);
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
      if (Date.now() > deadline) break;
    }
    return best;
  }

  // 상대가 이미 "열린 3"(양 끝이 모두 빈 연속 3개)을 갖고 있으면, 막지 않을 경우
  // 다음 턴에 열린 4가 되어 무조건 진다. 이 두 칸 중 하나를 반환한다(둘 다
  // 막아야 하는 칸 후보).
  function findOpenThreeBlockCells(stacks, color) {
    const cells = new Set();
    for (const key in BOARD_MAP) {
      if (topColorOf(stacks, key) !== color) continue;
      const c = BOARD_MAP[key];
      for (const dir of LINE_DIRS) {
        const prevKey = (c.q - dir.q) + "_" + (c.r - dir.r);
        if (topColorOf(stacks, prevKey) === color) continue;
        let length = 1;
        let cq = c.q + dir.q, cr = c.r + dir.r;
        while (topColorOf(stacks, cq + "_" + cr) === color) { length++; cq += dir.q; cr += dir.r; }
        if (length !== 3) continue;
        const afterKey = cq + "_" + cr;
        const beforeOpen = !!BOARD_MAP[prevKey] && !topColorOf(stacks, prevKey);
        const afterOpen = !!BOARD_MAP[afterKey] && !topColorOf(stacks, afterKey);
        if (beforeOpen && afterOpen) {
          cells.add(prevKey);
          cells.add(afterKey);
        }
      }
    }
    return cells;
  }

  // targetCells(반드시 막아야 하는 칸들) 중 하나를 두는 수만 추려서, 그 안에서
  // 1수 평가로 가장 나은 것을 결정적으로 고른다. 위협 칸이 여러 개(겹사)일 때
  // "두고 나면 상대에게 즉시 이기는 수가 하나도 안 남는" 후보를 먼저 고르고,
  // 그런 후보가 없을 때만 점수 위주로 고른다(2026-07-19, 덕후#912 기보에서 확인된
  // 겹사 오판 방지).
  function pickBestBlock(stacks, supply, allMoves, targetCells, opponent) {
    const blockMoves = allMoves.filter(m => targetCells.has(m.type === "place" ? m.key : m.dest));
    if (!blockMoves.length) return null;
    const fullyBlocking = blockMoves.filter(m => {
      const r = applyMoveWithSupply(stacks, supply, m, AI_PLAYER);
      const oppNextMoves = getAllLegalMainMoves(r.stacks, opponent, r.supply[opponent]);
      return !oppNextMoves.some(om => checkWinOf(applyMoveToStacks(r.stacks, om, opponent), opponent));
    });
    const pool = fullyBlocking.length ? fullyBlocking : blockMoves;
    let best = pool[0], bestScore = -Infinity;
    pool.forEach(m => {
      const score = evaluatePosition(applyMoveToStacks(stacks, m, AI_PLAYER), AI_PLAYER) + (Math.random() - 0.5) * 6;
      if (score > bestScore) { bestScore = score; best = m; }
    });
    return best;
  }

  return {
    setPlayers,
    lineThreatScore,
    stackThreatScore,
    windowThreatScore,
    evaluatePosition,
    contestedSquareBonus,
    orderedCandidates,
    minimax,
    findOpenThreeBlockCells,
    pickBestBlock,
  };
});
