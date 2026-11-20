import { FIXED_DT, PHYSICS, RACE } from '../config/gameplay';
import { STICKS, type StickId } from '../config/sticks';
import { SURFACES } from '../config/surfaces';
import { TYRES, type TyreId } from '../config/tyres';
import { wrapDelta } from '../core/math';
import { AI_PROFILES, BotController, type Difficulty } from './ai';
import {
  createRacerState, EV_BUMP, NO_INPUT, stepRacer, type PhysicsContext, type RacerInput, type RacerPhysicsState,
} from './physics';
import { advanceProgress, compareRacers, createProgress, rankingDistance, type LapProgress } from './progress';
import type { Track } from './track';

export const MAX_RACERS = 4;

export interface RacerSetup {
  id: string;
  name: string;
  isBot: boolean;
  tyreId: TyreId;
  stickId: StickId;
}

export interface RaceRacer {
  setup: RacerSetup;
  order: number;
  phys: RacerPhysicsState;
  ctx: PhysicsContext;
  progress: LapProgress;
  bot: BotController | null;
  /** Last lateral offset from centreline. */
  lastD: number;
  hint: number;
  /** Event flags from the most recent tick. */
  events: number;
  /** Strength of most recent bump (for effects). */
  bumpImpact: number;
  stuckTime: number;
  wrongWayTime: number;
  respawns: number;
}

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface RaceOptions {
  laps: number;
  difficulty: Difficulty;
  seed: number;
}

/**
 * Fill a grid up to MAX_RACERS with bots. Humans keep their order (host first).
 */
export function populateGrid(humans: RacerSetup[], bots: RacerSetup[]): RacerSetup[] {
  if (humans.length > MAX_RACERS) throw new Error(`Too many players (max ${MAX_RACERS})`);
  const need = MAX_RACERS - humans.length;
  if (bots.length < need) throw new Error('Not enough bot profiles to fill the grid');
  return [...humans, ...bots.slice(0, need).map((b) => ({ ...b, isBot: true }))];
}

/**
 * Deterministic, render-free race simulation. Owns physics, lap validation, collisions and rankings.
 * The same class can later run inside a Durable Object for authoritative multiplayer.
 */
export class RaceSession {
  readonly track: Track;
  readonly racers: RaceRacer[];
  readonly opts: RaceOptions;
  phase: RacePhase = 'countdown';
  /** Seconds left in the countdown. */
  countdown: number = RACE.countdownSeconds;
  /** Race clock (starts at GO). */
  time = 0;
  tick = 0;

  constructor(track: Track, setups: RacerSetup[], opts: RaceOptions) {
    if (setups.length === 0 || setups.length > MAX_RACERS) throw new Error('A race needs 1–4 racers');
    this.track = track;
    this.opts = opts;
    this.racers = setups.map((setup, i) => {
      // Two-by-two staggered grid behind the start line.
      const row = Math.floor(i / 2);
      const col = i % 2;
      const s = track.length - 4 - row * 4.5 - col * 1.5;
      const pt = track.pointAt(s);
      const lane = (col === 0 ? -1 : 1) * Math.min(1.9, pt.halfWidth * 0.45);
      const phys = createRacerState(pt.x + pt.nx * lane, pt.z + pt.nz * lane, pt.heading);
      const proj = track.project(phys.x, phys.z);
      return {
        setup, order: i, phys,
        ctx: { tyre: TYRES[setup.tyreId], stick: STICKS[setup.stickId] },
        progress: createProgress(proj.s, track.length),
        bot: setup.isBot ? new BotController(AI_PROFILES[opts.difficulty], opts.seed * 31 + i * 7919, lane * 0.6) : null,
        lastD: proj.d, hint: proj.index, events: 0, bumpImpact: 0, stuckTime: 0, wrongWayTime: 0, respawns: 0,
      };
    });
  }

  get(id: string): RaceRacer | undefined {
    return this.racers.find((r) => r.setup.id === id);
  }

