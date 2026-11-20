import { PHYSICS } from '../config/gameplay';
import type { StickConfig } from '../config/sticks';
import type { SurfaceConfig, SurfaceId } from '../config/surfaces';
import type { TyreConfig } from '../config/tyres';
import { approach, clamp, damp, lerp, smoothstep } from '../core/math';

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

export type RacerMode = 'racing' | 'fallen' | 'recovering';

export interface RacerPhysicsState {
  x: number;
  z: number;
  /** Forward = (sin heading, cos heading). Increasing heading turns left. */
  heading: number;
  /** Forward speed (m/s, >= 0). */
  speed: number;
  /** Sideways slide velocity along the right vector (m/s). */
  latVel: number;
  /** Smoothed steering -1..1. */
  steer: number;
  /** Lean angle (rad), positive = leaning right. Includes no wobble. */
  lean: number;
  /** 0..1 — reaching 1 makes the tyre fall. */
  instability: number;
  wobblePhase: number;
  /** Smoothed visual wobble amplitude 0..1. */
  wobble: number;
  /** 0..1 */
  stamina: number;
  /** Accumulated wheel rotation (rad). */
  roll: number;
  mode: RacerMode;
  modeTime: number;
  fallSide: number;
  /** Stick tap rhythm phase. */
  pushPhase: number;
  /** Smoothed effective push 0..1 (for animation). */
  pushing: number;
  surface: SurfaceId;
  /** Lateral load ratio (demand/grip) last step. */
  load: number;
  /** 0..1 slide amount for effects. */
  slip: number;
  /** Actual yaw rate last step (rad/s, positive = right turn). */
  yawRate: number;
}

export const EV_TAP = 1;
export const EV_FALL = 2;
export const EV_RECOVER_START = 4;
export const EV_RECOVERED = 8;
export const EV_BUMP = 16;

export function createRacerState(x: number, z: number, heading: number): RacerPhysicsState {
  return {
    x, z, heading, speed: 0, latVel: 0, steer: 0, lean: 0, instability: 0, wobblePhase: 0, wobble: 0,
    stamina: 1, roll: 0, mode: 'racing', modeTime: 0, fallSide: 1, pushPhase: 0, pushing: 0,
    surface: 'dirt', load: 0, slip: 0, yawRate: 0,
  };
}

