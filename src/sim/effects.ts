import { DASH, EFFECT_LIMITS, ITEM_IDS, ITEMS, LANDING_BONUS, NEUTRAL_MODS, TURON_TURBO, type EffectMods, type ItemId } from '../config/items';
import type { Rng } from '../core/rng';

/** Active timed effects on a racer (seconds left; 0 = inactive). */
export interface ActiveEffects {
  turbo: number;
  dash: number;
  dashCooldown: number;
  /** Ramp landing bonus. */
  bonus: number;
}

export function createEffects(): ActiveEffects {
  return { turbo: 0, dash: 0, dashCooldown: 0, bonus: 0 };
}

export function tickEffects(fx: ActiveEffects, dt: number): void {
  fx.turbo = Math.max(0, fx.turbo - dt);
  fx.dash = Math.max(0, fx.dash - dt);
  fx.dashCooldown = Math.max(0, fx.dashCooldown - dt);
  fx.bonus = Math.max(0, fx.bonus - dt);
}

function mul(out: EffectMods, m: Partial<EffectMods>): void {
  for (const k of Object.keys(m) as (keyof EffectMods)[]) out[k] *= m[k] ?? 1;
}

/** Combined handling modifiers from every active effect, clamped so buffs can't run away. */
export function effectMods(fx: ActiveEffects, out: EffectMods = { ...NEUTRAL_MODS }): EffectMods {
  Object.assign(out, NEUTRAL_MODS);
  if (fx.turbo > 0) mul(out, TURON_TURBO.mods);
  if (fx.dash > 0) mul(out, DASH.mods);
  if (fx.bonus > 0) mul(out, LANDING_BONUS.mods);
  out.accel = Math.min(out.accel, EFFECT_LIMITS.accelMax);
  out.speed = Math.min(out.speed, EFFECT_LIMITS.speedMax);
  out.instability = Math.max(out.instability, EFFECT_LIMITS.instabilityMin);
  out.rolling = Math.max(out.rolling, EFFECT_LIMITS.rollingMin);
  return out;
}

/**
 * Weighted random item. `rankFrac` is 0 for the leader … 1 for last place: Turon and Buko
 * become likelier further back.
 */
export function rollItem(rng: Rng, rankFrac: number): ItemId {
  const t = Math.min(1, Math.max(0, rankFrac));
  let total = 0;
  const weights = ITEM_IDS.map((id) => {
    const w = ITEMS[id].weightLead + (ITEMS[id].weightBack - ITEMS[id].weightLead) * t;
    total += w;
    return w;
  });
  let r = rng.next() * total;
  for (let i = 0; i < ITEM_IDS.length; i++) {
    r -= weights[i];
    if (r < 0) return ITEM_IDS[i];
  }
  return ITEM_IDS[ITEM_IDS.length - 1];
}

/**
 * Double-tap detector for the push control (keyboard key, touch button). Pure and time-based so
 * it can be unit-tested and shared by every input device.
 */
export class DoubleTapDetector {
  private lastPress = -Infinity;
  constructor(public window: number = DASH.doubleTapWindow) {}
  /** Register a press at time `t` (s). Returns true when it completes a double tap. */
  press(t: number): boolean {
    const hit = t - this.lastPress <= this.window;
    // A completed double tap consumes both presses (a triple tap is not two dashes).
    this.lastPress = hit ? -Infinity : t;
    return hit;
  }
  reset(): void {
    this.lastPress = -Infinity;
  }
}
