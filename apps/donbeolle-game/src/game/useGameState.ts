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
