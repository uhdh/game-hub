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

  return {
    CARD_IDS: CARD_IDS,
    CASTLE: CASTLE,
    other: other,
    countAlive: countAlive,
    isHoldingCastle: isHoldingCastle,
    createInitialState: createInitialState,
    getLegalMoves: getLegalMoves,
    applyDraft: applyDraft,
    chooseAiDraft: chooseAiDraft,
    applyMove: applyMove,
    applyPass: applyPass,
    evaluate: evaluate,
    chooseAiMove: chooseAiMove,
  };
});
