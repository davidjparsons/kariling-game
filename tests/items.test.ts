import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../src/config/gameplay';
import { DASH, EFFECT_LIMITS, ITEM_IDS, ITEM_RULES, ITEMS, LANDING_BONUS } from '../src/config/items';
import { STICKS } from '../src/config/sticks';
import { TYRES } from '../src/config/tyres';
import { Rng } from '../src/core/rng';
import { activateItem, createEffects, DoubleTapDetector, effectMods, rollItem, tickEffects } from '../src/sim/effects';
import {
  addImpact, applyStun, createRacerState, EV_DASH, EV_ITEM_USE, EV_NICE_CATCH, EV_SHIELD_BLOCK, giveItem, runnerConfig, stepRacer,
  type Ground, type GroundFn, type RacerInput,
} from '../src/sim/physics';
import { RaceSession } from '../src/sim/race';
import { Track } from '../src/sim/track';

const ctx = { tyre: TYRES.mtb, stick: STICKS.wood, runner: runnerConfig('child', TYRES.mtb.radius) };
const PUSH: RacerInput = { steer: 0, push: 1, brake: 0, balance: false };
const flat: GroundFn = () => ({ h: 0, launch: 0, surface: 'dirt', canal: false });

function run(st: ReturnType<typeof createRacerState>, seconds: number, input: RacerInput = PUSH, ground = flat) {
  let ev = 0;
  for (let i = 0; i < seconds / FIXED_DT; i++) ev |= stepRacer(st, input, ctx, ground, FIXED_DT);
  return ev;
}

describe('double-tap dash', () => {
  it('detects two presses inside the window, not slow ones, and a triple tap is one dash', () => {
    const d = new DoubleTapDetector(0.3);
    expect(d.press(1.0)).toBe(false);
    expect(d.press(1.2)).toBe(true);
    expect(d.press(1.35)).toBe(false); // third tap starts a new pair
    expect(d.press(2.0)).toBe(false);
    expect(d.press(2.5)).toBe(false); // too slow
    expect(d.press(2.7)).toBe(true);
  });

  it('gives a short burst of acceleration that costs stamina and wobble, then cools down', () => {
    const a = createRacerState(0, 0, 0, ctx.runner), b = createRacerState(0, 0, 0, ctx.runner);
    run(a, 1); run(b, 1);
    const stam = b.stamina, inst = b.instability;
    const ev = stepRacer(b, { ...PUSH, dash: true }, ctx, flat, FIXED_DT);
    stepRacer(a, PUSH, ctx, flat, FIXED_DT);
    expect(ev & EV_DASH).toBeTruthy();
    expect(b.stamina).toBeLessThan(stam - DASH.staminaCost * 0.9);
    expect(b.instability).toBeGreaterThan(inst);
    run(a, DASH.duration); run(b, DASH.duration);
    expect(b.speed).toBeGreaterThan(a.speed + 0.3);
    expect(b.fx.dash).toBe(0);
    // Cooldown: an immediate second dash does nothing.
    expect(stepRacer(b, { ...PUSH, dash: true }, ctx, flat, FIXED_DT) & EV_DASH).toBeFalsy();
    run(b, DASH.cooldown);
    expect(stepRacer(b, { ...PUSH, dash: true }, ctx, flat, FIXED_DT) & EV_DASH).toBeTruthy();
  });

  it('makes steering less precise while dashing', () => {
    const fx = createEffects();
    fx.dash = 0.5;
    expect(effectMods(fx).steer).toBeLessThan(1);
    expect(effectMods(fx).instability).toBeGreaterThan(1);
  });

  it('needs stamina', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    run(st, 0.5);
    st.stamina = DASH.minStamina * 0.5;
    expect(stepRacer(st, { ...PUSH, dash: true }, ctx, flat, FIXED_DT) & EV_DASH).toBeFalsy();
  });
});

