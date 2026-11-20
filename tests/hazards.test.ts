import { describe, expect, it } from 'vitest';
import { FIXED_DT, PHYSICS, RACE } from '../src/config/gameplay';
import { DOG, HAZARDS } from '../src/config/hazards';
import { STICKS } from '../src/config/sticks';
import { TYRES } from '../src/config/tyres';
import { createDogs, updateDogs, type DogTarget } from '../src/sim/dogs';
import { HazardField, profileHeight, type HazardPlacement } from '../src/sim/hazards';
import {
  applyStun, createRacerState, EV_BOOST, EV_CANAL, EV_CLEANED, EV_POO, runnerConfig, stepRacer, type GroundFn,
} from '../src/sim/physics';
import { RaceSession, type RacerSetup } from '../src/sim/race';
import { Track, type TrackDefinition } from '../src/sim/track';

/** A long simple oval so hazards can be placed on a straight. */
function testTrack(hazards: HazardPlacement[], extra: Partial<TrackDefinition> = {}): Track {
  return new Track({
    id: 't', name: 't', difficulty: 'Easy', description: '',
    controlPoints: [[0, 0], [0, 150], [60, 200], [120, 150], [120, 0], [60, -50]],
    halfWidth: 4.5, vergeWidth: 3.2, defaultSurface: 'dirt', offroadSurface: 'grass', surfaces: [],
    checkpointCount: 8, startAt: 0, hazards, ...extra,
  });
}
const me = (tyreId: RacerSetup['tyreId'] = 'mtb'): RacerSetup => ({ id: 'me', name: 'me', isBot: false, tyreId, stickId: 'wood' });

/** Drive straight down the centreline at full push, collecting events. */
function drive(session: RaceSession, seconds: number, steerToLine = true) {
  let events = 0;
  const r = session.get('me')!;
  for (let i = 0; i < seconds / FIXED_DT; i++) {
    const p = r.phys;
    const tp = session.track.pointAt(r.progress.lastS + 6);
    const want = Math.atan2(tp.x + tp.nx * r.lastD * 0 - p.x, tp.z - p.z);
    const err = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
    session.step({ me: { steer: steerToLine ? Math.max(-1, Math.min(1, -err * 2)) : 0, push: 1, brake: 0, balance: false } });
    events |= r.events;
  }
  return { r, events };
}
const startRace = (s: RaceSession) => { while (s.phase === 'countdown') s.step({}); };

describe('hazard field', () => {
  it('height profiles: humps rise, potholes dip, ramps peak near the lip', () => {
    expect(profileHeight(HAZARDS.cementHump, 0, 0, true)).toBeCloseTo(HAZARDS.cementHump.height);
    expect(profileHeight(HAZARDS.pothole, 0, 0, false)).toBeLessThan(0);
    expect(profileHeight(HAZARDS.ramp, 0.74, 0, false)).toBeGreaterThan(profileHeight(HAZARDS.ramp, -0.5, 0, false));
    expect(profileHeight(HAZARDS.log, 1.2, 0, false)).toBe(0);
  });

  it('samples ground height and surface overrides along the track', () => {
    const track = testTrack([{ type: 'dirtMound', at: 0.1, d: 0 }, { type: 'mud', at: 0.3, d: 0 }]);
    const f = new HazardField(track, track.def.hazards);
    const mound = f.sample({ s: 0.1 * track.length, d: 0, index: 0, halfWidth: 4.5 });
    expect(mound.h).toBeGreaterThan(0.3);
    const mud = f.sample({ s: 0.3 * track.length, d: 0, index: 0, halfWidth: 4.5 });
    expect(mud.surface).toBe('mud');
    expect(f.sample({ s: 0.3 * track.length, d: 4, index: 0, halfWidth: 4.5 }).surface).toBeNull();
  });

  it('canals are recessed only beyond the road edge on their side', () => {
    const track = testTrack([], { canals: [{ from: 0.05, to: 0.2, side: 1 }] });
    const f = new HazardField(track, [], track.def.canals);
    const s = 0.1 * track.length;
    expect(f.sample({ s, d: 5.3, index: 0, halfWidth: 4.5 }).canal).toBe(true);
    expect(f.sample({ s, d: 5.3, index: 0, halfWidth: 4.5 }).h).toBeLessThan(-0.5);
    expect(f.sample({ s, d: -5.3, index: 0, halfWidth: 4.5 }).canal).toBe(false);
    expect(f.sample({ s, d: 3, index: 0, halfWidth: 4.5 }).canal).toBe(false);
  });
});

