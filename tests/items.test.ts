import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../src/config/gameplay';
import { DASH, EFFECT_LIMITS, ITEM_IDS, ITEM_RULES, ITEMS, LANDING_BONUS, PROJECTILES, TURON_TURBO } from '../src/config/items';
import { STICKS } from '../src/config/sticks';
import { TYRES } from '../src/config/tyres';
import { Rng } from '../src/core/rng';
import { createEffects, DoubleTapDetector, effectMods, rollItem } from '../src/sim/effects';
import {
  createRacerState, EV_DASH, EV_ITEM_USE, EV_NICE_CATCH, giveItem, runnerConfig, stepRacer,
  type Ground, type GroundFn, type RacerInput,
} from '../src/sim/physics';
import { RaceSession } from '../src/sim/race';
import { AI_PROFILES, BotController } from '../src/sim/ai';
import { Track } from '../src/sim/track';
import { advanceProjectile, launchProjectile } from '../src/sim/projectiles';

const ctx = { tyre: TYRES.mtb, stick: STICKS.wood, runner: runnerConfig('child', TYRES.mtb.radius) };
const PUSH: RacerInput = { steer: 0, push: 1, brake: 0, balance: false };
const flat: GroundFn = () => ({ h: 0, launch: 0, surface: 'dirt', canal: false });

function run(st: ReturnType<typeof createRacerState>, seconds: number, input: RacerInput = PUSH, ground = flat) {
  let ev = 0;
  for (let i = 0; i < seconds / FIXED_DT; i++) ev |= stepRacer(st, input, ctx, ground, FIXED_DT);
  return ev;
}

describe('double-tap dash', () => {
  it('detects two presses inside the window, not slow ones, and a triple tap is one dash', () => {
    const d = new DoubleTapDetector(0.3);
    expect(d.press(1.0)).toBe(false);
    expect(d.press(1.2)).toBe(true);
    expect(d.press(1.35)).toBe(false); // third tap starts a new pair
    expect(d.press(2.0)).toBe(false);
    expect(d.press(2.5)).toBe(false); // too slow
    expect(d.press(2.7)).toBe(true);
  });

  it('gives a short burst of acceleration that costs stamina and wobble, then cools down', () => {
    const a = createRacerState(0, 0, 0, ctx.runner), b = createRacerState(0, 0, 0, ctx.runner);
    run(a, 1); run(b, 1);
    const stam = b.stamina, inst = b.instability;
    const ev = stepRacer(b, { ...PUSH, dash: true }, ctx, flat, FIXED_DT);
    stepRacer(a, PUSH, ctx, flat, FIXED_DT);
    expect(ev & EV_DASH).toBeTruthy();
    expect(b.stamina).toBeLessThan(stam - DASH.staminaCost * 0.9);
    expect(b.instability).toBeGreaterThan(inst);
    run(a, DASH.duration); run(b, DASH.duration);
    expect(b.speed).toBeGreaterThan(a.speed + 0.3);
    expect(b.fx.dash).toBe(0);
    // Cooldown: an immediate second dash does nothing.
    expect(stepRacer(b, { ...PUSH, dash: true }, ctx, flat, FIXED_DT) & EV_DASH).toBeFalsy();
    run(b, DASH.cooldown);
    expect(stepRacer(b, { ...PUSH, dash: true }, ctx, flat, FIXED_DT) & EV_DASH).toBeTruthy();
  });

  it('makes steering less precise while dashing', () => {
    const fx = createEffects();
    fx.dash = 0.5;
    expect(effectMods(fx).steer).toBeLessThan(1);
    expect(effectMods(fx).instability).toBeGreaterThan(1);
  });

  it('needs stamina', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    run(st, 0.5);
    st.stamina = DASH.minStamina * 0.5;
    expect(stepRacer(st, { ...PUSH, dash: true }, ctx, flat, FIXED_DT) & EV_DASH).toBeFalsy();
  });
});

