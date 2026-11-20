import { clamp } from '../core/math';
import type { RacerInput } from '../sim/physics';
import { DoubleTapDetector } from '../sim/effects';

/**
 * Single input abstraction: keyboard and touch both feed the same RacerInput,
 * so every device drives the identical simulation.
 */
export class InputManager {
  private keys = new Set<string>();
  private touch = { steer: 0, push: false, brake: false, balance: false };
  private steerPointers = new Map<number, number>();
  autoPush = false;
  onPause: (() => void) | null = null;
  onCamera: (() => void) | null = null;
  onDebug: (() => void) | null = null;
  private disposers: (() => void)[] = [];
  /** Double-tap on the push control (key or touch button) → one-shot dash. */
  private tap = new DoubleTapDetector();
  private pendingDash = false;
  private pendingItem = false;
  /** Fired when a dash is triggered (for immediate UI feedback). */
  onDash: (() => void) | null = null;

  constructor() {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.pushPressed(e.timeStamp);
        if (e.code === 'KeyE' || e.code === 'KeyQ' || e.code === 'Enter') this.pendingItem = true;
        if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
        if (e.code === 'KeyC') this.onCamera?.();
        if (e.code === 'F3' || e.code === 'Backquote') { e.preventDefault(); this.onDebug?.(); }
      }
      this.keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.resetTouch(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.disposers.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    });
  }

  /** A fresh press of the push control (ms timestamp). */
  private pushPressed(ms: number): void {
    if (this.tap.press(ms / 1000)) { this.pendingDash = true; this.onDash?.(); }
  }

  private resetTouch(): void {
    this.touch = { steer: 0, push: false, brake: false, balance: false };
    this.steerPointers.clear();
  }

  read(): RacerInput {
    const k = this.keys;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1;
    if (this.steerPointers.size > 0) steer = this.touch.steer;
    const brake = k.has('KeyS') || k.has('ArrowDown') || this.touch.brake;
    let push = k.has('KeyW') || k.has('ArrowUp') || this.touch.push;
    if (this.autoPush && !brake) push = true;
    const balance = k.has('Space') || k.has('ShiftLeft') || this.touch.balance;
    const dash = this.pendingDash, useItem = this.pendingItem;
    this.pendingDash = this.pendingItem = false;
    return { steer: clamp(steer, -1, 1), push: push ? 1 : 0, brake: brake ? 1 : 0, balance, dash, useItem };
  }

  /** Wire the on-screen touch controls. */
  bindTouch(root: HTMLElement): void {
    const pad = root.querySelector<HTMLElement>('[data-touch="steer"]');
    if (pad) {
      const updateSteer = () => {
        if (this.steerPointers.size === 0) { this.touch.steer = 0; pad.dataset.dir = ''; return; }
        const rect = pad.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        // Most recent finger wins.
        const x = [...this.steerPointers.values()].pop()!;
        const off = (x - cx) / (rect.width * 0.32);
        const dead = 0.12;
        const v = Math.abs(off) < dead ? 0 : clamp((Math.abs(off) - dead) / (1 - dead), 0, 1) * Math.sign(off);
        this.touch.steer = v;
        pad.dataset.dir = v < -0.05 ? 'left' : v > 0.05 ? 'right' : '';
      };
      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        capture(pad, e.pointerId);
        this.steerPointers.set(e.pointerId, e.clientX);
        updateSteer();
      };
      const onMove = (e: PointerEvent) => {
        if (!this.steerPointers.has(e.pointerId)) return;
        this.steerPointers.set(e.pointerId, e.clientX);
        updateSteer();
      };
      const onUp = (e: PointerEvent) => {
        this.steerPointers.delete(e.pointerId);
        updateSteer();
      };
      pad.addEventListener('pointerdown', onDown);
      pad.addEventListener('pointermove', onMove);
      pad.addEventListener('pointerup', onUp);
      pad.addEventListener('pointercancel', onUp);
      pad.addEventListener('lostpointercapture', onUp);
    }
    const hold = (name: 'push' | 'brake' | 'balance') => {
      const el = root.querySelector<HTMLElement>(`[data-touch="${name}"]`);
      if (!el) return;
      const ids = new Set<number>();
      const set = () => { this.touch[name] = ids.size > 0; el.classList.toggle('active', ids.size > 0); };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); capture(el, e.pointerId); ids.add(e.pointerId); set();
        if (name === 'push') this.pushPressed(e.timeStamp);
      });
      const off = (e: PointerEvent) => { ids.delete(e.pointerId); set(); };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    };
    hold('push');
    hold('brake');
    hold('balance');
    root.querySelector('[data-touch="pause"]')?.addEventListener('click', () => this.onPause?.());
    root.querySelector('[data-touch="item"]')?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pendingItem = true; });
  }

  clear(): void {
    this.keys.clear();
    this.resetTouch();
    this.tap.reset();
    this.pendingDash = this.pendingItem = false;
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }
}

function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* pointer already released or synthetic — capture is only an optimisation */
  }
}