describe('hazard triggers', () => {
  it('a full-speed pothole hit costs speed, adds instability and jolts the wheel up', () => {
    const track = testTrack([{ type: 'pothole', at: 0.12, d: 0 }]);
    const s = new RaceSession(track, [me()], { laps: 1, difficulty: 'normal', seed: 1 });
    startRace(s);
    const r = s.get('me')!;
    let hit = false, speedBefore = 0, airborne = false;
    for (let i = 0; i < 12 / FIXED_DT && !hit; i++) {
      speedBefore = r.phys.speed;
      drive(s, FIXED_DT);
      if (r.hazardHits.some((h) => h.type === 'pothole')) {
        hit = true;
        airborne = !r.phys.grounded;
        expect(r.phys.speed).toBeLessThan(speedBefore * 0.95);
        expect(r.phys.instability).toBeGreaterThan(0.2);
      }
    }
    expect(hit).toBe(true);
    expect(airborne).toBe(true);
  });

  it('boost pads boost for a limited time', () => {
    const track = testTrack([{ type: 'boost', at: 0.1, d: 0 }]);
    const s = new RaceSession(track, [me()], { laps: 1, difficulty: 'normal', seed: 1 });
    startRace(s);
    const { r, events } = drive(s, 11);
    expect(events & EV_BOOST).toBeTruthy();
    expect(r.phys.boost).toBe(0); // expired again
    expect(PHYSICS.boostTime).toBeGreaterThan(0.5);
    expect(PHYSICS.boostTime).toBeLessThan(3);
  });

  it('boosted tyres outrun unboosted ones for a while', () => {
    const ctx = { tyre: TYRES.mtb, stick: STICKS.wood, runner: runnerConfig('child', TYRES.mtb.radius) };
    const flat: GroundFn = () => ({ h: 0, launch: 0, surface: 'dirt', canal: false });
    const a = createRacerState(0, 0, 0, ctx.runner), b = createRacerState(0, 0, 0, ctx.runner);
    for (let i = 0; i < 360; i++) { stepRacer(a, { steer: 0, push: 1, brake: 0, balance: false }, ctx, flat, FIXED_DT); stepRacer(b, { steer: 0, push: 1, brake: 0, balance: false }, ctx, flat, FIXED_DT); }
    b.boost = PHYSICS.boostTime;
    for (let i = 0; i < 60; i++) { stepRacer(a, { steer: 0, push: 1, brake: 0, balance: false }, ctx, flat, FIXED_DT); stepRacer(b, { steer: 0, push: 1, brake: 0, balance: false }, ctx, flat, FIXED_DT); }
    expect(b.speed).toBeGreaterThan(a.speed * 1.05);
  });

  it('dog poo dirties the tyre (slower) until the runner stops to clean it', () => {
    const track = testTrack([{ type: 'poo', at: 0.15, d: 0, width: 4 }]);
    const s = new RaceSession(track, [me()], { laps: 1, difficulty: 'normal', seed: 1 });
    startRace(s);
    const { r, events } = drive(s, 13);
    expect(events & EV_POO).toBeTruthy();
    expect(r.phys.dirt).toBeGreaterThan(0.5);
    // Brake to a stop: cleaning starts automatically and finishes quickly.
    let t = 0, ev = 0;
    while (r.phys.dirt > 0 && t < 6) { s.step({ me: { steer: 0, push: 0, brake: 1, balance: false } }); ev |= r.events; t += FIXED_DT; }
    expect(ev & EV_CLEANED).toBeTruthy();
    expect(r.phys.dirt).toBe(0);
    expect(t).toBeLessThan(3.5);
  });

  it('a dirty tyre is slower at the top end', () => {
    const ctx = { tyre: TYRES.mtb, stick: STICKS.wood, runner: runnerConfig('child', TYRES.mtb.radius) };
    const flat: GroundFn = () => ({ h: 0, launch: 0, surface: 'dirt', canal: false });
    const clean = createRacerState(0, 0, 0, ctx.runner), dirty = createRacerState(0, 0, 0, ctx.runner);
    dirty.dirt = 1;
    for (let i = 0; i < 600; i++) {
      stepRacer(clean, { steer: 0, push: 1, brake: 0, balance: false }, ctx, flat, FIXED_DT);
      stepRacer(dirty, { steer: 0, push: 1, brake: 0, balance: false }, ctx, flat, FIXED_DT);
    }
    expect(dirty.speed).toBeLessThan(clean.speed * 0.92);
  });

  it('driving into a canal crashes the tyre, then respawns it safely with laps intact', () => {
    const track = testTrack([], { canals: [{ from: 0.02, to: 0.3, side: 1 }] });
    const s = new RaceSession(track, [me()], { laps: 2, difficulty: 'normal', seed: 1 });
    startRace(s);
    const r = s.get('me')!;
    drive(s, 2); // pick up speed on the straight
    const lapsBefore = r.progress.lapsCompleted, nextCp = r.progress.nextCp;
    let events = 0, t = 0;
    while (t < 8 && r.respawns === 0) { s.step({ me: { steer: r.lastD > 3 ? 0 : 0.35, push: 1, brake: 0, balance: false } }); events |= r.events; t += FIXED_DT; }
    expect(events & EV_CANAL).toBeTruthy();
    expect(r.respawns).toBe(1);
    expect(r.phys.control).toBe('controlled');
    expect(Math.abs(r.lastD)).toBeLessThan(track.sampleAt(r.progress.lastS).halfWidth);
    expect(r.phys.invuln).toBeGreaterThan(0);
    expect(r.progress.lapsCompleted).toBe(lapsBefore);
    expect(r.progress.nextCp).toBe(nextCp);
    expect(t).toBeGreaterThan(RACE.canalRespawnDelay);
  });

  it('respawns never award laps or checkpoints', () => {
    const track = testTrack([]);
    const s = new RaceSession(track, [me()], { laps: 3, difficulty: 'normal', seed: 1 });
    startRace(s);
    const r = s.get('me')!;
    drive(s, 20);
    const before = { ...r.progress, lapTimes: [...r.progress.lapTimes] };
    s.respawn(r, true);
    expect(r.progress.lapsCompleted).toBe(before.lapsCompleted);
    expect(r.progress.nextCp).toBe(before.nextCp);
    expect(r.progress.raceDistance).toBeLessThanOrEqual(before.raceDistance + 1e-6);
    drive(s, 4);
    expect(r.progress.lapsCompleted).toBeGreaterThanOrEqual(before.lapsCompleted);
  });
});

