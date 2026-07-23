// blind-auction-logic.js
// 블라인드 경매 순수 게임 로직 (DOM/네트워크 의존성 없음).
// 브라우저에서는 <script src="./blind-auction-logic.js"></script>로 로드되고,
// Node 테스트에서는 require()로 그대로 재사용된다.
(function (root) {
  'use strict';

  var CUBE_VALUES = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20, 25];
  var CUBE_TOTAL = CUBE_VALUES.reduce(function (a, b) { return a + b; }, 0);
  var PLAYER_ORDER = ['user', 'ai1', 'ai2', 'ai3', 'ai4'];
  var TOTAL_ROUNDS = 11;
  var POOL_SIZE = 22;

  var AI_ARCHETYPES = ['테토남', '에겐남', '욜로족', '안정형'];

  var ARCHETYPE_PARAMS = {
    '테토남': { aggressivenessMin: 1.05, aggressivenessMax: 1.3, pressureThreshold: 1.4, paceCoefficient: 0.4, gambleChance: 0 },
    '에겐남': { aggressivenessMin: 0.75, aggressivenessMax: 0.95, pressureThreshold: 1.05, paceCoefficient: 0.4, gambleChance: 0 },
    '욜로족': { aggressivenessMin: 0.9, aggressivenessMax: 1.1, pressureThreshold: 1.4, paceCoefficient: 0, gambleChance: 0.15 },
    '안정형': { aggressivenessMin: 0.9, aggressivenessMax: 1.1, pressureThreshold: 1.2, paceCoefficient: 1.0, gambleChance: 0 }
  };

  var ARCHETYPE_DESCRIPTIONS = {
    '테토남': '경쟁자가 많아도 잘 버팁니다.',
    '에겐남': '판이 과열되면 빠르게 손을 뗍니다.',
    '욜로족': '가끔 몰빵을 합니다.',
    '안정형': '성과에 따라 스스로 페이스를 조절합니다.'
  };

  function createPlayers() {
    return PLAYER_ORDER.map(function (id) {
      return { id: id, cubes: CUBE_VALUES.slice(), wonItems: [] };
    });
  }

  function findPlayer(players, id) {
    for (var i = 0; i < players.length; i++) {
      if (players[i].id === id) return players[i];
    }
    return null;
  }

  function shuffle(arr, rng) {
    var random = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pickGamePool(allItems, rng) {
    if (allItems.length < POOL_SIZE) {
      throw new Error('물품 풀이 부족합니다 (최소 ' + POOL_SIZE + '개 필요, 현재 ' + allItems.length + '개)');
    }
    var pool = shuffle(allItems, rng).slice(0, POOL_SIZE);
    var poolTotal = pool.reduce(function (sum, item) { return sum + item.value; }, 0);
    var playQueue = shuffle(pool, rng).slice(0, TOTAL_ROUNDS);
    var auctionTotal = playQueue.reduce(function (sum, item) { return sum + item.value; }, 0);
    return { pool: pool, poolTotal: poolTotal, playQueue: playQueue, auctionTotal: auctionTotal };
  }

  function rotateOrder(order, startId) {
    var i = order.indexOf(startId);
    if (i < 0) throw new Error('알 수 없는 플레이어: ' + startId);
    return order.slice(i).concat(order.slice(0, i));
  }

  function createRound(startPlayerId) {
    var active = {};
    var submitted = {};
    var usedCubes = {};
    PLAYER_ORDER.forEach(function (id) {
      active[id] = true;
      submitted[id] = 0;
      usedCubes[id] = [];
    });
    return {
      order: rotateOrder(PLAYER_ORDER, startPlayerId),
      pointer: 0,
      active: active,
      submitted: submitted,
      usedCubes: usedCubes,
      highestPlayerId: null,
      highestTotal: 0,
      log: []
    };
  }

  function activeIds(round) {
    return round.order.filter(function (id) { return round.active[id]; });
  }

  function currentActor(round) {
    var ids = activeIds(round);
    if (ids.length === 0) return null;
    if (ids.length === 1 && ids[0] === round.highestPlayerId) return null;
    var n = round.order.length;
    for (var step = 0; step < n; step++) {
      var id = round.order[(round.pointer + step) % n];
      if (!round.active[id]) continue;
      if (id === round.highestPlayerId) continue;
      return id;
    }
    return null;
  }

  function remainingCubesInRound(player, round) {
    var usedCopy = round.usedCubes[player.id].slice();
    return player.cubes.filter(function (v) {
      var idx = usedCopy.indexOf(v);
      if (idx === -1) return true;
      usedCopy.splice(idx, 1);
      return false;
    });
  }

  function applyBid(round, players, playerId, cubeValues) {
    if (currentActor(round) !== playerId) {
      return { ok: false, reason: 'not_your_turn' };
    }
    if (!cubeValues || cubeValues.length === 0) {
      return { ok: false, reason: 'no_cubes_selected' };
    }
    var player = findPlayer(players, playerId);
    var remainingCopy = remainingCubesInRound(player, round).slice();
    for (var i = 0; i < cubeValues.length; i++) {
      var idx = remainingCopy.indexOf(cubeValues[i]);
      if (idx === -1) return { ok: false, reason: 'cube_not_available' };
      remainingCopy.splice(idx, 1);
    }
    var addSum = cubeValues.reduce(function (a, b) { return a + b; }, 0);
    var newTotal = round.submitted[playerId] + addSum;
    if (newTotal <= round.highestTotal) {
      return { ok: false, reason: 'bid_too_low' };
    }
    round.usedCubes[playerId] = round.usedCubes[playerId].concat(cubeValues);
    round.submitted[playerId] = newTotal;
    round.highestPlayerId = playerId;
    round.highestTotal = newTotal;
    round.pointer = (round.order.indexOf(playerId) + 1) % round.order.length;
    round.log.push({ type: 'bid', playerId: playerId, cubes: cubeValues.slice(), total: newTotal });
    return { ok: true };
  }

  function applyPass(round, playerId) {
    if (currentActor(round) !== playerId) {
      return { ok: false, reason: 'not_your_turn' };
    }
    round.active[playerId] = false;
    round.pointer = (round.order.indexOf(playerId) + 1) % round.order.length;
    round.log.push({ type: 'pass', playerId: playerId });
    return { ok: true };
  }

  function isRoundOver(round) {
    return currentActor(round) === null;
  }

  function getRoundResult(round) {
    if (!isRoundOver(round)) return null;
    if (round.highestPlayerId !== null) {
      return { type: 'won', winnerId: round.highestPlayerId, amount: round.highestTotal };
    }
    return { type: 'unsold' };
  }

  function finalizeRound(round, players, item) {
    var result = getRoundResult(round);
    if (!result) throw new Error('라운드가 아직 끝나지 않았습니다');
    if (result.type === 'won') {
      var winner = findPlayer(players, result.winnerId);
      var remainingHand = winner.cubes.slice();
      round.usedCubes[result.winnerId].forEach(function (v) {
        var idx = remainingHand.indexOf(v);
        if (idx !== -1) remainingHand.splice(idx, 1);
      });
      winner.cubes = remainingHand;
      winner.wonItems.push({ itemId: item.id, itemName: item.item_name, value: item.value, memo: item.memo || null });
    }
    return result;
  }

  function nextStartPlayer(order, previousStartId, roundResult) {
    if (roundResult.type === 'won') return roundResult.winnerId;
    var i = order.indexOf(previousStartId);
    return order[(i + 1) % order.length];
  }

  function pickMinimalRaise(availableCubeValues, extraNeeded) {
    if (extraNeeded <= 0) return [];
    var n = availableCubeValues.length;
    var best = null;
    for (var mask = 1; mask < (1 << n); mask++) {
      var sum = 0;
      var count = 0;
      for (var i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          sum += availableCubeValues[i];
          count++;
        }
      }
      if (sum >= extraNeeded && (!best || sum < best.sum || (sum === best.sum && count < best.count))) {
        best = { sum: sum, count: count, mask: mask };
      }
    }
    if (!best) return null;
    var chosen = [];
    for (var j = 0; j < n; j++) {
      if (best.mask & (1 << j)) chosen.push(availableCubeValues[j]);
    }
    return chosen;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createAiProfiles(rng) {
    var random = rng || Math.random;
    var order = shuffle(AI_ARCHETYPES, random);
    var profiles = {};
    ['ai1', 'ai2', 'ai3', 'ai4'].forEach(function (id, idx) {
      var archetype = order[idx];
      var params = ARCHETYPE_PARAMS[archetype];
      profiles[id] = {
        archetype: archetype,
        aggressiveness: params.aggressivenessMin + random() * (params.aggressivenessMax - params.aggressivenessMin),
        pressureThreshold: params.pressureThreshold,
        paceCoefficient: params.paceCoefficient,
        gambleChance: params.gambleChance
      };
    });
    return profiles;
  }

  function computeAiWillingness(profile, poolTotal, rng) {
    var random = rng || Math.random;
    var avg = poolTotal / POOL_SIZE;
    var jitter = 0.85 + random() * 0.3;
    return avg * profile.aggressiveness * jitter;
  }

  function decideAiAction(player, round, profile, poolTotal, remainingRounds, rng) {
    var random = rng || Math.random;
    var willingness = computeAiWillingness(profile, poolTotal, random);

    var avgValue = poolTotal / POOL_SIZE;
    var pressureThreshold = profile.pressureThreshold != null ? profile.pressureThreshold : 1.2;
    var pressureRatio = avgValue > 0 ? round.highestTotal / avgValue : 0;
    if (pressureRatio > pressureThreshold) {
      willingness = willingness * 0.6;
    }

    var rivals = activeIds(round).filter(function (id) { return id !== player.id; }).length;
    var rivalsAdjustment = clamp((2 - rivals) * 0.04, -0.16, 0.16);
    willingness = willingness * (1 + rivalsAdjustment);

    if (profile.gambleChance) {
      if (!round.gambleRolls) round.gambleRolls = {};
      if (round.gambleRolls[player.id] === undefined) {
        round.gambleRolls[player.id] = random() < profile.gambleChance;
      }
      if (round.gambleRolls[player.id]) {
        willingness = willingness * (1.8 + random() * 0.4);
      }
    }

    var remaining = remainingCubesInRound(player, round);
    var remainingHandTotal = remaining.reduce(function (a, b) { return a + b; }, 0);
    var budgetCap = remainingRounds > 0 ? (remainingHandTotal / remainingRounds) * 1.6 : remainingHandTotal;

    var roundsPlayedSoFar = TOTAL_ROUNDS - remainingRounds;
    if (roundsPlayedSoFar > 0) {
      var paceCoefficient = profile.paceCoefficient != null ? profile.paceCoefficient : 1.0;
      var expectedWinsSoFar = roundsPlayedSoFar / PLAYER_ORDER.length;
      var paceRatio = player.wonItems.length / expectedWinsSoFar;
      var paceAdjustment = clamp((1 - paceRatio) * paceCoefficient, -0.3, 0.3);
      budgetCap = budgetCap * (1 + paceAdjustment);
    }

    if (remainingRounds <= 2) {
      budgetCap = Math.max(budgetCap, remainingHandTotal * 0.9);
    }

    var maxWillingness = Math.min(willingness, budgetCap);
    var extraNeeded = round.highestTotal - round.submitted[player.id] + 1;
    var prospectiveTotal = round.submitted[player.id] + extraNeeded;
    if (prospectiveTotal > maxWillingness) {
      return { action: 'pass' };
    }
    var cubes = pickMinimalRaise(remaining, extraNeeded);
    if (!cubes) return { action: 'pass' };
    return { action: 'bid', cubes: cubes };
  }

  function computeFinalRanking(players) {
    return players
      .map(function (p) {
        var total = p.wonItems.reduce(function (sum, it) { return sum + it.value; }, 0);
        return { id: p.id, total: total, wonItems: p.wonItems.slice() };
      })
      .sort(function (a, b) { return b.total - a.total; });
  }

  var api = {
    CUBE_VALUES: CUBE_VALUES,
    CUBE_TOTAL: CUBE_TOTAL,
    PLAYER_ORDER: PLAYER_ORDER,
    TOTAL_ROUNDS: TOTAL_ROUNDS,
    POOL_SIZE: POOL_SIZE,
    AI_ARCHETYPES: AI_ARCHETYPES,
    ARCHETYPE_DESCRIPTIONS: ARCHETYPE_DESCRIPTIONS,
    createPlayers: createPlayers,
    findPlayer: findPlayer,
    shuffle: shuffle,
    pickGamePool: pickGamePool,
    rotateOrder: rotateOrder,
    createRound: createRound,
    currentActor: currentActor,
    remainingCubesInRound: remainingCubesInRound,
    applyBid: applyBid,
    applyPass: applyPass,
    isRoundOver: isRoundOver,
    getRoundResult: getRoundResult,
    finalizeRound: finalizeRound,
    nextStartPlayer: nextStartPlayer,
    pickMinimalRaise: pickMinimalRaise,
    createAiProfiles: createAiProfiles,
    computeAiWillingness: computeAiWillingness,
    decideAiAction: decideAiAction,
    computeFinalRanking: computeFinalRanking
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.BlindAuctionLogic = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
