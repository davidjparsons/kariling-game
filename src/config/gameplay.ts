/** Global gameplay and physics constants. Tyre/stick/surface/hazard specifics live in their own configs.
 *  Everything here is meant to be tuned during playtesting. */
export const SIM_HZ = 60;
export const FIXED_DT = 1 / SIM_HZ;

export const PHYSICS = {
  gravity: 9.81,
  /** Gravity used for the arcade airborne arc (a little heavier than real for snappy hops). */
  airGravity: 17,
  brakeDecel: 9,
  airDrag: 0.0035,
  /** Steering smoothing (steer units/sec) at low and top speed. */
  steerRateLow: 7,
  steerRateHigh: 2.8,
  steerReturnRate: 8,
  /** Minimum turn ability at standstill (runner can walk the tyre round). */
  standstillTurn: 0.4,

  // ---- Balance / instability -------------------------------------------------
  /** Load ratio (lateral demand ÷ grip) where cornering starts to hurt, at low and at top speed.
   *  The threshold falls with speed, so tight turns at full pelt are risky. */
  stressThresholdLow: 0.8,
  stressThresholdHigh: 0.25,
  cornerStressGain: 3.2,
  /** Higher = big over-limit turns build instability less abruptly (more warning time). */
  cornerStressSoftness: 1.5,
  /** Instability from jerky steering at speed (per steer-unit/sec, scaled by speed²). */
  steerJerkGain: 0.09,
  roughStressGain: 0.55,
  /** Instability from uneven ground patches (per unit of roughness above 1, at 8 m/s). */
  lumpStressGain: 0.9,
  /** Recovery multiplier at standstill vs top speed — slowing down is how you calm a wobble. */
  recoverySlowMul: 1.7,
  recoveryFastMul: 0.45,
  balanceRecoveryMul: 2.3,
  balancePushMul: 0.35,
  maxLean: 0.6,
  /** Always-on gentle wobble so the tyre feels alive on straights. */
  idleWobble: 0.06,

  // ---- Control state machine (hysteresis) ------------------------------------
  unstableEnter: 0.42,
  unstableExit: 0.28,
  /** Instability at which control is lost. */
  lostThreshold: 1,
  /** A single impact this strong (in instability units) knocks the tyre out of control outright. */
  severeImpact: 0.8,
  /** Steering response multiplier while unstable (it gets laggy and vague). */
  unstableSteerMul: 0.6,
  /** Push effectiveness lost at full instability while still in contact. */
  unstableContactLoss: 0.55,
  /** After recovering from OUT OF CONTROL. */
  postRecoverInstability: 0.22,
  invulnerableAfterRecover: 1.8,

  // ---- Out of control --------------------------------------------------------
  /** Extra rolling decel (m/s²) for a loose, falling tyre. */
  looseTyreDecel: 3.2,
  fallTipRate: 2.6,
  /** Tyre must be slower than this before the runner can grab it. */
  pickupMaxSpeed: 2.2,
  pickupTime: 0.65,
  /** Hard cap on time out of control before a safe respawn. */
  maxLostTime: 6,

  // ---- Runner ------------------------------------------------------------------
  /** Runner top sprint when chasing a loose/launched tyre (m/s). */
  runnerChaseSpeed: 8.5,
  /** While racing the runner can briefly exceed the tyre's speed by this much. */
  runnerCatchUpBoost: 3,
  /** Extra distance beyond the comfortable stick position before contact is lost (m). */
  contactSlack: 0.5,
  /** Distance at which a separated runner re-catches the tyre (m). */
  recatchDistance: 0.3,
  /** Separated for this long → OUT OF CONTROL. */
  maxSeparatedTime: 2.6,
  /** Instability added per second while the tyre rolls unattended. */
  unattendedInstability: 0.22,

  // ---- Airborne ------------------------------------------------------------------
  /** Landing vertical speed (m/s) that lands softly with no penalty. */
  landSoftSpeed: 2.2,
  landImpactGain: 0.14,
  /** Penalty for landing while leaning/steered (per rad of lean). */
  landLeanGain: 0.55,
  landSteerGain: 0.25,
  /** Landing faster than this bounces. */
  bounceMinSpeed: 3.6,
  bounceRestitution: 0.28,
  /** Steering authority while airborne. */
  airSteer: 0.1,
  /** A step this much higher than an airborne tyre acts as a wall (m). */
  wallStep: 0.15,
  /** Energy lost (fraction of speed per metre climbed). */
  climbSpeedLoss: 0.35,

  // ---- Collisions --------------------------------------------------------------
  tyreRadius: 0.36,
  runnerRadius: 0.3,
  restitution: 0.35,
  /** Instability per m/s of closing speed, scaled by how side-on the hit is. */
  collisionInstabilityGain: 0.09,
  collisionSideMul: 1.8,
  maxCollisionImpulse: 4,

  // ---- Effects -----------------------------------------------------------------
  boostTime: 1.5,
  boostSpeedMul: 1.2,
  boostAccelMul: 1.8,
  boostInstabilityMul: 1.35,
  stunTime: 1.1,
  stunSpeedKeep: 0.35,
  stunInstability: 0.35,
  invulnerableAfterStun: 2.5,
  /** Dog-poo penalties at full dirt (cartoon smell + slippery tread). */
  dirtSpeedMul: 0.84,
  dirtGripMul: 0.75,
  dirtInstabilityMul: 0.4,
  /** Racing on: seconds for the smell to wear off completely by itself. */
  dirtDuration: 15,
  /** Pulling over (near the road edge / on the verge) below this speed starts cleaning. */
  cleanMaxSpeed: 2.6,
  cleanTime: 0.9,
  /** Extra dirt rubbed off per second rolling on grass. */
  grassCleanRate: 0.12,

  // ---- Stamina -----------------------------------------------------------------
  /** Stamina per second spent at full acceleration effort. */
  staminaDrain: 0.2,
  /** Stamina per second recovered while coasting. */
  staminaRegen: 0.3,
  /** Recovery while pushing at a steady cruising speed. */
  staminaCruiseRegen: 0.03,
  /** Push acceleration (m/s²) that counts as full effort for stamina. */
  staminaEffortRef: 7.5,

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
  /** Delay in a canal before respawning (the time penalty). */
  canalRespawnDelay: 1.7,
  invulnerableAfterRespawn: 2,
} as const;

/** Stick lengths (m) — spec: children 70 cm, adults 100 cm. */
export const STICK_LENGTH = { child: 0.7, adult: 1.0 } as const;
