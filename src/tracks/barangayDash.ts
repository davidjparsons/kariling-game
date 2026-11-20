import type { TrackDefinition } from '../sim/track';

/**
 * Track 1 — Barangay Dash (Easy).
 * A loop through a coastal village: concrete main road past the start, dusty lanes between
 * nipa huts and sari-sari stores, and a gravel back stretch beside the rice paddies.
 * Racing direction is clockwise when viewed from above (+y), sea to the south (-z).
 */
export const BARANGAY_DASH: TrackDefinition = {
  id: 'barangay-dash',
  name: 'Barangay Dash',
  difficulty: 'Easy',
  description: 'Dusty village lanes, wide corners and a gravel stretch by the rice paddies.',
  controlPoints: [
    [0, 0],
    [48, -3],
    [88, 8],
    [110, 42],
    [100, 84],
    [66, 104],
    [26, 98],
    [6, 74],
    [-22, 60],
    [-52, 76],
    [-88, 78],
    [-112, 50],
    [-104, 14],
    [-62, -4],
  ],
  halfWidth: 4.6,
  widthKeys: [
    { at: 0.0, halfWidth: 5.2 },
    { at: 0.12, halfWidth: 4.8 },
    { at: 0.45, halfWidth: 4.2 },
    { at: 0.6, halfWidth: 4.4 },
    { at: 0.85, halfWidth: 5.0 },
  ],
  vergeWidth: 3.2,
  defaultSurface: 'dirt',
  offroadSurface: 'grass',
  surfaces: [
    { from: 0.9, to: 0.1, surface: 'paved' },
    { from: 0.58, to: 0.7, surface: 'gravel' },
    { from: 0.33, to: 0.37, surface: 'gravel' },
  ],
  checkpointCount: 12,
  startAt: 0,
  // Lap length ≈ 576 m; `at` = metres / 576. Difficulty builds through the lap: a gentle
  // first third, the village gauntlet, a jump-or-log choice by the paddies, then a boosted sweep.
  hazards: [
    { type: 'boost', at: 22 / 576, d: -1.2 },
    { type: 'cementHump', at: 76 / 576, d: 0 },
    { type: 'pothole', at: 118 / 576, d: -1.8 },
    { type: 'pothole', at: 124 / 576, d: 1.1 },
    { type: 'pothole', at: 131 / 576, d: 3.0 },
    { type: 'poo', at: 150 / 576, d: 1.6 },
    { type: 'tyreStrip', at: 170 / 576, d: 0 },
    { type: 'fronds', at: 200 / 576, d: 2.2 },
    { type: 'mud', at: 233 / 576, d: -1.4 },
    { type: 'poo', at: 284 / 576, d: -1.6 },
    // Paddies: jump the ramp (right) or bounce over the log (left).
    { type: 'ramp', at: 364 / 576, d: 2.0 },
    { type: 'log', at: 366 / 576, d: -2.1, width: 4.2 },
    { type: 'dirtMound', at: 384 / 576, d: -2.3 },
    { type: 'dirtMound', at: 391 / 576, d: 2.1 },
    { type: 'boost', at: 408 / 576, d: 1.0 },
    { type: 'mud', at: 428 / 576, d: 2.4, length: 6, width: 3 },
    { type: 'flatTyre', at: 447 / 576, d: -1.3 },
    { type: 'flatTyre', at: 454 / 576, d: 1.7 },
    { type: 'flatTyre', at: 461 / 576, d: -2.8 },
    { type: 'poo', at: 481 / 576, d: -0.8 },
    { type: 'pothole', at: 500 / 576, d: 1.6 },
    { type: 'pothole', at: 506 / 576, d: -1.2 },
    { type: 'fronds', at: 513 / 576, d: -3.0, width: 2 },
    { type: 'cementHump', at: 540 / 576, d: 0 },
  ],
  canals: [
    { from: 525 / 576, to: 46 / 576, side: -1 },
    { from: 530 / 576, to: 40 / 576, side: 1 },
  ],
  // Power-up rows: after the start canals, before the village, before the paddies, after the
  // flat-tyre slalom. Three boxes across the road so a racer can pick a line.
  pickups: [
    { at: 54 / 576, d: [-2.4, 0, 2.4] },
    { at: 188 / 576, d: [-2.2, 0, 2.2] },
    { at: 330 / 576, d: [-2.2, 0, 2.2] },
    { at: 471 / 576, d: [-2.4, 0, 2.4] },
  ],
  dogs: [
    { at: 100 / 576, side: 1, offset: 1.8 },
    { at: 302 / 576, side: -1, offset: 1.8 },
    { at: 425 / 576, side: 1, offset: 2.0 },
  ],
};
