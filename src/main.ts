import './ui/styles.css';
import { AudioEngine } from './audio/audio';
import { BOT_ROSTER, DEFAULT_PLAYER, type CharacterAppearance, SKIN_TONES } from './config/appearance';
import { Rng } from './core/rng';
import { AI_PROFILES, BotController } from './sim/ai';
import { RaceController, type RaceResultRow } from './game/raceController';
import { InputManager } from './input/input';
import { ChaseCamera } from './render/camera';
import { Runner } from './render/character';
import { DustSystem } from './render/effects';
import { buildEnvironment, type EnvironmentBuild } from './render/environment';
import { QUALITY, type Quality } from './render/quality';
import { RacerView } from './render/racerView';
import { Stage } from './render/stage';
import { createRacerState } from './sim/physics';
import { Track } from './sim/track';
import { LocalStore, type Settings } from './storage/local';
import { BARANGAY_DASH } from './tracks/barangayDash';
import {
  homeScreen, loadingScreen, pauseScreen, recordsScreen, resultsScreen, settingsScreen, setupScreen,
} from './ui/screens';

type Screen = 'home' | 'setup' | 'race' | 'pause' | 'results' | 'settings' | 'records';

class App {
  private store = new LocalStore();
  private settings: Settings = this.store.settings;
  private stage: Stage;
  private camera: ChaseCamera;
  private audio = new AudioEngine();
  private input = new InputManager();
  private dust: DustSystem;
  private track = new Track(BARANGAY_DASH);
  private env!: EnvironmentBuild;
  private envQuality: Quality | null = null;
  private ui: HTMLElement;
  private hudLayer: HTMLElement;
  private race: RaceController | null = null;
  private screen: Screen = 'home';
  private returnTo: Screen = 'home';
  private showroom: RacerView[] = [];
  private spectators: Runner[] = [];
  private last = performance.now();
  private time = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lastResults: { rows: RaceResultRow[]; pb: { newBestRace: boolean; newBestLap: boolean } } | null = null;

  constructor() {
    const root = document.getElementById('app')!;
    this.stage = new Stage(root, this.settings.quality);
    this.camera = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.camera.distance = this.settings.camera;
    this.dust = new DustSystem(QUALITY[this.settings.quality].dust);
    this.stage.scene.add(this.dust.points);
    this.ui = document.getElementById('ui')!;
    this.hudLayer = document.getElementById('hud-layer')!;
    this.audio.setVolumes(this.settings.sfxVolume, this.settings.musicVolume);
    this.input.autoPush = this.settings.autoPush;
    this.input.onPause = () => this.togglePause();
    this.input.onCamera = () => {
      const order = ['near', 'normal', 'far'] as const;
      this.applySettings({ camera: order[(order.indexOf(this.settings.camera) + 1) % 3] });
    };

    window.addEventListener('resize', () => this.stage.resize(this.camera.camera));
    window.addEventListener('orientationchange', () => setTimeout(() => this.stage.resize(this.camera.camera), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.race && this.screen === 'race') this.togglePause();
    });
    const unlock = () => {
      this.audio.unlock();
      this.audio.startMusic();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Block iOS pinch/double-tap zoom gestures during play.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());

    this.ui.addEventListener('click', (e) => this.onClick(e));
    this.ui.addEventListener('input', (e) => this.onInput(e));
    document.getElementById('rotate-dismiss')?.addEventListener('click', () => document.body.classList.add('rotate-dismissed'));

