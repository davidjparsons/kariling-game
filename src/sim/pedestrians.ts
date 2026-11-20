import { PEDESTRIAN as P } from '../config/pedestrians';
import { mod } from '../core/math';
import type { Rng } from '../core/rng';
import type { PedestrianPlacement, Track } from './track';

/**
 * Villagers crossing the road at fixed, authored crossing points.
 *
 *   wait ─(timer)→ look ─(gap is safe, or not paying attention)→ cross ─→ arrive ─→ wait (other side)
 *                    └─(racer coming)→ hesitate (keep looking; give up after a while → wait)
 *   cross ─(racer about to arrive in their path)→ dodge (hurry on if past halfway, else step back)
 *   any on-road state ─(bumped)→ startled ─→ dodge to the nearest kerb
 *
 * Deterministic (seeded RNG), track-relative (s, d), and fair: people never step out in front of
 * a racer who can't react, only one person crosses at a time per crossing, nobody stays on the
 * road for long, and a bumped pedestrian can't be hit again straight away.
 */
export type PedState = 'wait' | 'look' | 'cross' | 'arrive' | 'dodge' | 'startled';

export interface Pedestrian {
  id: number;
  crossing: number;
  child: boolean;
  state: PedState;
  timer: number;
  /** Seconds in the current state. */
  stateTime: number;
  s: number;
  d: number;
  /** Kerb the person is walking from / to (lateral offsets). */
  fromD: number;
  toD: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Will cross without checking for racers this time. */
  distracted: boolean;
  /** Can't be bumped again until this reaches 0. */
  bumpCooldown: number;
  /** For animation: looking left/right while waiting to cross. */
  lookDir: number;
}

export interface PedRacer {
  s: number;
  d: number;
  speed: number;
  /** Tyre and runner positions. */
  x: number;
  z: number;
  rx: number;
  rz: number;
}

export interface PedEvent {
  type: 'bump' | 'startCross' | 'hesitate';
  ped: number;
  racer: number;
}

export function createPedestrians(track: Track, placements: readonly PedestrianPlacement[], rng: Rng): Pedestrian[] {
  const out: Pedestrian[] = [];
  placements.forEach((pl, ci) => {
    if (pl.kind !== 'crossing') return;
    const s = pl.at * track.length;
    const hw = track.pointAt(s).halfWidth;
    const kerb = hw + P.kerbOffset;
    for (let k = 0; k < pl.count; k++) {
      const side = k % 2 === 0 ? pl.side : -pl.side;
      const ps = s + (k - (pl.count - 1) / 2) * 1.4;
      const ped: Pedestrian = {
        id: out.length, crossing: ci, child: rng.chance(0.4), state: 'wait', timer: rng.range(P.firstDelay[0], P.firstDelay[1]) + k * 3,
        stateTime: 0, s: ps, d: side * kerb, fromD: side * kerb, toD: -side * kerb, x: 0, z: 0, heading: 0, speed: 0,
        distracted: false, bumpCooldown: 0, lookDir: 0,
      };
      place(track, ped);
      out.push(ped);
    }
  });
  return out;
}

function place(track: Track, p: Pedestrian): void {
  const pt = track.pointAt(p.s);
  p.x = pt.x + pt.nx * p.d;
  p.z = pt.z + pt.nz * p.d;
}

function setState(p: Pedestrian, s: PedState, timer = 0): void {
  p.state = s;
  p.stateTime = 0;
  p.timer = timer;
}

/** True while the person is (partly) on the carriageway. */
export function onRoad(track: Track, p: Pedestrian): boolean {
  return Math.abs(p.d) < track.pointAt(p.s).halfWidth + 0.2;
}

/** Earliest time (s) any racer reaches this person's spot along the track, in a lane near them. */
function threat(track: Track, p: Pedestrian, racers: readonly PedRacer[], laneWidth: number): number {
  let best = Infinity;
  for (const r of racers) {
    const ahead = mod(p.s - r.s, track.length);
    if (ahead > P.lookDistance || ahead < -1) continue;
    if (Math.abs(r.d - p.d) > laneWidth) continue;
    best = Math.min(best, ahead / Math.max(1, r.speed));
  }
  return best;
}

