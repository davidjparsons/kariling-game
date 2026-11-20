import { CANAL, HAZARDS, type HazardConfig, type HazardType } from '../config/hazards';
import type { SurfaceId } from '../config/surfaces';
import { clamp, mod, smoothstep, wrapDelta } from '../core/math';
import type { Track, TrackProjection } from './track';

/** Hazard placement as authored in a track definition. */
export interface HazardPlacement {
  type: HazardType;
  /** Lap fraction (0..1) of the hazard centre. */
  at: number;
  /** Lateral offset of the centre from the centreline (m, + = right). */
  d: number;
  /** Optional overrides of the config footprint. */
  length?: number;
  width?: number;
}

export interface CanalPlacement {
  from: number;
  to: number;
  /** -1 = left of the racing line, +1 = right. */
  side: -1 | 1;
}

export interface DogPlacement {
  at: number;
  side: -1 | 1;
  /** Distance beyond the road edge where the dog hangs out (m). */
  offset: number;
}

export interface Hazard {
  id: number;
  type: HazardType;
  cfg: HazardConfig;
  s: number;
  d: number;
  halfLen: number;
  halfWid: number;
  /** Spans the whole road. */
  fullWidth: boolean;
}

export interface Canal {
  s0: number;
  s1: number;
  side: -1 | 1;
}

export interface GroundSample {
  h: number;
  /** Fraction of climbing velocity that carries into the air. */
  launch: number;
  surface: SurfaceId | null;
  /** Inside a canal trench. */
  canal: boolean;
}

const FLAT: GroundSample = Object.freeze({ h: 0, launch: 0, surface: null, canal: false });

/** Normalised height profile, u along (-1..1), v across (-1..1). */
export function profileHeight(cfg: HazardConfig, u: number, v: number, fullWidth: boolean): number {
  const au = Math.abs(u), av = Math.abs(v);
  if (au > 1 || (!fullWidth && av > 1)) return 0;
  const edge = fullWidth ? 1 : 1 - smoothstep(0.8, 1, av);
  let k = 0;
  switch (cfg.profile) {
    case 'flatTop': k = au < 0.45 ? 1 : 0.5 + 0.5 * Math.cos(((au - 0.45) / 0.55) * Math.PI); break;
    case 'mound': k = Math.cos(au * Math.PI / 2) ** 2 * Math.cos(av * Math.PI / 2); return cfg.height * k;
    case 'log': k = Math.sqrt(Math.max(0, 1 - au * au)); break;
    case 'ridges': k = (0.75 + 0.25 * Math.cos(u * Math.PI * 5)) * Math.cos(au * Math.PI / 2); break;
    case 'ring': {
      const r = Math.hypot(u, v);
      k = r > 1 ? 0 : r > 0.45 ? Math.sin(((r - 0.45) / 0.55) * Math.PI) : 0;
      return cfg.height * k;
    }
    case 'flat': k = 1; break;
    // Ramp: rises steadily along u from -1 to 0.75, then drops off a steep back face.
    case 'ramp': k = u < 0.75 ? (u + 1) / 1.75 : 1 - (u - 0.75) / 0.25; break;
    case 'dip': {
      const r = Math.hypot(u, v);
      k = r > 1 ? 0 : 1 - r * r;
      return cfg.height * k;
    }
  }
  return cfg.height * k * edge;
}

/**
 * Track-relative hazard field: obstacles, potholes, surfaces and canals.
 * Pure data + queries; used identically by physics (all racers) and rendering.
 */
export class HazardField {
  readonly hazards: Hazard[];
  readonly canals: Canal[];

  constructor(readonly track: Track, placements: readonly HazardPlacement[] = [], canals: readonly CanalPlacement[] = []) {
    const L = track.length;
    this.hazards = placements.map((p, id) => {
      const cfg = HAZARDS[p.type];
      const length = p.length ?? cfg.length;
      const width = p.width ?? cfg.width;
      return {
        id, type: p.type, cfg, s: mod(p.at * L, L), d: p.d,
        halfLen: length / 2, halfWid: width / 2, fullWidth: width <= 0,
      };
    }).sort((a, b) => a.s - b.s);
    this.canals = canals.map((c) => ({ s0: mod(c.from * L, L), s1: mod(c.to * L, L), side: c.side }));
  }

  /** Canal lip and outer edge distances from the centreline at this point. */
  canalEdges(halfWidth: number): { inner: number; outer: number } {
    const inner = halfWidth + CANAL.gap;
    return { inner, outer: inner + CANAL.width };
  }

  /** Is there a canal on this side (-1 left, +1 right) at arc length s? Both sides can have one. */
  hasCanal(s: number, side: number): boolean {
    for (const c of this.canals) {
      if (c.side !== side) continue;
      const inside = c.s0 <= c.s1 ? s >= c.s0 && s < c.s1 : s >= c.s0 || s < c.s1;
      if (inside) return true;
    }
    return false;
  }

  /** True if (s, d) is down in a canal trench. */
  inCanal(s: number, d: number, halfWidth: number): boolean {
    if (this.canals.length === 0) return false;
    if (!this.hasCanal(s, Math.sign(d))) return false;
    const { inner, outer } = this.canalEdges(halfWidth);
    const ad = Math.abs(d);
    return ad > inner && ad < outer;
  }

  /** Hazards whose footprint contains (s, d). */
  hazardsAt(s: number, d: number, out: Hazard[] = []): Hazard[] {
    out.length = 0;
    const L = this.track.length;
    for (const h of this.hazards) {
      const ds = wrapDelta(s - h.s, L);
      if (Math.abs(ds) > h.halfLen) continue;
      if (!h.fullWidth && Math.abs(d - h.d) > h.halfWid) continue;
      out.push(h);
    }
    return out;
  }

  /** Hazards within [s + from, s + to] ahead (wrapping), for AI planning. */
  hazardsAhead(s: number, from: number, to: number): { h: Hazard; dist: number }[] {
    const L = this.track.length;
    const res: { h: Hazard; dist: number }[] = [];
    for (const h of this.hazards) {
      const dist = mod(h.s - s, L);
      if (dist >= from && dist <= to) res.push({ h, dist });
    }
    return res.sort((a, b) => a.dist - b.dist);
  }

  /** Ground height, launch factor and surface override at a projected point. */
  sample(proj: TrackProjection): GroundSample {
    const { s, d } = proj;
    if (this.inCanal(s, d, proj.halfWidth)) {
      return { h: -CANAL.depth, launch: 0, surface: 'paved', canal: true };
    }
    if (this.hazards.length === 0) return FLAT;
    let h = 0, dip = 0, launch = 0;
    let surface: SurfaceId | null = null;
    const L = this.track.length;
    for (const hz of this.hazards) {
      const ds = wrapDelta(s - hz.s, L);
      if (Math.abs(ds) > hz.halfLen + 0.01) continue;
      const u = ds / hz.halfLen;
      const v = hz.fullWidth ? 0 : (d - hz.d) / Math.max(0.01, hz.halfWid);
      if (!hz.fullWidth && Math.abs(v) > 1) continue;
      const ph = profileHeight(hz.cfg, u, v, hz.fullWidth);
      if (ph > h) { h = ph; launch = hz.cfg.launch; }
      if (ph < dip) dip = ph;
      if (hz.cfg.surface) surface = hz.cfg.surface;
    }
    return { h: h + dip, launch, surface, canal: false };
  }
}

export function clampToRoad(d: number, halfWidth: number, margin: number): number {
  return clamp(d, -halfWidth + margin, halfWidth - margin);
}