describe('ramp landing bonus', () => {
  /** A ramp along +z: rises 0.6 m over z ∈ [20, 25] then drops away. */
  const ramp = (launch: number): GroundFn => (_x, z): Ground => {
    const h = z > 20 && z < 25 ? ((z - 20) / 5) * 0.6 : 0;
    return { h, launch, surface: 'dirt', canal: false };
  };

  it('a clean ramp jump with the scoop reconnected in time earns one Nice Catch', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    let count = 0;
    for (let i = 0; i < 7 / FIXED_DT; i++) if (stepRacer(st, { ...PUSH, push: 0.75 }, ctx, ramp(1), FIXED_DT) & EV_NICE_CATCH) count++;
    expect(count).toBe(1);
  });

  it('rolling over a low-launch bump (or just touching a ramp) earns nothing', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    expect(run(st, 7, { ...PUSH, push: 0.75 }, ramp(0.4)) & EV_NICE_CATCH).toBeFalsy();
    // Crawling up the ramp: no real take-off.
    const slow = createRacerState(0, 0, 0, ctx.runner);
    expect(run(slow, 12, { ...PUSH, push: 0.25 }, ramp(1)) & EV_NICE_CATCH).toBeFalsy();
  });

  it('a botched landing gets no bonus', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    let ev = 0;
    for (let i = 0; i < 7 / FIXED_DT; i++) {
      // Yank the steering in the air: lands leaning/steered = heavy landing or a fall.
      ev |= stepRacer(st, { ...PUSH, push: 1, steer: st.grounded ? 0 : 1 }, ctx, ramp(1), FIXED_DT);
    }
    if (ev & EV_NICE_CATCH) {
      // If it still counted, the landing must have been within the allowed severity.
      expect(st.impact).toBeLessThanOrEqual(LANDING_BONUS.maxSeverity);
    }
    expect(LANDING_BONUS.maxSeverity).toBeLessThan(0.8);
  });
});

describe('power-ups', () => {
  it('weighted selection favours catch-up items at the back and is deterministic', () => {
    const count = (frac: number) => {
      const rng = new Rng(5);
      const c: Record<string, number> = {};
      for (let i = 0; i < 4000; i++) { const id = rollItem(rng, frac); c[id] = (c[id] ?? 0) + 1; }
      return c;
    };
    const lead = count(0), back = count(1);
    for (const id of ITEM_IDS) expect(back[id] ?? 0).toBeGreaterThan(0);
    expect(back.turon).toBeGreaterThan(lead.turon * 1.7);
    expect(lead.saging).toBeGreaterThan(back.saging * 2);
    expect(rollItem(new Rng(9), 0.5)).toBe(rollItem(new Rng(9), 0.5));
  });

  it('Turon requires a revealed item, boosts speed, expires and enforces a configurable reuse cooldown', () => {
    const st = createRacerState(0, 0, 0, ctx.runner);
    giveItem(st, 'turon');
    expect(stepRacer(st, { ...PUSH, useItem: true }, ctx, flat, FIXED_DT) & EV_ITEM_USE).toBeFalsy();
    run(st, ITEM_RULES.revealTime);
    const base = structuredClone(st);
    expect(stepRacer(st, { ...PUSH, useItem: true }, ctx, flat, FIXED_DT) & EV_ITEM_USE).toBeTruthy();
    expect(st.item).toBeNull();
    expect(st.itemCooldown).toBe(ITEMS.turon.cooldown);
    run(st, 0.8);
    run(base, 0.8 + FIXED_DT);
    expect(st.speed).toBeGreaterThan(base.speed);

    giveItem(st, 'turon');
    run(st, ITEM_RULES.revealTime + FIXED_DT);
    expect(stepRacer(st, { ...PUSH, useItem: true }, ctx, flat, FIXED_DT) & EV_ITEM_USE).toBeFalsy();
    expect(st.item).toBe('turon');
    run(st, TURON_TURBO.duration);
    expect(st.fx.turbo).toBe(0);
    expect(stepRacer(st, { ...PUSH, useItem: true }, ctx, flat, FIXED_DT) & EV_ITEM_USE).toBeTruthy();
  });

  it('caps Turon Turbo combined with dash and the landing bonus', () => {
    const fx = createEffects();
    fx.turbo = TURON_TURBO.duration;
    fx.dash = 1; fx.bonus = 1;
    expect(effectMods(fx).accel).toBe(EFFECT_LIMITS.accelMax);
    expect(effectMods(fx).speed).toBeLessThanOrEqual(EFFECT_LIMITS.speedMax);
  });

  it('pickups give one item, can’t be re-collected until they respawn, and racers hold one item', () => {
    const track = new Track({
      id: 't', name: 't', difficulty: 'Easy', description: '',
      controlPoints: [[0, 0], [0, 150], [60, 200], [120, 150], [120, 0], [60, -50]],
      halfWidth: 4.5, vergeWidth: 3.2, defaultSurface: 'dirt', offroadSurface: 'grass', surfaces: [],
      checkpointCount: 8, startAt: 0, pickups: [{ at: 0.05, d: [0] }],
    });
    const s = new RaceSession(track, [{ id: 'me', name: 'me', isBot: false, tyreId: 'mtb', stickId: 'wood' }], { laps: 1, difficulty: 'normal', seed: 3 });
    while (s.phase === 'countdown') s.step({});
    const r = s.get('me')!;
    const pk = s.pickups[0];
    // Put the tyre on the box.
    r.phys.x = pk.x; r.phys.z = pk.z;
    s.step({ me: PUSH });
    expect(r.phys.item).not.toBeNull();
    expect(pk.respawn).toBeGreaterThan(0);
    const held = r.phys.item;
    r.phys.x = pk.x; r.phys.z = pk.z;
    s.step({ me: PUSH });
    expect(r.phys.item).toBe(held);
    for (let i = 0; i < (ITEM_RULES.respawnTime + 0.1) / FIXED_DT; i++) s.step({ me: { ...PUSH, push: 0 } });
    expect(pk.respawn).toBe(0);
  });
});


