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
};
