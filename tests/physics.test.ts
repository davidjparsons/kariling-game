import { describe, expect, it } from 'vitest';
import { FIXED_DT, PHYSICS } from '../src/config/gameplay';
import { STICKS } from '../src/config/sticks';
import type { SurfaceId } from '../src/config/surfaces';
import { TYRES } from '../src/config/tyres';
import {
  addImpact, createRacerState, EV_CATCH, EV_FALL, EV_LAND, EV_LAUNCH, EV_RECOVERED, EV_SEPARATE, EV_TAP, EV_UNSTABLE,
  NO_INPUT, runnerConfig, staminaFactor, stepRacer, stressThreshold, type Ground, type GroundFn, type PhysicsContext,
  type RacerInput,
} from '../src/sim/physics';

const mk = (tyre = TYRES.mtb): PhysicsContext => ({ tyre, stick: STICKS.wood, runner: runnerConfig('child', tyre.radius) });
const ctx = mk();

const flat = (surface: SurfaceId): GroundFn => () => ({ h: 0, launch: 0, surface, canal: false });

function run(seconds: number, input: RacerInput, surface: SurfaceId | GroundFn = 'dirt', st = createRacerState(0, 0, 0, ctx.runner), c = ctx) {
  const g = typeof surface === 'function' ? surface : flat(surface);
  let events = 0;
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) events |= stepRacer(st, input, c, g, FIXED_DT);
  return { st, events };
}
const clone = <T>(o: T): T => ({ ...o });

const PUSH: RacerInput = { steer: 0, push: 1, brake: 0, balance: false };

describe('tyre physics basics', () => {
  it('accelerates when pushed and taps the stick', () => {
    const { st, events } = run(2, PUSH);
    expect(st.speed).toBeGreaterThan(6);
    expect(st.z).toBeGreaterThan(5); // heading 0 = +z
    // Only the natural idle wobble moves it sideways.
    expect(Math.abs(st.x)).toBeLessThan(0.15);
    expect(events & EV_TAP).toBeTruthy();
    expect(st.roll).toBeGreaterThan(0);
  });

  it('respects a top speed limit', () => {
    const { st } = run(20, PUSH, 'paved');
    expect(st.speed).toBeLessThanOrEqual(TYRES.mtb.maxSpeed * 1.01);
    expect(st.speed).toBeGreaterThan(TYRES.mtb.maxSpeed * 0.8);
  });

  it('rolls to a stop under friction and stops faster when braking', () => {
    const a = run(3, PUSH).st;
    const coast = run(1, NO_INPUT, 'dirt', clone(a)).st;
    const brake = run(1, { ...NO_INPUT, brake: 1 }, 'dirt', clone(a)).st;
    expect(coast.speed).toBeLessThan(a.speed);
    expect(brake.speed).toBeLessThan(coast.speed);
    expect(run(30, NO_INPUT, 'dirt', clone(a)).st.speed).toBe(0);
  });

  it('grass and mud slow the tyre more than paved road', () => {
    const paved = run(6, PUSH, 'paved').st;
    expect(run(6, PUSH, 'grass').st.speed).toBeLessThan(paved.speed * 0.85);
    expect(run(6, PUSH, 'mud').st.speed).toBeLessThan(paved.speed * 0.8);
  });

  it('mountain bike handles mud better than a road tyre', () => {
    const mtb = run(6, PUSH, 'mud', createRacerState(0, 0, 0, ctx.runner), mk(TYRES.mtb)).st;
    const road = run(6, PUSH, 'mud', createRacerState(0, 0, 0, ctx.runner), mk(TYRES.road)).st;
    expect(mtb.speed).toBeGreaterThan(road.speed);
  });

  it('steer right turns right (heading decreases) and leans into the corner', () => {
    const base = run(2, PUSH).st;
    const { st } = run(0.6, { ...PUSH, steer: 0.5 }, 'dirt', clone(base));
    expect(st.heading).toBeLessThan(base.heading);
    expect(st.x).toBeLessThan(base.x); // right of +z is -x
    expect(st.lean).toBeGreaterThan(0);
  });

  it('hard acceleration drains stamina; cruising is cheap; easing off regenerates; low stamina never stops you', () => {
    const { st } = run(3, PUSH, 'paved');
    expect(st.stamina).toBeLessThan(0.85);
    const afterSprint = st.stamina;
    run(8, PUSH, 'paved', st);
    expect(st.stamina).toBeGreaterThan(afterSprint - 0.12);
    st.stamina = 0.2;
    run(2, NO_INPUT, 'paved', st);
    expect(st.stamina).toBeGreaterThan(0.5);
    expect(staminaFactor(0)).toBeGreaterThanOrEqual(0.5);
    expect(staminaFactor(1)).toBe(1);
    const tired = createRacerState(0, 0, 0, ctx.runner); tired.stamina = 0;
    run(2, PUSH, 'dirt', tired);
    expect(tired.speed).toBeGreaterThan(3);
  });

  it('is deterministic for identical inputs', () => {
    const inputs: RacerInput[] = Array.from({ length: 300 }, (_, i) => ({ steer: Math.sin(i / 20), push: i % 50 < 40 ? 1 : 0, brake: 0, balance: i % 90 > 80 }));
    const a = createRacerState(1, 2, 0.3, ctx.runner), b = createRacerState(1, 2, 0.3, ctx.runner);
    for (const inp of inputs) { stepRacer(a, inp, ctx, flat('gravel'), FIXED_DT); stepRacer(b, inp, ctx, flat('gravel'), FIXED_DT); }
    expect(a).toEqual(b);
  });
});