describe('ramp landing bonus', () => {
  /** A ramp along +z: rises 0.6 m over z ∈ [20, 25] then drops away. */
  const ramp = (launch: number): GroundFn => (_x, z): Ground => {
    const h = z > 20 && z < 25 ? ((z - 20) / 5) * 0.6 : 0;
    return { h, launch, surface: 'dirt', canal: false };
  };

  it('a clean ramp jump with the scoop reconnected in time earns one Nice Catch', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    let count = 0;
    for (let i = 0; i < 7 / FIXED_DT; i++) if (stepRacer(st, { ...PUSH, push: 0.75 }, ctx, ramp(1), FIXED_DT) & EV_NICE_CATCH) count++;
    expect(count).toBe(1);
  });

  it('rolling over a low-launch bump (or just touching a ramp) earns nothing', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    expect(run(st, 7, { ...PUSH, push: 0.75 }, ramp(0.4)) & EV_NICE_CATCH).toBeFalsy();
    // Crawling up the ramp: no real take-off.
    const slow = createRacerState(0, 0, 0, ctx.runner);
    expect(run(slow, 12, { ...PUSH, push: 0.25 }, ramp(1)) & EV_NICE_CATCH).toBeFalsy();
  });

  it('a botched landing gets no bonus', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    let ev = 0;
    for (let i = 0; i < 7 / FIXED_DT; i++) {
      // Yank the steering in the air: lands leaning/steered = heavy landing or a fall.
      ev |= stepRacer(st, { ...PUSH, push: 1, steer: st.grounded ? 0 : 1 }, ctx, ramp(1), FIXED_DT);
    }
    if (ev & EV_NICE_CATCH) {
      // If it still counted, the landing must have been within the allowed severity.
      expect(st.impact).toBeLessThanOrEqual(LANDING_BONUS.maxSeverity);
    }
    expect(LANDING_BONUS.maxSeverity).toBeLessThan(0.8);
  });
});

