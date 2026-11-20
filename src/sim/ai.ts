import { PHYSICS } from '../config/gameplay';
import { SURFACES } from '../config/surfaces';
import { clamp, damp, wrapAngle } from '../core/math';
import { Rng } from '../core/rng';
import { effectiveMaxSpeed, gripLimit, stressThreshold, turnScale, type RacerInput } from './physics';
import { lerp } from '../core/math';
import type { RaceRacer, RaceSession } from './race';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AiProfile {
  /** Multiplier on the instability-free cornering threshold (1 = right at the limit). */
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
  /** Multiplier on hazard safe speeds. */
  hazardSpeedMul: number;
  /** Chance per hazard of spotting it in time (0..1). */
  awareness: number;
  /** Takes the jump instead of the log. */
  takesRamps: boolean;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: {
    cornerSafety: 0.72, pushCap: 0.72, steerGain: 1.5, mistakeRate: 0.035, balanceAt: 0.38, staminaReserve: 0.08,
    lineSkill: 0.2, hazardSpeedMul: 0.85, awareness: 0.6, takesRamps: false,
  },
  normal: {
    cornerSafety: 0.98, pushCap: 0.9, steerGain: 1.9, mistakeRate: 0.02, balanceAt: 0.34, staminaReserve: 0.18,
    lineSkill: 0.5, hazardSpeedMul: 1, awareness: 0.85, takesRamps: false,
  },
  hard: {
    cornerSafety: 1.18, pushCap: 1.0, steerGain: 2.2, mistakeRate: 0.008, balanceAt: 0.3, staminaReserve: 0.25,
    lineSkill: 0.8, hazardSpeedMul: 1.25, awareness: 1, takesRamps: true,
  },
};

/**
 * A bot drives through the exact same RacerInput → physics pipeline (and hazards, dogs and
 * collisions) as a human.
 */
export class BotController {
  private rng: Rng;
  private lane = 0;
  private laneBias: number;
  private mistakeTime = 0;
  private mistakeSteer = 0;
  private resting = false;
  /** Hazards this bot failed to notice (rolled once per hazard per lap section). */
  private blind = new Map<number, number>();
  /** Extra push scaling for gentle catch-up (set by the race director). */
  pushScale = 1;
  /** Post-finish cruise mode. */
  cruising = false;

  constructor(public profile: AiProfile, seed: number, laneBias: number) {
    this.rng = new Rng(seed);
    this.laneBias = laneBias;
    this.lane = laneBias;
  }

  private notices(id: number, lap: number): boolean {
    const key = id * 100 + lap;
    let v = this.blind.get(key);
    if (v === undefined) { v = this.rng.next(); this.blind.set(key, v); }
    return v < this.profile.awareness;
  }

