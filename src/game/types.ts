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
