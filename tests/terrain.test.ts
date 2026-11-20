import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../src/config/gameplay';
import { STICKS } from '../src/config/sticks';
import type { SurfaceId } from '../src/config/surfaces';
import { TYRES, type TyreId } from '../src/config/tyres';
import { createRacerState, runnerConfig, stepRacer, type GroundFn } from '../src/sim/physics';
import { RaceSession } from '../src/sim/race';
import { Track } from '../src/sim/track';

const ctxFor = (id: TyreId) => ({ tyre: TYRES[id], stick: STICKS.wood, runner: runnerConfig('child', TYRES[id].radius) });
const on = (surface: SurfaceId, rough = 1): GroundFn => () => ({ h: 0, launch: 0, surface, canal: false, rough });

/** Push flat out in a straight line; returns speed after `seconds` and the distance covered. */
function sprint(id: TyreId, surface: SurfaceId, seconds: number, rough = 1) {
  const ctx = ctxFor(id);
  const st = createRacerState(0, 0, 0, ctx.runner);
  let maxInst = 0;
  for (let i = 0; i < seconds / FIXED_DT; i++) {
    stepRacer(st, { steer: 0, push: 1, brake: 0, balance: false }, ctx, on(surface, rough), FIXED_DT);
    maxInst = Math.max(maxInst, st.instability);
  }
  return { speed: st.speed, dist: st.z, maxInst };
}

describe('grass terrain', () => {
  it('grass cuts acceleration and top speed compared with the road', () => {
    const road = sprint('mtb', 'dirt', 2), grass = sprint('mtb', 'grass', 2);
    expect(grass.speed).toBeLessThan(road.speed * 0.85);
    const roadTop = sprint('mtb', 'dirt', 10), grassTop = sprint('mtb', 'grass', 10);
    expect(grassTop.speed).toBeLessThan(roadTop.speed * 0.85);
  });

  it('rolling resistance on grass slows a coasting tyre much faster', () => {
    const coast = (surface: SurfaceId) => {
      const ctx = ctxFor('mtb');
      const st = createRacerState(0, 0, 0, ctx.runner);
      st.speed = 8;
      for (let i = 0; i < 1.5 / FIXED_DT; i++) stepRacer(st, { steer: 0, push: 0, brake: 0, balance: false }, ctx, on(surface), FIXED_DT);
      return st.speed;
    };
    expect(8 - coast('grass')).toBeGreaterThan((8 - coast('dirt')) * 2.5);
  });

  it('mountain-bike tyres handle grass far better than road tyres', () => {
    const mtb = sprint('mtb', 'grass', 8), road = sprint('road', 'grass', 8);
    expect(mtb.dist).toBeGreaterThan(road.dist);
    // …while the road tyre is the faster one on smooth concrete.
    expect(sprint('road', 'paved', 8).dist).toBeGreaterThan(sprint('mtb', 'paved', 8).dist);
  });

  it('lumpy grass patches shake the tyre more than smooth ones', () => {
    expect(sprint('road', 'grass', 6, 1.9).maxInst).toBeGreaterThan(sprint('road', 'grass', 6, 0.5).maxInst);
  });

  it('the race ground reports grass, patchy roughness and the roadside off the road', () => {
    const track = new Track({
      id: 't', name: 't', difficulty: 'Easy', description: '',
      controlPoints: [[0, 0], [0, 150], [60, 200], [120, 150], [120, 0], [60, -50]],
      halfWidth: 4.5, vergeWidth: 3.2, defaultSurface: 'dirt', offroadSurface: 'grass', surfaces: [],
      checkpointCount: 8, startAt: 0,
    });
    const s = new RaceSession(track, [{ id: 'a', name: 'a', isBot: true, tyreId: 'mtb', stickId: 'wood' }], { laps: 1, difficulty: 'normal', seed: 1 });
    const mid = s.groundAt({ s: 40, d: 0, index: 0, halfWidth: 4.5 });
    expect(mid.surface).toBe('dirt');
    expect(mid.roadside).toBe(false);
    const roughs = new Set<number>();
    for (let k = 0; k < 40; k++) {
      const g = s.groundAt({ s: 10 + k * 3, d: 5.8, index: 0, halfWidth: 4.5 });
      expect(g.surface).toBe('grass');
      expect(g.roadside).toBe(true);
      roughs.add(Math.round((g.rough ?? 1) * 10));
    }
    expect(roughs.size).toBeGreaterThan(3); // genuinely patchy
  });
});