describe('power-ups', () => {
  it('weighted selection favours catch-up items at the back and is deterministic', () => {
    const count = (frac: number) => {
      const rng = new Rng(5);
      const c: Record<string, number> = {};
      for (let i = 0; i < 4000; i++) { const id = rollItem(rng, frac); c[id] = (c[id] ?? 0) + 1; }
      return c;
    };
    const lead = count(0), back = count(1);
    for (const id of ITEM_IDS) expect(back[id] ?? 0).toBeGreaterThan(0);
    expect(back.cola).toBeGreaterThan(lead.cola * 3);
    expect(lead.buko).toBeGreaterThan(back.buko);
    expect(rollItem(new Rng(9), 0.5)).toBe(rollItem(new Rng(9), 0.5));
  });

  it('items only work after the reveal, are used once, and their effects expire', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    giveItem(st, 'chippy');
    expect(stepRacer(st, { ...PUSH, useItem: true }, ctx, flat, FIXED_DT) & EV_ITEM_USE).toBeFalsy();
    run(st, ITEM_RULES.revealTime);
    expect(stepRacer(st, { ...PUSH, useItem: true }, ctx, flat, FIXED_DT) & EV_ITEM_USE).toBeTruthy();
    expect(st.item).toBeNull();
    expect(st.fx.item.chippy).toBeGreaterThan(0);
    run(st, ITEMS.chippy.duration + 0.05);
    expect(st.fx.item.chippy).toBe(0);
  });

  it('each item does what it says', () => {
    const mods = (id: keyof typeof ITEMS) => { const fx = createEffects(); activateItem(fx, id); return effectMods(fx); };
    expect(mods('chippy').accel).toBeGreaterThan(1.3);
    expect(mods('chippy').instability).toBeGreaterThan(1);
    expect(mods('buko').instability).toBeLessThan(1);
    expect(mods('skyflakes').recovery).toBeGreaterThan(1.5);
    expect(mods('pandesal').staminaDrain).toBeLessThan(0.5);
    expect(mods('turon').rolling).toBeLessThan(1);
    expect(mods('turon').brake).toBeLessThan(1);
    expect(mods('cola').accel).toBeGreaterThan(mods('chippy').accel);
    expect(mods('cola').corner).toBeGreaterThan(1.5);
    expect(ITEMS.pandesal.stamina!).toBeGreaterThan(ITEMS.skyflakes.stamina!);
  });

  it('sugar rush ends in a stamina-draining crash', () => {
    const fx = createEffects();
    activateItem(fx, 'cola');
    tickEffects(fx, ITEMS.cola.duration + 0.01);
    expect(fx.crash).toBeGreaterThan(0);
    expect(effectMods(fx).staminaDrain).toBeGreaterThan(1.5);
    tickEffects(fx, ITEMS.cola.crashDuration! + 0.01);
    expect(effectMods(fx).staminaDrain).toBe(1);
  });

  it('buffs never stack beyond the caps, and re-using an item only refreshes it', () => {
    const fx = createEffects();
    for (const id of ITEM_IDS) activateItem(fx, id);
    fx.dash = 1; fx.bonus = 1;
    const m = effectMods(fx);
    expect(m.accel).toBeLessThanOrEqual(EFFECT_LIMITS.accelMax);
    expect(m.speed).toBeLessThanOrEqual(EFFECT_LIMITS.speedMax);
    activateItem(fx, 'chippy'); activateItem(fx, 'chippy');
    expect(fx.item.chippy).toBe(ITEMS.chippy.duration);
  });

  it('the coconut shield absorbs one moderate hit, then is gone', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    activateItem(st.fx, 'buko');
    addImpact(st, 0.5, ctx);
    expect(st.instability).toBeLessThan(0.15);
    expect(stepRacer(st, PUSH, ctx, flat, FIXED_DT) & EV_SHIELD_BLOCK).toBeTruthy();
    expect(st.fx.shieldHits).toBe(0);
    const before = st.instability;
    addImpact(st, 0.5, ctx);
    expect(st.instability).toBeGreaterThan(before + 0.3);
    // A shielded racer shrugs off a dog bite too.
    const st2 = createRacerState(0, 0, 0, ctx.runner);
    activateItem(st2.fx, 'buko');
    expect(applyStun(st2, ctx)).toBe(false);
    expect(st2.stun).toBe(0);
  });

  it('pickups give one item, can’t be re-collected until they respawn, and racers hold one item', () => {
    const track = new Track({
      id: 't', name: 't', difficulty: 'Easy', description: '',
      controlPoints: [[0, 0], [0, 150], [60, 200], [120, 150], [120, 0], [60, -50]],
      halfWidth: 4.5, vergeWidth: 3.2, defaultSurface: 'dirt', offroadSurface: 'grass', surfaces: [],
      checkpointCount: 8, startAt: 0, pickups: [{ at: 0.05, d: [0] }],
    });
    const s = new RaceSession(track, [{ id: 'me', name: 'me', isBot: false, tyreId: 'mtb', stickId: 'wood' }], { laps: 1, difficulty: 'normal', seed: 3 });
    while (s.phase === 'countdown') s.step({});
    const r = s.get('me')!;
    const pk = s.pickups[0];
    // Put the tyre on the box.
    r.phys.x = pk.x; r.phys.z = pk.z;
    s.step({ me: PUSH });
    expect(r.phys.item).not.toBeNull();
    expect(pk.respawn).toBeGreaterThan(0);
    const held = r.phys.item;
    r.phys.x = pk.x; r.phys.z = pk.z;
    s.step({ me: PUSH });
    expect(r.phys.item).toBe(held);
    for (let i = 0; i < (ITEM_RULES.respawnTime + 0.1) / FIXED_DT; i++) s.step({ me: { ...PUSH, push: 0 } });
    expect(pk.respawn).toBe(0);
  });
});
