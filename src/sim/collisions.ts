import { PHYSICS } from '../config/gameplay';
import { clamp } from '../core/math';
import { addImpact, EV_BUMP, type PhysicsContext, type RacerPhysicsState } from './physics';

/** Minimal view of a racer for collision purposes. */
export interface CollisionRacer {
  phys: RacerPhysicsState;
  ctx: PhysicsContext;
  events: number;
  bumpImpact: number;
}

const RUNNER_MASS = 1.6;

/** A tyre more than this high is flying over other racers. */
const FLY_OVER = 0.45;

function tyreVel(p: RacerPhysicsState): [number, number] {
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  return [fx * p.speed - fz * p.latVel, fz * p.speed + fx * p.latVel];
}

/** Apply a velocity change (world XZ) to a tyre, splitting it into forward speed and side slide. */
function applyTyreDv(p: RacerPhysicsState, dvx: number, dvz: number): void {
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const rx = -fz, rz = fx;
  p.speed = Math.max(0, p.speed + dvx * fx + dvz * fz);
  p.latVel = clamp(p.latVel + dvx * rx + dvz * rz, -3.5, 3.5);
}

/** How side-on a contact normal is relative to the tyre's heading (0 = head/tail, 1 = side). */
export function sideness(p: RacerPhysicsState, nx: number, nz: number): number {
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  return Math.abs(-fz * nx + fx * nz);
}

function instabilityFor(rel: number, side: number, share: number): number {
  return rel * PHYSICS.collisionInstabilityGain * (1 + (PHYSICS.collisionSideMul - 1) * side) * share * 2;
}

function hit(r: CollisionRacer, impact: number): void {
  if (impact > 0.6) {
    r.events |= EV_BUMP;
    r.bumpImpact = Math.max(r.bumpImpact, impact);
  }
}

/** Tyre ↔ tyre: separate, exchange momentum (mass-weighted), side hits wobble more. */
export function collideTyres(a: CollisionRacer, b: CollisionRacer): boolean {
  const pa = a.phys, pb = b.phys;
  if (Math.abs(pa.y - pb.y) > FLY_OVER) return false;
  const R = PHYSICS.tyreRadius * 2;
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return false;
  const d = Math.sqrt(d2) || 1e-3;
  const nx = d2 === 0 ? 1 : dx / d, nz = d2 === 0 ? 0 : dz / d;
  const ma = a.ctx.tyre.mass, mb = b.ctx.tyre.mass;
  const wa = mb / (ma + mb), wb = ma / (ma + mb);
  const overlap = R - d;
  pa.x -= nx * overlap * wa; pa.z -= nz * overlap * wa;
  pb.x += nx * overlap * wb; pb.z += nz * overlap * wb;
  const [vax, vaz] = tyreVel(pa), [vbx, vbz] = tyreVel(pb);
  const rel = (vax - vbx) * nx + (vaz - vbz) * nz; // > 0 closing
  if (rel <= 0) return true;
  const j = Math.min(PHYSICS.maxCollisionImpulse, ((1 + PHYSICS.restitution) * rel) / (1 / ma + 1 / mb));
  applyTyreDv(pa, (-j / ma) * nx, (-j / ma) * nz);
  applyTyreDv(pb, (j / mb) * nx, (j / mb) * nz);
  a.events |= addImpact(pa, instabilityFor(rel, sideness(pa, nx, nz), wa), a.ctx);
  b.events |= addImpact(pb, instabilityFor(rel, sideness(pb, nx, nz), wb), b.ctx);
  hit(a, rel); hit(b, rel);
  return true;
}