  update(self: RaceRacer, all: readonly RaceRacer[], session: RaceSession, dt: number): RacerInput {
    const p = self.phys;
    const prof = this.profile;
    const track = session.track;
    const field = session.field;
    const s = self.progress.lastS;
    const here = track.sampleAt(s);
    const hw = here.halfWidth;
    const surf = SURFACES[p.surface];
    const tyre = self.ctx.tyre;
    const lap = self.progress.lapsCompleted;

    // Out of control: the runner is chasing; hold balance to speed up the pick-up.
    if (p.control === 'lost') return { steer: 0, push: 0, brake: 0, balance: true };

    // --- Lane choice: racing line, overtaking, hazards, canals ---
    let desired = this.laneBias;
    const kAhead = track.sampleAt(s + 12 + p.speed).curvature;
    desired += -Math.sign(kAhead) * clamp(Math.abs(kAhead) * 30, 0, 1) * hw * 0.55 * prof.lineSkill;
    for (const o of all) {
      if (o === self) continue;
      const ds = o.progress.raceDistance - self.progress.raceDistance;
      if (ds > 0 && ds < 9 && Math.abs(o.lastD - this.lane) < 1.8) desired = o.lastD > 0 ? o.lastD - 2.4 : o.lastD + 2.4;
    }
    const blocks: [number, number][] = [];
    let limitFromHazards = Infinity;
    const look = 4 + p.speed * 1.8;
    for (const { h, dist } of field.hazardsAhead(s, 0.5, look)) {
      if (!this.notices(h.id, lap)) continue;
      const cfg = h.cfg;
      if (cfg.effect === 'boost') {
        if (prof.lineSkill > 0.4 && dist < 25) desired = h.d;
        continue;
      }
      if (h.type === 'ramp' && prof.takesRamps) {
        desired = h.d;
        limitFromHazards = Math.min(limitFromHazards, Math.sqrt((cfg.safeSpeed * prof.hazardSpeedMul) ** 2 + 2 * 5 * Math.max(0, dist - 2)));
        continue;
      }
      if (cfg.avoid && !h.fullWidth) {
        const m = 0.75;
        blocks.push([h.d - h.halfWid - m, h.d + h.halfWid + m]);
      } else {
        // Full-width humps: can't avoid, so arrive at a sensible speed.
        const safe = cfg.safeSpeed * prof.hazardSpeedMul;
        limitFromHazards = Math.min(limitFromHazards, Math.sqrt(safe * safe + 2 * 5.5 * Math.max(0, dist - 1)));
      }
    }
    const canalSide = field.canalSideAt(s + 10) || field.canalSideAt(s);
    let best = desired, bestCost = Infinity;
    for (let c = -hw + 0.9; c <= hw - 0.9; c += 0.25) {
      let cost = Math.abs(c - desired);
      for (const [a, b] of blocks) if (c > a && c < b) cost += 50;
      if (canalSide !== 0 && Math.sign(c) === canalSide && Math.abs(c) > hw - 1.6) cost += 8;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    // If every lane is blocked, slow right down instead.
    if (bestCost >= 50) limitFromHazards = Math.min(limitFromHazards, 5 * prof.hazardSpeedMul + 1);
    this.lane = damp(this.lane, best, 2.2, dt);

    // --- Steering: pure pursuit on a look-ahead point ---
    const lookD = 4 + p.speed * 0.55;
    const tp = track.pointAt(s + lookD);
    const tx = tp.x + tp.nx * this.lane, tz = tp.z + tp.nz * this.lane;
    const want = Math.atan2(tx - p.x, tz - p.z);
    const err = wrapAngle(want - p.heading);
    // Normalise by the tyre's turn rate so quick-steering tyres don't make the bot oscillate.
    let steer = clamp(-err * prof.steerGain * (2.2 / tyre.turnRate) * lerp(1, 0.6, clamp(p.speed / tyre.maxSpeed, 0, 1)), -1, 1);

    // --- Speed planning: stay under the speed-dependent stress threshold ---
    const grip = gripLimit(tyre, surf);
    const vTop = effectiveMaxSpeed(tyre, surf) * (p.boost > 0 ? PHYSICS.boostSpeedMul : 1);
    let allowed = vTop;
    const horizon = 8 + p.speed * 2.2;
    for (let x = 0; x <= horizon; x += 2) {
      const k = Math.max(Math.abs(track.sampleAt(s + x).curvature), 1e-4);
      let vc = 2;
      for (let v = vTop; v > 2; v -= 0.5) {
        const yawCap = tyre.turnRate * self.ctx.stick.steerAssist * turnScale(v, tyre.maxSpeed) * 0.8;
        const loadOk = (v * v * k) / grip <= stressThreshold(v / tyre.maxSpeed) * prof.cornerSafety * 0.8 * (p.boost > 0 ? 0.8 : 1);
        if (loadOk && v * k <= yawCap) { vc = v; break; }
      }
      const reach = Math.sqrt(vc * vc + 2 * 5.5 * x);
      if (reach < allowed) allowed = reach;
    }
    // Rough surfaces shake the tyre at speed: keep the shake below what it can recover from.
    const rough = surf.roughness * tyre.affinity[surf.id].rough * PHYSICS.roughStressGain * tyre.instabilityMul * self.ctx.stick.stabilityMul;
    if (rough > 0) {
      for (let v = vTop; v > 3; v -= 0.5) {
        const sn = v / tyre.maxSpeed;
        const rec = tyre.recoveryRate * lerp(PHYSICS.recoverySlowMul, PHYSICS.recoveryFastMul, Math.min(1, sn));
        if (rough * sn * sn <= rec * 0.7 * prof.cornerSafety) { allowed = Math.min(allowed, v); break; }
      }
    }
    allowed = Math.min(allowed, limitFromHazards);
    if (p.control === 'unstable') allowed *= 0.85;

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
      steer *= 0.7;
    }

    // --- Dirty tyre: pull up on a straight and clean it ---
    if (p.dirt > 0.3 && Math.abs(kAhead) < 0.02 && !this.cruising) {
      push = 0;
      brake = 1;
    }
    if (p.cleaning > 0) { push = 0; brake = 1; }

    // --- Mistakes: brief over-eager steering bursts ---
    if (this.mistakeTime > 0) {
      this.mistakeTime -= dt;
      steer = clamp(steer + this.mistakeSteer, -1, 1);
      push = 1;
      balance = false;
    } else if (!this.cruising && this.rng.chance(prof.mistakeRate * dt) && p.speed > 6) {
      this.mistakeTime = this.rng.range(0.4, 0.9);
      this.mistakeSteer = this.rng.chance(0.5) ? 0.75 : -0.75;
    }

    // Way off heading (spun round after a bump): turn on the spot.
    if (Math.abs(err) > 1.6) { push = 0.4; brake = 0; steer = err > 0 ? -1 : 1; }

    if (this.cruising) { push = Math.min(push, 0.45); balance = p.instability > 0.2; }

    return { steer, push, brake, balance };
  }
}
