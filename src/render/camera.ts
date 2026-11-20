import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math';
import type { Terrain } from './environment';
import type { Footprint } from './props';

export type CameraDistance = 'near' | 'normal' | 'far';
const DIST: Record<CameraDistance, { d: number; h: number }> = {
  near: { d: 4.0, h: 2.1 },
  normal: { d: 5.2, h: 2.7 },
  far: { d: 7.0, h: 3.5 },
};

export interface CameraTarget {
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Track tangent heading ahead — blended in so the road ahead stays in view. */
  roadHeading: number;
}

/** Smooth third-person chase camera with gentle look-ahead and obstacle avoidance. */
export class ChaseCamera {
  readonly camera: PerspectiveCameraExt;
  distance: CameraDistance = 'normal';
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private fov = 62;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 2600) as PerspectiveCameraExt;
  }

  snap(t: CameraTarget, terrain?: Terrain): void {
    this.yaw = t.heading;
    this.computeDesired(t, this.pos, this.look);
    if (terrain) this.pos.y = Math.max(this.pos.y, terrain.heightAt(this.pos.x, this.pos.z) + 0.8);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  private computeDesired(t: CameraTarget, pos: THREE.Vector3, look: THREE.Vector3): void {
    const cfg = DIST[this.distance];
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const d = cfg.d + Math.min(1.2, t.speed * 0.06);
    // Sit slightly to the tyre's side (right of the runner) so the tyre and its painted
    // sidewall stay visible instead of hiding edge-on behind the runner.
    const side = 0.75;
    const rx = -fz, rz = fx; // right vector
    pos.set(t.x - fx * d + rx * side, cfg.h, t.z - fz * d + rz * side);
    const ahead = 3 + t.speed * 0.25;
    look.set(t.x + fx * ahead, 0.6, t.z + fz * ahead);
  }

  update(dt: number, t: CameraTarget, terrain: Terrain, colliders: Footprint[]): void {
    // Follow mostly the racer's heading, nudged toward the road direction.
    const blend = t.heading + clamp(Math.atan2(Math.sin(t.roadHeading - t.heading), Math.cos(t.roadHeading - t.heading)), -0.5, 0.5) * 0.25;
    this.yaw = dampAngle(this.yaw, blend, 3.2, dt);
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();
    this.computeDesired(t, desired, look);

    // Obstacle avoidance: pull the camera in if a building/tree sits between it and the racer.
    const ox = t.x, oz = t.z;
    let pull = 1;
    for (const c of colliders) {
      const dx = desired.x - ox, dz = desired.z - oz;
      const len2 = dx * dx + dz * dz;
      if ((c.x - ox) ** 2 + (c.z - oz) ** 2 > len2 + (c.r + 2) ** 2) continue;
      const u = clamp(((c.x - ox) * dx + (c.z - oz) * dz) / len2, 0, 1);
      const px = ox + dx * u, pz = oz + dz * u;
      if ((px - c.x) ** 2 + (pz - c.z) ** 2 < (c.r + 0.4) ** 2) pull = Math.min(pull, Math.max(0.35, u - 0.1));
    }
    desired.x = ox + (desired.x - ox) * pull;
    desired.z = oz + (desired.z - oz) * pull;
    const ground = terrain.heightAt(desired.x, desired.z) + 0.9;
    if (desired.y < ground) desired.y = ground;

    this.pos.x = damp(this.pos.x, desired.x, 6, dt);
    this.pos.y = damp(this.pos.y, desired.y, 4, dt);
    this.pos.z = damp(this.pos.z, desired.z, 6, dt);
    this.look.x = damp(this.look.x, look.x, 10, dt);
    this.look.y = damp(this.look.y, look.y, 6, dt);
    this.look.z = damp(this.look.z, look.z, 10, dt);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    const fovTarget = 62 + Math.min(10, t.speed * 0.7);
    this.fov = damp(this.fov, fovTarget, 3, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Slow cinematic orbit (menus, results). */
  orbit(time: number, cx: number, cz: number, radius: number, height: number, lookY = 1): void {
    const a = time * 0.06;
    this.camera.position.set(cx + Math.cos(a) * radius, height, cz + Math.sin(a) * radius);
    this.camera.lookAt(cx, lookY, cz);
    if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
  }
}

type PerspectiveCameraExt = THREE.PerspectiveCamera;