export interface PhysicsContext {
  tyre: TyreConfig;
  stick: StickConfig;
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

/**
 * Advance one racer by a fixed timestep. Pure arcade model:
 * forward speed + heading + lateral slide, with a balance (instability) meter.
 * Returns event flags (EV_*).
 */
export function stepRacer(
  st: RacerPhysicsState, input: RacerInput, ctx: PhysicsContext, surface: SurfaceConfig, dt: number,
): number {
  const { tyre, stick } = ctx;
  const aff = tyre.affinity[surface.id];
  let events = 0;
  st.surface = surface.id;
  st.modeTime += dt;

  if (st.mode !== 'racing') {
    // Fallen or picking the tyre back up: input mostly ignored.
    const quick = input.balance ? 0.75 : 1;
    st.speed *= Math.exp(-(st.mode === 'fallen' ? 3.2 : 6) * dt);
    st.latVel *= Math.exp(-5 * dt);
    st.steer = approach(st.steer, 0, PHYSICS.steerReturnRate * dt);
    st.pushing = damp(st.pushing, 0, 8, dt);
    st.stamina = Math.min(1, st.stamina + PHYSICS.staminaRegen * dt);
    st.yawRate = 0;
    st.load = 0;
    st.slip = 0;
    if (st.mode === 'fallen') {
      st.lean = damp(st.lean, st.fallSide * 1.35, 9, dt);
      if (st.modeTime >= PHYSICS.fallTime * tyre.recoveryTime * quick) {
        st.mode = 'recovering';
        st.modeTime = 0;
        events |= EV_RECOVER_START;
      }
    } else {
      st.lean = damp(st.lean, 0, 7, dt);
      if (st.modeTime >= PHYSICS.recoverTime * tyre.recoveryTime * quick) {
        st.mode = 'racing';
        st.modeTime = 0;
        st.instability = PHYSICS.postRecoverInstability;
        st.lean = 0;
        events |= EV_RECOVERED;
      }
    }
    st.wobble = damp(st.wobble, 0, 6, dt);
    integrate(st, tyre, dt);
    return events;
  }

  const steerIn = clamp(input.steer, -1, 1);
  const push = clamp(input.push, 0, 1);
  const brake = clamp(input.brake, 0, 1);
  const balancing = input.balance;

  // --- Steering smoothing (slower at speed so digital keys feel analogue) ---
  const speedNorm = clamp(st.speed / tyre.maxSpeed, 0, 1);
  const returning = Math.abs(steerIn) < Math.abs(st.steer) || steerIn * st.steer < 0;
  const rate = returning
    ? PHYSICS.steerReturnRate
    : lerp(PHYSICS.steerRateLow, PHYSICS.steerRateHigh, speedNorm);
  st.steer = approach(st.steer, steerIn, rate * dt);

  // --- Longitudinal ---
  const effPush = push * (balancing ? PHYSICS.balancePushMul : 1);
  const sf = staminaFactor(st.stamina);
  const vmax = effectiveMaxSpeed(tyre, surface) * (0.94 + 0.06 * sf) * (0.6 + 0.4 * effPush);
  const ratio = st.speed / Math.max(0.1, vmax);
  const drive = effPush > 0 && ratio < 1
    ? tyre.acceleration * stick.pushPower * surface.accelMul * sf * effPush * (1 - ratio * ratio)
    : 0;
  const resist = surface.rollingResistance * aff.roll + PHYSICS.airDrag * st.speed * st.speed;
  const brakeAcc = brake * PHYSICS.brakeDecel;
  st.speed = Math.max(0, st.speed + (drive - resist - brakeAcc) * dt);

  // --- Lateral / steering ---
  const grip = gripLimit(tyre, surface, balancing);
  let yaw = st.steer * tyre.turnRate * stick.steerAssist * turnScale(st.speed, tyre.maxSpeed);
  const demand = st.speed * Math.abs(yaw);
  const load = demand / grip;
  st.load = load;
  if (load > 1) {
    // Past the grip limit: partial understeer, slide outwards and scrub speed.
    yaw /= Math.sqrt(load);
    const excess = demand - grip;
    st.latVel -= Math.sign(st.steer) * excess * 0.45 * dt;
    st.speed = Math.max(0, st.speed - excess * 0.12 * dt);
  }
  st.latVel *= Math.exp(-grip * 0.45 * dt);
  st.slip = clamp(Math.abs(st.latVel) / 2.5 + Math.max(0, load - 1) * 0.5, 0, 1);
  st.yawRate = yaw;

  // Wobble feeds a little heading noise, so instability is felt, not just seen.
  st.wobblePhase += (7 + st.speed * 0.9) * dt;
  const wobbleSteer = st.wobble * 0.35 * Math.sin(st.wobblePhase * 0.5);
  st.heading -= (yaw + wobbleSteer) * dt;

  // --- Balance ---
  const cornerStress = Math.max(0, load - PHYSICS.stressThreshold) * PHYSICS.cornerStressGain;
  const roughStress = surface.roughness * aff.rough * speedNorm * speedNorm * PHYSICS.roughStressGain;
  const gain = (cornerStress + roughStress) * tyre.instabilityMul * stick.stabilityMul;
  const calm = load < PHYSICS.stressThreshold ? 1 : 0.3;
  const recovery = tyre.recoveryRate * calm * (balancing ? PHYSICS.balanceRecoveryMul : 1) * (st.speed < 1.5 ? 1.6 : 1);
  st.instability = clamp(st.instability + (gain - recovery) * dt, 0, 1);
  st.wobble = damp(st.wobble, Math.pow(st.instability, 1.6), 6, dt);

  const leanTarget = clamp(Math.atan2(st.speed * yaw, PHYSICS.gravity), -PHYSICS.maxLean, PHYSICS.maxLean);
  st.lean = damp(st.lean, leanTarget, 8, dt);

  // --- Stamina ---
  // Accelerating hard is tiring; holding a cruising speed is cheap and slowly recovers.
  if (effPush > 0.05) {
    const effort = drive / PHYSICS.staminaEffortRef;
    st.stamina += (PHYSICS.staminaCruiseRegen * (1 - effort) - PHYSICS.staminaDrain * stick.staminaCost * effort) * dt;
  } else {
    st.stamina += PHYSICS.staminaRegen * dt;
  }
  st.stamina = clamp(st.stamina, 0, 1);

  // --- Stick rhythm ---
  st.pushing = damp(st.pushing, effPush > 0.05 ? effPush : 0, 10, dt);
  if (effPush > 0.05) {
    const before = Math.floor(st.pushPhase);
    st.pushPhase += (1.6 + st.speed * 0.22) * stick.pushRate * dt;
    if (Math.floor(st.pushPhase) !== before) events |= EV_TAP;
  }

  if (st.instability >= 1) {
    st.mode = 'fallen';
    st.modeTime = 0;
    st.fallSide = st.lean !== 0 ? Math.sign(st.lean) : 1;
    st.speed *= 0.6;
    events |= EV_FALL;
  }

  integrate(st, tyre, dt);
  return events;
}

function integrate(st: RacerPhysicsState, tyre: TyreConfig, dt: number): void {
  const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
  const rx = -fz, rz = fx; // right vector
  st.x += (fx * st.speed + rx * st.latVel) * dt;
  st.z += (fz * st.speed + rz * st.latVel) * dt;
  st.roll += (st.speed / tyre.radius) * dt;
}
