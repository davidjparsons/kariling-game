import { FIXED_DT, PHYSICS, RACE } from '../config/gameplay';
import { STICKS, type StickId } from '../config/sticks';
import { TYRES, type TyreId } from '../config/tyres';
import { clamp, valueNoise2, wrapAngle, wrapDelta } from '../core/math';
import { GRASS_PATCH } from '../config/surfaces';
import { AI_PROFILES, BotController, type Difficulty } from './ai';
import { resolveRacerCollisions } from './collisions';
import { createDogs, updateDogs, type Dog, type DogEvent, type DogNav, type DogTarget } from './dogs';
import { HazardField, type Hazard } from './hazards';
import { collectPickup, createPickups, tickPickups, touchedPickup, type Pickup } from './pickups';
import { rollItem } from './effects';
import { createPedestrians, updatePedestrians, type PedEvent, type Pedestrian, type PedRacer } from './pedestrians';
import { PEDESTRIAN } from '../config/pedestrians';
import { Rng } from '../core/rng';
import {
  addImpact, applyBoost, applyDirt, applyStun, createRacerState, EV_BOOST, EV_BUMP, EV_HAZARD, EV_ITEM_GET, EV_ITEM_USE, EV_LAUNCH, EV_PED, EV_POO, giveItem,
  EV_RESPAWN, EV_STUN, NO_INPUT, resetControl, runnerConfig, stepRacer,
  type Ground, type GroundFn, type PhysicsContext, type RacerInput, type RacerPhysicsState,
} from './physics';
import { advanceProgress, compareRacers, createProgress, rankingDistance, type LapProgress } from './progress';
import type { Track, TrackProjection } from './track';
import { advanceProjectile, launchProjectile, type ItemProjectile, type ProjectileHit } from './projectiles';

export const MAX_RACERS = 4;

export interface RacerSetup {
  id: string;
  name: string;
  isBot: boolean;
  tyreId: TyreId;
  stickId: StickId;
  /** Child or adult — sets stick length/runner position only (no racing advantage). */
  age?: 'child' | 'adult';
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
  /** Most recent safe track position (for respawns). */
  safeS: number;
  safeD: number;
  /** Hazard ids the tyre is currently inside (for enter triggers). */
  insideHazards: Set<number>;
  /** Hazard types hit since the last frame (for effects/audio). */
  hazardHits: Hazard[];
  /** Sim clock (s) of the last dog bite (−Infinity = never). */
  lastBitten: number;
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
 * Deterministic, render-free race simulation. Owns physics, hazards, dogs, collisions,
 * lap validation and rankings. The same class can later run inside a Durable Object.
 */
export class RaceSession {
  readonly track: Track;
  readonly field: HazardField;
  readonly dogs: Dog[];
  readonly pickups: Pickup[];
  projectiles: ItemProjectile[] = [];
  readonly projectileHits: ProjectileHit[] = [];
  private nextProjectileId = 0;
  readonly pedestrians: Pedestrian[];
  /** Pedestrian events from the most recent tick. */
  pedEvents: PedEvent[] = [];
  readonly racers: RaceRacer[];
  readonly opts: RaceOptions;
  phase: RacePhase = 'countdown';
  /** Seconds left in the countdown. */
  countdown: number = RACE.countdownSeconds;
  /** Race clock (starts at GO). */
  time = 0;
  tick = 0;
  /** Dog events from the most recent tick. */
  dogEvents: DogEvent[] = [];
  private dogTargets: DogTarget[] = [];
  private scratch: Hazard[] = [];
  private navScratch: Hazard[] = [];
  private dogHint = -1;
  /** Dogs keep to the road between the fences and run round logs, ramps, mounds and canals. */
  private dogNav: DogNav = {
    blocked: (x, z) => {
      const pj = this.track.project(x, z, this.dogHint);
      if (this.field.inCanal(pj.s, pj.d, pj.halfWidth)) return true;
      return this.field.hazardsAt(pj.s, pj.d, this.navScratch).some((h) => h.cfg.height >= 0.2);
    },
    clamp: (x, z) => {
      const pj = this.track.project(x, z, this.dogHint);
      this.dogHint = pj.index;
      const lim = this.track.barrierOffset(pj) - 0.35;
      if (Math.abs(pj.d) <= lim) return [x, z];
      const pt = this.track.pointAt(pj.s);
      const over = Math.abs(pj.d) - lim;
      return [x - pt.nx * Math.sign(pj.d) * over, z - pt.nz * Math.sign(pj.d) * over];
    },
  };
  private dogEventsBuf: DogEvent[] = [];
  private itemRng: Rng;
  private pedRng: Rng;
  private pedRacers: PedRacer[] = [];
  private pedBuf: PedEvent[] = [];

