import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../src/config/gameplay';
import { PEDESTRIAN as P } from '../src/config/pedestrians';
import { Rng } from '../src/core/rng';
import { EV_PED } from '../src/sim/physics';
import { createPedestrians, onRoad, updatePedestrians, type PedRacer } from '../src/sim/pedestrians';
import { RaceSession } from '../src/sim/race';
import { Track, type TrackDefinition } from '../src/sim/track';

function track(extra: Partial<TrackDefinition> = {}): Track {
  return new Track({
    id: 't', name: 't', difficulty: 'Easy', description: '',
    controlPoints: [[0, 0], [0, 150], [60, 200], [120, 150], [120, 0], [60, -50]],
    halfWidth: 4.5, vergeWidth: 3.2, defaultSurface: 'dirt', offroadSurface: 'grass', surfaces: [],
    checkpointCount: 8, startAt: 0, pedestrians: [{ kind: 'crossing', at: 0.1, side: 1, count: 1 }], ...extra,
  });
}

/** A racer at arc length s in lane d moving at speed v. */
function racerAt(t: Track, s: number, d: number, v: number): PedRacer {
  const pt = t.pointAt(s);
  const x = pt.x + pt.nx * d, z = pt.z + pt.nz * d;
  return { s, d, speed: v, x, z, rx: x - pt.tx, rz: z - pt.tz };
}

describe('pedestrians', () => {
  it('wait → look → cross → arrive when the road is clear', () => {
    const t = track();
    const rng = new Rng(1);
    const peds = createPedestrians(t, t.def.pedestrians!, rng);
    const p = peds[0];
    const seen = new Set<string>();
    for (let i = 0; i < 40 / FIXED_DT; i++) { updatePedestrians(t, peds, [], FIXED_DT, rng); seen.add(p.state); }
    for (const st of ['wait', 'look', 'cross', 'arrive']) expect(seen).toContain(st);
  });

  it('never steps out in front of a racer who could not react, even when distracted', () => {
    const t = track();
    for (let seed = 1; seed < 40; seed++) {
      const rng = new Rng(seed);
      const peds = createPedestrians(t, t.def.pedestrians!, rng);
      const p = peds[0];
      for (let i = 0; i < 30 / FIXED_DT; i++) {
        // A racer always ~1.2 s away from the crossing at 10 m/s.
        const r = racerAt(t, p.s - 12, 0, 10);
        const before = p.state;
        updatePedestrians(t, peds, [r], FIXED_DT, rng);
        if (before === 'look' && p.state === 'cross') throw new Error(`seed ${seed}: stepped out with a racer 1.2 s away`);
      }
    }
  });

  it('hurries out of the way when a racer arrives mid-crossing, and never gets stuck on the road', () => {
    const t = track();
    const rng = new Rng(4);
    const peds = createPedestrians(t, t.def.pedestrians!, rng);
    const p = peds[0];
    while (p.state !== 'cross') updatePedestrians(t, peds, [], FIXED_DT, rng);
    for (let i = 0; i < 0.6 / FIXED_DT; i++) updatePedestrians(t, peds, [], FIXED_DT, rng);
    // A racer appears 8 m away in their lane.
    let dodged = false;
    for (let i = 0; i < 1 / FIXED_DT; i++) {
      updatePedestrians(t, peds, [racerAt(t, p.s - 8, p.d, 10)], FIXED_DT, rng);
      if (p.state === 'dodge') dodged = true;
    }
    expect(dodged).toBe(true);
    let tOn = 0;
    while (onRoad(t, p) && tOn < 20) { updatePedestrians(t, peds, [], FIXED_DT, rng); tOn += FIXED_DT; }
    expect(tOn).toBeLessThan(P.maxOnRoad);
  });

  it('a bump startles the person (cartoon hop), slows the racer, and can’t repeat immediately', () => {
    const t = track();
    const s = new RaceSession(t, [{ id: 'me', name: 'me', isBot: false, tyreId: 'mtb', stickId: 'wood' }], { laps: 1, difficulty: 'normal', seed: 2 });
    while (s.phase === 'countdown') s.step({});
    const r = s.get('me')!;
    const p = s.pedestrians[0];
    p.state = 'cross'; p.d = 0; p.toD = -6; p.fromD = 6;
    const pt = t.pointAt(p.s);
    p.x = pt.x; p.z = pt.z;
    r.phys.x = p.x; r.phys.z = p.z; r.phys.speed = 8;
    s.step({ me: { steer: 0, push: 0, brake: 0, balance: false } });
    expect(r.events & EV_PED).toBeTruthy();
    expect(r.phys.speed).toBeLessThan(8 * 0.8);
    expect(p.state).toBe('startled');
    expect(p.bumpCooldown).toBeGreaterThan(0);
    r.phys.x = p.x; r.phys.z = p.z;
    s.step({ me: { steer: 0, push: 0, brake: 0, balance: false } });
    expect(r.events & EV_PED).toBeFalsy();
  });

  it('bot races with crossings still finish', () => {
    const t = track({ pedestrians: [{ kind: 'crossing', at: 0.1, side: 1, count: 2 }, { kind: 'crossing', at: 0.5, side: -1, count: 2 }] });
    const bots = ['a', 'b', 'c'].map((id) => ({ id, name: id, isBot: true, tyreId: 'mtb' as const, stickId: 'wood' as const }));
    const s = new RaceSession(t, bots, { laps: 2, difficulty: 'normal', seed: 7 });
    for (let i = 0; i < 300 / FIXED_DT && s.phase !== 'finished'; i++) s.step({});
    expect(s.phase).toBe('finished');
  });
});
