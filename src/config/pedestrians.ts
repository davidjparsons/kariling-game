/** Villager behaviour at road crossings. Tune freely — the sim reads only these values. */
export const PEDESTRIAN = {
  /** Where people stand to cross, beyond the road edge (m). */
  kerbOffset: 1.3,
  walkSpeed: 1.25,
  childWalkSpeed: 1.6,
  /** Hurrying out of the way (m/s). */
  dodgeSpeed: 3.2,
  /** Racers further back than this along the road are ignored (m). */
  lookDistance: 40,
  /** An attentive person crosses only if no racer arrives within this many seconds. */
  safeGap: 3.2,
  /** Even a distracted person never steps out if a racer is closer than this (s) — always fair. */
  minReactionTime: 1.6,
  /** Chance a person crosses without waiting for a big gap (makes racers slow down sometimes). */
  distractedChance: 0.3,
  /** Give up waiting for a gap after this long (s), try again later. */
  maxHesitate: 6,
  retryDelay: [5, 11] as [number, number],
  firstDelay: [2, 9] as [number, number],
  /** While crossing: a racer arriving within this time (s) and lateral distance (m) triggers a dodge. */
  dodgeTime: 1.1,
  dodgeLane: 1.8,
  /** Never on the carriageway longer than this (s). */
  maxOnRoad: 12,
  startledTime: 0.9,
  /** Contact distance between a person and a tyre/runner centre (m). */
  hitRadius: 0.6,
  /** A bumped person can't be bumped again for this long (s). */
  bumpCooldown: 2.5,
  /** Racer penalty on contact: speed kept and instability added (scaled by speed). */
  bumpSpeedKeep: 0.72,
  bumpInstability: 0.12,
  bumpInstabilitySpeed: 0.022,
} as const;
