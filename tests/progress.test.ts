import { describe, expect, it } from 'vitest';
import { advanceProgress, compareRacers, createProgress, crossesGate, rankingDistance } from '../src/sim/progress';

const L = 400;
const CPS = [0, 100, 200, 300];

/** Drive a racer forward along the loop in small steps from `from` by `dist` metres. */
function drive(p: ReturnType<typeof createProgress>, dist: number, t0: number, speed = 10, laps = 3) {
  let s = p.lastS;
  let t = t0;
  const step = 2;
  for (let d = 0; d < dist; d += step) {
    s = (s + step) % L;
    t += step / speed;
    advanceProgress(p, s, L, CPS, t, laps, 5);
  }
  return t;
}

describe('checkpoint gates', () => {
  it('detects forward crossings including the wrap', () => {
    expect(crossesGate(99, 2, 100, L)).toBe(true);
    expect(crossesGate(398, 4, 0, L)).toBe(true);
    expect(crossesGate(101, 2, 100, L)).toBe(false);
    expect(crossesGate(99, -2, 100, L)).toBe(false);
  });
});

describe('lap progress', () => {
  it('first crossing of the line starts the race; three valid laps finish it', () => {
    const p = createProgress(L - 6, L);
    expect(p.raceDistance).toBeCloseTo(-6);
    drive(p, 8, 0);
    expect(p.started).toBe(true);
    expect(p.lapsCompleted).toBe(0);
    const t = drive(p, L * 3, 1);
    expect(p.lapsCompleted).toBe(3);
    expect(p.finished).toBe(true);
    expect(p.lapTimes).toHaveLength(3);
    expect(p.finishTime).toBeCloseTo(t, 0);
    // first lap includes the extra run-up from the grid
    expect(p.bestLap).toBeCloseTo(40, 0);
  });

  it('records lap times and best lap', () => {
    const p = createProgress(L - 2, L);
    drive(p, 4, 0);
    drive(p, L, 0, 10);
    drive(p, L, 40, 20);
    expect(p.lapTimes).toHaveLength(2);
    expect(p.bestLap).toBeLessThan(p.lapTimes[0]);
  });

  it('rejects teleports and does not award skipped checkpoints', () => {
    const p = createProgress(L - 2, L);
    drive(p, 4, 0);
    expect(p.nextCp).toBe(1);
    // Jump straight from 2m to 250m (cutting across the infield).
    const r = advanceProgress(p, 250, L, CPS, 5, 3, 5);
    expect(r.rejected).toBe(true);
    expect(p.nextCp).toBe(1);
    // Carry on to the line: lap must not count because gates 1-3 were skipped.
    drive(p, 160, 5);
    expect(p.lapsCompleted).toBe(0);
    expect(p.nextCp).toBe(1);
  });

  it('driving backwards over the line does not count a lap', () => {
    const p = createProgress(L - 2, L);
    drive(p, 4, 0); // now at s=2, started
    for (let s = 2; s > -10; s -= 1) advanceProgress(p, ((s % L) + L) % L, L, CPS, 1, 3, 5);
    for (let s = -10; s < 4; s += 1) advanceProgress(p, ((s % L) + L) % L, L, CPS, 2, 3, 5);
    expect(p.lapsCompleted).toBe(0);
  });

  it('caps ranking distance at the next unpassed gate', () => {
    const p = createProgress(L - 2, L);
    drive(p, 4, 0);
    p.raceDistance = 350; // forged distance without gates
    expect(rankingDistance(p, L, CPS)).toBeLessThanOrEqual(101);
  });
});

describe('race rankings', () => {
  it('ranks finishers by time, then everyone else by distance', () => {
    const mk = (order: number, dist: number, finish: number | null) => {
      const p = createProgress(0, L);
      p.started = true;
      p.raceDistance = dist;
      p.lapsCompleted = Math.floor(dist / L);
      p.nextCp = Math.floor((dist % L) / 100) + 1 === 4 ? 0 : Math.floor((dist % L) / 100) + 1;
      if (finish != null) { p.finished = true; p.finishTime = finish; }
      return { progress: p, order };
    };
    const a = mk(0, 1200, 130), b = mk(1, 1200, 125), c = mk(2, 950, null), d = mk(3, 1010, null);
    const sorted = [a, b, c, d].sort((x, y) => compareRacers(x, y, L, CPS)).map((r) => r.order);
    expect(sorted).toEqual([1, 0, 3, 2]);
  });
});
