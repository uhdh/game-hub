import { PIVOT_OFFSET } from './constants';

/**
 * The plank's hinge sits PIVOT_OFFSET units off its geometric center, toward the
 * "top" in the plank's own unrotated local space. Rotating this local offset by
 * the plank's current angle gives the world-space offset to feed into
 * Matter.Body.setCentre so the plank swings around its true physical pivot.
 */
export function computePivotOffset(angle: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localOffset = { x: 0, y: -PIVOT_OFFSET };
  return {
    x: localOffset.x * cos - localOffset.y * sin,
    y: localOffset.x * sin + localOffset.y * cos,
  };
}
