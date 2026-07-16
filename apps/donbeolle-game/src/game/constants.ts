import type { ExitMeta, PlankData } from './types';

export const WIDTH = 1000;
export const HEIGHT = 1000;

export const PLANK_LENGTH = 169;
export const PLANK_THICK = 36;
// the crossbar/pivot slot on the real board sits off the bar's geometric middle
// (measured ~9 units closer to one end, out of a 169-unit bar)
export const PIVOT_OFFSET = 9;

export const STARTING_COINS = 15;

// --- bug movement tuning (adjust these to test different movement feel) ---
export const BUG_SPEED = 0.0018; // forward force per tick; tunable range 0.0015-0.008
export const WOBBLE_TIME_STEP = 0.25; // how fast the wobble "clock" advances per tick
export const WOBBLE_AMPLITUDE = 0.015; // how strongly the wobble nudges angular velocity
export const WOBBLE_FREQUENCY_RATIO = 0.8; // relative speed of the second wobble wave
export const STUCK_VELOCITY_THRESHOLD = 0.3; // speed below which the bug is considered "stuck" (scaled down with BUG_SPEED so slower cruising isn't mistaken for stuck)
export const STUCK_TICK_LIMIT = 40; // ticks stuck before forcing a direction change
export const SPEED_VARIANCE = 0.3; // +/- random fraction applied to BUG_SPEED each tick (0 = constant pace)
export const JITTER_CHANCE = 0.005; // probability per tick of a sudden sharp turn (0 = never)
export const JITTER_STRENGTH = 0.08; // max angular velocity kick from a jitter turn
export const ANGULAR_DAMPING = 0.9; // fraction of angular velocity kept each tick (lower = less spinning, more like legs nudging direction rather than a top spinning up)
export const MAX_BUG_VELOCITY = 8; // hard speed cap per tick; prevents unbounded velocity buildup (no air friction) from tunneling through thin walls
// --- end bug movement tuning ---

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

// y = each exit's vertical center, height = the gap's vertical span - both digitized
// from a screenshot mockup showing the desired exit box size/position per exit
// (no longer shared between left/right - each of the 6 exits is independent).
export const EXIT_META: ExitMeta[] = [
  { id: 1, side: 'left', y: 160, height: 190, label: '출구1', odds: 2 },
  { id: 2, side: 'left', y: 495, height: 155, label: '출구2', odds: 3 },
  { id: 3, side: 'left', y: 850, height: 210, label: '출구3', odds: 2 },
  { id: 4, side: 'right', y: 125, height: 115, label: '출구4', odds: 3 },
  { id: 5, side: 'right', y: 500, height: 195, label: '출구5', odds: 2 },
  { id: 6, side: 'right', y: 918, height: 113, label: '출구6', odds: 5 }, // 2/3 of the previous 170 height, bottom edge kept fixed at y=975
];

export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const WALL_THICKNESS = 16; // outer edge stays flush with the board (0/1000); only thickness shrank from 26

export const TOP_BOTTOM_WALL_RECTS: WallRect[] = [
  { x: 500, y: WALL_THICKNESS / 2, width: 1000, height: WALL_THICKNESS },
  { x: 500, y: 1000 - WALL_THICKNESS / 2, width: 1000, height: WALL_THICKNESS },
];

// Each side wall is the solid segments left over once that side's 3 exit gaps
// (EXIT_META filtered by side, using y +/- height/2) are cut out of the full
// 13-987 span. Kept as explicit rects (not derived at runtime) so the physics
// walls and the exit sensors are visibly using the same source data.
export const LEFT_WALL_RECTS: WallRect[] = [
  { x: WALL_THICKNESS / 2, y: 39, width: WALL_THICKNESS, height: 52 },
  { x: WALL_THICKNESS / 2, y: 336, width: WALL_THICKNESS, height: 163 },
  { x: WALL_THICKNESS / 2, y: 659, width: WALL_THICKNESS, height: 173 },
  { x: WALL_THICKNESS / 2, y: 971, width: WALL_THICKNESS, height: 32 },
];

export const RIGHT_WALL_RECTS: WallRect[] = [
  { x: 1000 - WALL_THICKNESS / 2, y: 40, width: WALL_THICKNESS, height: 55 },
  { x: 1000 - WALL_THICKNESS / 2, y: 293, width: WALL_THICKNESS, height: 220 },
  { x: 1000 - WALL_THICKNESS / 2, y: 730, width: WALL_THICKNESS, height: 264 },
  { x: 1000 - WALL_THICKNESS / 2, y: 981, width: WALL_THICKNESS, height: 13 },
];
