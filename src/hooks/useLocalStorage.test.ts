import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useLocalStorage } from './useLocalStorage';

describe('useLocalStorage', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 42));
    expect(result.current[0]).toBe(42);
  });

  it('persists updates to localStorage and reads them back on next mount', () => {
    const { result, unmount } = renderHook(() => useLocalStorage('test-key', 0));

    act(() => {
      result.current[1](99);
    });
    expect(result.current[0]).toBe(99);
    unmount();

    const { result: result2 } = renderHook(() => useLocalStorage('test-key', 0));
    expect(result2.current[0]).toBe(99);
  });

  it('falls back to the initial value when stored JSON is corrupted', () => {
    window.localStorage.setItem('test-key', 'not json');
    const { result } = renderHook(() => useLocalStorage('test-key', 7));
    expect(result.current[0]).toBe(7);
  });
});
