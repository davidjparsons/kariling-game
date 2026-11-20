import { PHYSICS, RACE, STICK_LENGTH } from '../config/gameplay';
import type { StickConfig } from '../config/sticks';
import { SURFACES, type SurfaceConfig, type SurfaceId } from '../config/surfaces';
import type { TyreConfig } from '../config/tyres';
import { approach, clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math';

/** Device-independent racer input. Keyboard, touch and AI all produce this. */
export interface RacerInput {
  /** -1 (left) .. 1 (right). */
  steer: number;
  /** 0..1 */
  push: number;
  /** 0..1 */
  brake: number;
  /** Steady the tyre: faster balance recovery, weaker pushing. */
  balance: boolean;
}

export const NO_INPUT: RacerInput = Object.freeze({ steer: 0, push: 0, brake: 0, balance: false });

/** The three tyre-control states (spec §24.12). */
export type ControlState = 'controlled' | 'unstable' | 'lost';
export type LostKind = 'fall' | 'impact' | 'separated' | 'canal';
/** Sub-phases while OUT OF CONTROL. */
export type LostPhase = 'chase' | 'pickup' | 'canal';

export interface RacerPhysicsState {
  // ---- tyre ----
  x: number;
  z: number;
  /** Height of the tyre's contact point above the base ground plane (m). */
  y: number;
  vy: number;
  grounded: boolean;
  airTime: number;
  /** Forward = (sin heading, cos heading). Increasing heading turns left. */
  heading: number;
  /** Forward speed (m/s, >= 0). */
  speed: number;
  /** Sideways slide velocity along the right vector (m/s). */
  latVel: number;
  /** Smoothed steering -1..1. */
  steer: number;
  /** Lean angle (rad), positive = leaning right. Wobble is added visually. */
  lean: number;
  /** 0..1+ — drives the control state machine. */
  instability: number;
  wobblePhase: number;
  /** Smoothed wobble amplitude 0..1. */
  wobble: number;
  stamina: number;
  /** Accumulated wheel rotation (rad). */
  roll: number;
  surface: SurfaceId;
  /** Lateral load ratio (demand/grip) last step. */
  load: number;
  /** 0..1 slide amount for effects. */
  slip: number;
  /** Actual yaw rate last step (rad/s, positive = right turn). */
  yawRate: number;

  // ---- control state machine ----
  control: ControlState;
  controlTime: number;
  lostKind: LostKind;
  lostPhase: LostPhase;
  fallSide: number;
  /** Set when the race should put this racer back on the track. */
  needsRespawn: boolean;

  // ---- runner + stick ----
  rx: number;
  rz: number;
  rHeading: number;
  /** Runner's actual speed (m/s). */
  rSpeed: number;
  /** 0..1 quality of scoop-on-tyre contact. */
  stickContact: number;
  /** Runner has fallen too far behind to reach the tyre. */
  separated: boolean;
  separatedTime: number;

  // ---- push rhythm / effort ----
  pushPhase: number;
  pushing: number;

  // ---- effects / timers ----
  stun: number;
  invuln: number;
  boost: number;
  /** 0..1 dog-poo dirt on the tyre. */
  dirt: number;
  /** Seconds of tyre-cleaning left (0 = not cleaning). */
  cleaning: number;
  /** Strength of the most recent impact (instability units) — for effects. */
  impact: number;
  /** Instability gain sources last step (per second) — for the debug HUD and tuning. */
  stressCorner: number;
  stressJerk: number;
  stressRough: number;
}

export const EV_TAP = 1;
export const EV_FALL = 2; // entered OUT OF CONTROL
export const EV_RECOVER_START = 4; // runner started picking the tyre up
export const EV_RECOVERED = 8;
export const EV_BUMP = 16;
export const EV_LAUNCH = 32;
export const EV_LAND = 64;
export const EV_SEPARATE = 128;
export const EV_CATCH = 256;
export const EV_UNSTABLE = 512;
export const EV_CANAL = 1024;
export const EV_CLEAN_START = 2048;
export const EV_CLEANED = 4096;
// Race-level events (hazards, dogs) share the same bit field.
export const EV_BOOST = 1 << 13;
export const EV_POO = 1 << 14;
export const EV_STUN = 1 << 15;
export const EV_HAZARD = 1 << 16;
export const EV_RESPAWN = 1 << 17;

export interface RunnerConfig {
  stickLength: number;
  /** Comfortable runner position behind the tyre centre (m). */
  followBack: number;
  /** Runner offset to the left of the tyre (m). */
  followSide: number;
}

/** Where the runner must be for a stick of the given length to reach the scoop contact. */
export function runnerConfig(age: 'child' | 'adult', tyreRadius: number): RunnerConfig {
  const stickLength = STICK_LENGTH[age];
  const handH = age === 'adult' ? 0.8 : 0.58;
  const contactH = tyreRadius * 0.6;
  const drop = handH - contactH;
  const horiz = Math.sqrt(Math.max(0.05, (stickLength * 0.96) ** 2 - drop * drop));
  return { stickLength, followBack: tyreRadius * 0.92 + horiz + 0.14, followSide: 0.26 };
}

export interface PhysicsContext {
  tyre: TyreConfig;
  stick: StickConfig;
  runner: RunnerConfig;
}

/** Ground under a world point, already resolved to a surface. */
export interface Ground {
  h: number;
  launch: number;
  surface: SurfaceId;
  canal: boolean;
}
export type GroundFn = (x: number, z: number) => Ground;

export const FLAT_GROUND: GroundFn = () => ({ h: 0, launch: 0, surface: 'dirt', canal: false });

export function createRacerState(x: number, z: number, heading: number, runner?: RunnerConfig): RacerPhysicsState {
  const back = runner?.followBack ?? 1.1, side = runner?.followSide ?? 0.26;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  return {
    x, z, y: 0, vy: 0, grounded: true, airTime: 0, heading, speed: 0, latVel: 0, steer: 0, lean: 0,
    instability: 0, wobblePhase: 0, wobble: 0, stamina: 1, roll: 0, surface: 'dirt', load: 0, slip: 0, yawRate: 0,
    control: 'controlled', controlTime: 0, lostKind: 'fall', lostPhase: 'chase', fallSide: 1, needsRespawn: false,
    rx: x - fx * back + fz * side, rz: z - fz * back - fx * side, rHeading: heading, rSpeed: 0,
    stickContact: 1, separated: false, separatedTime: 0,
    pushPhase: 0, pushing: 0, stun: 0, invuln: 0, boost: 0, dirt: 0, cleaning: 0, impact: 0,
    stressCorner: 0, stressJerk: 0, stressRough: 0,
  };
}

/** Stamina → push efficiency. Low stamina weakens, never stops, the runner. */
export function staminaFactor(stamina: number): number {
  return 0.5 + 0.5 * smoothstep(0, 0.3, stamina);
}

/** Effective top speed for a tyre on a surface at full stamina. */
export function effectiveMaxSpeed(tyre: TyreConfig, surface: SurfaceConfig): number {
  return tyre.maxSpeed * surface.speedMul * tyre.affinity[surface.id].speed;
}

/** Lateral grip limit (m/s²) for a tyre on a surface. */
export function gripLimit(tyre: TyreConfig, surface: SurfaceConfig, balancing = false): number {
  return tyre.grip * surface.grip * tyre.affinity[surface.id].grip * (balancing ? 1.08 : 1);
}

/** Steering authority multiplier as a function of speed. */
export function turnScale(speed: number, maxSpeed: number): number {
  const norm = clamp(speed / maxSpeed, 0, 1);
  return lerp(1, 0.55, norm) * (PHYSICS.standstillTurn + (1 - PHYSICS.standstillTurn) * smoothstep(0, 3, speed));
}

/** Load ratio at which cornering starts building instability — lower at higher speed. */
export function stressThreshold(speedNorm: number): number {
  const t = clamp(speedNorm, 0, 1);
  return lerp(PHYSICS.stressThresholdLow, PHYSICS.stressThresholdHigh, t * t);
}

/** Can the runner currently push and steer the tyre? */
export function hasControl(st: RacerPhysicsState): boolean {
  return st.control !== 'lost' && st.grounded && !st.separated && st.stun <= 0 && st.cleaning <= 0;
}

/** Enter OUT OF CONTROL. */
export function loseControl(st: RacerPhysicsState, kind: LostKind): number {
  if (st.control === 'lost') return 0;
  st.control = 'lost';
  st.controlTime = 0;
  st.lostKind = kind;
  st.lostPhase = kind === 'canal' ? 'canal' : 'chase';
  st.fallSide = st.lean !== 0 ? Math.sign(st.lean) : st.latVel !== 0 ? -Math.sign(st.latVel) : 1;
  st.stickContact = 0;
  st.separated = true;
  st.cleaning = 0;
  st.speed *= kind === 'impact' ? 0.75 : 0.85;
  return EV_FALL;
}

/**
 * Add an impact (collision, landing, obstacle) in instability units.
 * Protected racers (recent stun/respawn) only feel a fraction of it.
 */
export function addImpact(st: RacerPhysicsState, amount: number, ctx: PhysicsContext): number {
  if (amount <= 0 || st.control === 'lost') return 0;
  const scaled = amount * ctx.tyre.instabilityMul * (st.invuln > 0 ? 0.25 : 1);
  st.impact = Math.max(st.impact, scaled);
  st.instability += scaled;
  if (scaled >= PHYSICS.severeImpact || st.instability >= PHYSICS.lostThreshold) {
    return loseControl(st, scaled >= PHYSICS.severeImpact ? 'impact' : 'fall');
  }
  return 0;
}

/** Dog catch / cartoon stun. Returns false if the racer is protected. */
export function applyStun(st: RacerPhysicsState, ctx: PhysicsContext): boolean {
  if (st.invuln > 0 || st.stun > 0 || st.control === 'lost') return false;
  st.stun = PHYSICS.stunTime;
  st.speed *= PHYSICS.stunSpeedKeep;
  st.invuln = PHYSICS.stunTime + PHYSICS.invulnerableAfterStun;
  addImpact(st, PHYSICS.stunInstability / ctx.tyre.instabilityMul, ctx);
  return true;
}

export function applyBoost(st: RacerPhysicsState): void {
  if (st.control === 'lost') return;
  st.boost = PHYSICS.boostTime;
}

export function applyDirt(st: RacerPhysicsState): void {
  st.dirt = 1;
  st.cleaning = 0;
}

/** Clear transient state after a respawn/recovery. */
export function resetControl(st: RacerPhysicsState, ctx: PhysicsContext, invuln: number): void {
  st.control = 'controlled';
  st.controlTime = 0;
  st.instability = 0;
  st.lean = 0;
  st.latVel = 0;
  st.vy = 0;
  st.grounded = true;
  st.airTime = 0;
  st.separated = false;
  st.separatedTime = 0;
  st.stickContact = 1;
  st.stun = 0;
  st.cleaning = 0;
  st.needsRespawn = false;
  st.invuln = Math.max(st.invuln, invuln);
  const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
  st.rx = st.x - fx * ctx.runner.followBack + fz * ctx.runner.followSide;
  st.rz = st.z - fz * ctx.runner.followBack - fx * ctx.runner.followSide;
  st.rHeading = st.heading;
}

/**
 * Advance one racer by a fixed timestep. Arcade model: forward speed + heading + lateral
 * slide, a vertical channel for hops and jumps, a simulated runner, and the three-state
 * control machine. Returns event flags (EV_*).
 */
export function stepRacer(st: RacerPhysicsState, input: RacerInput, ctx: PhysicsContext, ground: GroundFn, dt: number): number {
  const { tyre, stick } = ctx;
  let events = 0;
  st.controlTime += dt;
  st.stun = Math.max(0, st.stun - dt);
  st.invuln = Math.max(0, st.invuln - dt);
  st.boost = Math.max(0, st.boost - dt);
  st.impact = Math.max(0, st.impact - dt * 2);

  const g0 = ground(st.x, st.z);
  st.surface = g0.surface;
  const surface = SURFACES[g0.surface];
  const aff = tyre.affinity[surface.id];
  const speedNorm = clamp(st.speed / tyre.maxSpeed, 0, 1.3);

  if (st.control === 'lost') {
    events |= stepLost(st, input, ctx, surface, dt);
  } else {
    // ---------------- dirt + cleaning ----------------
    if (st.cleaning > 0) {
      st.cleaning -= dt;
      st.speed = Math.max(0, st.speed - 6 * dt);
      if (st.cleaning <= 0) { st.cleaning = 0; st.dirt = 0; events |= EV_CLEANED; }
    } else if (st.dirt > 0.05 && st.grounded && st.speed < PHYSICS.cleanMaxSpeed && input.push < 0.5 && st.stun <= 0) {
      st.cleaning = PHYSICS.cleanTime;
      events |= EV_CLEAN_START;
    }
    if (st.dirt > 0 && surface.id === 'grass' && st.speed > 2) st.dirt = Math.max(0, st.dirt - PHYSICS.grassCleanRate * dt);

    const control = hasControl(st);
    const contact = control ? st.stickContact : 0;
    const balancing = input.balance && control;

    // ---------------- steering ----------------
    const steerIn = control ? clamp(input.steer, -1, 1) * (st.stun > 0 ? 0.3 : 1) : 0;
    const returning = Math.abs(steerIn) < Math.abs(st.steer) || steerIn * st.steer < 0;
    let rate = returning ? PHYSICS.steerReturnRate : lerp(PHYSICS.steerRateLow, PHYSICS.steerRateHigh, Math.min(1, speedNorm));
    if (st.control === 'unstable') rate *= PHYSICS.unstableSteerMul;
    const prevSteer = st.steer;
    st.steer = approach(st.steer, steerIn, rate * dt);
    const steerJerk = Math.abs(st.steer - prevSteer) / dt;

    // ---------------- longitudinal ----------------
    const dirtK = st.dirt;
    const pushIn = control ? clamp(input.push, 0, 1) : 0;
    const effPush = pushIn * (balancing ? PHYSICS.balancePushMul : 1) * contact;
    const sf = staminaFactor(st.stamina);
    const boosting = st.boost > 0;
    const vmax = effectiveMaxSpeed(tyre, surface) * (0.94 + 0.06 * sf) * (0.6 + 0.4 * Math.min(1, effPush / Math.max(0.01, contact)))
      * (boosting ? PHYSICS.boostSpeedMul : 1) * lerp(1, PHYSICS.dirtSpeedMul, dirtK);
    const ratio = st.speed / Math.max(0.1, vmax);
    let drive = 0;
    if (st.grounded && effPush > 0 && ratio < 1) {
      drive = tyre.acceleration * stick.pushPower * surface.accelMul * sf * effPush * (1 - ratio * ratio)
        * (boosting ? PHYSICS.boostAccelMul : 1);
    }
    if (boosting && st.grounded && ratio < 1) drive = Math.max(drive, 4 * (1 - ratio)); // the boost carries you a bit even unpushed
    const resist = (st.grounded ? surface.rollingResistance * aff.roll : 0) + PHYSICS.airDrag * st.speed * st.speed;
    const brakeAcc = st.grounded && control ? clamp(input.brake, 0, 1) * PHYSICS.brakeDecel : 0;
    st.speed = Math.max(0, st.speed + (drive - resist - brakeAcc) * dt);

    // ---------------- lateral ----------------
    const grip = gripLimit(tyre, surface, balancing) * lerp(1, PHYSICS.dirtGripMul, dirtK);
    let yaw = st.steer * tyre.turnRate * stick.steerAssist * turnScale(st.speed, tyre.maxSpeed);
    if (!st.grounded) yaw *= PHYSICS.airSteer;
    const demand = st.speed * Math.abs(yaw);
    const load = st.grounded ? demand / grip : 0;
    st.load = load;
    if (load > 1) {
      yaw /= Math.sqrt(load);
      const excess = demand - grip;
      st.latVel -= Math.sign(st.steer) * excess * 0.45 * dt;
      st.speed = Math.max(0, st.speed - excess * 0.12 * dt);
    }
    if (st.grounded) st.latVel *= Math.exp(-grip * 0.45 * dt);
    st.slip = clamp(Math.abs(st.latVel) / 2.5 + Math.max(0, load - 1) * 0.5, 0, 1);
    st.yawRate = yaw;

    st.wobblePhase += (7 + st.speed * 0.9) * dt;
    // Wobble feeds heading noise, so instability is felt, not just seen.
    const wobbleSteer = st.wobble * (st.control === 'unstable' ? 0.7 : 0.35) * Math.sin(st.wobblePhase * 0.5) * Math.min(1, st.speed / 3);
    st.heading -= (yaw + wobbleSteer) * dt;

    // ---------------- balance ----------------
    if (st.grounded) {
      const thr = stressThreshold(speedNorm);
      const excess = Math.max(0, load - thr);
      // Saturating: extreme inputs still lose control, but always after a readable wobble.
      const cornerStress = (PHYSICS.cornerStressGain * excess) / (1 + excess * PHYSICS.cornerStressSoftness);
      const jerkStress = steerJerk * speedNorm * speedNorm * PHYSICS.steerJerkGain;
      const roughStress = surface.roughness * aff.rough * speedNorm * speedNorm * PHYSICS.roughStressGain;
      const mul = tyre.instabilityMul * stick.stabilityMul;
      st.stressCorner = cornerStress * mul; st.stressJerk = jerkStress * mul; st.stressRough = roughStress * mul;
      const unattended = st.separated && st.speed > 1.5 ? PHYSICS.unattendedInstability : 0;
      const gain = (cornerStress + jerkStress + roughStress) * tyre.instabilityMul * stick.stabilityMul
        * (boosting ? PHYSICS.boostInstabilityMul : 1) * (1 + 0.3 * dirtK) + unattended;
      const calm = (1 - 0.75 * smoothstep(thr * 0.6, thr, load)) * (steerJerk < 1.5 ? 1 : 0.6);
      const recovery = tyre.recoveryRate * calm * (balancing ? PHYSICS.balanceRecoveryMul : 1)
        * lerp(PHYSICS.recoverySlowMul, PHYSICS.recoveryFastMul, Math.min(1, speedNorm));
      st.instability = Math.max(0, st.instability + (gain - recovery) * dt);
    }

    // ---------------- control state machine ----------------
    if (st.control === 'controlled' && st.instability >= PHYSICS.unstableEnter) {
      st.control = 'unstable'; st.controlTime = 0; events |= EV_UNSTABLE;
    } else if (st.control === 'unstable' && st.instability <= PHYSICS.unstableExit) {
      st.control = 'controlled'; st.controlTime = 0;
    }
    if (st.instability >= PHYSICS.lostThreshold) events |= loseControl(st, 'fall');
    if (st.control === 'controlled' || st.control === 'unstable') {
      const leanTarget = clamp(Math.atan2(st.speed * yaw, PHYSICS.gravity), -PHYSICS.maxLean, PHYSICS.maxLean);
      st.lean = damp(st.lean, leanTarget * (st.control === 'unstable' ? 1.25 : 1), 8, dt);
    }

    // ---------------- stamina + stick rhythm ----------------
    if (effPush > 0.05) {
      const effort = drive / PHYSICS.staminaEffortRef;
      st.stamina += (PHYSICS.staminaCruiseRegen * (1 - effort) - PHYSICS.staminaDrain * stick.staminaCost * effort) * dt;
    } else {
      st.stamina += PHYSICS.staminaRegen * dt;
    }
    st.stamina = clamp(st.stamina, 0, 1);
    st.pushing = damp(st.pushing, effPush > 0.05 ? effPush : 0, 10, dt);
    if (effPush > 0.05) {
      const before = Math.floor(st.pushPhase);
      st.pushPhase += (1.6 + st.speed * 0.22) * stick.pushRate * dt;
      if (Math.floor(st.pushPhase) !== before) events |= EV_TAP;
    }
  }

  const target = Math.max(PHYSICS.idleWobble, Math.pow(Math.min(1, st.instability), 1.4));
  st.wobble = damp(st.wobble, st.control === 'lost' ? 0 : target, 6, dt);

  events |= integrate(st, ctx, ground, dt);
  events |= stepRunner(st, ctx, dt);
  return events;
}

/** OUT OF CONTROL: the loose tyre tumbles/rolls away and falls; the runner chases and picks it up. */
function stepLost(st: RacerPhysicsState, input: RacerInput, ctx: PhysicsContext, surface: SurfaceConfig, dt: number): number {
  let events = 0;
  const tyre = ctx.tyre;
  st.steer = approach(st.steer, 0, PHYSICS.steerReturnRate * dt);
  st.pushing = damp(st.pushing, 0, 8, dt);
  st.stamina = Math.min(1, st.stamina + PHYSICS.staminaRegen * dt);
  st.load = 0;
  st.slip = 0;
  st.yawRate = 0;
  st.stickContact = 0;
  if (st.grounded) {
    const decel = surface.rollingResistance * 3 + PHYSICS.looseTyreDecel + (st.lostPhase === 'canal' ? 6 : 0);
    st.speed = Math.max(0, st.speed - decel * dt);
    st.latVel *= Math.exp(-4 * dt);
    // A falling wheel curls towards the side it leans to.
    st.heading -= st.fallSide * 0.9 * Math.min(1, st.speed / tyre.maxSpeed) * dt;
    st.lean = approach(st.lean, st.fallSide * 1.4, PHYSICS.fallTipRate * dt);
  }
  if (st.lostPhase === 'canal') {
    if (st.controlTime > 0) st.needsRespawn = st.needsRespawn || st.controlTime >= RACE.canalRespawnDelay;
    return events;
  }
  if (st.controlTime > PHYSICS.maxLostTime) { st.needsRespawn = true; return events; }
  if (st.lostPhase === 'chase') {
    const d = Math.hypot(st.x - st.rx, st.z - st.rz);
    if (d < 0.95 && st.grounded && st.speed < PHYSICS.pickupMaxSpeed && st.stun <= 0) {
      st.lostPhase = 'pickup';
      st.controlTime = 0;
      events |= EV_RECOVER_START;
    }
  } else if (st.lostPhase === 'pickup') {
    st.speed = Math.max(0, st.speed - 8 * dt);
    st.lean = approach(st.lean, 0, 3 * dt);
    const quick = input.balance ? 0.75 : 1;
    if (st.controlTime >= PHYSICS.pickupTime * tyre.recoveryTime * quick) {
      // Turn the tyre to face the runner's direction of travel and carry on.
      st.heading = st.rHeading;
      resetControl(st, ctx, PHYSICS.invulnerableAfterRecover);
      st.instability = PHYSICS.postRecoverInstability;
      st.speed = 0.5;
      events |= EV_RECOVERED;
    }
  }
  return events;
}


/** Horizontal + vertical integration with ground following, launches and landings. */
function integrate(st: RacerPhysicsState, ctx: PhysicsContext, ground: GroundFn, dt: number): number {
  let events = 0;
  const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
  const rx = -fz, rz = fx; // right vector
  st.x += (fx * st.speed + rx * st.latVel) * dt;
  st.z += (fz * st.speed + rz * st.latVel) * dt;
  st.roll += (st.speed / ctx.tyre.radius) * dt;

  const G = PHYSICS.airGravity;
  const g1 = ground(st.x, st.z);
  if (st.grounded) {
    const dh = g1.h - st.y;
    if (dh >= 0) {
      // Climbing: some of the climb rate is carried as upward velocity (launches off crests).
      st.vy = (dh / dt) * g1.launch;
      if (dh > 0.0005) {
        const v2 = st.speed * st.speed - 2 * PHYSICS.gravity * dh * PHYSICS.climbSpeedLoss;
        st.speed = Math.sqrt(Math.max(0, v2));
      }
      st.y = g1.h;
    } else {
      const yp = st.y + st.vy * dt - 0.5 * G * dt * dt;
      if (g1.h >= yp - 0.002 && st.vy <= 0.5) {
        st.y = g1.h;
        st.vy = 0;
      } else {
        st.y = yp;
        st.vy -= G * dt;
        st.grounded = false;
        st.airTime = 0;
        if (st.vy > 0.6 || dh < -0.12) events |= EV_LAUNCH;
      }
    }
  } else {
    st.vy -= G * dt;
    st.y += st.vy * dt;
    st.airTime += dt;
    if (st.y <= g1.h) {
      const impactV = Math.max(0, -st.vy);
      st.y = g1.h;
      st.grounded = true;
      events |= EV_LAND;
      const speedNorm = clamp(st.speed / ctx.tyre.maxSpeed, 0, 1.3);
      const severity = Math.max(0, impactV - PHYSICS.landSoftSpeed) * PHYSICS.landImpactGain
        + Math.abs(st.lean) * PHYSICS.landLeanGain
        + Math.abs(st.steer) * speedNorm * PHYSICS.landSteerGain
        + st.airTime * speedNorm * speedNorm * 0.45;
      if (impactV > PHYSICS.bounceMinSpeed && !g1.canal) {
        st.vy = impactV * PHYSICS.bounceRestitution;
        st.grounded = false;
        st.airTime = 0;
      } else {
        st.vy = 0;
      }
      st.speed *= 1 - Math.min(0.15, impactV * 0.015);
      events |= addImpact(st, severity, ctx);
      if (severity > 0.15) events |= EV_BUMP;
    }
  }
  if (g1.canal && st.y < -0.25 && !(st.control === 'lost' && st.lostKind === 'canal')) {
    st.control = 'controlled'; // allow loseControl to re-enter as canal
    events |= loseControl(st, 'canal') | EV_CANAL;
  }
  return events;
}

/**
 * The runner follows behind-left of the tyre. If the tyre gets away (jumps, shoves, stuns)
 * contact is lost until the runner catches up; while OUT OF CONTROL the runner chases it.
 */
function stepRunner(st: RacerPhysicsState, ctx: PhysicsContext, dt: number): number {
  let events = 0;
  const cfg = ctx.runner;
  const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
  let tx: number, tz: number, maxSpeed: number;
  if (st.control === 'lost') {
    // Run to the loose tyre (stop at the canal edge).
    const back = st.lostPhase === 'pickup' ? 0.55 : 0.6;
    const dx = st.x - st.rx, dz = st.z - st.rz;
    const dist = Math.hypot(dx, dz) || 1;
    tx = st.x - (dx / dist) * back;
    tz = st.z - (dz / dist) * back;
    maxSpeed = st.lostPhase === 'canal' ? 3 : st.lostPhase === 'pickup' ? 1.5 : PHYSICS.runnerChaseSpeed * (st.stun > 0 ? 0.3 : 1);
  } else {
    tx = st.x - fx * cfg.followBack + fz * cfg.followSide;
    tz = st.z - fz * cfg.followBack - fx * cfg.followSide;
    const airborne = !st.grounded;
    maxSpeed = st.separated || airborne
      ? Math.max(PHYSICS.runnerChaseSpeed, st.speed + (st.separated ? 1.8 : -2))
      : st.speed + PHYSICS.runnerCatchUpBoost;
    if (st.stun > 0) maxSpeed *= 0.4;
  }
  const dx = tx - st.rx, dz = tz - st.rz;
  const dist = Math.hypot(dx, dz);
  const step = Math.min(dist, maxSpeed * dt);
  if (dist > 1e-5) {
    st.rx += (dx / dist) * step;
    st.rz += (dz / dist) * step;
  }
  st.rSpeed = damp(st.rSpeed, step / dt, 12, dt);
  // Face the tyre / direction of travel.
  const look = Math.atan2(st.x - st.rx, st.z - st.rz);
  const face = st.control === 'lost' ? look : st.heading + clamp(wrapAngle(look - st.heading), -0.5, 0.5) * 0.4;
  st.rHeading += wrapAngle(face - st.rHeading) * (1 - Math.exp(-10 * dt));

  if (st.control === 'lost') return events;
  // ---- stick contact ----
  const err = Math.hypot(tx - st.rx, tz - st.rz);
  if (!st.separated && err > PHYSICS.contactSlack) {
    st.separated = true;
    st.separatedTime = 0;
    events |= EV_SEPARATE;
  } else if (st.separated) {
    st.separatedTime += dt;
    if (err < PHYSICS.recatchDistance && st.grounded) {
      st.separated = false;
      events |= EV_CATCH;
    } else if (st.separatedTime > PHYSICS.maxSeparatedTime) {
      events |= loseControl(st, 'separated');
    }
  }
  const quality = !st.grounded || st.separated || st.cleaning > 0
    ? 0
    : 1 - PHYSICS.unstableContactLoss * smoothstep(0.25, 1, st.instability);
  st.stickContact = damp(st.stickContact, quality, 14, dt);
  return events;
}
