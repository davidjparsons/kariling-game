import type { SurfaceId } from './surfaces';

export type HazardType =
  | 'cementHump' | 'dirtMound' | 'log' | 'tyreStrip' | 'flatTyre' | 'fronds' | 'ramp'
  | 'pothole' | 'mud' | 'boost' | 'poo';

export type HazardProfile = 'flatTop' | 'mound' | 'log' | 'ridges' | 'ring' | 'flat' | 'ramp' | 'dip';

export interface HazardConfig {
  name: string;
  /** Footprint along the track (m) and across it (m). */
  length: number;
  width: number;
  /** Peak height (m); negative for depressions. */
  height: number;
  profile: HazardProfile;
  /** How much climbing velocity carries over the crest (0 = rolls over, 1 = full launch). */
  launch: number;
  /** Surface override inside the footprint. */
  surface?: SurfaceId;
  /** Fraction of speed lost on entry at top speed (scaled by speed). */
  speedLoss: number;
  /** Instability added on entry: base + extra × (speed/top)². */
  instability: number;
  instabilitySpeed: number;
  /** Upward kick on entry (m/s at top speed) — the wheel jolts and may leave the scoop. */
  kick: number;
  effect?: 'boost' | 'poo';
  /** AI steers around it when it can. */
  avoid: boolean;
  /** Speed the AI slows to when it can't avoid it (m/s). */
  safeSpeed: number;
}

export const HAZARDS: Record<HazardType, HazardConfig> = {
  cementHump: {
    name: 'Cement hump', length: 1.6, width: 0, height: 0.13, profile: 'flatTop', launch: 0.45,
    speedLoss: 0.06, instability: 0.04, instabilitySpeed: 0.22, kick: 0, avoid: false, safeSpeed: 8.5,
  },
  dirtMound: {
    name: 'Dirt mound', length: 3.4, width: 2.8, height: 0.42, profile: 'mound', launch: 0.7,
    surface: 'dirt', speedLoss: 0.05, instability: 0.04, instabilitySpeed: 0.18, kick: 0, avoid: true, safeSpeed: 8,
  },
  log: {
    name: 'Log', length: 0.42, width: 4, height: 0.24, profile: 'log', launch: 0.55,
    speedLoss: 0.2, instability: 0.08, instabilitySpeed: 0.4, kick: 0.6, avoid: true, safeSpeed: 6,
  },
  tyreStrip: {
    name: 'Old-tyre hump', length: 0.9, width: 0, height: 0.1, profile: 'ridges', launch: 0.3,
    speedLoss: 0.08, instability: 0.05, instabilitySpeed: 0.3, kick: 0.4, avoid: false, safeSpeed: 8,
  },
  flatTyre: {
    name: 'Old motorbike tyre', length: 0.8, width: 0.8, height: 0.1, profile: 'ring', launch: 0.3,
    speedLoss: 0.08, instability: 0.06, instabilitySpeed: 0.32, kick: 0.9, avoid: true, safeSpeed: 6,
  },
  fronds: {
    name: 'Fallen fronds', length: 2.6, width: 2.4, height: 0.04, profile: 'flat', launch: 0,
    surface: 'grass', speedLoss: 0.1, instability: 0.08, instabilitySpeed: 0.2, kick: 0, avoid: true, safeSpeed: 7,
  },
  ramp: {
    name: 'Dirt ramp', length: 5, width: 3.2, height: 0.85, profile: 'ramp', launch: 1,
    surface: 'dirt', speedLoss: 0, instability: 0, instabilitySpeed: 0, kick: 0, avoid: true, safeSpeed: 9,
  },
  pothole: {
    name: 'Pothole', length: 1.1, width: 1.1, height: -0.09, profile: 'dip', launch: 0,
    speedLoss: 0.24, instability: 0.1, instabilitySpeed: 0.5, kick: 2.4, avoid: true, safeSpeed: 5,
  },
  mud: {
    name: 'Mud', length: 9, width: 4.6, height: 0, profile: 'flat', launch: 0,
    surface: 'mud', speedLoss: 0, instability: 0, instabilitySpeed: 0, kick: 0, avoid: true, safeSpeed: 7,
  },
  boost: {
    name: 'Boost', length: 4, width: 2.6, height: 0, profile: 'flat', launch: 0,
    speedLoss: 0, instability: 0, instabilitySpeed: 0, kick: 0, effect: 'boost', avoid: false, safeSpeed: 99,
  },
  poo: {
    name: 'Dog poo', length: 0.45, width: 0.45, height: 0.03, profile: 'flat', launch: 0,
    speedLoss: 0.04, instability: 0.06, instabilitySpeed: 0, kick: 0, effect: 'poo', avoid: true, safeSpeed: 99,
  },
};

/** Roadside canal: open drain beside the road edge. */
export const CANAL = {
  /** Gap between the road edge and the canal lip (m). */
  gap: 0.3,
  width: 1.1,
  depth: 0.9,
} as const;

/** Askal (street dog) behaviour. */
export const DOG = {
  triggerRadius: 8,
  alertTime: 0.75,
  chaseSpeed: 9.6,
  maxChaseTime: 3.4,
  /** Dogs give up this far from home (m). */
  leash: 38,
  catchDistance: 0.9,
  returnSpeed: 3,
  cooldown: 9,
  wanderRadius: 2.5,
} as const;
