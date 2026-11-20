import { BOT_ROSTER, type RacerLoadout } from '../config/appearance';
import { FIXED_DT, RACE } from '../config/gameplay';
import { SURFACES } from '../config/surfaces';
import { ITEMS, PROJECTILES, type ProjectileId } from '../config/items';
import { AI_PROFILES, BotController, type Difficulty } from '../sim/ai';
import {
  EV_BOOST, EV_BUMP, EV_CANAL, EV_CATCH, EV_CLEAN_START, EV_CLEANED, EV_FALL, EV_LAND, EV_LAUNCH, EV_POO,
  EV_AIRED, EV_DASH, EV_ITEM_GET, EV_ITEM_USE, EV_NICE_CATCH, EV_PED, EV_RECOVERED, EV_RESPAWN, EV_SEPARATE, EV_STUN, EV_TAP, EV_UNSTABLE, type RacerInput,
} from '../sim/physics';
import { populateGrid, RaceSession, type RaceRacer, type RacerSetup } from '../sim/race';
import { projectileThreatTime } from '../sim/projectiles';
import type { Track } from '../sim/track';
import type { AudioEngine } from '../audio/audio';
import type { InputManager } from '../input/input';
import type { ChaseCamera } from '../render/camera';
import { DogView } from '../render/dogView';
import { buildParol, buildProjectileModel, parolMaterial } from '../render/items';
import { PedestrianViews } from '../render/pedestrianView';
import * as THREE from 'three';
import type { DustSystem } from '../render/effects';
import type { EnvironmentBuild } from '../render/environment';
import { RacerView } from '../render/racerView';
import type { Stage } from '../render/stage';
import { Hud } from '../ui/hud';

export interface RaceConfig {
  track: Track;
  laps: number;
  difficulty: Difficulty;
  player: { id: string; name: string; loadout: RacerLoadout };
  showTouch: boolean;
  seed: number;
  debugHud: boolean;
}

export interface RaceResultRow {
  id: string;
  name: string;
  isPlayer: boolean;
  tyreId: string;
  position: number;
  time: number | null;
  bestLap: number | null;
  /** Bot didn't finish within the fast-forward window. */
  dnf: boolean;
}

export interface RaceDeps {
  stage: Stage;
  env: EnvironmentBuild;
  camera: ChaseCamera;
  input: InputManager;
  audio: AudioEngine;
  dust: DustSystem;
  uiRoot: HTMLElement;
}

type Snapshot = { x: number; z: number; heading: number; rx: number; rz: number; rHeading: number };

const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/**
 * Runs one race: fixed-timestep simulation, interpolated rendering, HUD, audio and effects.
 */
export class RaceController {
  readonly session: RaceSession;
  readonly views: RacerView[] = [];
  readonly dogViews: DogView[] = [];
  private pedViews: PedestrianViews;
  /** Floating parol pickups, one per sim pickup. */
  private pickupViews: { group: THREE.Mesh; wasActive: boolean; spawnT: number }[] = [];
  private projectileModels = new Map<ProjectileId, THREE.Group>();
  private projectileViews = new Map<number, THREE.Group>();
  readonly hud: Hud;
  private prev: Snapshot[] = [];
  private acc = 0;
  private paused = false;
  private lastCountdown = 4;
  private playerId: string;
  private autopilot: BotController;
  private finishedAt: number | null = null;
  private done = false;
  private wrongWaySound = 0;
  private footTimer = 0;
  private time = 0;
  private lastLapShown = 0;
  private shake = 0;
  /** Per-racer ground samplers for feet/stick placement (use each racer's projection hint). */
  private groundFns: ((x: number, z: number) => number)[] = [];
  onFinish: ((rows: RaceResultRow[]) => void) | null = null;
  /** Dev/testing only: let an AI drive the player's racer. */
  devAutopilot: BotController | null = null;

