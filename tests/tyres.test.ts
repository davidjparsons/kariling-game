import { describe, expect, it } from 'vitest';
import { STICKS } from '../src/config/sticks';
import { SURFACES } from '../src/config/surfaces';
import { TYRES, TYRE_IDS } from '../src/config/tyres';
import { effectiveMaxSpeed, gripLimit } from '../src/sim/physics';

describe('tyre configuration', () => {
  it('defines all four tyre categories with ratings in 1..10', () => {
    expect(TYRE_IDS).toEqual(['bmx', 'mtb', 'road', 'moto']);
    for (const id of TYRE_IDS) {
      const t = TYRES[id];
      for (const v of Object.values(t.ratings)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(10);
      }
      expect(t.radius).toBeGreaterThan(0.2);
      expect(t.maxSpeed).toBeGreaterThan(8);
      for (const s of Object.keys(SURFACES)) expect(t.affinity[s as keyof typeof SURFACES]).toBeDefined();
    }
  });

  it('matches the design ratings from the brief', () => {
    expect(TYRES.bmx.ratings).toEqual({ speed: 6, acceleration: 9, stability: 6, cornering: 9 });
    expect(TYRES.mtb.ratings).toEqual({ speed: 7, acceleration: 7, stability: 8, cornering: 8 });
    expect(TYRES.road.ratings).toEqual({ speed: 10, acceleration: 8, stability: 4, cornering: 6 });
    expect(TYRES.moto.ratings).toEqual({ speed: 8, acceleration: 4, stability: 10, cornering: 5 });
  });

  it('orders physics constants consistently with ratings', () => {
    const byRating = (key: 'speed' | 'acceleration' | 'stability' | 'cornering') =>
      [...TYRE_IDS].sort((a, b) => TYRES[b].ratings[key] - TYRES[a].ratings[key])[0];
    const max = <K extends keyof (typeof TYRES)['bmx']>(k: K, invert = false) =>
      [...TYRE_IDS].sort((a, b) => ((TYRES[b][k] as number) - (TYRES[a][k] as number)) * (invert ? -1 : 1))[0];
    expect(max('maxSpeed')).toBe(byRating('speed'));
    expect(max('acceleration')).toBe(byRating('acceleration'));
    expect(max('turnRate')).toBe(byRating('cornering'));
    expect(max('instabilityMul', true)).toBe(byRating('stability'));
  });

  it('no tyre dominates every surface', () => {
    const surfaces = ['paved', 'dirt', 'gravel', 'grass', 'mud'] as const;
    const winners = new Set(surfaces.map((s) =>
      [...TYRE_IDS].sort((a, b) => effectiveMaxSpeed(TYRES[b], SURFACES[s]) - effectiveMaxSpeed(TYRES[a], SURFACES[s]))[0]));
    expect(winners.size).toBeGreaterThan(1);
    // Road tyre is fastest on concrete; mountain bike beats it on gravel.
    expect(effectiveMaxSpeed(TYRES.road, SURFACES.paved)).toBeGreaterThan(effectiveMaxSpeed(TYRES.mtb, SURFACES.paved));
    expect(effectiveMaxSpeed(TYRES.mtb, SURFACES.gravel)).toBeGreaterThan(effectiveMaxSpeed(TYRES.road, SURFACES.gravel));
    expect(gripLimit(TYRES.mtb, SURFACES.mud)).toBeGreaterThan(gripLimit(TYRES.road, SURFACES.mud));
  });

  it('keeps stick differences small', () => {
    const { wood, bottle } = STICKS;
    for (const k of ['pushPower', 'steerAssist', 'stabilityMul', 'staminaCost'] as const) {
      expect(Math.abs(wood[k] - bottle[k])).toBeLessThanOrEqual(0.17);
    }
    expect(bottle.stabilityMul).toBeLessThan(wood.stabilityMul);
    expect(bottle.staminaCost).toBeGreaterThan(wood.staminaCost);
  });
});
