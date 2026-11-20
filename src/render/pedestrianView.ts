import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { Pedestrian } from '../sim/pedestrians';
import type { PedestrianPlacement, Track } from '../sim/track';
import { randomLook, Villager, type VillagerMode } from './villager';

const MODE: Record<Pedestrian['state'], VillagerMode> = {
  wait: 'idle', look: 'look', cross: 'walk', arrive: 'idle', dodge: 'run', startled: 'startled',
};

interface Bystander { v: Villager; x: number; z: number; heading: number; chat: boolean }

/**
 * Villagers: the simulated road-crossers plus scenery groups chatting outside homes and stores
 * (behind the fence, so they never affect racing). One skinned draw call per person.
 */
export class PedestrianViews {
  readonly group = new THREE.Group();
  private crossers: Villager[] = [];
  private modeTime: number[] = [];
  private lastState: string[] = [];
  private bystanders: Bystander[] = [];

  constructor(track: Track, peds: readonly Pedestrian[], placements: readonly PedestrianPlacement[], groupScale: number, seed = 21) {
    const rng = new Rng(seed);
    for (const p of peds) {
      const v = new Villager(randomLook(rng, !p.child));
      this.crossers.push(v);
      this.modeTime.push(0);
      this.lastState.push('');
      this.group.add(v.root);
    }
    // Chatting groups just beyond the fence.
    for (const pl of placements) {
      if (pl.kind !== 'group') continue;
      const n = Math.max(1, Math.round(pl.count * groupScale));
      const s = pl.at * track.length;
      const pt = track.pointAt(s);
      const off = pl.side * (pt.halfWidth + track.def.vergeWidth + 1.1);
      const cx = pt.x + pt.nx * off, cz = pt.z + pt.nz * off;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const r = n === 1 ? 0 : 0.55;
        const x = cx + pt.tx * Math.cos(a) * r + pt.nx * pl.side * Math.sin(a) * r * 0.6;
        const z = cz + pt.tz * Math.cos(a) * r + pt.nz * pl.side * Math.sin(a) * r * 0.6;
        const v = new Villager(randomLook(rng));
        v.mesh.castShadow = false; // scenery only: skip the shadow pass on phones
        // Face the middle of the group, turned a little towards the road.
        const heading = Math.atan2(cx - x, cz - z) * 0.6 + Math.atan2(-pt.nx * pl.side, -pt.nz * pl.side) * 0.4;
        v.root.position.set(x, 0, z);
        v.root.rotation.y = n === 1 ? Math.atan2(-pt.nx * pl.side, -pt.nz * pl.side) : heading;
        this.group.add(v.root);
        this.bystanders.push({ v, x, z, heading: v.root.rotation.y, chat: rng.chance(0.6) });
      }
    }
  }

  /** `racers` are tyre positions, so bystanders can cheer as the race passes. */
  update(dt: number, peds: readonly Pedestrian[], racers: readonly { x: number; z: number }[]): void {
    peds.forEach((p, i) => {
      const v = this.crossers[i];
      if (p.state !== this.lastState[i]) { this.lastState[i] = p.state; this.modeTime[i] = 0; }
      this.modeTime[i] += dt;
      v.root.position.set(p.x, 0, p.z);
      // Smooth turning.
      const cur = v.root.rotation.y;
      const d = Math.atan2(Math.sin(p.heading - cur), Math.cos(p.heading - cur));
      v.root.rotation.y = cur + d * Math.min(1, dt * 10);
      v.update(dt, MODE[p.state], p.speed, this.modeTime[i]);
    });
    for (const b of this.bystanders) {
      const near = racers.some((r) => (r.x - b.x) ** 2 + (r.z - b.z) ** 2 < 100);
      b.v.update(dt, near ? 'cheer' : b.chat ? 'chat' : 'idle', 0);
    }
  }

  dispose(): void {
    for (const v of [...this.crossers, ...this.bystanders.map((b) => b.v)]) v.dispose();
  }
}