describe('control states and wobble thresholds', () => {
  it('cornering threshold drops with speed (fast sharp turns are riskier)', () => {
    expect(stressThreshold(0)).toBeCloseTo(PHYSICS.stressThresholdLow);
    expect(stressThreshold(1)).toBeCloseTo(PHYSICS.stressThresholdHigh);
    expect(stressThreshold(0.5)).toBeGreaterThan(stressThreshold(0.9));
  });

  it('gentle steering at speed stays CONTROLLED', () => {
    const fast = run(6, PUSH, 'paved').st;
    const gentle = run(2, { ...PUSH, steer: 0.15 }, 'paved', clone(fast)).st;
    expect(gentle.control).toBe('controlled');
    expect(gentle.instability).toBeLessThan(PHYSICS.unstableEnter);
  });

  it('a sharp turn at speed goes UNSTABLE first (warning), then OUT OF CONTROL if held', () => {
    const fast = run(6, PUSH, 'paved').st;
    const st = clone(fast);
    let events = 0, unstableAt = -1, lostAt = -1;
    for (let i = 0; i < 6 / FIXED_DT; i++) {
      events |= stepRacer(st, { ...PUSH, steer: 1 }, ctx, flat('paved'), FIXED_DT);
      if (unstableAt < 0 && st.control === 'unstable') unstableAt = i;
      if (lostAt < 0 && st.control === 'lost') { lostAt = i; break; }
    }
    expect(events & EV_UNSTABLE).toBeTruthy();
    expect(events & EV_FALL).toBeTruthy();
    expect(unstableAt).toBeGreaterThan(0);
    // There is a real warning window before control is lost.
    expect((lostAt - unstableAt) * FIXED_DT).toBeGreaterThan(0.25);
  });

  it('the same sharp turn at low speed is fine', () => {
    const slow = run(1, { ...PUSH, push: 0.4 }, 'paved').st;
    const { st } = run(3, { ...PUSH, push: 0.3, steer: 1 }, 'paved', clone(slow));
    expect(st.control).not.toBe('lost');
  });

  it('UNSTABLE recovers to CONTROLLED by easing off, with hysteresis (no flicker)', () => {
    const st = run(4, PUSH, 'paved').st;
    st.instability = 0.6;
    st.control = 'unstable';
    let flips = 0, prev = st.control;
    for (let i = 0; i < 4 / FIXED_DT; i++) {
      stepRacer(st, { steer: 0, push: 0, brake: 0.5, balance: true }, ctx, flat('paved'), FIXED_DT);
      if (st.control !== prev) { flips++; prev = st.control; }
    }
    expect(st.control).toBe('controlled');
    expect(flips).toBe(1);
    expect(st.instability).toBeLessThanOrEqual(PHYSICS.unstableExit);
  });

  it('instability between the exit and enter thresholds keeps the current state', () => {
    const a = createRacerState(0, 0, 0, ctx.runner); a.instability = 0.35;
    stepRacer(a, NO_INPUT, ctx, flat('paved'), FIXED_DT);
    expect(a.control).toBe('controlled');
    const b = createRacerState(0, 0, 0, ctx.runner); b.instability = 0.36; b.control = 'unstable';
    stepRacer(b, NO_INPUT, ctx, flat('paved'), FIXED_DT);
    expect(b.control).toBe('unstable');
  });

  it('unstable tyres push less effectively (stick contact suffers)', () => {
    const a = createRacerState(0, 0, 0, ctx.runner);
    const b = createRacerState(0, 0, 0, ctx.runner);
    b.instability = 0.9; b.control = 'unstable';
    for (let i = 0; i < 20; i++) { stepRacer(a, PUSH, ctx, flat('paved'), FIXED_DT); stepRacer(b, PUSH, ctx, flat('paved'), FIXED_DT); }
    expect(b.stickContact).toBeLessThan(a.stickContact);
    expect(b.speed).toBeLessThan(a.speed);
  });

  it('a severe impact knocks the tyre straight OUT OF CONTROL', () => {
    const st = run(3, PUSH).st;
    const ev = addImpact(st, PHYSICS.severeImpact / ctx.tyre.instabilityMul + 0.01, ctx);
    expect(ev & EV_FALL).toBeTruthy();
    expect(st.control).toBe('lost');
    expect(st.lostKind).toBe('impact');
  });

  it('OUT OF CONTROL: no driving; runner chases, picks up and recovers within a few seconds', () => {
    const st = run(4, PUSH).st;
    addImpact(st, 2, ctx);
    expect(st.control).toBe('lost');
    const before = st.speed;
    let t = 0, events = 0;
    while (st.control === 'lost' && t < 8) { events |= stepRacer(st, PUSH, ctx, flat('dirt'), FIXED_DT); t += FIXED_DT; if (t < 0.3) expect(st.speed).toBeLessThan(before); }
    expect(st.control).toBe('controlled');
    expect(events & EV_RECOVERED).toBeTruthy();
    expect(t).toBeGreaterThan(1);
    expect(t).toBeLessThan(5);
    expect(st.invuln).toBeGreaterThan(1);
    expect(st.instability).toBeLessThan(PHYSICS.unstableEnter);
  });

  it('balance button calms instability faster', () => {
    const a = createRacerState(0, 0, 0, ctx.runner); a.speed = 8; a.instability = 0.7; a.control = 'unstable';
    const b = clone(a);
    run(0.8, { ...PUSH, push: 0 }, 'dirt', a);
    run(0.8, { ...PUSH, push: 0, balance: true }, 'dirt', b);
    expect(b.instability).toBeLessThan(a.instability);
  });

  it('tyres keep distinct handling: road tyre is twitchier than the motorbike tyre on gravel', () => {
    const hold = (tyre = TYRES.road) => {
      const c = mk(tyre);
      const st = run(6, PUSH, 'gravel', createRacerState(0, 0, 0, c.runner), c).st;
      run(1.5, { ...PUSH, steer: 0.35 }, 'gravel', st, c);
      return st.instability;
    };
    expect(hold(TYRES.road)).toBeGreaterThan(hold(TYRES.moto));
  });
});

