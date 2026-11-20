import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../src/config/gameplay';
import { BotController, AI_PROFILES } from '../src/sim/ai';
import { MAX_RACERS, populateGrid, RaceSession, type RacerSetup } from '../src/sim/race';
import { Track } from '../src/sim/track';
import { BARANGAY_DASH } from '../src/tracks/barangayDash';
import { EV_FALL } from '../src/sim/physics';

const track = new Track(BARANGAY_DASH);

const bots: RacerSetup[] = [
  { id: 'b0', name: 'Inday', isBot: true, tyreId: 'bmx', stickId: 'bottle' },
  { id: 'b1', name: 'Totoy', isBot: true, tyreId: 'moto', stickId: 'wood' },
  { id: 'b2', name: 'Joy', isBot: true, tyreId: 'road', stickId: 'wood' },
  { id: 'b3', name: 'Dodong', isBot: true, tyreId: 'mtb', stickId: 'bottle' },
];
const human = (id: string): RacerSetup => ({ id, name: id, isBot: false, tyreId: 'mtb', stickId: 'wood' });

describe('track', () => {
  it('is a closed loop of sensible length with ordered checkpoints', () => {
    expect(track.length).toBeGreaterThan(450);
    expect(track.length).toBeLessThan(750);
    expect(track.checkpoints[0]).toBe(0);
    for (let i = 1; i < track.checkpoints.length; i++) expect(track.checkpoints[i]).toBeGreaterThan(track.checkpoints[i - 1]);
    const a = track.samples[0], b = track.samples[track.count - 1];
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(track.spacing * 1.5);
  });

  it('projects points back onto the centreline', () => {
    for (const s of [0, 37, 200, 411]) {
      const p = track.pointAt(s);
      const proj = track.project(p.x + p.nx * 2, p.z + p.nz * 2);
      expect(Math.abs(((proj.s - s + track.length / 2) % track.length) - track.length / 2)).toBeLessThan(1.5);
      expect(proj.d).toBeCloseTo(2, 0);
    }
  });

  it('has varied surfaces (dirt, concrete and gravel)', () => {
    const kinds = new Set(track.samples.map((s) => s.surface));
    expect(kinds).toEqual(new Set(['dirt', 'paved', 'gravel']));
  });
});

describe('grid population', () => {
  it('fills the grid to four racers with bots', () => {
    expect(populateGrid([human('host')], bots)).toHaveLength(MAX_RACERS);
    expect(populateGrid([human('host')], bots).filter((r) => r.isBot)).toHaveLength(3);
    expect(populateGrid([human('a'), human('b')], bots).filter((r) => r.isBot)).toHaveLength(2);
    expect(populateGrid([human('a'), human('b'), human('c')], bots).filter((r) => r.isBot)).toHaveLength(1);
    expect(populateGrid([human('a'), human('b'), human('c'), human('d')], bots).filter((r) => r.isBot)).toHaveLength(0);
    expect(populateGrid([human('host'), human('g')], bots)[0].id).toBe('host');
  });

  it('rejects more than four players', () => {
    expect(() => populateGrid([human('a'), human('b'), human('c'), human('d'), human('e')], bots)).toThrow();
    expect(() => new RaceSession(track, [...bots, human('x')], { laps: 3, difficulty: 'normal', seed: 1 })).toThrow();
  });
});

describe('full race simulation', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    it(`four ${difficulty} bots complete three valid laps in 2–4 minutes`, () => {
      const session = new RaceSession(track, bots, { laps: 3, difficulty, seed: 7 });
      let falls = 0;
      const maxTicks = Math.round(400 / FIXED_DT);
      let ticks = 0;
      while (session.phase !== 'finished' && ticks < maxTicks) {
        session.step({});
        for (const r of session.racers) if (r.events & EV_FALL) falls++;
        ticks++;
      }
      expect(session.phase).toBe('finished');
      const standings = session.standings();
      for (const r of standings) {
        expect(r.progress.finished).toBe(true);
        expect(r.progress.lapTimes).toHaveLength(3);
        expect(r.progress.finishTime!).toBeGreaterThan(110);
        expect(r.progress.finishTime!).toBeLessThan(240);
        expect(r.respawns).toBeLessThanOrEqual(2);
      }
      for (let i = 1; i < standings.length; i++) {
        expect(standings[i].progress.finishTime!).toBeGreaterThanOrEqual(standings[i - 1].progress.finishTime!);
      }
      // Bots should wobble occasionally but not crash constantly.
      expect(falls).toBeLessThan(20);
    });
  }

  it('countdown holds racers still, then the clock runs', () => {
    const session = new RaceSession(track, bots, { laps: 1, difficulty: 'normal', seed: 3 });
    const x0 = session.racers[0].phys.x;
    for (let i = 0; i < 60; i++) session.step({});
    expect(session.phase).toBe('countdown');
    expect(session.racers[0].phys.x).toBe(x0);
    for (let i = 0; i < 200; i++) session.step({});
    expect(session.phase).toBe('racing');
    expect(session.time).toBeGreaterThan(0);
  });

  it('a human with no input stays near the start while bots leave', () => {
    const grid = populateGrid([human('me')], bots);
    const session = new RaceSession(track, grid, { laps: 3, difficulty: 'normal', seed: 3 });
    for (let i = 0; i < 60 * 10; i++) session.step({});
    expect(session.positionOf('me')).toBe(4);
    const me = session.get('me')!;
    expect(me.progress.lapsCompleted).toBe(0);
    expect(me.progress.raceDistance).toBeLessThan(15);
  });

  it('a human driven by the AI pipeline completes a race (same physics as bots)', () => {
    const grid = populateGrid([human('me')], bots);
    const session = new RaceSession(track, grid, { laps: 1, difficulty: 'easy', seed: 11 });
    const driver = new BotController(AI_PROFILES.hard, 5, 0);
    let ticks = 0;
    while (!session.get('me')!.progress.finished && ticks < 120 / FIXED_DT) {
      const me = session.get('me')!;
      session.step({ me: driver.update(me, session.racers, session, FIXED_DT) });
      ticks++;
    }
    const me = session.get('me')!;
    expect(me.progress.finished).toBe(true);
    expect(me.progress.lapTimes).toHaveLength(1);
  });

  it('barriers keep racers inside the course', () => {
    const grid = populateGrid([human('me')], bots);
    const session = new RaceSession(track, grid, { laps: 3, difficulty: 'normal', seed: 2 });
    let maxD = 0;
    for (let i = 0; i < 60 * 20; i++) {
      session.step({ me: { steer: 1, push: 1, brake: 0, balance: false } });
      const me = session.get('me')!;
      maxD = Math.max(maxD, Math.abs(me.lastD) - track.barrierOffset(track.project(me.phys.x, me.phys.z)));
    }
    expect(maxD).toBeLessThan(0.5);
  });
});
