import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../src/config/gameplay';
import { DOG } from '../src/config/hazards';
import { createDogs, updateDogs, type DogEvent, type DogNav, type DogTarget } from '../src/sim/dogs';
import { RaceSession } from '../src/sim/race';
import { Track } from '../src/sim/track';

const track = new Track({
  id: 't', name: 't', difficulty: 'Easy', description: '',
  controlPoints: [[0, 0], [0, 150], [60, 200], [120, 150], [120, 0], [60, -50]],
  halfWidth: 4.5, vergeWidth: 3.2, defaultSurface: 'dirt', offroadSurface: 'grass', surfaces: [],
  checkpointCount: 8, startAt: 0, dogs: [{ at: 0.1, side: 1, offset: 1.5 }],
});

/** A racer running along the track past the dog at a constant speed. Returns the event types. */
function runPast(speed: number, sinceBitten = Infinity, nav?: DogNav) {
  const dogs = createDogs(track, track.def.dogs!);
  const s0 = 0.1 * track.length - 6;
  const types: DogEvent['type'][] = [];
  let maxD = 0;
  for (let t = 0; t < 14; t += FIXED_DT) {
    const pt = track.pointAt(s0 + speed * t);
    const tgt: DogTarget = { x: pt.x, z: pt.z, rx: pt.x, rz: pt.z, protectedFor: 0, busy: false, sinceBitten: sinceBitten + t };
    for (const e of updateDogs(dogs, [tgt], FIXED_DT, [], nav)) types.push(e.type);
    if (nav) maxD = Math.max(maxD, Math.abs(track.project(dogs[0].x, dogs[0].z).d));
    if (types.includes('catch')) break;
  }
  return { types, maxD };
}

describe('askal chases', () => {
  it('slow racers get caught', () => {
    expect(runPast(6).types).toContain('catch');
  });

  it('fast racers can escape', () => {
    const { types } = runPast(11.5);
    expect(types).not.toContain('catch');
    expect(types).toContain('giveUp');
  });

  it('chases last long enough to matter and keep warning the racer', () => {
    const { types } = runPast(9.6);
    expect(DOG.maxChaseTime).toBeGreaterThanOrEqual(5);
    expect(types[0]).toBe('bark');
    expect(types.filter((t) => t === 'growl').length).toBeGreaterThanOrEqual(1);
  });

  it('a recently bitten racer is left alone (no repeated unavoidable stuns)', () => {
    const { types } = runPast(4, 2);
    expect(types).not.toContain('catch');
  });

  it('dogs stay on the road side of the fences while chasing', () => {
    const session = new RaceSession(track, [{ id: 'a', name: 'a', isBot: true, tyreId: 'mtb', stickId: 'wood' }], { laps: 1, difficulty: 'normal', seed: 1 });
    const nav = (session as unknown as { dogNav: DogNav }).dogNav;
    const { maxD } = runPast(5, Infinity, nav);
    expect(maxD).toBeLessThanOrEqual(track.barrierOffset(track.project(0, 0)) + 0.01);
  });
});
