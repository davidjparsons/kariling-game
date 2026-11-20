import { ITEM_RULES, PROJECTILES, type ProjectileId } from '../config/items';
import { SURFACES } from '../config/surfaces';
import { clamp } from '../core/math';
import { addImpact, type RacerPhysicsState } from './physics';
import type { RaceRacer, RaceSession } from './race';

export interface ItemProjectile {
  id: number;
  kind: ProjectileId;
  owner: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  roll: number;
  grounded: boolean;
  hint: number;
}

export interface ProjectileHit {
  projectile: ItemProjectile;
  target: RaceRacer;
}

export function launchProjectile(id: number, kind: ProjectileId, owner: RaceRacer, backward: boolean): ItemProjectile {
  const { phys: p, order, hint } = owner;
  const cfg = PROJECTILES[kind];
  const back = cfg.direction === 'backward' || (cfg.direction === 'both' && backward);
  const heading = p.heading + (back ? Math.PI : 0);
  const fx = Math.sin(heading), fz = Math.cos(heading);
  const speed = back ? cfg.backwardSpeed : cfg.forwardSpeed + p.speed * 0.85;
  const offset = kind === 'saging'
    ? owner.ctx.runner.followBack + cfg.radius + 0.35
    : owner.ctx.tyre.radius + cfg.radius + 0.12;
  const height = back ? cfg.backwardLaunch?.height ?? cfg.launchHeight : cfg.launchHeight;
  const up = back ? cfg.backwardLaunch?.up ?? cfg.launchUp : cfg.launchUp;
  return {
    id, kind, owner: order, life: cfg.lifetime, heading, roll: 0, hint,
    x: p.x + fx * offset, y: p.y + Math.max(cfg.radius, height), z: p.z + fz * offset,
    vx: fx * speed, vz: fz * speed, vy: up, grounded: false,
  };
}

/** Approximate time to closest approach for warnings and steering, using current trajectories. */
export function projectileThreatTime(shot: ItemProjectile, p: RacerPhysicsState, horizon: number): number | null {
  if (shot.y > p.y + 1.25) return null;
  const dx = shot.x - p.x, dz = shot.z - p.z;
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const vx = shot.vx - fx * p.speed + fz * p.latVel;
  const vz = shot.vz - fz * p.speed - fx * p.latVel;
  const t = -(dx * vx + dz * vz) / Math.max(0.01, vx * vx + vz * vz);
  return t >= 0.08 && t <= Math.min(horizon, shot.life) && Math.hypot(dx + vx * t, dz + vz * t) <= 1.15 ? t : null;
}

/** Advance in short segments so a fast shot cannot skip a narrow tyre or road obstacle. */
export function advanceProjectile(shot: ItemProjectile, race: RaceSession, dt: number): boolean {
  shot.life -= dt;
  if (shot.life <= 0) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(shot.vx, shot.vz, shot.vy) * dt / 0.12));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    if (!moveProjectile(shot, race, step)) return false;
    for (const r of race.racers) {
      if (r.order === shot.owner || r.progress.finished || r.phys.control === 'lost' ||
          r.phys.invuln > 0 || r.phys.itemHitProtection > 0) continue;
      if (hitTyre(shot, r)) {
        race.projectileHits.push({ projectile: shot, target: r });
        return false;
      }
    }
  }
  return true;
}

