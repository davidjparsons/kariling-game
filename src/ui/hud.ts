import * as THREE from 'three';
import { formatTime, ordinal } from '../core/math';
import type { RacerPhysicsState } from '../sim/physics';
import type { RaceRacer } from '../sim/race';
import type { Track } from '../sim/track';

export interface HudState {
  position: number;
  racers: number;
  lap: number;
  laps: number;
  lapTime: number;
  totalTime: number;
  bestLap: number | null;
  speed: number;
  stamina: number;
  instability: number;
  wrongWay: boolean;
  phys: RacerPhysicsState;
}

export type Tone = 'info' | 'good' | 'warn' | 'bad';

const RACER_COLORS = ['#ff9800', '#ff4f8b', '#ffd600', '#3ddc84', '#7c4dff'];

/** HTML/CSS racing HUD + on-screen touch controls. */
export class Hud {
  readonly root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private mini: HTMLCanvasElement;
  private miniBase: HTMLCanvasElement;
  private miniXf: (x: number, z: number) => [number, number];
  private msgTimer = 0;
  private toasts = new Map<string, { el: HTMLElement; time: number }>();
  private debugOn = false;
  private debugTick = 0;
  private tags: HTMLElement[] = [];
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement, track: Track, names: string[], showTouch: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hud-pos"><span data-k="pos">1</span><sup data-k="suf">st</sup><small>/<span data-k="of">4</span></small></div>
        <div class="hud-lap">LAP <b data-k="lap">1</b>/<span data-k="laps">3</span></div>
        <div class="hud-times">
          <div><span>LAP</span><b data-k="lapTime">0:00.000</b></div>
          <div><span>TOTAL</span><b data-k="total">0:00.000</b></div>
          <div class="dim"><span>BEST</span><b data-k="best">--:--.---</b></div>
        </div>
        <div class="hud-state" data-k="state"></div>
        <pre class="hud-debug hidden" data-k="debug"></pre>
      </div>
      <div class="hud-tr">
        <canvas class="minimap" width="200" height="200"></canvas>
        <button class="hud-pause" data-touch="pause" aria-label="Pause">II</button>
      </div>
      <div class="hud-toasts" data-k="toasts" aria-live="polite"></div>
      <div class="hud-meters">
        <div class="speed"><b data-k="speed">0</b><span>km/h</span></div>
        <div class="meter"><label>STAMINA</label><div class="bar"><i data-k="stam"></i></div></div>
        <div class="meter"><label>BALANCE</label><div class="bar balance"><i data-k="bal"></i></div></div>
      </div>
      <div class="hud-center"><div class="hud-msg" data-k="msg"></div></div>
      <div class="hud-tags"></div>
      <div class="touch ${showTouch ? '' : 'hidden'}">
        <div class="touch-left">
          <div class="steer-pad" data-touch="steer"><span class="arrow l">◀</span><span class="arrow r">▶</span></div>
        </div>
        <div class="touch-right">
          <button class="tbtn balance" data-touch="balance"><span>BALANCE</span></button>
          <button class="tbtn brake" data-touch="brake"><span>BRAKE</span></button>
          <button class="tbtn push" data-touch="push"><span>PUSH</span></button>
        </div>
      </div>
      <div class="hud-keys ${showTouch ? 'hidden' : ''}">W/↑ push · A D/← → steer · S/↓ brake · Space balance · C camera · Esc pause</div>
    `;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => { this.el[e.dataset.k!] = e; });
    this.mini = this.root.querySelector('.minimap')!;

    // Pre-render the track outline for the minimap.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }
    const pad = 18, W = 200;
    const scale = (W - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (W - (maxX - minX) * scale) / 2, oz = (W - (maxZ - minZ) * scale) / 2;
    // Mirror x so the map matches the view from behind/above (+z up on screen).
    this.miniXf = (x, z) => [W - (ox + (x - minX) * scale), W - (oz + (z - minZ) * scale)];
    this.miniBase = document.createElement('canvas');
    this.miniBase.width = this.miniBase.height = W;
    const g = this.miniBase.getContext('2d')!;
    const path = () => {
      g.beginPath();
      track.samples.forEach((s, i) => { const [x, y] = this.miniXf(s.x, s.z); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.closePath();
    };
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(40,25,10,0.55)'; g.lineWidth = 12; path(); g.stroke();
    g.strokeStyle = '#f3d9a8'; g.lineWidth = 7; path(); g.stroke();
    const [sx, sy] = this.miniXf(track.samples[0].x, track.samples[0].z);
    g.fillStyle = '#fff'; g.fillRect(sx - 6, sy - 2, 12, 4);

    const tagRoot = this.root.querySelector('.hud-tags')!;
    names.forEach((n, i) => {
      const t = document.createElement('div');
      t.className = 'tag';
      t.textContent = n;
      t.style.setProperty('--c', RACER_COLORS[i % RACER_COLORS.length]);
      tagRoot.appendChild(t);
      this.tags.push(t);
    });
  }

  update(s: HudState): void {
    const e = this.el;
    e.pos.textContent = String(s.position);
    e.suf.textContent = ordinal(s.position).replace(/\d+/, '');
    e.of.textContent = String(s.racers);
    this.root.dataset.pos = String(s.position);
    e.lap.textContent = String(Math.min(s.lap, s.laps));
    e.laps.textContent = String(s.laps);
    e.lapTime.textContent = formatTime(s.lapTime);
    e.total.textContent = formatTime(s.totalTime);
    e.best.textContent = formatTime(s.bestLap);
    e.speed.textContent = String(Math.round(s.speed * 3.6));
    e.stam.style.width = `${Math.round(s.stamina * 100)}%`;
    e.stam.parentElement!.classList.toggle('low', s.stamina < 0.25);
    const bal = 1 - s.instability;
    e.bal.style.width = `${Math.round(bal * 100)}%`;
    e.bal.parentElement!.classList.toggle('low', s.instability > 0.6);
    const p = s.phys;
    // Ongoing conditions: one compact status toast at the screen edge (never mid-road).
    let warn: [string, string, Tone] | null = null;
    if (s.wrongWay) warn = ['↩', 'Wrong way!', 'bad'];
    else if (p.control === 'lost') warn = p.lostPhase === 'canal' ? ['💦', 'Splash!', 'bad'] : p.lostPhase === 'pickup' ? ['🛞', 'Picking it up…', 'info'] : ['🛞', 'Catch your tyre!', 'bad'];
    else if (p.stun > 0) warn = ['💫', 'Dizzy!', 'bad'];
    else if (p.cleaning > 0) warn = ['🧽', 'Cleaning…', 'info'];
    else if (p.control === 'unstable') warn = ['⚠', 'Wobble — ease off', 'warn'];
    if (warn) this.toast('status', warn[0], warn[1], 0.25, warn[2]);
    // Control-state chip: green / amber / red.
    const st = p.control === 'lost' ? 'OUT OF CONTROL' : p.control === 'unstable' ? 'UNSTABLE' : 'CONTROLLED';
    e.state.textContent = st + (p.boost > 0 ? ' · BOOST' : '') + (p.dirt > 0.05 ? ' · DIRTY' : '') + (p.invuln > 0 ? ' · SAFE' : '');
    e.state.dataset.state = p.control;
    if (this.debugOn && (this.debugTick++ % 6 === 0)) {
      const f = (n: number, d = 2) => n.toFixed(d);
      e.debug.textContent =
        `speed   ${f(p.speed)} m/s (${Math.round(p.speed * 3.6)} km/h)\n` +
        `state   ${p.control}${p.control === 'lost' ? ` / ${p.lostKind} / ${p.lostPhase}` : ''}  t=${f(p.controlTime, 1)}\n` +
        `instab  ${f(p.instability)}  wobble ${f(p.wobble)}  lean ${f(p.lean)}\n` +
        `stress  corner ${f(p.stressCorner)} jerk ${f(p.stressJerk)} rough ${f(p.stressRough)}\n` +
        `load    ${f(p.load)}  slip ${f(p.slip)}  surface ${p.surface}\n` +
        `ground  ${p.grounded ? 'yes' : 'AIR'}  y ${f(p.y)} vy ${f(p.vy)} air ${f(p.airTime)}\n` +
        `stick   contact ${f(p.stickContact)}  ${p.separated ? 'SEPARATED ' + f(p.separatedTime, 1) : 'attached'}\n` +
        `fx      boost ${f(p.boost, 1)} stun ${f(p.stun, 1)} safe ${f(p.invuln, 1)} dirt ${f(p.dirt)} clean ${f(p.cleaning, 1)}\n` +
        `stamina ${f(p.stamina)}`;
    }
  }

  /** Big centred text — reserved for the countdown, laps and the finish. */
  message(text: string, seconds = 1.4, cls = ''): void {
    const m = this.el.msg;
    m.textContent = text;
    m.className = `hud-msg show ${cls}`;
    this.msgTimer = seconds;
  }

  /**
   * Small, translucent notification at the screen edge (warnings, hazards, boosts, recoveries).
   * Toasts with the same key replace each other, at most three show at once, and they fade.
   */
  toast(key: string, icon: string, text: string, seconds = 1.5, tone: Tone = 'info'): void {
    let t = this.toasts.get(key);
    if (!t) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.innerHTML = '<i></i><span></span>';
      this.el.toasts.prepend(el);
      t = { el, time: 0 };
      this.toasts.set(key, t);
      requestAnimationFrame(() => el.classList.add('show'));
      // Never stack more than three: drop the oldest.
      while (this.toasts.size > 3) {
        let oldest: string | null = null, min = Infinity;
        for (const [k, v] of this.toasts) if (k !== key && v.time < min) { min = v.time; oldest = k; }
        if (!oldest) break;
        this.removeToast(oldest);
      }
    }
    t.el.dataset.tone = tone;
    (t.el.firstChild as HTMLElement).textContent = icon;
    (t.el.lastChild as HTMLElement).textContent = text;
    t.time = seconds;
  }

  /** Short helper line (tips, hazard warnings). */
  notice(text: string, seconds = 1.5, icon = 'ℹ', tone: Tone = 'info'): void {
    this.toast('notice', icon, text, seconds, tone);
  }

  private removeToast(key: string): void {
    const t = this.toasts.get(key);
    if (!t) return;
    this.toasts.delete(key);
    t.el.classList.remove('show');
    setTimeout(() => t.el.remove(), 220);
  }

  /** Item slot contents (null = empty). */
  setItem(icon: string | null, name: string): void {
    const slot = this.el.item;
    if (!slot) return;
    slot.classList.toggle('empty', !icon);
    this.el.itemIcon.textContent = icon ?? '';
    slot.setAttribute('aria-label', icon ? `Use ${name}` : 'No item');
    this.el.itemName.textContent = icon ? name : '';
  }

  /** Brief item-roulette flash while a pickup is being revealed. */
  setItemRolling(rolling: boolean): void {
    this.el.item?.classList.toggle('rolling', rolling);
  }

  setDebug(on: boolean): void {
    this.debugOn = on;
    this.el.debug.classList.toggle('hidden', !on);
  }

  tick(dt: number): void {
    for (const [k, t] of this.toasts) {
      t.time -= dt;
      if (t.time <= 0) this.removeToast(k);
    }
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.el.msg.classList.remove('show');
    }
  }

  drawMinimap(racers: readonly RaceRacer[], playerId: string): void {
    const g = this.mini.getContext('2d')!;
    g.clearRect(0, 0, 200, 200);
    g.drawImage(this.miniBase, 0, 0);
    racers.forEach((r, i) => {
      const [x, y] = this.miniXf(r.phys.x, r.phys.z);
      const me = r.setup.id === playerId;
      g.beginPath();
      g.arc(x, y, me ? 8 : 6, 0, Math.PI * 2);
      g.fillStyle = RACER_COLORS[i % RACER_COLORS.length];
      g.fill();
      g.lineWidth = me ? 3 : 2;
      g.strokeStyle = me ? '#fff' : 'rgba(0,0,0,0.6)';
      g.stroke();
    });
  }

  /** Place name tags over the other racers' heads. */
  updateTags(positions: { x: number; y: number; z: number; visible: boolean }[], camera: THREE.Camera): void {
    const w = window.innerWidth, h = window.innerHeight;
    positions.forEach((p, i) => {
      const tag = this.tags[i];
      if (!tag) return;
      this.v.set(p.x, p.y, p.z).project(camera);
      const dist = camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z));
      const on = p.visible && this.v.z < 1 && dist < 60 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      tag.style.display = on ? 'block' : 'none';
      if (on) {
        tag.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * h}px) translate(-50%, -100%) scale(${Math.max(0.6, Math.min(1, 14 / dist))})`;
      }
    });
  }

  dispose(): void {
    this.root.remove();
  }
}

export { RACER_COLORS };
