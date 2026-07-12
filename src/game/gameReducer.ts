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
      if (state.phase !== 'running') return state;
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