  constructor(private cfg: RaceConfig, private deps: RaceDeps) {
    const humans: RacerSetup[] = [{
      id: cfg.player.id, name: cfg.player.name, isBot: false,
      tyreId: cfg.player.loadout.tyreId, stickId: cfg.player.loadout.stickId, age: cfg.player.loadout.appearance.age,
    }];
    const roster = BOT_ROSTER;
    const bots: RacerSetup[] = roster.map((b, i) => ({
      id: `bot-${i}`, name: b.name, isBot: true, tyreId: b.loadout.tyreId, stickId: b.loadout.stickId, age: b.loadout.appearance.age,
    }));
    // Player starts at the back of the grid: more fun to overtake.
    const grid = populateGrid(humans, bots);
    const ordered = [...grid.slice(1), grid[0]];
    this.session = new RaceSession(cfg.track, ordered, { laps: cfg.laps, difficulty: cfg.difficulty, seed: cfg.seed });
    this.playerId = cfg.player.id;
    this.autopilot = new BotController(AI_PROFILES.normal, cfg.seed + 99, 0);
    this.autopilot.cruising = true;

    for (const r of this.session.racers) {
      const loadout = r.setup.isBot ? roster[Number(r.setup.id.split('-')[1])].loadout : cfg.player.loadout;
      const view = new RacerView(loadout);
      deps.stage.scene.add(view.group);
      this.views.push(view);
    }
    const groupScale = deps.stage.quality === 'low' ? 0.5 : deps.stage.quality === 'medium' ? 0.8 : 1;
    this.pedViews = new PedestrianViews(cfg.track, this.session.pedestrians, cfg.track.def.pedestrians ?? [], groupScale, cfg.seed);
    deps.stage.scene.add(this.pedViews.group);
    for (const pk of this.session.pickups) {
      const group = buildParol();
      group.position.set(pk.x, 0.75, pk.z);
      deps.stage.scene.add(group);
      this.pickupViews.push({ group, wasActive: true, spawnT: 1 });
    }
    this.groundFns = this.session.racers.map((r) => (x: number, z: number) => Math.max(0, this.groundAt(x, z, r.hint, false)));
    for (const d of this.session.dogs) {
      const dv = new DogView(d.id);
      deps.stage.scene.add(dv.root);
      this.dogViews.push(dv);
    }
    this.snapshot();
    this.hud = new Hud(deps.uiRoot, cfg.track, this.session.racers.map((r) => (r.setup.id === this.playerId ? '' : r.setup.name)), cfg.showTouch);
    this.hud.setDebug(cfg.debugHud);
    deps.input.bindTouch(this.hud.root);
    const p = this.player;
    deps.camera.snap(this.cameraTarget(p.phys.x, p.phys.z, p.phys.heading, 0), deps.env.terrain);
    // Settle animation poses before the first frame is shown.
    for (let i = 0; i < 10; i++) this.renderViews(1 / 30, 1);
  }

  get player(): RaceRacer {
    return this.session.get(this.playerId)!;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.deps.input.clear();
  }

  setDebug(on: boolean): void {
    this.hud.setDebug(on);
  }

  respawnPlayer(): void {
    this.session.respawn(this.player, false);
    this.snapshot();
  }

  private snapshot(): void {
    this.prev = this.session.racers.map((r) => ({
      x: r.phys.x, z: r.phys.z, heading: r.phys.heading, rx: r.phys.rx, rz: r.phys.rz, rHeading: r.phys.rHeading,
    }));
  }

  private cameraTarget(x: number, z: number, heading: number, speed: number) {
    const proj = this.cfg.track.project(x, z, this.player.hint);
    return { x, z, heading, speed, roadHeading: this.cfg.track.pointAt(proj.s + 8).heading };
  }

