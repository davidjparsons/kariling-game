import { DOG } from '../config/hazards';
import { wrapAngle } from '../core/math';
import type { DogPlacement } from './hazards';
import type { Track } from './track';

export type DogState = 'idle' | 'alert' | 'chase' | 'return' | 'cooldown';

export interface Dog {
  id: number;
  homeX: number;
  homeZ: number;
  /** Faces the road when resting. */
  homeHeading: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: DogState;
  /** Seconds in the current state. */
  timer: number;
  /** Index of the racer being chased, or -1. */
  target: number;
  /** Idle sub-pose seed: 0 = lying, 1 = sitting, 2 = wandering. */
  pose: number;
  /** Time until the next warning bark while chasing. */
  barkTimer: number;
}

/** What a dog needs to know about each racer. */
export interface DogTarget {
  x: number;
  z: number;
  /** Runner position (the dog goes for the runner's heels). */
  rx: number;
  rz: number;
  /** Protected from being caught (recent stun/respawn). */
  protectedFor: number;
  /** Out of control / respawning — not a valid target. */
  busy: boolean;
  /** Seconds since this racer was last bitten by any dog (Infinity = never). */
  sinceBitten?: number;
}

/** Road awareness for chasing dogs: stay between the fences and go round raised obstacles. */
export interface DogNav {
  /** True if a dog can't run through this point (log, ramp, mound, canal…). */
  blocked(x: number, z: number): boolean;
  /** Pull a point back inside the fences. */
  clamp(x: number, z: number): [number, number];
}

export interface DogEvent {
  /** bark = first warning, growl = still chasing (repeat warning). */
  type: 'bark' | 'growl' | 'catch' | 'giveUp';
  dog: number;
  racer: number;
}

export function createDogs(track: Track, placements: readonly DogPlacement[]): Dog[] {
  return placements.map((p, id) => {
    const s = p.at * track.length;
    const pt = track.pointAt(s);
    const off = p.side * (pt.halfWidth + p.offset);
    const x = pt.x + pt.nx * off, z = pt.z + pt.nz * off;
    const toRoad = Math.atan2(pt.x - x, pt.z - z);
    return {
      id, homeX: x, homeZ: z, homeHeading: toRoad, x, z, heading: toRoad, speed: 0,
      state: 'idle', timer: id * 1.7, target: -1, pose: id % 3, barkTimer: 0,
    };
  });
}

const AVOID = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8];

function moveToward(dog: Dog, tx: number, tz: number, speed: number, dt: number, nav?: DogNav): number {
  const dx = tx - dog.x, dz = tz - dog.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 1e-4) {
    const step = Math.min(dist, speed * dt);
    let ux = dx / dist, uz = dz / dist;
    if (nav) {
      // Look a little ahead; swerve round obstacles instead of running through them.
      const look = Math.max(0.6, step * 6);
      for (const a of AVOID) {
        const c = Math.cos(a), s = Math.sin(a);
        const vx = ux * c + uz * s, vz = -ux * s + uz * c;
        if (!nav.blocked(dog.x + vx * look, dog.z + vz * look)) { ux = vx; uz = vz; break; }
      }
    }
    dog.x += ux * step;
    dog.z += uz * step;
    if (nav) [dog.x, dog.z] = nav.clamp(dog.x, dog.z);
    const want = Math.atan2(ux, uz);
    dog.heading += wrapAngle(want - dog.heading) * (1 - Math.exp(-12 * dt));
    dog.speed = step / dt;
  } else {
    dog.speed = 0;
  }
  return dist;
}

/**
 * Deterministic dog behaviour. Dogs only notice racers close to their spot, bark a warning
 * first, chase briefly, and always head home afterwards with a cooldown — so a racer can
 * outrun them, avoid them, or at worst be caught once.
 */
export function updateDogs(dogs: Dog[], racers: readonly DogTarget[], dt: number, out: DogEvent[] = [], nav?: DogNav): DogEvent[] {
  const fair = (r: DogTarget) => !r.busy && (r.sinceBitten ?? Infinity) >= DOG.rebiteGrace;
  out.length = 0;
  for (const dog of dogs) {
    dog.timer += dt;
    switch (dog.state) {
      case 'idle': {
        // Gentle wander around the home spot (wanderers only).
        if (dog.pose === 2) {
          const a = dog.timer * 0.35 + dog.id;
          moveToward(dog, dog.homeX + Math.cos(a) * DOG.wanderRadius, dog.homeZ + Math.sin(a * 1.3) * DOG.wanderRadius * 0.6, 1.1, dt);
        } else {
          dog.speed = 0;
          dog.heading += wrapAngle(dog.homeHeading - dog.heading) * (1 - Math.exp(-2 * dt));
        }
        let best = -1;
        let bestD: number = DOG.triggerRadius;
        racers.forEach((r, i) => {
          if (!fair(r)) return;
          const d = Math.hypot(r.x - dog.x, r.z - dog.z);
          if (d < bestD) { bestD = d; best = i; }
        });
        if (best >= 0) {
          dog.state = 'alert';
          dog.timer = 0;
          dog.target = best;
          out.push({ type: 'bark', dog: dog.id, racer: best });
        }
        break;
      }
      case 'alert': {
        dog.speed = 0;
        const t = racers[dog.target];
        dog.heading += wrapAngle(Math.atan2(t.rx - dog.x, t.rz - dog.z) - dog.heading) * (1 - Math.exp(-10 * dt));
        if (dog.timer >= DOG.alertTime) { dog.state = 'chase'; dog.timer = 0; dog.barkTimer = DOG.barkEvery; }
        break;
      }
      case 'chase': {
        const t = racers[dog.target];
        // A sprint that tires: slow racers get run down, fast ones pull away.
        const k = Math.min(1, dog.timer / DOG.maxChaseTime);
        const speed = DOG.chaseSpeed + (DOG.chaseSpeedEnd - DOG.chaseSpeed) * k;
        const dist = moveToward(dog, t.rx, t.rz, speed, dt, nav);
        const fromHome = Math.hypot(dog.x - dog.homeX, dog.z - dog.homeZ);
        dog.barkTimer -= dt;
        if (dist < DOG.catchDistance) {
          if (t.protectedFor <= 0 && fair(t)) out.push({ type: 'catch', dog: dog.id, racer: dog.target });
          dog.state = 'return';
          dog.timer = 0;
        } else if (dog.timer > DOG.maxChaseTime || fromHome > DOG.leash || !fair(t)) {
          dog.state = 'return';
          dog.timer = 0;
          out.push({ type: 'giveUp', dog: dog.id, racer: dog.target });
        } else if (dog.barkTimer <= 0) {
          dog.barkTimer = DOG.barkEvery;
          out.push({ type: 'growl', dog: dog.id, racer: dog.target });
        }
        break;
      }
      case 'return': {
        const dist = moveToward(dog, dog.homeX, dog.homeZ, DOG.returnSpeed, dt, nav);
        if (dist < 0.2) { dog.state = 'cooldown'; dog.timer = 0; dog.target = -1; }
        break;
      }
      case 'cooldown': {
        dog.speed = 0;
        dog.heading += wrapAngle(dog.homeHeading - dog.heading) * (1 - Math.exp(-2 * dt));
        if (dog.timer >= DOG.cooldown) { dog.state = 'idle'; dog.timer = 0; }
        break;
      }
    }
  }
  return out;
}
