/**
 * Filipino snack & drink power-ups, double-tap dash and the ramp "Nice Catch!" bonus.
 * Everything here is data: tune durations, strengths and odds without touching the simulation.
 * Display names are generic ("Corn Chips", "Crackers", "Cola") so no brand names or packaging
 * are reproduced; the ids keep the original brief's names for reference.
 *
 * Effect modifiers multiply the racer's normal handling while the effect is active. Several
 * effects can overlap (e.g. a dash during Golden Roll), but the combined result is clamped by
 * `EFFECT_LIMITS`, and re-using the same item only refreshes its timer — buffs never stack up.
 */

export type ItemId = 'buko' | 'chippy' | 'skyflakes' | 'pandesal' | 'turon' | 'cola';

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
  /** Runner animation speed. */
  anim: number;
}

export const NEUTRAL_MODS: Readonly<EffectMods> = Object.freeze({
  accel: 1, speed: 1, instability: 1, corner: 1, steer: 1, recovery: 1, staminaDrain: 1, rolling: 1, brake: 1, anim: 1,
});

/** Caps on the combined modifiers so no combination becomes overwhelming. */
export const EFFECT_LIMITS = {
  accelMax: 2.1,
  /** Includes boost pads and the landing bonus. */
  speedMax: 1.3,
  instabilityMin: 0.45,
  rollingMin: 0.45,
} as const;

export interface ItemConfig {
  id: ItemId;
  /** Display name. */
  name: string;
  /** Effect name shown when used. */
  effect: string;
  /** HUD icon (emoji; renders on every platform without image assets). */
  icon: string;
  description: string;
  /** Effect duration (s). */
  duration: number;
  /** Modifiers while active (unspecified = 1). */
  mods: Partial<EffectMods>;
  /** Stamina restored instantly on use (0..1). */
  stamina?: number;
  /** Absorbs this many moderate hits (collision, hazard, dog). */
  shieldHits?: number;
  /** After the effect, a crash phase with these modifiers for `crashDuration` s. */
  crash?: Partial<EffectMods>;
  crashDuration?: number;
  /** Relative pick weight for a racer in the lead / at the back (interpolated by position). */
  weightLead: number;
  weightBack: number;
}

export const ITEMS: Record<ItemId, ItemConfig> = {
  buko: {
    id: 'buko', name: 'Buko', effect: 'Stability Shield', icon: '🥥',
    description: 'Young coconut: steadier tyre, less wobble, shrugs off one bump or bite.',
    duration: 8, shieldHits: 1,
    mods: { instability: 0.55, recovery: 1.5 },
    weightLead: 30, weightBack: 16,
  },
  chippy: {
    id: 'chippy', name: 'Corn Chips', effect: 'Crunch Boost', icon: '🌽',
    description: 'Corn chips: a short crunchy burst of speed. A little twitchy while it lasts.',
    duration: 1.7,
    mods: { accel: 1.75, speed: 1.1, instability: 1.25 },
    weightLead: 26, weightBack: 20,
  },
  skyflakes: {
    id: 'skyflakes', name: 'Crackers', effect: 'Recovery Boost', icon: '🍘',
    description: 'Plain crackers: stamina back, stronger pushes, wobbles settle fast.',
    duration: 4, stamina: 0.35,
    mods: { accel: 1.15, recovery: 2.2 },
    weightLead: 22, weightBack: 16,
  },
  pandesal: {
    id: 'pandesal', name: 'Pandesal', effect: 'Endurance', icon: '🍞',
    description: 'Warm bread roll: lots of stamina and you tire much slower for a while.',
    duration: 7, stamina: 0.6,
    mods: { staminaDrain: 0.35 },
    weightLead: 18, weightBack: 14,
  },
  turon: {
    id: 'turon', name: 'Turon', effect: 'Golden Roll', icon: '🍌',
    description: 'Banana spring roll: faster and keeps rolling — hard to slow for corners!',
    duration: 4,
    mods: { accel: 1.3, speed: 1.1, rolling: 0.5, brake: 0.55 },
    weightLead: 4, weightBack: 18,
  },
  cola: {
    id: 'cola', name: 'Cola sa Plastik', effect: 'Sugar Rush', icon: '🥤',
    description: 'Cola in a tied plastic bag: big burst, frantic legs, very wobbly in sharp turns — then a sugar crash.',
    duration: 2.6,
    mods: { accel: 2.0, speed: 1.16, corner: 1.9, steer: 0.85, anim: 1.35 },
    crash: { staminaDrain: 2.6, accel: 0.92 }, crashDuration: 3.5,
    weightLead: 2, weightBack: 16,
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export const ITEM_RULES = {
  /** Roulette time after collecting before the item can be used (s). */
  revealTime: 1.0,
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
  maxSeverity: 0.45,
  duration: 1.1,
  mods: { accel: 1.45, speed: 1.06 } as Partial<EffectMods>,
} as const;
