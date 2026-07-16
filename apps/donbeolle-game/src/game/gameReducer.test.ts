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
    const exit = EXIT_META.find((e) => e.id === 2)!;
    let state = createInitialState(15);
    state = gameReducer(state, { type: 'SELECT_EXIT', id: 2 });
    state = gameReducer(state, { type: 'SET_BET_AMOUNT', amount: 4 });
    state = gameReducer(state, { type: 'PLACE_BET' }); // coins 15 -> 11, pendingBet 4
    const next = gameReducer(state, { type: 'RESOLVE_ROUND', exit });
    const expectedPayout = 4 * exit.odds;
    expect(next.phase).toBe('result');
    expect(next.coins).toBe(11 + expectedPayout);
    expect(next.lastResult).toEqual({ win: true, payout: expectedPayout, exitLabel: exit.label });
    expect(next.exitStats[2]).toBe(1);
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({
      betLabel: exit.label,
      actualLabel: exit.label,
      win: true,
      payout: expectedPayout,
      bet: 4,
    });
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

  it('RESOLVE_ROUND is ignored when not in running phase', () => {
    const state = createInitialState(15);
    const next = gameReducer(state, { type: 'RESOLVE_ROUND', exit: EXIT_META[0] });
    expect(next.phase).toBe('setup');
    expect(next.coins).toBe(15);
    expect(next.history).toEqual([]);
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
