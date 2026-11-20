import * as THREE from 'three';
import { formatTime, ordinal } from '../core/math';
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
  fallen: boolean;
}

const RACER_COLORS = ['#ff9800', '#ff4f8b', '#ffd600', '#3ddc84', '#7c4dff'];

/** HTML/CSS racing HUD + on-screen touch controls. */
export class Hud {
  readonly root: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private mini: HTMLCanvasElement;
  private miniBase: HTMLCanvasElement;
  private miniXf: (x: number, z: number) => [number, number];
  private msgTimer = 0;
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
      </div>
      <div class="hud-tr">
        <canvas class="minimap" width="200" height="200"></canvas>
        <button class="hud-pause" data-touch="pause" aria-label="Pause">II</button>
      </div>
      <div class="hud-meters">
        <div class="speed"><b data-k="speed">0</b><span>km/h</span></div>
        <div class="meter"><label>STAMINA</label><div class="bar"><i data-k="stam"></i></div></div>
        <div class="meter"><label>BALANCE</label><div class="bar balance"><i data-k="bal"></i></div></div>
      </div>
      <div class="hud-center"><div class="hud-msg" data-k="msg"></div><div class="hud-warn" data-k="warn"></div></div>
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
    let warn = '';
    if (s.wrongWay) warn = 'WRONG WAY!';
    else if (s.fallen) warn = 'WHOOPS!';
    else if (s.instability > 0.62) warn = 'WOBBLE! Ease off';
    e.warn.textContent = warn;
    e.warn.classList.toggle('show', warn !== '');
  }

  message(text: string, seconds = 1.4, cls = ''): void {
    const m = this.el.msg;
    m.textContent = text;
    m.className = `hud-msg show ${cls}`;
    this.msgTimer = seconds;
  }

  tick(dt: number): void {
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