describe('street dogs and stuns', () => {
  const track = testTrack([], { dogs: [{ at: 0.2, side: 1, offset: 1.5 }] });
  const target = (x: number, z: number, protectedFor = 0): DogTarget => ({ x, z, rx: x, rz: z, protectedFor, busy: false });

  it('dogs ignore far racers, bark a warning, then chase', () => {
    const dogs = createDogs(track, track.def.dogs!);
    const d = dogs[0];
    expect(updateDogs(dogs, [target(d.x + 50, d.z)], FIXED_DT)).toHaveLength(0);
    const ev = updateDogs(dogs, [target(d.x + 4, d.z)], FIXED_DT);
    expect(ev[0]).toMatchObject({ type: 'bark', racer: 0 });
    expect(d.state).toBe('alert');
    for (let i = 0; i < (DOG.alertTime + 0.1) / FIXED_DT; i++) updateDogs(dogs, [target(d.homeX + 30, d.homeZ)], FIXED_DT);
    expect(d.state).toBe('chase');
  });

  it('chases are short: a dog gives up and goes home, then cools down', () => {
    const dogs = createDogs(track, track.def.dogs!);
    const d = dogs[0];
    updateDogs(dogs, [target(d.x + 4, d.z)], FIXED_DT);
    let t = 0;
    // Racer stays out of reach, running away fast.
    while (d.state !== 'return' && t < 10) { updateDogs(dogs, [target(d.homeX + 6 + t * 12, d.homeZ)], FIXED_DT); t += FIXED_DT; }
    expect(d.state).toBe('return');
    expect(t).toBeLessThanOrEqual(DOG.alertTime + DOG.maxChaseTime + 0.05);
    while (d.state === 'return' && t < 40) { updateDogs(dogs, [target(999, 999)], FIXED_DT); t += FIXED_DT; }
    expect(d.state).toBe('cooldown');
    // During cooldown nearby racers are ignored.
    expect(updateDogs(dogs, [target(d.x + 1, d.z)], FIXED_DT)).toHaveLength(0);
  });

  it('a caught racer is stunned briefly, then protected from repeat stuns', () => {
    const ctx = { tyre: TYRES.mtb, stick: STICKS.wood, runner: runnerConfig('child', TYRES.mtb.radius) };
    const st = createRacerState(0, 0, 0, ctx.runner);
    st.speed = 10;
    expect(applyStun(st, ctx)).toBe(true);
    expect(st.stun).toBeCloseTo(PHYSICS.stunTime);
    expect(st.speed).toBeLessThan(10 * 0.5);
    expect(applyStun(st, ctx)).toBe(false); // no stun-lock
    const flat: GroundFn = () => ({ h: 0, launch: 0, surface: 'dirt', canal: false });
    let t = 0;
    while (st.stun > 0) { stepRacer(st, { steer: 0, push: 1, brake: 0, balance: false }, ctx, flat, FIXED_DT); t += FIXED_DT; }
    expect(t).toBeCloseTo(PHYSICS.stunTime, 1);
    expect(st.invuln).toBeGreaterThan(1);
    expect(applyStun(st, ctx)).toBe(false);
    while (st.invuln > 0) stepRacer(st, { steer: 0, push: 1, brake: 0, balance: false }, ctx, flat, FIXED_DT);
    expect(applyStun(st, ctx)).toBe(true);
  });

  it('protected racers are not caught', () => {
    const dogs = createDogs(track, track.def.dogs!);
    const d = dogs[0];
    updateDogs(dogs, [target(d.x + 3, d.z, 5)], FIXED_DT);
    const caught: string[] = [];
    for (let i = 0; i < 4 / FIXED_DT; i++) for (const e of updateDogs(dogs, [target(d.x + 0.5, d.z, 5)], FIXED_DT)) caught.push(e.type);
    expect(caught).not.toContain('catch');
  });
});