  constructor(track: Track, setups: RacerSetup[], opts: RaceOptions) {
    if (setups.length === 0 || setups.length > MAX_RACERS) throw new Error('A race needs 1–4 racers');
    this.track = track;
    this.opts = opts;
    this.field = new HazardField(track, track.def.hazards ?? [], track.def.canals ?? []);
    this.dogs = createDogs(track, track.def.dogs ?? []);
    this.pickups = createPickups(track, track.def.pickups ?? []);
    this.itemRng = new Rng(opts.seed * 7 + 13);
    this.pedRng = new Rng(opts.seed * 11 + 5);
    this.pedestrians = createPedestrians(track, track.def.pedestrians ?? [], this.pedRng);
    this.racers = setups.map((setup, i) => {
      // Two-by-two staggered grid behind the start line.
      const row = Math.floor(i / 2);
      const col = i % 2;
      const s = track.length - 4 - row * 5 - col * 1.6;
      const pt = track.pointAt(s);
      const lane = (col === 0 ? -1 : 1) * Math.min(1.9, pt.halfWidth * 0.45);
      const tyre = TYRES[setup.tyreId];
      const runner = runnerConfig(setup.age ?? 'child', tyre.radius);
      const phys = createRacerState(pt.x + pt.nx * lane, pt.z + pt.nz * lane, pt.heading, runner);
      const proj = track.project(phys.x, phys.z);
      return {
        setup, order: i, phys,
        ctx: { tyre, stick: STICKS[setup.stickId], runner },
        progress: createProgress(proj.s, track.length),
        bot: setup.isBot ? new BotController(AI_PROFILES[opts.difficulty], opts.seed * 31 + i * 7919, lane * 0.6) : null,
        lastD: proj.d, hint: proj.index, events: 0, bumpImpact: 0, stuckTime: 0, wrongWayTime: 0, respawns: 0,
        safeS: proj.s, safeD: proj.d, insideHazards: new Set<number>(), hazardHits: [], lastBitten: -Infinity,
      };
    });
  }

  /** Simulation clock in seconds since the session was created (countdown included). */
  get clock(): number {
    return this.tick * FIXED_DT;
  }

  get(id: string): RaceRacer | undefined {
    return this.racers.find((r) => r.setup.id === id);
  }

  /** Ground under a world point near a racer (uses its projection hint). */
  groundFor(r: RaceRacer): GroundFn {
    return (x: number, z: number): Ground => {
      const proj = this.track.project(x, z, r.hint);
      return this.groundAt(proj);
    };
  }

  groundAt(proj: TrackProjection): Ground {
    const g = this.field.sample(proj);
    const surface = g.surface ?? this.track.surfaceAt(proj);
    // Grass is lumpy in patches (deterministic noise along the track).
    const rough = surface === 'grass'
      ? GRASS_PATCH.min + (GRASS_PATCH.max - GRASS_PATCH.min) * valueNoise2(proj.s * GRASS_PATCH.scale, proj.d * GRASS_PATCH.scale + 40)
      : 1;
    return { h: g.h, launch: g.launch, surface, canal: g.canal, roadside: Math.abs(proj.d) > proj.halfWidth - 1.2, rough };
  }