/** Tyre (of a) ↔ runner (of b): the tyre deflects, the runner gets shoved off their line. */
export function collideTyreRunner(a: CollisionRacer, b: CollisionRacer): boolean {
  const pa = a.phys, pb = b.phys;
  if (pa.y > FLY_OVER) return false;
  const R = PHYSICS.tyreRadius + PHYSICS.runnerRadius;
  const dx = pb.rx - pa.x, dz = pb.rz - pa.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return false;
  const d = Math.sqrt(d2) || 1e-3;
  const nx = d2 === 0 ? 1 : dx / d, nz = d2 === 0 ? 0 : dz / d;
  const ma = a.ctx.tyre.mass, mb = RUNNER_MASS;
  const wa = mb / (ma + mb), wb = ma / (ma + mb);
  const overlap = R - d;
  pa.x -= nx * overlap * wa; pa.z -= nz * overlap * wa;
  pb.rx += nx * overlap * wb; pb.rz += nz * overlap * wb;
  const [vax, vaz] = tyreVel(pa);
  const rel = vax * nx + vaz * nz - pb.rSpeed * (Math.sin(pb.rHeading) * nx + Math.cos(pb.rHeading) * nz);
  if (rel <= 0) return true;
  const j = Math.min(PHYSICS.maxCollisionImpulse, ((1 + PHYSICS.restitution) * rel) / (1 / ma + 1 / mb));
  applyTyreDv(pa, (-j / ma) * nx, (-j / ma) * nz);
  // Shove the runner a little further; their own tyre feels it through the stick.
  pb.rx += nx * Math.min(0.35, j * 0.05); pb.rz += nz * Math.min(0.35, j * 0.05);
  a.events |= addImpact(pa, instabilityFor(rel, sideness(pa, nx, nz), wa), a.ctx);
  b.events |= addImpact(pb, instabilityFor(rel, 0.5, wb) * 0.6, b.ctx);
  hit(a, rel); hit(b, rel * 0.7);
  return true;
}

/** Runner ↔ runner: push apart; a strong barge knocks the stick (small instability). */
export function collideRunners(a: CollisionRacer, b: CollisionRacer): boolean {
  const pa = a.phys, pb = b.phys;
  const R = PHYSICS.runnerRadius * 2;
  const dx = pb.rx - pa.rx, dz = pb.rz - pa.rz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return false;
  const d = Math.sqrt(d2) || 1e-3;
  const nx = d2 === 0 ? 1 : dx / d, nz = d2 === 0 ? 0 : dz / d;
  const overlap = R - d;
  pa.rx -= nx * overlap * 0.5; pa.rz -= nz * overlap * 0.5;
  pb.rx += nx * overlap * 0.5; pb.rz += nz * overlap * 0.5;
  const va = pa.rSpeed * (Math.sin(pa.rHeading) * nx + Math.cos(pa.rHeading) * nz);
  const vb = pb.rSpeed * (Math.sin(pb.rHeading) * nx + Math.cos(pb.rHeading) * nz);
  const rel = va - vb;
  if (rel <= 0.5) return true;
  a.events |= addImpact(pa, rel * 0.03, a.ctx);
  b.events |= addImpact(pb, rel * 0.03, b.ctx);
  // The barging runner loses a little speed.
  pa.speed *= 1 - Math.min(0.1, rel * 0.015);
  hit(a, rel * 0.5); hit(b, rel * 0.5);
  return true;
}

/** Stick of a (runner → tyre segment) sweeping into b's tyre: a light knock for both. */
export function collideStickTyre(a: CollisionRacer, b: CollisionRacer): boolean {
  const pa = a.phys, pb = b.phys;
  if (pa.control === 'lost' || pb.y > FLY_OVER) return false;
  const ax = pa.rx, az = pa.rz, ex = pa.x - pa.rx, ez = pa.z - pa.rz;
  const len2 = ex * ex + ez * ez;
  if (len2 < 1e-4) return false;
  const t = clamp(((pb.x - ax) * ex + (pb.z - az) * ez) / len2, 0.25, 0.85);
  const px = ax + ex * t, pz = az + ez * t;
  const dx = pb.x - px, dz = pb.z - pz;
  const R = PHYSICS.tyreRadius * 0.7;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return false;
  const d = Math.sqrt(d2) || 1e-3;
  const nx = dx / d, nz = dz / d;
  pb.x += nx * (R - d); pb.z += nz * (R - d);
  applyTyreDv(pb, nx * 0.4, nz * 0.4);
  a.events |= addImpact(pa, 0.04, a.ctx);
  b.events |= addImpact(pb, 0.06, b.ctx);
  return true;
}

/** Resolve all pairwise racer collisions for one tick. Two iterations to settle stacks. */
export function resolveRacerCollisions(racers: readonly CollisionRacer[]): number {
  let contacts = 0;
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        const a = racers[i], b = racers[j];
        if (collideTyres(a, b)) contacts++;
        if (collideTyreRunner(a, b)) contacts++;
        if (collideTyreRunner(b, a)) contacts++;
        if (collideRunners(a, b)) contacts++;
        if (iter === 0) {
          if (collideStickTyre(a, b)) contacts++;
          if (collideStickTyre(b, a)) contacts++;
        }
      }
    }
  }
  return contacts;
}
