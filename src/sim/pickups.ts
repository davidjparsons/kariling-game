import { ITEM_RULES } from '../config/items';
import type { PickupRow } from './track';
import type { Track } from './track';

/** A floating power-up box on the road. Collected boxes respawn after a delay. */
export interface Pickup {
  id: number;
  x: number;
  z: number;
  s: number;
  d: number;
  /** Seconds until it reappears (0 = available). */
  respawn: number;
}

export function createPickups(track: Track, rows: readonly PickupRow[]): Pickup[] {
  const out: Pickup[] = [];
  for (const row of rows) {
    const s = row.at * track.length;
    const pt = track.pointAt(s);
    for (const d of row.d) out.push({ id: out.length, x: pt.x + pt.nx * d, z: pt.z + pt.nz * d, s, d, respawn: 0 });
  }
  return out;
}

export function tickPickups(pickups: Pickup[], dt: number): void {
  for (const p of pickups) if (p.respawn > 0) p.respawn = Math.max(0, p.respawn - dt);
}

/**
 * The available pickup a tyre at (x, y, z) touches, or null. A tyre high in the air passes
 * under/over it.
 */
export function touchedPickup(pickups: readonly Pickup[], x: number, y: number, z: number): Pickup | null {
  if (y > 0.9) return null;
  const r2 = ITEM_RULES.collectRadius * ITEM_RULES.collectRadius;
  for (const p of pickups) {
    if (p.respawn > 0) continue;
    if ((p.x - x) ** 2 + (p.z - z) ** 2 <= r2) return p;
  }
  return null;
}

export function collectPickup(p: Pickup): void {
  p.respawn = ITEM_RULES.respawnTime;
}