  /** Advance one fixed tick. `inputs` supplies human input by racer id. */
  step(inputs: Record<string, RacerInput>): void {
    const dt = FIXED_DT;
    this.tick++;
    for (const r of this.racers) { r.events = 0; r.bumpImpact = 0; r.hazardHits.length = 0; }
    this.dogEvents = [];
    this.projectileHits.length = 0;
    this.pedEvents = [];

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.phase = 'racing'; this.countdown = 0; }
      this.updateDogs(dt);
      this.updatePedestrians(dt);
      return;
    }
    if (this.phase === 'racing') this.time += dt;

    this.applyCatchUp();

    for (const r of this.racers) {
      let input: RacerInput;
      if (r.bot) input = r.bot.update(r, this.racers, this, dt);
      else input = inputs[r.setup.id] ?? NO_INPUT;
      r.events |= stepRacer(r.phys, input, r.ctx, this.groundFor(r), dt);
      const used = r.phys.lastItem;
      if ((r.events & EV_ITEM_USE) && used && used !== 'turon') {
        this.projectiles.push(launchProjectile(this.nextProjectileId++, used, r, input.useItem === 'backward'));
      }
      this.stuckCheck(r, input, dt);
    }

    resolveRacerCollisions(this.racers);

    for (const r of this.racers) {
      let proj = this.track.project(r.phys.x, r.phys.z, r.hint);
      proj = this.resolveBarrier(r, proj) ?? proj;
      this.clampRunner(r);
      r.hint = proj.index;
      r.lastD = proj.d;
      this.hazardTriggers(r, proj);
      this.pickupCheck(r);
      this.trackSafePosition(r, proj);
      if (r.phys.needsRespawn) this.respawn(r, true);
      const onTrack = Math.abs(r.lastD) <= this.track.barrierOffset(proj) + 1;
      const upd = advanceProgress(
        r.progress, this.track.project(r.phys.x, r.phys.z, r.hint).s, this.track.length, this.track.checkpoints,
        this.time, this.opts.laps, PHYSICS.maxStepDistance, onTrack,
      );
      if (upd.finished && r.bot) r.bot.cruising = true;
      // Wrong-way detection.
      const t = this.track.sampleAt(proj.s);
      const dot = Math.sin(r.phys.heading) * t.tx + Math.cos(r.phys.heading) * t.tz;
      r.wrongWayTime = dot < -0.3 && r.phys.speed > 1 && r.phys.control !== 'lost' ? r.wrongWayTime + dt : 0;
    }

    if (this.projectiles.length) this.projectiles = this.projectiles.filter((shot) => advanceProjectile(shot, this, dt));
    this.updateDogs(dt);
    this.updatePedestrians(dt);
    tickPickups(this.pickups, dt);

