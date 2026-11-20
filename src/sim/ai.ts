import { SURFACES } from '../config/surfaces';
import { clamp, damp, wrapAngle } from '../core/math';
import { Rng } from '../core/rng';
import { effectiveMaxSpeed, gripLimit, turnScale, type RacerInput } from './physics';
import type { RaceRacer } from './race';
import type { Track } from './track';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AiProfile {
  /** Fraction of grip used through corners. */
  cornerSafety: number;
  /** Max push intensity (lower = slower terminal speed). */
  pushCap: number;
  steerGain: number;
  /** Random mistakes per second. */
  mistakeRate: number;
  /** Instability level at which the bot steadies the tyre. */
  balanceAt: number;
  /** Bot coasts to regain stamina below this. */
  staminaReserve: number;
  /** How much the bot cuts to the inside of corners (0..1). */
  lineSkill: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: { cornerSafety: 0.52, pushCap: 0.68, steerGain: 1.5, mistakeRate: 0.06, balanceAt: 0.8, staminaReserve: 0.08, lineSkill: 0.2 },
  normal: { cornerSafety: 0.74, pushCap: 0.86, steerGain: 1.9, mistakeRate: 0.03, balanceAt: 0.62, staminaReserve: 0.18, lineSkill: 0.5 },
  hard: { cornerSafety: 0.95, pushCap: 1.0, steerGain: 2.2, mistakeRate: 0.01, balanceAt: 0.5, staminaReserve: 0.25, lineSkill: 0.8 },
};

/**
 * A bot drives through the exact same RacerInput → physics pipeline as a human.
 */
export class BotController {
  private rng: Rng;
  private lane = 0;
  private laneBias: number;
  private mistakeTime = 0;
  private mistakeSteer = 0;
  private resting = false;
  /** Extra push scaling for gentle catch-up (set by the race director). */
  pushScale = 1;
  /** Post-finish cruise mode. */
  cruising = false;

  constructor(public profile: AiProfile, seed: number, laneBias: number) {
    this.rng = new Rng(seed);
    this.laneBias = laneBias;
    this.lane = laneBias;
  }

  update(self: RaceRacer, all: readonly RaceRacer[], track: Track, dt: number): RacerInput {
    const p = self.phys;
    const prof = this.profile;
    const s = self.progress.lastS;
    const here = track.sampleAt(s);
    const hw = here.halfWidth;
    const surf = SURFACES[p.surface];

    // --- Lane choice: bias, racing line and overtaking ---
    let targetLane = this.laneBias;
    const kAhead = track.sampleAt(s + 12 + p.speed).curvature;
    targetLane += -Math.sign(kAhead) * clamp(Math.abs(kAhead) * 30, 0, 1) * hw * 0.55 * prof.lineSkill;
    for (const o of all) {
      if (o === self) continue;
      const ds = o.progress.raceDistance - self.progress.raceDistance;
      if (ds > 0 && ds < 9) {
        const od = o.lastD;
        if (Math.abs(od - this.lane) < 1.8) {
          targetLane = od > 0 ? od - 2.4 : od + 2.4;
        }
      }
    }
    targetLane = clamp(targetLane, -hw + 1, hw - 1);
    this.lane = damp(this.lane, targetLane, 1.5, dt);

    // --- Steering: pure pursuit on a look-ahead point ---
    const look = 4 + p.speed * 0.55;
    const tp = track.pointAt(s + look);
    const tx = tp.x + tp.nx * this.lane, tz = tp.z + tp.nz * this.lane;
    const desired = Math.atan2(tx - p.x, tz - p.z);
    const err = wrapAngle(desired - p.heading);
    let steer = clamp(-err * prof.steerGain, -1, 1);

    // --- Speed planning: brake early enough for upcoming curvature ---
    const grip = gripLimit(self.ctx.tyre, surf) * prof.cornerSafety;
    const vTop = effectiveMaxSpeed(self.ctx.tyre, surf);
    let allowed = vTop;
    const horizon = 8 + p.speed * 2.2;
    for (let x = 0; x <= horizon; x += 2) {
      const smp = track.sampleAt(s + x);
      const k = Math.max(Math.abs(smp.curvature), 1e-4);
      let vc = Math.sqrt(grip / k);
      // Also respect the steering authority limit.
      const yawCap = self.ctx.tyre.turnRate * self.ctx.stick.steerAssist * turnScale(vc, self.ctx.tyre.maxSpeed) * 0.8;
      if (vc * k > yawCap) vc = Math.min(vc, yawCap / k);
      const reach = Math.sqrt(vc * vc + 2 * 5.5 * x);
      if (reach < allowed) allowed = reach;
    }

    let push = prof.pushCap * this.pushScale;
    let brake = 0;
    if (p.speed > allowed + 1.2) { push = 0; brake = clamp((p.speed - allowed) / 3, 0.3, 1); }
    else if (p.speed > allowed) push = 0;

    // --- Stamina management ---
    if (p.stamina < prof.staminaReserve) this.resting = true;
    if (p.stamina > prof.staminaReserve + 0.25) this.resting = false;
    if (this.resting && p.speed > vTop * 0.7) push = Math.min(push, 0.15);

    // --- Balance ---
    let balance = false;
    if (p.instability > prof.balanceAt) {
      balance = true;
      steer *= 0.6;
    }

    // --- Mistakes: brief over-eager steering bursts ---
    if (this.mistakeTime > 0) {
      this.mistakeTime -= dt;
      steer = clamp(steer + this.mistakeSteer, -1, 1);
      push = 1;
      balance = false;
    } else if (!this.cruising && this.rng.chance(prof.mistakeRate * dt) && p.speed > 6) {
      this.mistakeTime = this.rng.range(0.5, 1.1);
      this.mistakeSteer = this.rng.chance(0.5) ? 1.2 : -1.2;
    }

    // Way off heading (spun round after a bump): turn on the spot.
    if (Math.abs(err) > 1.6) { push = 0.4; brake = 0; steer = err > 0 ? -1 : 1; }

    if (this.cruising) { push = Math.min(push, 0.45); balance = p.instability > 0.3; }

    return { steer, push, brake, balance };
  }
}