    this.ui.innerHTML = loadingScreen('Building the barangay…');
    this.stage.resize(this.camera.camera);
    requestAnimationFrame(() => {
      this.ensureEnvironment();
      this.buildShowroom();
      this.showHome();
      this.loop();
    });
  }

  // ------------------------------------------------------------------ world
  private ensureEnvironment(): void {
    if (this.env && this.envQuality === this.settings.quality) return;
    if (this.env) {
      this.stage.scene.remove(this.env.group);
      this.env.dispose();
      for (const s of this.spectators) { this.stage.scene.remove(s.root); s.dispose(); }
      this.spectators = [];
    }
    this.env = buildEnvironment(this.track, QUALITY[this.settings.quality], 7);
    this.envQuality = this.settings.quality;
    this.stage.scene.add(this.env.group);
    // Cheering villagers along the start straight.
    const rng = new Rng(42);
    for (const spot of this.env.spectatorSpots) {
      const look: CharacterAppearance = {
        age: rng.chance(0.5) ? 'adult' : 'child', gender: rng.chance(0.5) ? 'boy' : 'girl',
        hair: rng.pick(['short', 'curly', 'bob', 'ponytail', 'cap', 'spiky'] as const), skin: rng.pick(SKIN_TONES),
        hairColor: rng.pick([0x1c1410, 0x2a1a10, 0x3b2314, 0xb0b0b0]), shirt: rng.pick(['tee', 'tank', 'jersey'] as const),
        shirtColor: rng.pick([0xffffff, 0xef5350, 0x42a5f5, 0xffee58, 0x66bb6a, 0xab47bc, 0xff7043]),
        bottoms: rng.pick(['shorts', 'trousers'] as const), bottomsColor: rng.pick([0x37474f, 0x5d4037, 0x1565c0, 0x9e9e9e]),
        footwear: rng.pick(['sandals', 'barefoot', 'sneakers'] as const), footwearColor: rng.pick([0xffffff, 0x1e88e5, 0xe53935]),
      };
      const r = new Runner(look);
      r.root.position.set(spot.x, this.env.terrain.heightAt(spot.x, spot.z), spot.z);
      r.root.rotation.y = spot.heading;
      this.stage.scene.add(r.root);
      this.spectators.push(r);
    }
  }

  /** Racers parked on the grid for the menu background. */
  private buildShowroom(): void {
    this.clearShowroom();
    const loadouts = [...BOT_ROSTER.slice(0, 3).map((b) => b.loadout), DEFAULT_PLAYER];
    loadouts.forEach((lo, i) => {
      const v = new RacerView(lo);
      const row = Math.floor(i / 2), col = i % 2;
      const s = this.track.length - 4 - row * 4.5 - col * 1.5;
      const pt = this.track.pointAt(s);
      const lane = (col === 0 ? -1 : 1) * 1.9;
      const ph = createRacerState(pt.x + pt.nx * lane, pt.z + pt.nz * lane, pt.heading);
      v.userState = ph;
      this.stage.scene.add(v.group);
      this.showroom.push(v);
    });
  }

  private clearShowroom(): void {
    for (const v of this.showroom) { this.stage.scene.remove(v.group); v.dispose(); }
    this.showroom = [];
  }

  // ------------------------------------------------------------------ loop
  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.env?.update(this.time);
    const specMode = this.race && !this.race.isDone && this.race.session.phase === 'racing' ? 'cheer' : 'idle';
    for (const s of this.spectators) s.animate(dt, { speed: 0, pushing: 0, lean: 0, wobble: 0, mode: specMode, modeTime: 0 });

    if (this.race) {
      this.race.frame(dt);
    } else {
      for (const v of this.showroom) {
        const st = v.userState!;
        v.update(dt, { x: st.x, z: st.z, heading: st.heading, phys: st });
      }
      const sp = this.track.pointAt(this.track.length - 8);
      this.camera.orbit(this.time * 0.8 + 2, sp.x, sp.z, 13, 3.0, 0.6);
      this.stage.followSun(sp.x, sp.z);
      this.dust.update(dt);
    }
    this.stage.render(this.camera.camera);

    // Dynamic resolution to hold frame rate on slower devices.
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 2) {
      this.stage.adaptResolution(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  };

  /** Dev/testing helper: advance the game by `seconds` of fixed frames regardless of rAF throttling. */
  devAdvance(seconds: number, fps = 30, autopilot = false): void {
    const dt = 1 / fps;
    if (autopilot && this.race && !this.race.devAutopilot) this.race.devAutopilot = new BotController(AI_PROFILES.normal, 1, 0);
    for (let i = 0; i < seconds * fps; i++) {
      this.time += dt;
      this.env.update(this.time);
      this.race?.frame(dt);
    }
    this.stage.render(this.camera.camera);
  }

  // ------------------------------------------------------------------ screens
  private setScreen(s: Screen, html: string): void {
    this.screen = s;
    this.ui.innerHTML = html;
    this.ui.classList.toggle('passthrough', s === 'race');
  }

  private showHome(): void {
    this.setScreen('home', homeScreen(this.store.profile.nickname));
  }

  private showSetup(): void {
    const s = this.settings;
    this.setScreen('setup', setupScreen({
      nickname: this.store.profile.nickname, difficulty: s.difficulty, laps: s.laps,
      record: this.store.record(this.track.def.id, s.laps), tyreId: DEFAULT_PLAYER.tyreId, stickId: DEFAULT_PLAYER.stickId,
    }));
  }

  private startRace(): void {
    this.endRace();
    this.ensureEnvironment();
    this.clearShowroom();
    const touch = this.settings.touchControls === 'on' || (this.settings.touchControls === 'auto' && (navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches));
    this.race = new RaceController({
      track: this.track, laps: this.settings.laps, difficulty: this.settings.difficulty,
      player: { id: this.store.profile.guestId, name: this.store.profile.nickname, loadout: DEFAULT_PLAYER },
      showTouch: touch, seed: Math.floor(Math.random() * 1e6),
    }, {
      stage: this.stage, env: this.env, camera: this.camera, input: this.input, audio: this.audio, dust: this.dust, uiRoot: this.hudLayer,
    });
    this.race.onFinish = (rows) => this.onRaceFinished(rows);
    this.setScreen('race', '');
  }

  private endRace(): void {
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
  }

  private onRaceFinished(rows: RaceResultRow[]): void {
    const me = rows.find((r) => r.isPlayer)!;
    const pb = this.store.submitResult({
      date: Date.now(), trackId: this.track.def.id, laps: this.settings.laps, difficulty: this.settings.difficulty,
      position: me.position, time: me.time, bestLap: me.bestLap, tyreId: DEFAULT_PLAYER.tyreId,
    });
    this.lastResults = { rows, pb };
    this.setScreen('results', resultsScreen(rows, pb));
  }

  private togglePause(): void {
    if (!this.race || this.race.isDone) return;
    if (this.screen === 'race') {
      this.race.setPaused(true);
      this.setScreen('pause', pauseScreen());
    } else if (this.screen === 'pause') {
      this.race.setPaused(false);
      this.setScreen('race', '');
    }
  }

  private goHome(): void {
    this.endRace();
    this.buildShowroom();
    this.showHome();
  }

  private applySettings(patch: Partial<Settings>): void {
    const prevQuality = this.settings.quality;
    this.settings = this.store.updateSettings(patch);
    this.camera.distance = this.settings.camera;
    this.input.autoPush = this.settings.autoPush;
    this.audio.setVolumes(this.settings.sfxVolume, this.settings.musicVolume);
    if (this.settings.quality !== prevQuality) {
      this.stage.applyQuality(this.settings.quality);
      this.stage.resize(this.camera.camera);
      if (!this.race) { this.ensureEnvironment(); }
    }
  }

  // ------------------------------------------------------------------ events
  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    const segBtn = target.closest<HTMLElement>('.seg button');
    if (segBtn) {
      const seg = segBtn.parentElement!.dataset.seg!;
      const raw = segBtn.dataset.value!;
      segBtn.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === segBtn));
      this.audio.click();
      const value: unknown = seg === 'laps' ? Number(raw) : seg === 'autoPush' ? raw === 'true' : raw;
      this.applySettings({ [seg]: value } as Partial<Settings>);
      if (seg === 'laps' && this.screen === 'setup') this.showSetup();
      return;
    }
    const btn = target.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    this.audio.click();
    const nick = this.ui.querySelector<HTMLInputElement>('#nick');
    if (nick) this.store.setNickname(nick.value);
    switch (btn.dataset.action) {
      case 'solo': this.endRace(); if (!this.showroom.length) this.buildShowroom(); this.showSetup(); break;
      case 'start': case 'again': this.startRace(); break;
      case 'home': this.goHome(); break;
      case 'resume': this.togglePause(); break;
      case 'restart': this.startRace(); break;
      case 'respawn': this.race?.respawnPlayer(); this.togglePause(); break;
      case 'quit': this.goHome(); break;
      case 'settings': this.returnTo = this.screen; this.setScreen('settings', settingsScreen(this.settings)); break;
      case 'records':
        this.returnTo = this.screen;
        this.setScreen('records', recordsScreen(this.store.record(this.track.def.id, this.settings.laps), this.settings.laps, this.store.history));
        break;
      case 'back': this.back(); break;
    }
  }

  private back(): void {
    switch (this.returnTo) {
      case 'pause': this.setScreen('pause', pauseScreen()); break;
      case 'results':
        if (this.lastResults) this.setScreen('results', resultsScreen(this.lastResults.rows, this.lastResults.pb));
        else this.showHome();
        break;
      default: this.showHome();
    }
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    const key = el.dataset.range as 'sfxVolume' | 'musicVolume' | undefined;
    if (key) this.applySettings({ [key]: Number(el.value) });
  }
}

const app = new App();
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
