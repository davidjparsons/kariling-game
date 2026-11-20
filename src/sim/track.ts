import type { SurfaceId } from '../config/surfaces';
import { clamp, lerp, mod, wrapAngle } from '../core/math';
import type { CanalPlacement, DogPlacement, HazardPlacement } from './hazards';

export interface SurfaceRange {
  /** Start/end as fractions of lap length (0..1). May wrap (from > to). */
  from: number;
  to: number;
  surface: SurfaceId;
}

export interface WidthKey {
  at: number; // fraction 0..1
  halfWidth: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Medium–Hard' | 'Hard';
  description: string;
  /** Closed loop of control points (x, z) in metres, in racing order. */
  controlPoints: [number, number][];
  halfWidth: number;
  widthKeys?: WidthKey[];
  /** Grass run-off between road edge and barrier (m). */
  vergeWidth: number;
  defaultSurface: SurfaceId;
  offroadSurface: SurfaceId;
  surfaces: SurfaceRange[];
  checkpointCount: number;
  /** Fraction of the lap where the start/finish line sits. */
  startAt: number;
  /** Obstacles, potholes, mud, boosts and poo (positions relative to the start line). */
  hazards?: HazardPlacement[];
  /** Open drainage canals beside the road. */
  canals?: CanalPlacement[];
  /** Street-dog hangouts. */
  dogs?: DogPlacement[];
  /** Rows of power-up pickups: lap fraction + lateral offsets (m). */
  pickups?: PickupRow[];
  /** Pedestrian crossings and roadside groups. */
  pedestrians?: PedestrianPlacement[];
}

export interface PickupRow {
  at: number;
  d: number[];
}

/** A crossing point (people walk across the road) or a roadside group (people mill about). */
export interface PedestrianPlacement {
  kind: 'crossing' | 'group';
  at: number;
  /** Side of the road the group stands on / crossers start from. */
  side: -1 | 1;
  /** Number of people (adults and children). */
  count: number;
}

export interface TrackSample {
  x: number;
  z: number;
  /** Unit tangent. */
  tx: number;
  tz: number;
  /** Unit right-hand normal (in racing direction). */
  nx: number;
  nz: number;
  /** Arc length from start line. */
  s: number;
  halfWidth: number;
  surface: SurfaceId;
  /** Signed curvature (1/m). Negative = right-hand bend. */
  curvature: number;
  /** Heading angle of the tangent using the game convention (forward = (sin h, cos h)). */
  heading: number;
}

export interface TrackProjection {
  s: number;
  /** Signed lateral offset; positive = right of centreline. */
  d: number;
  index: number;
  halfWidth: number;
}

/** Centripetal Catmull–Rom point on segment p1→p2. */
function catmullRom(
  p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number,
): [number, number] {
  const alpha = 0.5;
  const tj = (a: [number, number], b: [number, number], ti: number) =>
    ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), alpha) + 1e-6;
  const t0 = 0;
  const t1 = tj(p0, p1, t0);
  const t2 = tj(p1, p2, t1);
  const t3 = tj(p2, p3, t2);
  const u = lerp(t1, t2, t);
  const mix = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
    const w = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

export function inRange(frac: number, r: { from: number; to: number }): boolean {
  if (r.from <= r.to) return frac >= r.from && frac < r.to;
  return frac >= r.from || frac < r.to;
}

/**
 * Pure (Three.js-free) track geometry used by physics, AI, lap validation and rendering.
 * The centreline is resampled at uniform spacing so lookups by arc length are O(1).
 */
export class Track {
  readonly def: TrackDefinition;
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly spacing: number;
  readonly checkpoints: number[] = [];
  readonly maxHalfWidth: number;

