import { BOT_ROSTER, type RacerLoadout } from '../config/appearance';
import { FIXED_DT, RACE } from '../config/gameplay';
import { SURFACES } from '../config/surfaces';
import { AI_PROFILES, BotController, type Difficulty } from '../sim/ai';
import { EV_BUMP, EV_FALL, EV_RECOVERED, EV_TAP, type RacerInput } from '../sim/physics';
import { populateGrid, RaceSession, type RaceRacer, type RacerSetup } from '../sim/race';
import type { Track } from '../sim/track';
import type { AudioEngine } from '../audio/audio';
import type { InputManager } from '../input/input';
import type { ChaseCamera } from '../render/camera';
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
}

export interface RaceResultRow {
  id: string;
  name: string;
  isPlayer: boolean;
  tyreId: string;
  position: number;
  time: number | null;
  bestLap: number | null;
  /** Estimated finish (bot didn't finish within the fast-forward window). */
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

type Snapshot = { x: number; z: number; heading: number };

/**
 * Runs one race: fixed-timestep simulation, interpolated rendering, HUD, audio and effects.
 */
export class RaceController {
  readonly session: RaceSession;
  readonly views: RacerView[] = [];
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
  onFinish: ((rows: RaceResultRow[]) => void) | null = null;
  /** Dev/testing only: let an AI drive the player's racer. */
  devAutopilot: BotController | null = null;

