import { describe, expect, it } from 'vitest';
import { computePivotOffset } from './pivot';

describe('computePivotOffset', () => {
  it('returns an offset straight up for angle 0 (vertical plank)', () => {
    const offset = computePivotOffset(0);
    expect(offset.x).toBeCloseTo(0);
    expect(offset.y).toBeCloseTo(-9);
  });

  it('rotates the offset 90 degrees for horizontal state', () => {
    const offset = computePivotOffset(Math.PI / 2);
    expect(offset.x).toBeCloseTo(9);
    expect(offset.y).toBeCloseTo(0);
  });
});