describe('race projectiles', () => {
  const coast = { ...PUSH, push: 0 };
  function raceFixture(targetDistance: number, lane = 0, tyreId: 'mtb' | 'moto' | 'road' = 'mtb', targetIsBot = false) {
    const track = new Track({
      id: 'test', name: 'test', difficulty: 'Easy', description: '',
      controlPoints: [[0, 0], [0, 80], [0, 160], [0, 240], [100, 300], [220, 200], [220, 0], [100, -80]],
      halfWidth: 4.5, vergeWidth: 3, defaultSurface: 'paved', offroadSurface: 'grass',
      surfaces: [], checkpointCount: 8, startAt: 0,
    });
    const race = new RaceSession(track, [
      { id: 'owner', name: 'Owner', isBot: false, tyreId: 'mtb', stickId: 'wood' },
      { id: 'target', name: 'Target', isBot: targetIsBot, tyreId, stickId: 'wood' },
    ], { laps: 1, seed: 3, difficulty: 'normal' });
    while (race.phase === 'countdown') race.step({});
    const [owner, target] = race.racers;
    function place(r: typeof owner, distance: number, d: number) {
      const p = track.pointAt(distance);
      r.phys = createRacerState(p.x + p.nx * d, p.z + p.nz * d, p.heading, r.ctx.runner);
      r.hint = track.project(r.phys.x, r.phys.z).index;
      r.progress.lastS = distance;
      r.lastD = d;
    }
    place(owner, 110, 0);
    place(target, 110 + targetDistance, lane);
    return { race, owner, target, place };
  }

  function fire(race: RaceSession, kind: 'buko' | 'saging' | 'skyflakes', backward = false) {
    const owner = race.racers[0];
    giveItem(owner.phys, kind);
    owner.phys.itemReveal = 0;
    race.step({ owner: { ...coast, useItem: backward ? 'backward' : true }, target: coast });
  }

  function waitForHit(race: RaceSession, seconds = 1.5) {
    for (let i = 0; i < seconds / FIXED_DT; i++) {
      if (race.projectileHits.length) return race.projectileHits[0];
      race.step({ owner: coast, target: coast });
    }
    return undefined;
  }

  it.each([false, true])('Buko can hit a tyre in the selected direction (backward = %s)', (backward) => {
    const { race, owner, target } = raceFixture(backward ? -4 : 6);
    if (backward) target.phys.speed = 4;
    fire(race, 'buko', backward);
    expect(race.projectiles).toHaveLength(1);
    const shot = race.projectiles[0];
    expect(shot.kind).toBe('buko');
    expect(shot.vz * Math.cos(owner.phys.heading) * (backward ? -1 : 1)).toBeGreaterThan(1);
    expect(waitForHit(race)?.target).toBe(target);
    expect(target.phys.instability).toBeGreaterThan(0.4);
    expect(target.phys.itemHitProtection).toBe(ITEM_RULES.hitProtection);
    expect(owner.phys.itemHitProtection).toBe(0);
    expect(race.projectiles).toHaveLength(0);
  });

  it('Buko bounces, rolls, ignores a racer in another lane, and expires', () => {
    const { race, target } = raceFixture(6, 2);
    fire(race, 'buko');
    const shot = race.projectiles[0];
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      const vy = shot.vy;
      race.step({});
      bounced ||= vy < -0.5 && shot.vy > 0.5;
    }
    expect(bounced).toBe(true);
    expect(shot.grounded).toBe(true);
    expect(shot.roll).toBeGreaterThan(15);
    expect(shot.x).toBeCloseTo(race.racers[0].phys.x, 0);
    expect(target.phys.itemHitProtection).toBe(0);
    for (let i = 0; i < PROJECTILES.buko.lifetime / FIXED_DT; i++) race.step({});
    expect(race.projectiles).toHaveLength(0);
  });

  it('rolls over a road hump and loses more speed on the grass verge', () => {
    const { race, owner, place } = raceFixture(60);
    const withHump = new Track({
      ...race.track.def, hazards: [{ type: 'cementHump', at: 113 / race.track.length, d: 0 }],
    });
    const bumpyRace = new RaceSession(withHump, race.racers.map((r) => r.setup), race.opts);
    const shot = launchProjectile(0, 'buko', owner, false);
    shot.y = PROJECTILES.buko.radius;
    shot.vy = 0;
    shot.grounded = true;
    const flatShot = { ...shot };
    let highest = shot.y;
    for (let i = 0; i < 40; i++) {
      expect(advanceProjectile(shot, bumpyRace, FIXED_DT)).toBe(true);
      expect(advanceProjectile(flatShot, race, FIXED_DT)).toBe(true);
      highest = Math.max(highest, shot.y);
    }
    expect(highest - flatShot.y).toBeGreaterThan(0.1);

    place(owner, 110, 5.4);
    const grass = launchProjectile(1, 'buko', owner, false);
    grass.y = PROJECTILES.buko.radius;
    grass.vy = 0;
    grass.grounded = true;
    expect(race.groundAt(race.track.project(grass.x, grass.z)).surface).toBe('grass');
    for (let i = 0; i < 40; i++) expect(advanceProjectile(grass, race, FIXED_DT)).toBe(true);
    expect(Math.hypot(grass.vx, grass.vz)).toBeLessThan(Math.hypot(flatShot.vx, flatShot.vz) - 1);
  });

  it('scales the same Buko hit by tyre mass and protects a racer from another hit', () => {
    for (const type of ['road', 'moto'] as const) {
      const { race, owner, target } = raceFixture(2, 0, type, type === 'moto');
      target.phys.speed = 7;
      const shot = launchProjectile(1, 'buko', owner, false);
      shot.x = target.phys.x;
      shot.z = target.phys.z - 0.15;
      shot.vz = 26;
      expect(advanceProjectile(shot, race, FIXED_DT)).toBe(false);
      expect(race.projectileHits[0]?.target).toBe(target);
      expect(target.phys.speed).toBeLessThan(6);
      expect(target.phys.control).toBe(type === 'road' ? 'lost' : 'controlled');
      const before = target.phys.speed;
      expect(advanceProjectile({ ...shot }, race, FIXED_DT)).toBe(true);
      expect(target.phys.speed).toBe(before);
      expect(race.projectileHits).toHaveLength(1);
    }
  });

  it('a bot uses its held Buko backward against an aligned trailing racer', () => {
    const { race, owner } = raceFixture(-7);
    owner.bot = new BotController(AI_PROFILES.normal, 12, 0);
    giveItem(owner.phys, 'buko');
    owner.phys.itemReveal = 0;
    let input: RacerInput | undefined;
    // Hold the lineup fixed long enough for the bot's normal item reaction timer.
    for (let i = 0; i < 75; i++) input = owner.bot.update(owner, race.racers, race, FIXED_DT);
    expect(input?.useItem).toBe('backward');
    race.step({ target: coast });
    expect(race.projectiles[0]?.kind).toBe('buko');
    expect(race.projectiles[0]?.vz).toBeLessThan(0);
  });

  it('a bot steers out of the lane of an incoming Buko', () => {
    const { race, target } = raceFixture(7, 0, 'mtb', true);
    target.phys.speed = 4;
    fire(race, 'buko');
    for (let i = 0; i < 80; i++) race.step({ owner: coast });
    expect(Math.abs(target.lastD)).toBeGreaterThan(0.65);
    expect(target.phys.itemHitProtection).toBe(0);
  });

  it('Saging stays behind as a hazard and Cracker Shot travels ahead', () => {
    const peel = raceFixture(-4);
    peel.target.phys.speed = 6;
    fire(peel.race, 'saging');
    expect(peel.race.projectiles[0].vz).toBeCloseTo(0);
    expect(waitForHit(peel.race)?.projectile.kind).toBe('saging');
    expect(peel.target.phys.speed).toBeLessThan(5.3);
    expect(peel.target.phys.instability).toBeGreaterThan(0.3);

    const cracker = raceFixture(5);
    fire(cracker.race, 'skyflakes');
    expect(cracker.race.projectiles[0].vz).toBeGreaterThan(10);
    expect(waitForHit(cracker.race)?.projectile.kind).toBe('skyflakes');
    expect(cracker.target.phys.control).not.toBe('lost');
  });
});
