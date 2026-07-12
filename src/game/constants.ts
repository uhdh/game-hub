import type { ExitMeta, PlankData } from './types';

export const WIDTH = 1000;
export const HEIGHT = 1000;

export const PLANK_LENGTH = 169;
export const PLANK_THICK = 56;
// the crossbar/pivot slot on the real board sits off the bar's geometric middle
// (measured ~9 units closer to one end, out of a 169-unit bar)
export const PIVOT_OFFSET = 9;

export const STARTING_COINS = 15;
export const BUG_SPEED = 0.0032;

// plank centers digitized directly from the physical board photo (pixel-grid measured, normalized to 0-1000)
// x,y = the bar's geometric center in its default (state 0) orientation, exactly as it sits in the photo
export const BOARD_DATA: PlankData[] = [
  { x: 128, y: 110, state: 0 },
  { x: 511, y: 107, state: 0 },
  { x: 883, y: 105, state: 1 },
  { x: 408, y: 296, state: 0 },
  { x: 787, y: 296, state: 0 },
  { x: 128, y: 494, state: 0 },
  { x: 301, y: 497, state: 0 },
  { x: 694, y: 494, state: 1 },
  { x: 888, y: 494, state: 1 },
  { x: 222, y: 705, state: 0 },
  { x: 399, y: 705, state: 0 },
  { x: 785, y: 702, state: 1 },
  { x: 128, y: 911, state: 0 },
  { x: 701, y: 911, state: 0 },
  { x: 888, y: 911, state: 0 },
];

export const EXIT_Y = [200, 500, 800];

export const EXIT_META: ExitMeta[] = [
  { id: 1, side: 'left', y: 200, label: '출구1', odds: 3 },
  { id: 2, side: 'left', y: 500, label: '출구2', odds: 2 },
  { id: 3, side: 'left', y: 800, label: '출구3', odds: 4 },
  { id: 4, side: 'right', y: 200, label: '출구4', odds: 3 },
  { id: 5, side: 'right', y: 500, label: '출구5', odds: 2 },
  { id: 6, side: 'right', y: 800, label: '출구6', odds: 6 },
];

export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const WALL_RECTS: WallRect[] = [
  { x: 500, y: 13, width: 1000, height: 26 },
  { x: 500, y: 987, width: 1000, height: 26 },
  { x: 13, y: 72, width: 26, height: 118 },
  { x: 13, y: 350, width: 26, height: 188 },
  { x: 13, y: 650, width: 26, height: 188 },
  { x: 13, y: 928, width: 26, height: 118 },
  { x: 987, y: 72, width: 26, height: 118 },
  { x: 987, y: 350, width: 26, height: 188 },
  { x: 987, y: 650, width: 26, height: 188 },
  { x: 987, y: 928, width: 26, height: 118 },
];
