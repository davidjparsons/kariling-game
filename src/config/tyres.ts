import type { SurfaceId } from './surfaces';

export type TyreId = 'bmx' | 'mtb' | 'road' | 'moto';

/** Per-surface multipliers on top of the base surface properties. */
export interface SurfaceAffinity {
  grip: number;
  roll: number;
  speed: number;
  rough: number;
}

export interface TyreConfig {
  id: TyreId;
  name: string;
  description: string;
  /** 1–10 design ratings shown in the UI. Physics values below are derived/tuned from these. */
  ratings: { speed: number; acceleration: number; stability: number; cornering: number };
  /** Visual + roll-rate radius (m). */
  radius: number;
  /** Visual tube thickness (m). */
  tube: number;
  /** Relative mass for collisions. */
  mass: number;
  /** Nominal top speed (m/s) on a neutral surface. */
  maxSpeed: number;
  /** Peak push acceleration (m/s²). */
  acceleration: number;
  /** Max yaw rate at low speed (rad/s). */
  turnRate: number;
  /** Lateral acceleration limit before slipping (m/s²). */
  grip: number;
  /** Multiplier on instability gain (lower = more stable). */
  instabilityMul: number;
  /** Instability recovered per second when calm. */
  recoveryRate: number;
  /** Multiplier on fall/recovery duration. */
  recoveryTime: number;
  affinity: Record<SurfaceId, SurfaceAffinity>;
}

const neutral: SurfaceAffinity = { grip: 1, roll: 1, speed: 1, rough: 1 };

export const TYRES: Record<TyreId, TyreConfig> = {
  bmx: {
    id: 'bmx',
    name: 'BMX',
    description: 'Quick off the line and turns on a coin. Lower top speed.',
    ratings: { speed: 6, acceleration: 9, stability: 6, cornering: 9 },
    radius: 0.33, tube: 0.06, mass: 1.0,
    maxSpeed: 13.0, acceleration: 8.8, turnRate: 2.5, grip: 12.9,
    instabilityMul: 1.0, recoveryRate: 0.55, recoveryTime: 0.9,
    affinity: {
      paved: neutral,
      dirt: neutral,
      gravel: { grip: 0.95, roll: 1.05, speed: 0.98, rough: 1.05 },
      grass: neutral,
      mud: { grip: 0.95, roll: 1.1, speed: 0.97, rough: 1.1 },
    },
  },
  mtb: {
    id: 'mtb',
    name: 'Mountain Bike',
    description: 'The all-rounder. Grippy and steady on dirt, gravel and grass.',
    ratings: { speed: 7, acceleration: 7, stability: 8, cornering: 8 },
    radius: 0.36, tube: 0.07, mass: 1.3,
    maxSpeed: 13.1, acceleration: 7.4, turnRate: 2.25, grip: 11.8,
    instabilityMul: 0.82, recoveryRate: 0.62, recoveryTime: 1.0,
    affinity: {
      paved: { grip: 0.97, roll: 1.1, speed: 0.98, rough: 1 },
      dirt: { grip: 1.08, roll: 0.85, speed: 1.02, rough: 0.8 },
      gravel: { grip: 1.15, roll: 0.85, speed: 1.06, rough: 0.6 },
      grass: { grip: 1.1, roll: 0.75, speed: 1.06, rough: 0.7 },
      mud: { grip: 1.15, roll: 0.8, speed: 1.06, rough: 0.7 },
    },
  },
  road: {
    id: 'road',
    name: 'Road Bike',
    description: 'Fastest on smooth concrete, but twitchy on rough ground.',
    ratings: { speed: 10, acceleration: 8, stability: 4, cornering: 6 },
    radius: 0.38, tube: 0.045, mass: 0.8,
    maxSpeed: 14.3, acceleration: 7.9, turnRate: 2.0, grip: 10.9,
    instabilityMul: 1.22, recoveryRate: 0.48, recoveryTime: 1.0,
    affinity: {
      paved: { grip: 1.05, roll: 0.7, speed: 1.04, rough: 1 },
      dirt: { grip: 0.92, roll: 1.15, speed: 0.94, rough: 1.3 },
      gravel: { grip: 0.8, roll: 1.35, speed: 0.85, rough: 1.7 },
      grass: { grip: 0.85, roll: 1.4, speed: 0.88, rough: 1.4 },
      mud: { grip: 0.75, roll: 1.5, speed: 0.82, rough: 1.6 },
    },
  },
  moto: {
    id: 'moto',
    name: 'Motorbike',
    description: 'Heavy and rock-solid. Slow to get going and wide in the turns.',
    ratings: { speed: 8, acceleration: 4, stability: 10, cornering: 5 },
    radius: 0.39, tube: 0.09, mass: 2.4,
    maxSpeed: 13.3, acceleration: 5.4, turnRate: 1.85, grip: 10.2,
    instabilityMul: 0.6, recoveryRate: 0.72, recoveryTime: 1.15,
    affinity: {
      paved: neutral,
      dirt: { grip: 1, roll: 1, speed: 1, rough: 0.9 },
      gravel: { grip: 1, roll: 1, speed: 1, rough: 0.7 },
      grass: { grip: 1, roll: 1.1, speed: 0.98, rough: 0.8 },
      mud: { grip: 0.95, roll: 1.2, speed: 0.95, rough: 0.8 },
    },
  },
};

export const TYRE_IDS: TyreId[] = ['bmx', 'mtb', 'road', 'moto'];