function moveProjectile(shot: ItemProjectile, race: RaceSession, dt: number): boolean {
  const cfg = PROJECTILES[shot.kind];
  const x = shot.x + shot.vx * dt, z = shot.z + shot.vz * dt;
  const proj = race.track.project(x, z, shot.hint);
  shot.hint = proj.index;
  const ground = race.groundAt(proj);
  const floor = ground.h + cfg.radius;
  const distance = Math.hypot(shot.vx, shot.vz) * dt;
  if (Math.abs(proj.d) > race.track.barrierOffset(proj) - cfg.radius) {
    if (shot.kind !== 'buko') return shot.kind === 'saging' && shot.grounded;
    const { nx, nz } = race.track.pointAt(proj.s);
    const vn = shot.vx * nx + shot.vz * nz;
    shot.vx = (shot.vx - vn * nx * 1.55) * 0.75;
    shot.vz = (shot.vz - vn * nz * 1.55) * 0.75;
    return true;
  }

  if (shot.grounded && Math.abs(floor - shot.y) <= 0.045 + distance * 0.65) {
    // Convert a smooth rise/fall into a change in rolling speed. On sharp drops preserve
    // the motion at the lip and let gravity carry the coconut onto the next surface.
    if (distance > 1e-5) {
      const rise = floor - shot.y;
      const speed = distance / dt;
      const next = Math.sqrt(Math.max(0, speed * speed - 2 * cfg.gravity * rise));
      shot.vx *= next / speed;
      shot.vz *= next / speed;
      shot.vy = rise / dt;
    }
    shot.y = floor;
  } else {
    shot.grounded = false;
    shot.vy -= cfg.gravity * dt;
    const y = shot.y + shot.vy * dt;
    if (y <= floor) {
      if (ground.canal || shot.kind === 'skyflakes') return false;
      if (floor - shot.y > 0.065 + distance * 0.65 && shot.kind === 'buko') {
        shot.vx *= -0.42;
        shot.vz *= -0.42;
        shot.vy = Math.max(0.65, Math.abs(shot.vy) * cfg.bounce);
        return true;
      }
      shot.y = floor;
      const bounce = Math.max(0, -shot.vy * cfg.bounce);
      shot.grounded = bounce < 0.45;
      shot.vy = shot.grounded ? 0 : bounce;
      shot.vx *= 0.86;
      shot.vz *= 0.86;
    } else shot.y = y;
  }
  if (ground.canal && shot.grounded) return false;
  const resistance = shot.grounded ? cfg.rolling * SURFACES[ground.surface].rollingResistance : cfg.airDrag;
  const keep = Math.exp(-resistance * dt);
  shot.vx *= keep;
  shot.vz *= keep;
  shot.x = x;
  shot.z = z;
  if (distance > 1e-5) {
    shot.heading = Math.atan2(shot.vx, shot.vz);
    shot.roll += distance / cfg.radius;
  }
  return true;
}

function hitTyre(shot: ItemProjectile, target: RaceRacer): boolean {
  const cfg = PROJECTILES[shot.kind];
  const { phys: p, ctx: { tyre } } = target;
  const dx = shot.x - p.x, dz = shot.z - p.z;
  const forward = Math.sin(p.heading) * dx + Math.cos(p.heading) * dz;
  const side = Math.cos(p.heading) * dx - Math.sin(p.heading) * dz;
  const vertical = shot.y - (p.y + tyre.radius);
  // The wheel presents a narrow tread head-on and a much wider profile from the side.
  const thickness = tyre.tube + cfg.radius;
  const radius = tyre.radius + cfg.radius;
  if ((side / thickness) ** 2 + (forward / radius) ** 2 + (vertical / radius) ** 2 > 1) return false;

  const vx = Math.sin(p.heading) * p.speed - Math.cos(p.heading) * p.latVel;
  const vz = Math.cos(p.heading) * p.speed + Math.sin(p.heading) * p.latVel;
  const closing = Math.hypot(shot.vx - vx, shot.vz - vz, shot.vy - p.vy);
  if (closing < 1.25) return false;
  const massFactor = Math.sqrt(1 / tyre.mass);
  const sideFactor = 1 + 0.3 * Math.min(1, Math.abs(side) / thickness);
  const impact = Math.min(cfg.maxImpact, (cfg.impactBase + cfg.impactPerSpeed * closing) * massFactor * sideFactor);
  p.speed *= 1 - clamp(cfg.speedLoss * closing * massFactor, 0.08, 0.52);
  p.itemHitProtection = ITEM_RULES.hitProtection;
  target.events |= addImpact(p, impact, target.ctx);
  return true;
}