export function updatePedestrians(track: Track, peds: Pedestrian[], racers: readonly PedRacer[], dt: number, rng: Rng, out: PedEvent[] = []): PedEvent[] {
  out.length = 0;
  for (const p of peds) {
    p.stateTime += dt;
    p.bumpCooldown = Math.max(0, p.bumpCooldown - dt);
    const hw = track.pointAt(p.s).halfWidth;
    const walk = p.child ? P.childWalkSpeed : P.walkSpeed;
    let move = 0;
    switch (p.state) {
      case 'wait':
        p.speed = 0;
        p.timer -= dt;
        if (p.timer <= 0) {
          // Only one person on the road per crossing.
          const busy = peds.some((o) => o !== p && o.crossing === p.crossing && (o.state === 'cross' || o.state === 'dodge'));
          if (busy) { p.timer = 1.5; break; }
          p.distracted = rng.chance(P.distractedChance);
          setState(p, 'look', rng.range(0.6, 1.2));
        }
        break;
      case 'look': {
        p.speed = 0;
        p.lookDir = Math.sin(p.stateTime * 3.2);
        p.timer -= dt;
        if (p.timer > 0) break;
        // Whole road width counts: they're about to walk across all of it.
        const t = threat(track, p, racers, hw * 2 + 1);
        // Even a distracted villager never steps out in front of a racer who can't react.
        const safe = p.distracted ? t > P.minReactionTime : t > P.safeGap;
        if (safe) {
          setState(p, 'cross');
          out.push({ type: 'startCross', ped: p.id, racer: -1 });
        } else if (p.stateTime > P.maxHesitate) {
          setState(p, 'wait', rng.range(P.retryDelay[0], P.retryDelay[1]));
        } else {
          p.timer = 0.4;
          if (p.stateTime < 0.5) out.push({ type: 'hesitate', ped: p.id, racer: -1 });
        }
        break;
      }
      case 'cross': {
        move = walk;
        const progress = Math.abs(p.d - p.fromD) / Math.max(0.1, Math.abs(p.toD - p.fromD));
        // A racer about to arrive in their path: hurry on if past halfway, otherwise step back.
        if (threat(track, p, racers, P.dodgeLane) < P.dodgeTime) {
          if (progress < 0.5) { const f = p.fromD; p.fromD = p.toD; p.toD = f; }
          setState(p, 'dodge');
        }
        break;
      }
      case 'dodge':
        move = P.dodgeSpeed;
        break;
      case 'startled':
        p.speed = 0;
        if (p.stateTime > P.startledTime) {
          // Head for the nearest kerb.
          const kerb = hw + P.kerbOffset;
          p.fromD = -Math.sign(p.d || 1) * kerb;
          p.toD = Math.sign(p.d || 1) * kerb;
          setState(p, 'dodge');
        }
        break;
      case 'arrive':
        p.speed = 0;
        p.timer -= dt;
        if (p.timer <= 0) {
          // Turn round: next time they cross back.
          const f = p.fromD; p.fromD = p.toD; p.toD = f;
          setState(p, 'wait', rng.range(P.retryDelay[0], P.retryDelay[1]) + 4);
        }
        break;
    }
    if (move > 0) {
      const dir = Math.sign(p.toD - p.d);
      const step = move * dt;
      p.speed = move;
      if (Math.abs(p.toD - p.d) <= step || p.stateTime > P.maxOnRoad) {
        // Arrived (or taking too long — never stuck on the road).
        p.d = p.toD;
        setState(p, 'arrive', rng.range(2, 5));
      } else {
        p.d += dir * step;
      }
    }
    place(track, p);
    // Face the direction of travel (across the road) or the road while waiting.
    const pt = track.pointAt(p.s);
    const across = Math.atan2(pt.nx, pt.nz); // heading of +d
    const facing = p.state === 'cross' || p.state === 'dodge'
      ? (p.toD > p.d ? across : across + Math.PI)
      : (p.d > 0 ? across + Math.PI : across) + (p.state === 'look' ? p.lookDir * 0.9 : 0);
    p.heading = facing;
  }

  // Bumps: brushing a person with the tyre or the runner.
  for (const p of peds) {
    if (p.bumpCooldown > 0 || !onRoad(track, p)) continue;
    racers.forEach((r, i) => {
      if (p.bumpCooldown > 0) return;
      const hitT = (r.x - p.x) ** 2 + (r.z - p.z) ** 2 < P.hitRadius ** 2;
      const hitR = (r.rx - p.x) ** 2 + (r.rz - p.z) ** 2 < P.hitRadius ** 2;
      if (!hitT && !hitR) return;
      p.bumpCooldown = P.bumpCooldown;
      setState(p, 'startled');
      // Cartoon hop out of the way, sideways along the road.
      const pt = track.pointAt(p.s);
      const away = Math.sign((p.x - r.x) * pt.tx + (p.z - r.z) * pt.tz) || 1;
      p.s += away * 0.6;
      place(track, p);
      out.push({ type: 'bump', ped: p.id, racer: i });
    });
  }
  return out;
}