  /** Per-frame update. */
  frame(dt: number): void {
    this.time += dt;
    if (!this.paused && !this.done) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 8) {
        this.snapshot();
        this.simTick();
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps >= 8) this.acc = 0;
    }
    const alpha = this.paused ? 1 : Math.min(1, this.acc / FIXED_DT);
    this.renderViews(this.paused ? 0 : dt, alpha);
    this.updateHud(dt);
  }

  private simTick(): void {
    const s = this.session;
    const p = this.player;
    let input: RacerInput = this.deps.input.read();
    if (this.devAutopilot) input = this.devAutopilot.update(p, s.racers, s, FIXED_DT);
    if (p.progress.finished) input = this.autopilot.update(p, s.racers, s, FIXED_DT);
    const inputs: Record<string, RacerInput> = { [this.playerId]: input };
    const wasCountdown = s.phase === 'countdown';
    s.step(inputs);

    if (wasCountdown) {
      const n = Math.ceil(s.countdown);
      if (n !== this.lastCountdown) {
        this.lastCountdown = n;
        if (n > 0) { this.hud.message(String(n), 0.9, 'count'); this.deps.audio.countdown(n); }
      }
      if (s.phase === 'racing') { this.hud.message('GO!', 1, 'go'); this.deps.audio.countdown(0); }
    }

    this.handleEvents();

    const laps = p.progress.lapsCompleted;
    if (laps > this.lastLapShown && !p.progress.finished) {
      this.lastLapShown = laps;
      const final = laps === this.cfg.laps - 1;
      this.hud.message(final ? 'FINAL LAP!' : `LAP ${laps + 1}`, 1.2, final ? 'final' : '');
      this.deps.audio.lap(final);
    }
    if (p.progress.finished && this.finishedAt === null) {
      this.finishedAt = this.time;
      const pos = s.positionOf(this.playerId);
      this.hud.message(pos === 1 ? 'PANALO! 1st!' : `FINISH! ${pos}${['st', 'nd', 'rd', 'th'][Math.min(pos - 1, 3)]}`, RACE.finishCelebration, 'finish');
      this.deps.audio.finish(pos === 1);
    }
    if (this.finishedAt !== null && this.time - this.finishedAt > RACE.finishCelebration && !this.done) this.complete();
  }

  /** Simulation events → sounds, particles, speech bubbles and HUD messages. */
  private handleEvents(): void {
    const s = this.session;
    const p = this.player;
    const a = this.deps.audio;
    if (p.phys.itemHitProtection <= 0 && p.phys.invuln <= 0 && p.phys.control !== 'lost' &&
        s.projectiles.some((shot) => shot.kind === 'buko' && shot.owner !== p.order && projectileThreatTime(shot, p.phys, 0.95) !== null)) {
      this.hud.toast('buko-incoming', '🥥', 'Incoming Buko!', 0.35, 'warn');
    }
    for (const { projectile, target } of s.projectileHits) {
      const color = PROJECTILES[projectile.kind].color;
      this.sparkle(target, color, 16);
      this.views[target.order].react(projectile.kind === 'saging' ? 'Dulas!' : 'Bonk!', null, 0.85, '#fff59d');
      const hitPlayer = target === p;
      if (hitPlayer || Math.hypot(target.phys.x - p.phys.x, target.phys.z - p.phys.z) < 18) a.itemHit();
      if (hitPlayer) {
        this.hud.toast('item-hit', ITEMS[projectile.kind].icon, `Hit by ${ITEMS[projectile.kind].name}!`, 1.4, 'bad');
        this.shake = Math.max(this.shake, 0.16);
      } else if (s.racers[projectile.owner] === p) {
        this.hud.toast('item-hit', '💥', `Hit ${target.setup.name}!`, 1.2, 'good');
      }
    }
    s.racers.forEach((r, i) => {
      const me = r.setup.id === this.playerId;
      const near = me || Math.hypot(r.phys.x - p.phys.x, r.phys.z - p.phys.z) < 18;
      const view = this.views[i];
      const e = r.events;
      if (e & EV_TAP && me) a.tap(0.8);
      if (e & EV_FALL) {
        if (near) a.fall();
        this.burstDust(r, 16);
        view.react(r.phys.lostKind === 'impact' ? 'ARAY!' : 'AY!', null, 1.0, '#ffe082');
        if (me) { this.hud.toast('event', '🛞', 'Out of control!', 1.3, 'bad'); this.shake = 0.35; }
      }
      if (e & EV_CANAL) {
        if (near) a.splash();
        this.burstSplash(r.phys.x, -0.6, r.phys.z, 0x7fa2a8, 22);
        view.react('AY NAKU!', null, 1.4, '#ffe082');
        if (me) this.hud.toast('event', '💦', 'In the canal!', 1.5, 'bad');
      }
      if (e & EV_RECOVERED && me) { a.recover(); this.hud.toast('event', '✔', 'Back in control', 1, 'good'); }
      if (e & EV_UNSTABLE && me) a.wobbleWarn();
      if (e & EV_LAUNCH && near) a.whoosh(Math.min(1, r.phys.vy / 3 + 0.3));
      if (e & EV_LAND) {
        if (near) a.land(Math.min(1, r.phys.impact + 0.3));
        this.burstDust(r, 6);
        if (me && r.phys.impact > 0.25) this.shake = Math.max(this.shake, 0.2);
      }
      if (e & EV_SEPARATE && me && r.phys.control !== 'lost') this.hud.notice('Catch your tyre!', 1.2, '🏃', 'warn');
      if (e & EV_CATCH && me) a.catchTyre();
      if (e & EV_BOOST) {
        if (near) a.boost();
        if (me) this.hud.toast('boost', '⚡', 'Boost!', 1, 'good');
      }
      if (e & EV_POO) {
        view.react('EWW!', 'eww', 1.2, '#c5e1a5');
        if (near) a.squish();
        if (me) this.hud.notice('Poo! Stop on the side to clean — or race on', 2.5, '💩', 'warn');
      }
      if (e & EV_CLEAN_START) view.react('Linis!', null, 0.9);
      if (e & EV_CLEANED) { if (me) { a.clean(); this.hud.notice('Clean! Go go go!', 1, '✨', 'good'); } this.sparkle(r, 0xffffff, 10); }
      if (e & EV_AIRED && me) this.hud.notice('Smell’s gone!', 1.2, '🌬', 'good');
      if (e & EV_STUN) {
        if (near) a.stun();
        view.react('ARAY!', null, 1.1, '#ffccbc');
        if (me) { this.hud.toast('event', '🐕', 'Bitten!', 1.1, 'bad'); this.shake = 0.3; }
      }
      if (e & EV_RESPAWN) this.sparkle(r, 0xffffff, 14);
      if (e & EV_DASH) {
        if (near) a.dash();
        this.burstDust(r, 8);
        if (me) this.hud.toast('dash', '💨', 'Dash!', 0.8, 'good');
      }
      if (e & EV_NICE_CATCH) {
        if (near) a.niceCatch();
        this.sparkle(r, 0xffd54f, 18);
        view.react('Nice catch!', null, 1.0, '#fff59d');
        if (me) this.hud.toast('catch', '🎯', 'Nice Catch! +speed', 1.4, 'good');
      }
      if (e & EV_ITEM_GET) {
        if (me) { a.pickup(); this.hud.toast('item', '🎁', 'Item!', 1, 'info'); }
      }
      if (e & EV_ITEM_USE && r.phys.lastItem) {
        const it = ITEMS[r.phys.lastItem];
        if (near) a.itemUse(it.id);
        view.showItem(it.id);
        if (me) this.hud.toast('item', it.icon, `${it.effect}!`, 1.6, 'good');
      }
      if (e & EV_PED) {
        if (near) a.oops();
        if (me) this.hud.toast('ped', '🚶', 'Watch out for people!', 1.2, 'warn');
      }
      if (e & EV_BUMP && near && r.bumpImpact > 1) a.bump(r.bumpImpact);
      for (const h of r.hazardHits) {
        if (!near) continue;
        if (h.type === 'pothole' || h.type === 'flatTyre') a.clunk();
        if (h.type === 'log') a.thunk();
        if (h.type === 'mud') this.burstSplash(r.phys.x, 0.1, r.phys.z, 0x5a3d22, 10);
      }
    });
    for (const ev of s.pedEvents) {
      if (ev.type !== 'startCross') continue;
      const ped = s.pedestrians[ev.ped];
      const ahead = ((ped.s - p.progress.lastS) % s.track.length + s.track.length) % s.track.length;
      if (ahead < 45) this.hud.toast('ped', '🚶', 'People crossing ahead', 1.6, 'warn');
    }
    for (const ev of s.dogEvents) {
      const dv = this.dogViews[ev.dog];
      const dog = s.dogs[ev.dog];
      const close = Math.hypot(dog.x - p.phys.x, dog.z - p.phys.z) < 25;
      if (ev.type === 'bark') {
        dv.say('ARF! ARF!', 1.0, '#fff59d');
        if (close) a.bark();
        if (ev.racer === s.racers.indexOf(p)) this.hud.toast('dog', '🐕', 'Askal! Outrun it!', 1.6, 'warn');
      } else if (ev.type === 'growl') {
        dv.say('ARF!', 0.6, '#fff59d');
        if (close) a.bark();
        if (ev.racer === s.racers.indexOf(p)) this.hud.toast('dog', '🐕', 'Askal on your heels!', 1.5, 'warn');
      } else if (ev.type === 'catch') {
        dv.say('GRRR!', 0.8);
        if (close) a.bark();
      } else if (ev.type === 'giveUp') {
        dv.say('...', 0.6);
      }
    }
  }

  /** Let the remaining bots finish quickly in pure simulation, then report results. */
  private complete(): void {
    this.done = true;
    const s = this.session;
    const maxTicks = Math.round(RACE.maxFastForward / FIXED_DT);
    for (let i = 0; i < maxTicks && s.phase !== 'finished'; i++) {
      const p = this.player;
      s.step({ [this.playerId]: this.autopilot.update(p, s.racers, s, FIXED_DT) });
    }
    this.snapshot();
    const standings = s.standings();
    const rows: RaceResultRow[] = standings.map((r, i) => ({
      id: r.setup.id, name: r.setup.name, isPlayer: r.setup.id === this.playerId, tyreId: r.setup.tyreId,
      position: i + 1, time: r.progress.finishTime, bestLap: r.progress.bestLap, dnf: !r.progress.finished,
    }));
    const playerPos = rows.find((r) => r.isPlayer)!.position;
    this.views.forEach((v, i) => {
      const r = s.racers[i];
      const pos = standings.indexOf(r) + 1;
      v.setForcedMode(pos === 1 ? 'celebrate' : r.setup.id === this.playerId && playerPos >= 3 ? 'sad' : 'cheer');
    });
    this.hud.root.classList.add('hidden');
    this.onFinish?.(rows);
  }

  get isDone(): boolean {
    return this.done;
  }

  private burstDust(r: RaceRacer, n: number): void {
    const col = SURFACES[r.phys.surface].dustColor;
    for (let i = 0; i < n; i++) {
      this.deps.dust.emit(r.phys.x, r.phys.y + 0.2, r.phys.z, (Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3, col, 1.2);
    }
  }

  private burstSplash(x: number, y: number, z: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.deps.dust.emit(x, y, z, (Math.random() - 0.5) * 2.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2.5, color, 0.7);
    }
  }

  private sparkle(r: RaceRacer, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.deps.dust.emit(r.phys.x, r.phys.y + 0.5, r.phys.z, (Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5, color, 0.6);
    }
  }

  private groundAt(x: number, z: number, hint: number, allowCanal: boolean): number {
    const g = this.session.groundAt(this.cfg.track.project(x, z, hint));
    return g.canal && !allowCanal ? 0 : g.h;
  }

  private renderViews(dt: number, alpha: number): void {
    const s = this.session;
    const tagPos: { x: number; y: number; z: number; visible: boolean }[] = [];
    s.racers.forEach((r, i) => {
      const a = this.prev[i];
      const x = a.x + (r.phys.x - a.x) * alpha;
      const z = a.z + (r.phys.z - a.z) * alpha;
      const heading = lerpAngle(a.heading, r.phys.heading, alpha);
      const rx = a.rx + (r.phys.rx - a.rx) * alpha;
      const rz = a.rz + (r.phys.rz - a.rz) * alpha;
      const rHeading = lerpAngle(a.rHeading, r.phys.rHeading, alpha);
      const view = this.views[i];
      const tyreGround = this.groundAt(x, z, r.hint, true);
      const runnerGround = Math.max(0, this.groundAt(rx, rz, r.hint, false));
      view.update(dt, { x, z, heading, rx, rz, rHeading, phys: r.phys, tyreGround, runnerGround, ground: this.groundFns[i] });
      tagPos.push({ x: rx, y: runnerGround + view.runner.height + 0.45, z: rz, visible: r.setup.id !== this.playerId });
      if (dt <= 0) return;
      const ph = r.phys;
      // Dust from the tyre on dusty ground; mud splashes; boost sparkles.
      if (ph.speed > 2 && ph.grounded) {
        const surf = SURFACES[ph.surface];
        const rate = surf.dust * (ph.speed / 12) * (1 + ph.slip * 2) * 22;
        if (Math.random() < rate * dt) {
          this.deps.dust.emit(x - Math.sin(heading) * 0.3 + (Math.random() - 0.5) * 0.3, ph.y + 0.1, z - Math.cos(heading) * 0.3 + (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8, surf.dustColor, 0.8 + Math.random() * 0.5);
        }
        if (ph.surface === 'mud' && Math.random() < ph.speed * 1.5 * dt) {
          this.burstSplash(x, 0.1, z, 0x4e3420, 2);
        }
        // Grass: clippings and clods kicked up, more on lumpy patches.
        if (ph.surface === 'grass' && Math.random() < ph.speed * 2.2 * dt) {
          const col = Math.random() < 0.7 ? 0x6fae3a : 0x7a5a32;
          this.deps.dust.emit(x + (Math.random() - 0.5) * 0.25, ph.y + 0.08, z + (Math.random() - 0.5) * 0.25,
            -Math.sin(heading) * 1.2 + (Math.random() - 0.5), 1.2 + Math.random() * 1.2, -Math.cos(heading) * 1.2 + (Math.random() - 0.5), col, 0.45);
        }
      }
      // Power-up trails: crumbs, fizz, sparkles, dash streaks, landing-bonus glitter.
      const fx = ph.fx;
      const trail = (rate: number, color: number, up: number, life: number) => {
        if (Math.random() < rate * dt) {
          this.deps.dust.emit(x + (Math.random() - 0.5) * 0.4, ph.y + 0.2 + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 0.8, up, (Math.random() - 0.5) * 0.8, color, life);
        }
      };
      if (fx.turbo > 0) trail(30, 0xffd54f, 0.6, 0.6);
      if (fx.dash > 0) trail(40, 0xffffff, 0.3, 0.35);
      if (fx.bonus > 0) trail(30, 0xfff176, 1.0, 0.5);
      // Cartoon stink trail while racing on with a dirty tyre.
      if (ph.dirt > 0.05 && Math.random() < 9 * ph.dirt * dt) {
        this.deps.dust.emit(x + (Math.random() - 0.5) * 0.3, ph.y + 0.3 + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3, 0.35, (Math.random() - 0.5) * 0.3, 0x9ccc65, 1.3);
      }
      if (ph.boost > 0 && Math.random() < 30 * dt) {
        this.deps.dust.emit(x, ph.y + 0.35, z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, 0xffc400, 0.45);
      }
    });
    if (dt > 0) this.deps.dust.update(dt);

    s.dogs.forEach((d, i) => this.dogViews[i].update(dt, d, Math.max(0, this.groundAt(d.x, d.z, -1, false))));
    this.updatePickups(dt);
    this.updateProjectiles();
    this.pedViews.update(dt, s.pedestrians, s.racers.map((r) => r.phys));

    const p = this.player;
    const pi = s.racers.indexOf(p);
    const a = this.prev[pi];
    let px = a.x + (p.phys.x - a.x) * alpha, pz = a.z + (p.phys.z - a.z) * alpha;
    let heading = p.phys.heading;
    if (p.phys.control === 'lost') {
      // Frame the runner chasing the loose tyre.
      px = (px + p.phys.rx) / 2; pz = (pz + p.phys.rz) / 2;
      heading = p.phys.rHeading;
    }
    if (this.done) {
      this.deps.camera.orbit(this.time, p.phys.rx, p.phys.rz, 5, 2.2, 0.8);
    } else if (dt > 0) {
      this.deps.camera.update(dt, this.cameraTarget(px, pz, heading, p.phys.speed), this.deps.env.terrain, this.deps.env.colliders);
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt);
        const k = this.shake * 0.12;
        this.deps.camera.camera.position.x += (Math.random() - 0.5) * k;
        this.deps.camera.camera.position.y += (Math.random() - 0.5) * k;
      }
    }
    this.deps.stage.followSun(px, pz);
    this.hud.updateTags(tagPos, this.deps.camera.camera);
  }

  private updateProjectiles(): void {
    const shots = this.session.projectiles;
    for (const [id, view] of this.projectileViews) {
      if (shots.some((shot) => shot.id === id)) continue;
      this.deps.stage.scene.remove(view);
      this.projectileViews.delete(id);
    }
    for (const shot of shots) {
      let view = this.projectileViews.get(shot.id);
      if (!view) {
        let model = this.projectileModels.get(shot.kind);
        if (!model) {
          model = buildProjectileModel(shot.kind);
          this.projectileModels.set(shot.kind, model);
        }
        view = model.clone();
        this.projectileViews.set(shot.id, view);
        this.deps.stage.scene.add(view);
      }
      view.position.set(shot.x, shot.y, shot.z);
      view.rotation.set(shot.kind === 'buko' ? shot.roll : 0, shot.heading, shot.kind === 'skyflakes' ? shot.roll * 0.16 : 0, 'YXZ');
    }
  }

  /** Spin/bob the parol pickups; burst when collected, grow back in when they respawn. */
  private updatePickups(dt: number): void {
    const t = this.time;
    this.session.pickups.forEach((pk, i) => {
      const v = this.pickupViews[i];
      const active = pk.respawn <= 0;
      if (v.wasActive && !active) {
        for (let k = 0; k < 14; k++) {
          this.deps.dust.emit(pk.x, 0.75, pk.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, k % 2 ? 0xffd54f : 0xff5252, 0.6);
        }
        v.spawnT = 0;
      }
      v.wasActive = active;
      v.group.visible = active;
      if (!active) return;
      v.spawnT = Math.min(1, v.spawnT + dt * 2.5);
      const sc = v.spawnT * (1 + 0.06 * Math.sin(t * 5 + i));
      v.group.scale.setScalar(sc);
      v.group.rotation.y = t * 1.8 + i;
      v.group.position.y = 0.78 + Math.sin(t * 2.4 + i * 0.7) * 0.07;
    });
    parolMaterial().emissiveIntensity = 0.3 + 0.25 * Math.sin(t * 4);
  }

  private updateHud(dt: number): void {
    const s = this.session;
    const p = this.player;
    const ph = p.phys;
    const pr = p.progress;
    const lap = pr.started ? pr.lapsCompleted + 1 : 1;
    const wrongWay = p.wrongWayTime > 1 && !pr.finished;
    this.hud.update({
      position: s.positionOf(this.playerId),
      racers: s.racers.length,
      lap, laps: this.cfg.laps,
      lapTime: pr.finished ? (pr.lapTimes[pr.lapTimes.length - 1] ?? 0) : s.time - pr.lapStartTime,
      totalTime: pr.finishTime ?? s.time,
      bestLap: pr.bestLap,
      speed: ph.speed,
      stamina: ph.stamina,
      instability: Math.min(1, ph.instability),
      wrongWay,
      phys: ph,
    });
    this.updateItemSlot(ph);
    this.hud.tick(dt);
    this.hud.drawMinimap(s.racers, this.playerId);
    const a = this.deps.audio;
    a.updateRolling(ph.grounded ? ph.speed : 0, ph.surface, ph.control === 'lost' ? 0 : ph.wobble, !this.paused && !this.done);
    if (!this.paused && !this.done) {
      if (wrongWay) {
        this.wrongWaySound -= dt;
        if (this.wrongWaySound <= 0) { a.wrongWay(); this.wrongWaySound = 1.2; }
      }
      if (ph.rSpeed > 1) {
        this.footTimer -= dt;
        if (this.footTimer <= 0) {
          a.footstep(ph.surface);
          const stride = 0.6 + ph.rSpeed * 0.12;
          this.footTimer = stride / ph.rSpeed;
        }
      }
    }
  }

  private itemShown: string | null = '';
  private updateItemSlot(ph: RaceRacer['phys']): void {
    if (ph.item && ph.itemReveal > 0) {
      // Roulette: flick through the snacks until the reveal.
      const ids = Object.keys(ITEMS) as (keyof typeof ITEMS)[];
      const show = ids[Math.floor(this.time * 14) % ids.length];
      this.hud.setItemRolling(true);
      this.hud.setItem(ITEMS[show].icon, '…');
      this.itemShown = null;
      return;
    }
    this.hud.setItemRolling(false);
    const ready = ph.itemCooldown <= 0 && ph.control !== 'lost';
    const key = ph.item ? `${ph.item}/${ready}` : '';
    if (key === this.itemShown) return;
    this.itemShown = key;
    this.hud.setItem(ph.item ? ITEMS[ph.item].icon : null, ph.item ? ITEMS[ph.item].name : '', !!ph.item && ready, ph.item === 'buko');
  }

  dispose(): void {
    for (const view of this.projectileViews.values()) this.deps.stage.scene.remove(view);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const model of this.projectileModels.values()) {
      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        resources.add(node.geometry);
        for (const material of [node.material].flat()) resources.add(material);
      });
    }
    for (const resource of resources) resource.dispose();
    this.deps.stage.scene.remove(this.pedViews.group);
    this.pedViews.dispose();
    // Parol geometry/material are shared module-level caches (reused by the next race).
    for (const v of this.pickupViews) this.deps.stage.scene.remove(v.group);
    for (const v of this.views) {
      this.deps.stage.scene.remove(v.group);
      v.dispose();
    }
    for (const d of this.dogViews) {
      this.deps.stage.scene.remove(d.root);
      d.dispose();
    }
    this.hud.dispose();
    this.deps.audio.updateRolling(0, 'dirt', 0, false);
  }
}
