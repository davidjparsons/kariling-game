import { describe, expect, it } from 'vitest';
import { FIXED_DT, PHYSICS } from '../src/config/gameplay';
import { STICKS } from '../src/config/sticks';
import { TYRES } from '../src/config/tyres';
import {
  collideRunners, collideTyreRunner, collideTyres, resolveRacerCollisions, sideness, type CollisionRacer,
} from '../src/sim/collisions';
import { createRacerState, runnerConfig, stepRacer, type GroundFn } from '../src/sim/physics';

function racer(x: number, z: number, heading: number, speed: number, tyre = TYRES.mtb): CollisionRacer {
  const ctx = { tyre, stick: STICKS.wood, runner: runnerConfig('child', tyre.radius) };
  const phys = createRacerState(x, z, heading, ctx.runner);
  phys.speed = speed;
  return { phys, ctx, events: 0, bumpImpact: 0 };
}
const flat: GroundFn = () => ({ h: 0, launch: 0, surface: 'paved', canal: false });

describe('racer collisions', () => {
  it('separates overlapping tyres (no ghosting, no permanent overlap)', () => {
    const a = racer(0, 0, 0, 0), b = racer(0.3, 0, 0, 0);
    expect(collideTyres(a, b)).toBe(true);
    const d = Math.hypot(b.phys.x - a.phys.x, b.phys.z - a.phys.z);
    expect(d).toBeGreaterThanOrEqual(PHYSICS.tyreRadius * 2 - 1e-6);
  });

  it('a rear-end hit slows the chaser and nudges the leader', () => {
    const a = racer(0, 0, 0, 12), b = racer(0, 0.6, 0, 8);
    collideTyres(a, b);
    expect(a.phys.speed).toBeLessThan(12);
    expect(b.phys.speed).toBeGreaterThan(8);
  });

  it('side impacts cause more wobble than glancing nose-to-tail hits', () => {
    const rear = [racer(0, 0, 0, 12), racer(0, 0.6, 0, 6)];
    collideTyres(rear[0], rear[1]);
    // b is to the right (−x) of a and gets hit side-on.
    const side = [racer(0.6, 0, -Math.PI / 2, 6), racer(0, 0, 0, 6)];
    collideTyres(side[0], side[1]);
    expect(sideness(side[1].phys, -1, 0)).toBeCloseTo(1);
    expect(side[1].phys.instability).toBeGreaterThan(rear[1].phys.instability);
  });

  it('a hard side hit on an already wobbling tyre knocks it out of control', () => {
    const a = racer(0.6, 0, -Math.PI / 2, 13), b = racer(0, 0, 0, 6);
    b.phys.instability = 0.85; b.phys.control = 'unstable';
    collideTyres(a, b);
    expect(b.phys.control).toBe('lost');
  });

  it('heavier tyres (motorbike) are pushed around less', () => {
    const light = racer(0, 0, 0, 0, TYRES.road), heavy = racer(0.4, 0, 0, 0, TYRES.moto);
    collideTyres(light, heavy);
    expect(Math.abs(light.phys.x)).toBeGreaterThan(Math.abs(heavy.phys.x - 0.4));
  });

  it('tyre ↔ runner: the runner is shoved off their line, the tyre deflects', () => {
    const a = racer(0, 0, Math.PI / 2, 10), b = racer(2, 0, 0, 5);
    b.phys.rx = 0.45; b.phys.rz = 0; // b's runner right in front of a's tyre
    const rx0 = b.phys.rx;
    expect(collideTyreRunner(a, b)).toBe(true);
    expect(b.phys.rx).toBeGreaterThan(rx0);
    expect(a.phys.speed).toBeLessThan(10);
  });

  it('runner ↔ runner separates bodies', () => {
    const a = racer(0, 0, 0, 5), b = racer(3, 0, 0, 5);
    b.phys.rx = a.phys.rx + 0.2; b.phys.rz = a.phys.rz;
    collideRunners(a, b);
    expect(Math.hypot(b.phys.rx - a.phys.rx, b.phys.rz - a.phys.rz)).toBeGreaterThanOrEqual(PHYSICS.runnerRadius * 2 - 1e-6);
  });

  it('tyres flying high over another racer do not collide', () => {
    const a = racer(0, 0, 0, 10), b = racer(0.2, 0, 0, 5);
    a.phys.y = 0.8; a.phys.grounded = false;
    expect(collideTyres(a, b)).toBe(false);
  });

  it('two racers side by side settle without jitter or launching', () => {
    const a = racer(0, 0, 0, 0), b = racer(0.5, 0, 0, 0);
    const racers = [a, b];
    let maxSpeed = 0;
    for (let i = 0; i < 120; i++) {
      for (const r of racers) stepRacer(r.phys, { steer: 0, push: 1, brake: 0, balance: false }, r.ctx, flat, FIXED_DT);
      resolveRacerCollisions(racers);
      maxSpeed = Math.max(maxSpeed, a.phys.speed, b.phys.speed);
    }
    const d = Math.hypot(b.phys.x - a.phys.x, b.phys.z - a.phys.z);
    expect(d).toBeGreaterThanOrEqual(PHYSICS.tyreRadius * 2 - 0.05);
    expect(maxSpeed).toBeLessThan(TYRES.mtb.maxSpeed * 1.05);
    expect(Math.abs(a.phys.latVel)).toBeLessThan(3.6);
  });
});
