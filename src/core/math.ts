export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Wrap an angle to the range (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Move `cur` towards `target` by at most `maxDelta`. */
export function approach(cur: number, target: number, maxDelta: number): number {
  if (cur < target) return Math.min(cur + maxDelta, target);
  return Math.max(cur - maxDelta, target);
}

/** Frame-rate independent exponential smoothing. */
export function damp(cur: number, target: number, lambda: number, dt: number): number {
  return lerp(cur, target, 1 - Math.exp(-lambda * dt));
}

export function dampAngle(cur: number, target: number, lambda: number, dt: number): number {
  return cur + wrapAngle(target - cur) * (1 - Math.exp(-lambda * dt));
}

/** Signed wrapped delta on a loop of length `len`, in (-len/2, len/2]. */
export function wrapDelta(delta: number, len: number): number {
  let d = delta % len;
  if (d > len / 2) d -= len;
  else if (d <= -len / 2) d += len;
  return d;
}

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  const ss = s.toFixed(3).padStart(6, '0');
  return `${m}:${ss}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function hash2(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Deterministic smooth 2D value noise in [0, 1) (same result everywhere — safe for the sim). */
export function valueNoise2(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
