import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../src/config/gameplay';
import { STICKS } from '../src/config/sticks';
import { SURFACES, type SurfaceId } from '../src/config/surfaces';
import { TYRES } from '../src/config/tyres';
import {
  createRacerState, EV_FALL, EV_RECOVERED, EV_TAP, NO_INPUT, staminaFactor, stepRacer, type RacerInput,
} from '../src/sim/physics';

const ctx = { tyre: TYRES.mtb, stick: STICKS.wood };

function run(seconds: number, input: RacerInput, surface: SurfaceId = 'dirt', st = createRacerState(0, 0, 0), c = ctx) {
  let events = 0;
  for (let i = 0; i < seconds / FIXED_DT; i++) events |= stepRacer(st, input, c, SURFACES[surface], FIXED_DT);
  return { st, events };
}

const PUSH: RacerInput = { steer: 0, push: 1, brake: 0, balance: false };

describe('tyre physics', () => {
  it('accelerates when pushed and taps the stick', () => {
    const { st, events } = run(2, PUSH);
    expect(st.speed).toBeGreaterThan(6);
    expect(st.z).toBeGreaterThan(5); // heading 0 = +z
    expect(Math.abs(st.x)).toBeLessThan(0.01);
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
    const coast = run(1, NO_INPUT, 'dirt', { ...a }).st;
    const brake = run(1, { ...NO_INPUT, brake: 1 }, 'dirt', { ...a }).st;
    expect(coast.speed).toBeLessThan(a.speed);
    expect(brake.speed).toBeLessThan(coast.speed);
    const stopped = run(30, NO_INPUT, 'dirt', { ...a }).st;
    expect(stopped.speed).toBe(0);
  });

  it('grass slows the tyre more than paved road', () => {
    const paved = run(6, PUSH, 'paved').st;
    const grass = run(6, PUSH, 'grass').st;
    expect(grass.speed).toBeLessThan(paved.speed * 0.85);
  });

  it('steer right turns right (heading decreases) and leans into the corner', () => {
    const base = run(2, PUSH).st;
    const { st } = run(0.6, { ...PUSH, steer: 0.5 }, 'dirt', { ...base });
    expect(st.heading).toBeLessThan(base.heading);
    expect(st.x).toBeLessThan(base.x); // right of +z is -x
    expect(st.lean).toBeGreaterThan(0);
  });

  it('gentle steering stays stable; full lock at speed builds instability and falls', () => {
    const fast = run(6, PUSH, 'paved').st;
    const gentle = run(2, { ...PUSH, steer: 0.25 }, 'paved', { ...fast }).st;
    expect(gentle.instability).toBeLessThan(0.2);
    expect(gentle.mode).toBe('racing');
    const hard = run(4, { ...PUSH, steer: 1 }, 'gravel', { ...fast }, { tyre: TYRES.road, stick: STICKS.wood });
    expect(hard.events & EV_FALL).toBeTruthy();
  });

  it('recovers after a fall within a couple of seconds and resumes racing', () => {
    const st = createRacerState(0, 0, 0);
    st.speed = 11;
    st.instability = 0.995;
    let events = 0;
    for (let i = 0; i < 60 && !(events & EV_FALL); i++) events |= stepRacer(st, { ...PUSH, steer: 1 }, ctx, SURFACES.gravel, FIXED_DT);
    expect(events & EV_FALL).toBeTruthy();
    expect(st.mode).toBe('fallen');
    let t = 0;
    while (st.mode !== 'racing' && t < 5) { events |= stepRacer(st, PUSH, ctx, SURFACES.dirt, FIXED_DT); t += FIXED_DT; }
    expect(st.mode).toBe('racing');
    expect(events & EV_RECOVERED).toBeTruthy();
    expect(t).toBeGreaterThan(1);
    expect(t).toBeLessThan(2.5);
    expect(st.speed).toBeLessThan(3);
  });

  it('balance button calms instability faster', () => {
    const a = createRacerState(0, 0, 0); a.speed = 8; a.instability = 0.7;
    const b = { ...a };
    run(0.8, { ...PUSH, push: 0 }, 'dirt', a);
    run(0.8, { ...PUSH, push: 0, balance: true }, 'dirt', b);
    expect(b.instability).toBeLessThan(a.instability);
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
    const tired = createRacerState(0, 0, 0); tired.stamina = 0;
    run(2, PUSH, 'dirt', tired);
    expect(tired.speed).toBeGreaterThan(3);
  });

  it('is deterministic for identical inputs', () => {
    const inputs: RacerInput[] = Array.from({ length: 300 }, (_, i) => ({ steer: Math.sin(i / 20), push: i % 50 < 40 ? 1 : 0, brake: 0, balance: i % 90 > 80 }));
    const a = createRacerState(1, 2, 0.3), b = createRacerState(1, 2, 0.3);
    for (const inp of inputs) { stepRacer(a, inp, ctx, SURFACES.gravel, FIXED_DT); stepRacer(b, inp, ctx, SURFACES.gravel, FIXED_DT); }
    expect(a).toEqual(b);
  });
});