    if (this.phase === 'racing' && this.racers.every((r) => r.progress.finished)) this.phase = 'finished';
  }

  /** One-off effects when a grounded tyre rolls into a hazard footprint. */
  private hazardTriggers(r: RaceRacer, proj: TrackProjection): void {
    const p = r.phys;
    const inside = this.field.hazardsAt(proj.s, proj.d, this.scratch);
    const now = new Set<number>();
    for (const h of inside) {
      now.add(h.id);
      if (r.insideHazards.has(h.id)) continue;
      // Airborne tyres sail over flat hazards (mud, poo, boosts, potholes).
      if (!p.grounded && p.y > 0.12) continue;
      r.hazardHits.push(h);
      r.events |= EV_HAZARD;
      const cfg = h.cfg;
      const sn = clamp(p.speed / r.ctx.tyre.maxSpeed, 0, 1.3);
      if (cfg.speedLoss > 0) p.speed *= 1 - cfg.speedLoss * sn;
      const inst = cfg.instability + cfg.instabilitySpeed * sn * sn;
      if (inst > 0) r.events |= addImpact(p, inst, r.ctx);
      if (cfg.kick > 0 && sn > 0.25 && p.control !== 'lost') {
        p.vy = Math.max(p.vy, cfg.kick * sn);
        p.grounded = false;
        p.airTime = 0;
        r.events |= EV_LAUNCH | EV_BUMP;
        r.bumpImpact = Math.max(r.bumpImpact, cfg.kick * sn * 2);
      }
      if (cfg.effect === 'boost') { applyBoost(p); r.events |= EV_BOOST; }
      if (cfg.effect === 'poo' && p.invuln <= 0) { applyDirt(p); r.events |= EV_POO; }
    }
    r.insideHazards = now;
  }

  /** Villagers crossing; contact slows and unsettles the racer (cartoon hop, no injuries). */
  private updatePedestrians(dt: number): void {
    if (this.pedestrians.length === 0) { this.pedEvents = []; return; }
    this.pedRacers.length = 0;
    for (const r of this.racers) {
      const p = r.phys;
      // Loose tyres and runners still bump people, but finished racers have left the course.
      this.pedRacers.push({ s: r.progress.lastS, d: r.lastD, speed: r.progress.finished ? 0 : p.speed, x: p.x, z: p.z, rx: p.rx, rz: p.rz });
    }
    this.pedEvents = [...updatePedestrians(this.track, this.pedestrians, this.pedRacers, dt, this.pedRng, this.pedBuf)];
    for (const e of this.pedEvents) {
      if (e.type !== 'bump') continue;
      const r = this.racers[e.racer];
      const p = r.phys;
      r.events |= EV_PED;
      if (p.control === 'lost') continue;
      const v = p.speed;
      p.speed *= PEDESTRIAN.bumpSpeedKeep;
      r.events |= addImpact(p, PEDESTRIAN.bumpInstability + PEDESTRIAN.bumpInstabilitySpeed * v, r.ctx);
    }
  }

  /** Empty-handed racers collect a pickup they roll through and get a weighted random item. */
  private pickupCheck(r: RaceRacer): void {
    const p = r.phys;
    if (r.phys.item || p.control === 'lost' || this.phase !== 'racing') return;
    const box = touchedPickup(this.pickups, p.x, p.y, p.z);
    if (!box) return;
    collectPickup(box);
    const rank = this.standings().indexOf(r);
    giveItem(p, rollItem(this.itemRng, this.racers.length > 1 ? rank / (this.racers.length - 1) : 0));
    r.events |= EV_ITEM_GET;
  }

  private trackSafePosition(r: RaceRacer, proj: TrackProjection): void {
    const p = r.phys;
    if (p.control === 'lost' || !p.grounded || p.separated) return;
    if (Math.abs(proj.d) > proj.halfWidth - 1.0) return;
    if (this.field.hazardsAt(proj.s, proj.d, this.scratch).some((h) => h.cfg.height !== 0 || h.cfg.surface === 'mud')) return;
    r.safeS = proj.s;
    r.safeD = proj.d;
  }

  private updateDogs(dt: number): void {
    if (this.dogs.length === 0) return;
    this.dogTargets.length = 0;
    for (const r of this.racers) {
      this.dogTargets.push({
        x: r.phys.x, z: r.phys.z, rx: r.phys.rx, rz: r.phys.rz, protectedFor: r.phys.invuln,
        busy: r.phys.control === 'lost' || r.progress.finished || this.phase !== 'racing',
        sinceBitten: this.clock - r.lastBitten,
      });
    }
    this.dogEvents = [...updateDogs(this.dogs, this.dogTargets, dt, this.dogEventsBuf, this.dogNav)];
    for (const e of this.dogEvents) {
      if (e.type !== 'catch') continue;
      const r = this.racers[e.racer];
      if (applyStun(r.phys, r.ctx)) { r.events |= EV_STUN; r.lastBitten = this.clock; }
    }
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
    if (r.phys.control !== 'lost' && input.push > 0.5 && r.phys.speed < 0.6 && this.phase === 'racing' && r.phys.cleaning <= 0 && r.phys.stun <= 0) {
      r.stuckTime += dt;
      if (r.stuckTime > RACE.stuckRespawnSeconds) this.respawn(r, false);
    } else {
      r.stuckTime = 0;
    }
  }

  /**
   * Put a racer back on the road facing forward. `toSafe` uses the most recent safe position
   * (canal falls, lost tyres); otherwise the current track position. Laps and checkpoints are
   * preserved: only the small positional change is applied to race distance.
   */
  respawn(r: RaceRacer, toSafe = true): void {
    const cur = this.track.project(r.phys.x, r.phys.z, r.hint);
    const s = toSafe ? r.safeS : cur.s;
    const pt = this.track.pointAt(s);
    const d = clamp(toSafe ? r.safeD : cur.d, -pt.halfWidth + 1.4, pt.halfWidth - 1.4);
    const p = r.phys;
    p.x = pt.x + pt.nx * d;
    p.z = pt.z + pt.nz * d;
    p.y = 0;
    p.heading = pt.heading;
    p.speed = 0;
    resetControl(p, r.ctx, RACE.invulnerableAfterRespawn);
    r.stuckTime = 0;
    r.respawns++;
    r.events |= EV_RESPAWN;
    const proj = this.track.project(p.x, p.z);
    r.hint = proj.index;
    r.lastD = proj.d;
    const ds = wrapDelta(proj.s - r.progress.lastS, this.track.length);
    // Moving back is fine (no gates are re-awarded); never move a racer forward past a gate.
    if (Math.abs(ds) < 60) r.progress.raceDistance += ds;
    r.progress.lastS = proj.s;
    r.insideHazards.clear();
  }

  private resolveBarrier(r: RaceRacer, proj: TrackProjection): TrackProjection | null {
    const limit = this.track.barrierOffset(proj) - 0.4;
    if (Math.abs(proj.d) <= limit) return null;
    const p = r.phys;
    const side = Math.sign(proj.d);
    const pt = this.track.pointAt(proj.s);
    const over = Math.abs(proj.d) - limit;
    p.x -= pt.nx * side * over;
    p.z -= pt.nz * side * over;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const into = (fx * pt.nx + fz * pt.nz) * side; // >0 = heading into the fence
    const impact = Math.max(0, into) * p.speed + Math.max(0, p.latVel * side);
    const along = Math.atan2(pt.tx, pt.tz);
    const facingForward = fx * pt.tx + fz * pt.tz >= 0;
    const tangentHeading = facingForward ? along : along + Math.PI;
    p.heading += wrapAngle(tangentHeading - p.heading) * 0.6;
    p.speed *= 1 - 0.45 * Math.min(1, impact / 8);
    p.latVel = -side * Math.min(2, 0.5 + impact * 0.2);
    if (impact > 0.8) {
      r.events |= addImpact(p, impact * 0.07, r.ctx);
      r.events |= EV_BUMP;
      r.bumpImpact = Math.max(r.bumpImpact, impact);
    }
    return this.track.project(p.x, p.z, proj.index);
  }

  /** Keep runners inside the fences, and out of canals (they stop at the lip). */
  private clampRunner(r: RaceRacer): void {
    const p = r.phys;
    const proj = this.track.project(p.rx, p.rz, r.hint);
    const lip = this.field.canalEdges(proj.halfWidth).inner - 0.15;
    const limit = this.field.hasCanal(proj.s, Math.sign(proj.d)) ? lip : this.track.barrierOffset(proj) - 0.3;
    if (Math.abs(proj.d) <= limit) return;
    const pt = this.track.pointAt(proj.s);
    const over = Math.abs(proj.d) - limit;
    p.rx -= pt.nx * Math.sign(proj.d) * over;
    p.rz -= pt.nz * Math.sign(proj.d) * over;
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

