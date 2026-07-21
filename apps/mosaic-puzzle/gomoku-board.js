// gomoku-board.js
// 3단 오목의 보드 좌표계와 순수 규칙 함수. 임의의 stacks 스냅샷에 대해 동작하며
// DOM에 의존하지 않아, 메인 스레드와 AI 웹 워커 양쪽에서 그대로 재사용한다
// (전에는 이 파일 내용 전체가 워커 안에 문자열로 복사돼 있어 두 사본이 어긋날
// 위험이 있었다 — checkWinOf가 boolean만 반환하도록 워커 쪽만 고쳐졌다가 다시
// 깨진 사고가 실제로 있었음).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GomokuBoard = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  "use strict";

  const NEIGHBOR_DIRS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];
  const LINE_DIRS = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: -1 }];

  const RAW_BOARD = [];
  for (let q = -5; q <= 5; q++) {
    for (let r = -5; r <= 5; r++) {
      const s = -q - r;
      if (Math.abs(s) > 5) continue;
      const isCorner = [Math.abs(q), Math.abs(r), Math.abs(s)].filter(v => v === 5).length >= 2;
      if (isCorner) continue;
      RAW_BOARD.push({ q, r, s, key: q + "_" + r });
    }
  }
  const BOARD_MAP = {};
  RAW_BOARD.forEach(c => { BOARD_MAP[c.key] = c; });

  function otherPlayer(p) { return p === 1 ? 2 : 1; }

  function neighbors(key) {
    const c = BOARD_MAP[key];
    return NEIGHBOR_DIRS.map(d => BOARD_MAP[(c.q + d.q) + "_" + (c.r + d.r)]).filter(Boolean);
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
    const origin = BOARD_MAP[originKey];
    const dest = BOARD_MAP[destKey];
    const isAdj = NEIGHBOR_DIRS.some(d => (origin.q + d.q) === dest.q && (origin.r + d.r) === dest.r);
    if (!isAdj) return false;
    const originH = (stacks[originKey] || []).length;
    const destH = (stacks[destKey] || []).length;
    return destH <= originH && destH + 1 <= 3;
  }

  function checkFiveInRowOf(stacks, color) {
    for (const key in BOARD_MAP) {
      if (topColorOf(stacks, key) !== color) continue;
      const c = BOARD_MAP[key];
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
    for (const key in BOARD_MAP) {
      const st = stacks[key];
      if (st && st.length === 3 && st[2] === color) found.push(key);
    }
    return found.length >= 5 ? found.slice(0, 5) : null;
  }

  function checkTriangleTop3Of(stacks, color) {
    const isTop3 = k => { const st = stacks[k]; return st && st.length === 3 && st[2] === color; };
    for (const key in BOARD_MAP) {
      if (!isTop3(key)) continue;
      const c = BOARD_MAP[key];
      for (let i = 0; i < 6; i++) {
        const d1 = NEIGHBOR_DIRS[i];
        const n1Key = (c.q + d1.q) + "_" + (c.r + d1.r);
        if (!isTop3(n1Key)) continue;
        const n1 = BOARD_MAP[n1Key];
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
      RAW_BOARD.forEach(c => {
        const st = stacks[c.key];
        if (!st || !st.length) moves.push({ type: "place", key: c.key });
      });
    }
    RAW_BOARD.forEach(c => {
      if (topColorOf(stacks, c.key) !== player) return;
      neighbors(c.key).forEach(n => {
        if (isValidMoveTargetOf(stacks, c.key, n.key, player)) moves.push({ type: "move", origin: c.key, dest: n.key });
      });
    });
    return moves;
  }

  // 상대 돌이 칸을 막고 있어도, 그 돌이 높이 1~2층이고 옆(인접)에 내 돌이
  // 있어서 "쌓기 이동"으로 그 위에 올라타 색을 뒤집을 수 있다면 진짜 차단이
  // 아니다.
  function isRestackableBlock(stacks, key, byColor) {
    const st = stacks[key];
    if (!st || !st.length) return false;
    const h = st.length;
    if (h + 1 > 3) return false;
    return neighbors(key).some(n => {
      const os = stacks[n.key];
      return !!os && os.length > 0 && os[os.length - 1] === byColor && os.length >= h;
    });
  }

  function isNearAnyStone(stacks, key, radius) {
    const c = BOARD_MAP[key];
    for (const k in stacks) {
      if (!stacks[k] || !stacks[k].length) continue;
      const c2 = BOARD_MAP[k];
      if (Math.max(Math.abs(c.q - c2.q), Math.abs(c.r - c2.r), Math.abs(c.s - c2.s)) <= radius) return true;
    }
    return false;
  }

  // 탐색 내부용: 관련 없는(기존 돌과 멀리 떨어진) 배치 후보는 제외해 비용을 줄인다.
  // 반경은 기존 두 사본(메인 스레드/워커) 모두 2로 고정돼 있던 값 그대로다.
  const SEARCH_NEAR_RADIUS = 2;
  function getSearchMoves(stacks, player, supply) {
    const moves = [];
    if (supply > 0) {
      RAW_BOARD.forEach(c => {
        const st = stacks[c.key];
        if (st && st.length) return;
        if (isNearAnyStone(stacks, c.key, SEARCH_NEAR_RADIUS)) moves.push({ type: "place", key: c.key });
      });
    }
    RAW_BOARD.forEach(c => {
      if (topColorOf(stacks, c.key) !== player) return;
      neighbors(c.key).forEach(n => {
        if (isValidMoveTargetOf(stacks, c.key, n.key, player)) moves.push({ type: "move", origin: c.key, dest: n.key });
      });
    });
    return moves;
  }

  function applyMoveWithSupply(stacks, supply, move, player) {
    const nextStacks = applyMoveToStacks(stacks, move, player);
    const nextSupply = move.type === "place" ? Object.assign({}, supply, { [player]: supply[player] - 1 }) : supply;
    return { stacks: nextStacks, supply: nextSupply };
  }

  function moveIdKey(m) {
    return m.type === "place" ? "p:" + m.key : "m:" + m.origin + ">" + m.dest;
  }

  return {
    NEIGHBOR_DIRS,
    LINE_DIRS,
    RAW_BOARD,
    BOARD_MAP,
    otherPlayer,
    neighbors,
    topColorOf,
    isValidInitialPlacementOf,
    isValidMoveTargetOf,
    checkFiveInRowOf,
    checkFiveAtTop3Of,
    checkTriangleTop3Of,
    checkWinOf,
    placeStoneOf,
    moveStoneOf,
    applyMoveToStacks,
    getAllLegalMainMoves,
    isRestackableBlock,
    isNearAnyStone,
    getSearchMoves,
    applyMoveWithSupply,
    moveIdKey,
  };
});