  /** Advance one fixed tick. `inputs` supplies human input by racer id. */
  step(inputs: Record<string, RacerInput>): void {
    const dt = FIXED_DT;
    this.tick++;
    for (const r of this.racers) { r.events = 0; r.bumpImpact = 0; }

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.phase = 'racing'; this.countdown = 0; }
      return;
    }
    if (this.phase === 'racing') this.time += dt;

    this.applyCatchUp();

    for (const r of this.racers) {
      let input: RacerInput;
      if (r.bot) input = r.bot.update(r, this.racers, this.track, dt);
      else input = inputs[r.setup.id] ?? NO_INPUT;
      const proj = this.track.project(r.phys.x, r.phys.z, r.hint);
      const surface = SURFACES[this.track.surfaceAt(proj)];
      r.events |= stepRacer(r.phys, input, r.ctx, surface, dt);
      this.stuckCheck(r, input, dt);
    }

    this.resolveRacerCollisions();

    for (const r of this.racers) {
      let proj = this.track.project(r.phys.x, r.phys.z, r.hint);
      proj = this.resolveBarrier(r, proj) ?? proj;
      r.hint = proj.index;
      r.lastD = proj.d;
      const onTrack = Math.abs(proj.d) <= this.track.barrierOffset(proj) + 1;
      const upd = advanceProgress(
        r.progress, proj.s, this.track.length, this.track.checkpoints, this.time, this.opts.laps,
        PHYSICS.maxStepDistance, onTrack,
      );
      if (upd.finished && r.bot) r.bot.cruising = true;
      // Wrong-way detection.
      const t = this.track.sampleAt(proj.s);
      const dot = Math.sin(r.phys.heading) * t.tx + Math.cos(r.phys.heading) * t.tz;
      r.wrongWayTime = dot < -0.3 && r.phys.speed > 1 ? r.wrongWayTime + dt : 0;
    }

    if (this.phase === 'racing' && this.racers.every((r) => r.progress.finished)) this.phase = 'finished';
  }

  /** Mild catch-up so bots stay in the mix without teleporting. */
  private applyCatchUp(): void {
    const humans = this.racers.filter((r) => !r.bot);
    if (humans.length === 0) return;
    const L = this.track.length;
    const cps = this.track.checkpoints;
    const lead = Math.max(...humans.map((h) => rankingDistance(h.progress, L, cps)));
    const scale = this.opts.difficulty === 'hard' ? 0.5 : 1;
    for (const r of this.racers) {
      if (!r.bot) continue;
      const gap = rankingDistance(r.progress, L, cps) - lead;
      if (gap > 35) r.bot.pushScale = 1 - Math.min(0.1, (gap - 35) / 400) * scale;
      else if (gap < -35) r.bot.pushScale = 1 + Math.min(0.06, (-gap - 35) / 600) * scale;
      else r.bot.pushScale = 1;
    }
  }

  private stuckCheck(r: RaceRacer, input: RacerInput, dt: number): void {
    if (r.phys.mode === 'racing' && input.push > 0.5 && r.phys.speed < 0.6 && this.phase === 'racing') {
      r.stuckTime += dt;
      if (r.stuckTime > RACE.stuckRespawnSeconds) this.respawn(r);
    } else {
      r.stuckTime = 0;
    }
  }

  /** Put a racer back on the centreline at its current track position, facing forward. */
  respawn(r: RaceRacer): void {
    const proj = this.track.project(r.phys.x, r.phys.z, r.hint);
    const pt = this.track.pointAt(proj.s);
    const lane = r.order % 2 === 0 ? -1 : 1;
    r.phys.x = pt.x + pt.nx * lane;
    r.phys.z = pt.z + pt.nz * lane;
    r.phys.heading = pt.heading;
    r.phys.speed = 0;
    r.phys.latVel = 0;
    r.phys.instability = 0;
    r.phys.mode = 'racing';
    r.phys.lean = 0;
    r.stuckTime = 0;
    r.respawns++;
    // Keep progress consistent with the small positional change.
    const ds = wrapDelta(proj.s - r.progress.lastS, this.track.length);
    if (Math.abs(ds) < PHYSICS.maxStepDistance) r.progress.raceDistance += ds;
    r.progress.lastS = proj.s;
  }

  private resolveBarrier(r: RaceRacer, proj: ReturnType<Track['project']>): ReturnType<Track['project']> | null {
    const limit = this.track.barrierOffset(proj) - 0.4;
    if (Math.abs(proj.d) <= limit) return null;
    const p = r.phys;
    const side = Math.sign(proj.d);
    const pt = this.track.pointAt(proj.s);
    const over = Math.abs(proj.d) - limit;
    p.x -= pt.nx * side * over;
    p.z -= pt.nz * side * over;
    // Velocity component into the barrier.
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const into = (fx * pt.nx + fz * pt.nz) * side; // >0 = heading into wall
    const impact = Math.max(0, into) * p.speed + Math.max(0, p.latVel * side);
    // Deflect heading along the barrier.
    const along = Math.atan2(pt.tx, pt.tz);
    const facingForward = fx * pt.tx + fz * pt.tz >= 0;
    const tangentHeading = facingForward ? along : along + Math.PI;
    p.heading += wrapAngle2(tangentHeading - p.heading) * 0.6;
    p.speed *= 1 - 0.4 * Math.min(1, impact / 8);
    p.latVel = -side * Math.min(2, 0.5 + impact * 0.2);
    if (impact > 0.8) {
      p.instability = Math.min(1, p.instability + impact * 0.05 * r.ctx.tyre.instabilityMul);
      r.events |= EV_BUMP;
      r.bumpImpact = Math.max(r.bumpImpact, impact);
    }
    return this.track.project(p.x, p.z, proj.index);
  }

  private resolveRacerCollisions(): void {
    const R = PHYSICS.racerRadius;
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const a = this.racers[i], b = this.racers[j];
        const dx = b.phys.x - a.phys.x, dz = b.phys.z - a.phys.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= 4 * R * R || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const overlap = 2 * R - d;
        const ma = a.ctx.tyre.mass, mb = b.ctx.tyre.mass;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.phys.x -= nx * overlap * wa; a.phys.z -= nz * overlap * wa;
        b.phys.x += nx * overlap * wb; b.phys.z += nz * overlap * wb;
        // Relative velocity along the normal.
        const va = velocity(a.phys), vb = velocity(b.phys);
        const rel = (va[0] - vb[0]) * nx + (va[1] - vb[1]) * nz; // >0 = closing
        if (rel <= 0) continue;
        const impulse = rel * 0.8;
        // Rear racer loses speed, front gets a nudge; both get a sideways shove.
        bump(a, -impulse * wa, nx, nz);
        bump(b, impulse * wb, nx, nz);
        const instab = Math.min(0.35, rel * 0.06);
        a.phys.instability = Math.min(1, a.phys.instability + instab * a.ctx.tyre.instabilityMul * wa * 2);
        b.phys.instability = Math.min(1, b.phys.instability + instab * b.ctx.tyre.instabilityMul * wb * 2);
        if (rel > 0.6) {
          a.events |= EV_BUMP; b.events |= EV_BUMP;
          a.bumpImpact = Math.max(a.bumpImpact, rel);
          b.bumpImpact = Math.max(b.bumpImpact, rel);
        }
      }
    }
  }

  /** Current standings, leader first. */
  standings(): RaceRacer[] {
    const L = this.track.length, cps = this.track.checkpoints;
    return [...this.racers].sort((a, b) => compareRacers(a, b, L, cps));
  }

  positionOf(id: string): number {
    return this.standings().findIndex((r) => r.setup.id === id) + 1;
  }
}

function wrapAngle2(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function velocity(p: RacerPhysicsState): [number, number] {
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  return [fx * p.speed - fz * p.latVel, fz * p.speed + fx * p.latVel];
}

function bump(r: RaceRacer, dv: number, nx: number, nz: number): void {
  const p = r.phys;
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const rx = -fz, rz = fx;
  p.speed = Math.max(0, p.speed + dv * (fx * nx + fz * nz));
  p.latVel += dv * (rx * nx + rz * nz);
}