  constructor(private cfg: RaceConfig, private deps: RaceDeps) {
    const humans: RacerSetup[] = [{
      id: cfg.player.id, name: cfg.player.name, isBot: false,
      tyreId: cfg.player.loadout.tyreId, stickId: cfg.player.loadout.stickId,
    }];
    const roster = BOT_ROSTER;
    const bots: RacerSetup[] = roster.map((b, i) => ({
      id: `bot-${i}`, name: b.name, isBot: true, tyreId: b.loadout.tyreId, stickId: b.loadout.stickId,
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
    this.snapshot();
    this.hud = new Hud(deps.uiRoot, cfg.track, this.session.racers.map((r) => (r.setup.id === this.playerId ? '' : r.setup.name)), cfg.showTouch);
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

  respawnPlayer(): void {
    this.session.respawn(this.player);
    this.snapshot();
  }

  private snapshot(): void {
    this.prev = this.session.racers.map((r) => ({ x: r.phys.x, z: r.phys.z, heading: r.phys.heading }));
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
    if (this.devAutopilot) input = this.devAutopilot.update(p, s.racers, s.track, FIXED_DT);
    if (p.progress.finished) input = this.autopilot.update(p, s.racers, s.track, FIXED_DT);
    const inputs: Record<string, RacerInput> = { [this.playerId]: input };
    const wasCountdown = s.phase === 'countdown';
    s.step(inputs);

    // Countdown beeps.
    if (wasCountdown) {
      const n = Math.ceil(s.countdown);
      if (n !== this.lastCountdown) {
        this.lastCountdown = n;
        if (n > 0) { this.hud.message(String(n), 0.9, 'count'); this.deps.audio.countdown(n); }
      }
      if (s.phase === 'racing') { this.hud.message('GO!', 1, 'go'); this.deps.audio.countdown(0); }
    }

    // Events → audio/effects (player is loud, others quieter).
    for (const r of s.racers) {
      const me = r.setup.id === this.playerId;
      const near = me || Math.hypot(r.phys.x - p.phys.x, r.phys.z - p.phys.z) < 18;
      if (r.events & EV_TAP && me) this.deps.audio.tap(0.8);
      if (r.events & EV_FALL) {
        if (near) this.deps.audio.fall();
        this.burstDust(r, 14);
      }
      if (r.events & EV_RECOVERED && me) this.deps.audio.recover();
      if (r.events & EV_BUMP && near && r.bumpImpact > 1) this.deps.audio.bump(r.bumpImpact);
    }

    // Lap messages.
    const laps = p.progress.lapsCompleted;
    if (laps > this.lastLapShown && !p.progress.finished) {
      this.lastLapShown = laps;
      const final = laps === this.cfg.laps - 1;
      this.hud.message(final ? 'FINAL LAP!' : `LAP ${laps + 1}`, 1.6, final ? 'final' : '');
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

  /** Let the remaining bots finish quickly in pure simulation, then report results. */
  private complete(): void {
    this.done = true;
    const s = this.session;
    const maxTicks = Math.round(RACE.maxFastForward / FIXED_DT);
    for (let i = 0; i < maxTicks && s.phase !== 'finished'; i++) {
      const p = this.player;
      s.step({ [this.playerId]: this.autopilot.update(p, s.racers, s.track, FIXED_DT) });
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
      this.deps.dust.emit(r.phys.x, 0.2, r.phys.z, (Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3, col, 1.2);
    }
  }

  private renderViews(dt: number, alpha: number): void {
    const s = this.session;
    const tagPos: { x: number; y: number; z: number; visible: boolean }[] = [];
    s.racers.forEach((r, i) => {
      const a = this.prev[i];
      const x = a.x + (r.phys.x - a.x) * alpha;
      const z = a.z + (r.phys.z - a.z) * alpha;
      const dh = Math.atan2(Math.sin(r.phys.heading - a.heading), Math.cos(r.phys.heading - a.heading));
      const heading = a.heading + dh * alpha;
      const view = this.views[i];
      view.update(dt, { x, z, heading, phys: r.phys });
      tagPos.push({ x, y: view.runner.height + 0.45, z, visible: r.setup.id !== this.playerId });
      // Dust from tyre + feet.
      if (dt > 0 && r.phys.speed > 2) {
        const surf = SURFACES[r.phys.surface];
        const rate = surf.dust * (r.phys.speed / 12) * (1 + r.phys.slip * 2) * 22;
        if (Math.random() < rate * dt) {
          const back = -0.3;
          this.deps.dust.emit(
            x + Math.sin(heading) * back + (Math.random() - 0.5) * 0.3, 0.1, z + Math.cos(heading) * back + (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8, surf.dustColor, 0.8 + Math.random() * 0.5,
          );
        }
      }
    });
    if (dt > 0) this.deps.dust.update(dt);

    const p = this.player;
    const pi = s.racers.indexOf(p);
    const a = this.prev[pi];
    const px = a.x + (p.phys.x - a.x) * alpha, pz = a.z + (p.phys.z - a.z) * alpha;
    if (this.done) {
      this.deps.camera.orbit(this.time, px, pz, 5.5, 2.4, 0.8);
    } else if (dt > 0) {
      this.deps.camera.update(dt, this.cameraTarget(px, pz, p.phys.heading, p.phys.speed), this.deps.env.terrain, this.deps.env.colliders);
    }
    this.deps.stage.followSun(px, pz);
    this.hud.updateTags(tagPos, this.deps.camera.camera);
  }

  private updateHud(dt: number): void {
    const s = this.session;
    const p = this.player;
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
      speed: p.phys.speed,
      stamina: p.phys.stamina,
      instability: p.phys.instability,
      wrongWay,
      fallen: p.phys.mode !== 'racing',
    });
    this.hud.tick(dt);
    this.hud.drawMinimap(s.racers, this.playerId);
    const a = this.deps.audio;
    a.updateRolling(p.phys.speed, p.phys.surface, p.phys.wobble, !this.paused && !this.done);
    if (!this.paused && !this.done) {
      if (wrongWay) {
        this.wrongWaySound -= dt;
        if (this.wrongWaySound <= 0) { a.wrongWay(); this.wrongWaySound = 1.2; }
      }
      if (p.phys.speed > 1 && p.phys.mode === 'racing') {
        this.footTimer -= dt;
        if (this.footTimer <= 0) {
          a.footstep(p.phys.surface);
          const stride = 0.6 + p.phys.speed * 0.12;
          this.footTimer = stride / p.phys.speed;
        }
      }
    }
  }

  dispose(): void {
    for (const v of this.views) {
      this.deps.stage.scene.remove(v.group);
      v.dispose();
    }
    this.hud.dispose();
    this.deps.audio.updateRolling(0, 'dirt', 0, false);
  }
}

