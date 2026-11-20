/** Item pool, projectile tuning, double-tap dash and the ramp landing bonus. */
export type ItemId = 'buko' | 'saging' | 'skyflakes' | 'turon';

export interface EffectMods {
  /** Push acceleration. */
  accel: number;
  /** Top speed. */
  speed: number;
  /** All instability gain. */
  instability: number;
  /** Extra multiplier on cornering stress only (sharp turns). */
  corner: number;
  /** Steering response rate (precision). */
  steer: number;
  /** Instability recovery. */
  recovery: number;
  /** Stamina drain while pushing. */
  staminaDrain: number;
  /** Rolling resistance (lower = keeps momentum). */
  rolling: number;
  /** Braking strength (lower = harder to slow down). */
  brake: number;
}

export const NEUTRAL_MODS: Readonly<EffectMods> = Object.freeze({
  accel: 1, speed: 1, instability: 1, corner: 1, steer: 1, recovery: 1, staminaDrain: 1, rolling: 1, brake: 1,
});

/** Caps on the combined modifiers so no combination becomes overwhelming. */
export const EFFECT_LIMITS = {
  accelMax: 2.1,
  /** Includes boost pads and the landing bonus. */
  speedMax: 1.3,
  instabilityMin: 0.45,
  rollingMin: 0.45,
} as const;

export type ProjectileId = Exclude<ItemId, 'turon'>;

export interface ProjectileConfig {
  direction: 'both' | 'forward' | 'backward';
  radius: number;
  lifetime: number;
  launchHeight: number;
  launchUp: number;
  forwardSpeed: number;
  backwardSpeed: number;
  backwardLaunch?: { height: number; up: number };
  gravity: number;
  bounce: number;
  rolling: number;
  airDrag: number;
  speedLoss: number;
  impactBase: number;
  impactPerSpeed: number;
  maxImpact: number;
  color: number;
}

export const PROJECTILES: Record<ProjectileId, ProjectileConfig> = {
  buko: {
    direction: 'both', radius: 0.23, lifetime: 7, launchHeight: 0.48, launchUp: 1.9,
    forwardSpeed: 10, backwardSpeed: 7, backwardLaunch: { height: 0.27, up: 0.15 }, gravity: 9.81, bounce: 0.52, rolling: 0.85, airDrag: 0.13,
    speedLoss: 0.035, impactBase: 0.24, impactPerSpeed: 0.053, maxImpact: 1.1, color: 0x9cdb4a,
  },
  saging: {
    direction: 'backward', radius: 0.28, lifetime: 11, launchHeight: 0.18, launchUp: 0,
    forwardSpeed: 0, backwardSpeed: 0, gravity: 9.81, bounce: 0, rolling: 7, airDrag: 5,
    speedLoss: 0.026, impactBase: 0.19, impactPerSpeed: 0.037, maxImpact: 0.62, color: 0xffdc44,
  },
  skyflakes: {
    direction: 'forward', radius: 0.15, lifetime: 1.45, launchHeight: 0.53, launchUp: 0.3,
    forwardSpeed: 15, backwardSpeed: 0, gravity: 4, bounce: 0, rolling: 9, airDrag: 0.3,
    speedLoss: 0.018, impactBase: 0.12, impactPerSpeed: 0.02, maxImpact: 0.48, color: 0xf4d7a0,
  },
};

interface ItemConfig {
  id: ItemId;
  name: string;
  effect: string;
  icon: string;
  cooldown: number;
  weightLead: number;
  weightBack: number;
}

export const ITEMS: Record<ItemId, ItemConfig> = {
  buko: { id: 'buko', name: 'Buko Missile', effect: 'Buko away', icon: '🥥', cooldown: 2.4, weightLead: 28, weightBack: 36 },
  saging: { id: 'saging', name: 'Saging Peel', effect: 'Peel dropped', icon: '🍌', cooldown: 2, weightLead: 36, weightBack: 12 },
  skyflakes: { id: 'skyflakes', name: 'SkyFlakes Cracker Shot', effect: 'Cracker shot', icon: '🍘', cooldown: 1.6, weightLead: 24, weightBack: 26 },
  turon: { id: 'turon', name: 'Turon Turbo', effect: 'Turon turbo', icon: '🍌', cooldown: 3, weightLead: 12, weightBack: 26 },
};

export const TURON_TURBO = {
  duration: 3.5,
  mods: { accel: 1.55, speed: 1.12, rolling: 0.75 } as Partial<EffectMods>,
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export const ITEM_RULES = {
  /** Roulette time after collecting before the item can be used (s). */
  revealTime: 1.0,
  /** Prevent item hits from chaining on the same racer. */
  hitProtection: 1.8,
  /** Pickup respawn delay (s). */
  respawnTime: 6,
  /** Tyre-to-pickup distance that collects it (m). */
  collectRadius: 0.95,
} as const;

/** Double-tap the push control for a short dash (spec: skill, not a replacement for pushing). */
export const DASH = {
  /** Max time between the two taps (s). */
  doubleTapWindow: 0.32,
  duration: 0.75,
  mods: { accel: 1.7, speed: 1.06, instability: 1.45, steer: 0.82, corner: 1.25 } as Partial<EffectMods>,
  /** Stamina spent per dash, and the minimum needed to dash at all. */
  staminaCost: 0.14,
  minStamina: 0.12,
  /** Wobble kick on activation (instability units). */
  wobbleKick: 0.06,
  cooldown: 3.2,
} as const;

/** Reward for landing a real ramp jump and getting the scoop back on the tyre quickly. */
export const LANDING_BONUS = {
  /** Ground launch factor that counts as a legitimate ramp (logs/humps are lower). */
  minLaunch: 0.9,
  /** Must leave the ramp this fast upwards (m/s) — just touching the ramp doesn't count. */
  minTakeoffVy: 0.8,
  minAirTime: 0.25,
  /** Seconds after touchdown to reconnect the scoop. */
  catchWindow: 1.3,
  /** Landing severity above this (instability units) is a botched landing: no bonus. */
  maxSeverity: 0.68,
  duration: 1.1,
  mods: { accel: 1.45, speed: 1.06 } as Partial<EffectMods>,
} as const;