describe('airborne and landing', () => {
  /** A ramp along +z: rises 0.6 m over z ∈ [20, 25] then drops away. */
  const ramp: GroundFn = (_x, z): Ground => {
    const h = z > 20 && z < 25 ? ((z - 20) / 5) * 0.6 : 0;
    return { h, launch: 1, surface: 'dirt', canal: false };
  };

  it('launches off a ramp, follows a ballistic arc and lands', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    let events = 0, maxY = 0, airborneTicks = 0;
    for (let i = 0; i < 6 / FIXED_DT; i++) {
      events |= stepRacer(st, PUSH, ctx, ramp, FIXED_DT);
      maxY = Math.max(maxY, st.y);
      if (!st.grounded) airborneTicks++;
    }
    expect(events & EV_LAUNCH).toBeTruthy();
    expect(events & EV_LAND).toBeTruthy();
    expect(maxY).toBeGreaterThan(0.6); // goes higher than the lip
    expect(airborneTicks * FIXED_DT).toBeGreaterThan(0.2);
    expect(st.grounded).toBe(true);
    expect(st.y).toBe(0);
  });

  it('a faster take-off flies further and lands harder', () => {
    const jump = (push: number) => {
      const st = createRacerState(0, 0, 0, ctx.runner);
      let peakImpact = 0, airTime = 0;
      for (let i = 0; i < 6 / FIXED_DT; i++) {
        stepRacer(st, { ...PUSH, push }, ctx, ramp, FIXED_DT);
        if (!st.grounded) airTime += FIXED_DT;
        peakImpact = Math.max(peakImpact, st.impact);
      }
      return { airTime, peakImpact };
    };
    const slow = jump(0.45), fast = jump(1);
    expect(fast.airTime).toBeGreaterThan(slow.airTime);
    expect(fast.peakImpact).toBeGreaterThan(slow.peakImpact);
  });

  it('no pushing or steering in the air; the runner falls behind and re-catches after landing', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    let events = 0, airSpeedGain = 0, prev = 0, wasAir = false;
    for (let i = 0; i < 8 / FIXED_DT; i++) {
      events |= stepRacer(st, PUSH, ctx, ramp, FIXED_DT);
      if (!st.grounded && wasAir) airSpeedGain = Math.max(airSpeedGain, st.speed - prev);
      wasAir = !st.grounded;
      prev = st.speed;
    }
    expect(airSpeedGain).toBeLessThanOrEqual(1e-6);
    expect(events & EV_SEPARATE).toBeTruthy();
    expect(events & EV_CATCH).toBeTruthy();
    expect(st.separated).toBe(false);
  });
});
