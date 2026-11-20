/** Global gameplay and physics constants. Tyre/stick/surface specifics live in their own configs. */
export const SIM_HZ = 60;
export const FIXED_DT = 1 / SIM_HZ;

export const PHYSICS = {
  gravity: 9.81,
  brakeDecel: 9,
  airDrag: 0.0035,
  /** Steering smoothing (steer units/sec) at low and top speed. */
  steerRateLow: 7,
  steerRateHigh: 3.2,
  steerReturnRate: 8,
  /** Minimum turn ability at standstill (runner can walk the tyre round). */
  standstillTurn: 0.4,
  /** Load ratio above which the tyre starts getting unstable. */
  stressThreshold: 0.72,
  cornerStressGain: 1.25,
  roughStressGain: 0.45,
  balanceRecoveryMul: 2.4,
  balancePushMul: 0.35,
  maxLean: 0.55,
  fallTime: 0.95,
  recoverTime: 0.85,
  postRecoverInstability: 0.3,
  /** Stamina per second spent at full acceleration effort. */
  staminaDrain: 0.2,
  /** Stamina per second recovered while coasting. */
  staminaRegen: 0.3,
  /** Recovery while pushing at a steady cruising speed. */
  staminaCruiseRegen: 0.03,
  /** Push acceleration (m/s²) that counts as full effort for stamina. */
  staminaEffortRef: 7.5,
  /** Collision footprint radius per racer (m). */
  racerRadius: 0.7,
  maxStepDistance: 5,
} as const;

export const RACE = {
  defaultLaps: 3,
  countdownSeconds: 3,
  /** Seconds to wait after the player finishes before showing results. */
  finishCelebration: 3.5,
  /** Max extra simulated seconds to let bots finish once the human is done. */
  maxFastForward: 150,
  stuckRespawnSeconds: 3.5,
} as const;