  constructor(def: TrackDefinition, spacing = 1) {
    this.def = def;
    const pts = def.controlPoints;
    const n = pts.length;
    // 1) Dense polyline from the spline.
    const dense: [number, number][] = [];
    const per = 48;
    for (let i = 0; i < n; i++) {
      const p0 = pts[mod(i - 1, n)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let k = 0; k < per; k++) dense.push(catmullRom(p0, p1, p2, p3, k / per));
    }
    const cum: number[] = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[dense.length];
    // 2) Uniform resample, starting at the start line.
    const count = Math.max(16, Math.round(total / spacing));
    this.spacing = total / count;
    this.length = total;
    const startOffset = def.startAt * total;
    let j = 0;
    const raw: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const target = mod(startOffset + i * this.spacing, total);
      // dense search (monotone except at wrap)
      if (target < cum[j]) j = 0;
      while (j < dense.length - 1 && cum[j + 1] < target) j++;
      const seg = cum[j + 1] - cum[j];
      const w = seg > 0 ? (target - cum[j]) / seg : 0;
      const a = dense[j], b = dense[(j + 1) % dense.length];
      raw.push([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]);
    }
    let maxHw = 0;
    for (let i = 0; i < count; i++) {
      const prev = raw[mod(i - 1, count)], next = raw[(i + 1) % count];
      let tx = next[0] - prev[0], tz = next[1] - prev[1];
      const len = Math.hypot(tx, tz) || 1;
      tx /= len; tz /= len;
      const frac = i / count;
      const hw = this.widthAt(frac);
      maxHw = Math.max(maxHw, hw);
      let surface = def.defaultSurface;
      for (const r of def.surfaces) if (inRange(frac, r)) surface = r.surface;
      this.samples.push({
        x: raw[i][0], z: raw[i][1], tx, tz, nx: -tz, nz: tx, s: i * this.spacing,
        halfWidth: hw, surface, curvature: 0, heading: Math.atan2(tx, tz),
      });
    }
    this.maxHalfWidth = maxHw;
    // 3) Curvature from heading change, lightly smoothed.
    const curv: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = this.samples[mod(i - 1, count)], b = this.samples[(i + 1) % count];
      curv.push(wrapAngle(b.heading - a.heading) / (2 * this.spacing));
    }
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) sum += curv[mod(i + k, count)];
      this.samples[i].curvature = sum / 7;
    }
    for (let c = 0; c < def.checkpointCount; c++) this.checkpoints.push((c / def.checkpointCount) * total);
  }

  private widthAt(frac: number): number {
    const keys = this.def.widthKeys;
    if (!keys || keys.length === 0) return this.def.halfWidth;
    const sorted = [...keys].sort((a, b) => a.at - b.at);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i], b = sorted[(i + 1) % sorted.length];
      const span = mod(b.at - a.at, 1) || 1;
      const off = mod(frac - a.at, 1);
      if (off <= span) {
        const t = off / span;
        const e = t * t * (3 - 2 * t);
        return lerp(a.halfWidth, b.halfWidth, e);
      }
    }
    return this.def.halfWidth;
  }

  get count(): number {
    return this.samples.length;
  }

  sampleAt(s: number): TrackSample {
    const i = Math.floor(mod(s, this.length) / this.spacing) % this.samples.length;
    return this.samples[i];
  }

  /** Interpolated centreline point + tangent at arc length s. */
  pointAt(s: number): { x: number; z: number; tx: number; tz: number; nx: number; nz: number; heading: number; halfWidth: number } {
    const ss = mod(s, this.length);
    const f = ss / this.spacing;
    const i = Math.floor(f) % this.samples.length;
    const a = this.samples[i], b = this.samples[(i + 1) % this.samples.length];
    const t = f - Math.floor(f);
    const tx = lerp(a.tx, b.tx, t), tz = lerp(a.tz, b.tz, t);
    const l = Math.hypot(tx, tz) || 1;
    return {
      x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), tx: tx / l, tz: tz / l, nx: -tz / l, nz: tx / l,
      heading: Math.atan2(tx, tz), halfWidth: lerp(a.halfWidth, b.halfWidth, t),
    };
  }

  /** Project a world point onto the centreline. `hint` (sample index) makes this O(window). */
  project(x: number, z: number, hint = -1): TrackProjection {
    const n = this.samples.length;
    let best = -1;
    let bestD2 = Infinity;
    const scan = (i0: number, i1: number) => {
      for (let k = i0; k <= i1; k++) {
        const i = mod(k, n);
        const p = this.samples[i];
        const dx = x - p.x, dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
    };
    if (hint >= 0) {
      scan(hint - 25, hint + 25);
      const limit = this.maxHalfWidth + this.def.vergeWidth + 6;
      if (bestD2 > limit * limit) { bestD2 = Infinity; scan(0, n - 1); }
    } else {
      scan(0, n - 1);
    }
    // Refine against neighbouring segments.
    let bs = this.samples[best].s;
    let bd = 0;
    let bestSeg = Infinity;
    for (const k of [best - 1, best]) {
      const a = this.samples[mod(k, n)], b = this.samples[mod(k + 1, n)];
      const ex = b.x - a.x, ez = b.z - a.z;
      const el2 = ex * ex + ez * ez || 1;
      const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / el2, 0, 1);
      const px = a.x + ex * t, pz = a.z + ez * t;
      const dist2 = (x - px) ** 2 + (z - pz) ** 2;
      if (dist2 < bestSeg) {
        bestSeg = dist2;
        bs = mod(a.s + t * this.spacing, this.length);
        const nx = lerp(a.nx, b.nx, t), nz = lerp(a.nz, b.nz, t);
        bd = (x - px) * nx + (z - pz) * nz;
      }
    }
    return { s: bs, d: bd, index: best, halfWidth: this.samples[best].halfWidth };
  }

  /** Surface under a point given its projection. */
  surfaceAt(proj: TrackProjection): SurfaceId {
    if (Math.abs(proj.d) <= proj.halfWidth) return this.sampleAt(proj.s).surface;
    return this.def.offroadSurface;
  }

  /** Lateral distance from centreline to the barrier at this projection. */
  barrierOffset(proj: TrackProjection): number {
    return proj.halfWidth + this.def.vergeWidth;
  }

  /** Largest |curvature| within [s, s+dist]. */
  maxCurvatureAhead(s: number, dist: number): number {
    let m = 0;
    for (let x = 0; x <= dist; x += this.spacing * 2) {
      m = Math.max(m, Math.abs(this.sampleAt(s + x).curvature));
    }
    return m;
  }
}
