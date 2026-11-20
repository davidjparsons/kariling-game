import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { BatchBuilder, mat4 } from './batch';
import { sharedMaterials } from './materials';

/** Prepare a geometry part with a flat vertex colour, transformed by `m`. */
export function part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4, shade?: (y: number, c: THREE.Color) => void): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (m) g.applyMatrix4(m);
  const pos = g.getAttribute('position');
  const c = new THREE.Color(color);
  const tmp = new THREE.Color();
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    tmp.copy(c);
    if (shade) shade(pos.getY(i), tmp);
    arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- vegetation

/** Coconut palm with a curved, ringed trunk and arching fronds. Origin at the base. */
export function palmGeometry(seed: number, height = 7.5): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const lean = rng.range(0.6, 2.2);
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.2, height * 0.55, 0),
    new THREE.Vector3(lean, height, 0),
  );
  const segs = 10;
  const tube = new THREE.TubeGeometry(curve, segs, 0.17, 6, false);
  // taper + ring bands
  const pos = tube.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 7);
    const t = ring / segs;
    const center = curve.getPoint(Math.min(1, t));
    const k = 1.25 - 0.5 * t;
    pos.setXYZ(i, center.x + (pos.getX(i) - center.x) * k, pos.getY(i), center.z + (pos.getZ(i) - center.z) * k);
  }
  tube.computeVertexNormals();
  parts.push(part(tube, 0x8a6a48, undefined, (y, c) => {
    const band = Math.sin(y * 9) > 0.6 ? 0.82 : 1;
    c.multiplyScalar(band);
  }));
  const top = curve.getPoint(1);
  // coconuts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng.range(0, 1);
    parts.push(part(new THREE.IcosahedronGeometry(0.17, 0), i % 2 ? 0x6b8f2a : 0x7a5a2a,
      mat4(top.x + Math.cos(a) * 0.22, top.y - 0.22, top.z + Math.sin(a) * 0.22)));
  }
  // fronds
  const fronds = 9;
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const len = rng.range(2.8, 3.6);
    const droop = rng.range(0.9, 1.6);
    parts.push(frondGeometry(len, droop, rng, top, yaw));
  }
  return mergeParts(parts);
}

function frondGeometry(len: number, droop: number, rng: Rng, origin: THREE.Vector3, yaw: number): THREE.BufferGeometry {
  const steps = 5;
  const verts: number[] = [];
  const cols: number[] = [];
  const base = new THREE.Color(0x4f9a2c);
  const tip = new THREE.Color(0x8fcb3e);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * len;
    const y = 0.5 * Math.sin(t * Math.PI * 0.6) - droop * t * t;
    pts.push(new THREE.Vector3(x, y, 0));
  }
  const pushV = (v: THREE.Vector3, c: THREE.Color) => { verts.push(v.x, v.y, v.z); cols.push(c.r, c.g, c.b); };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const w0 = 0.55 * Math.sin(Math.PI * Math.min(1, t0 * 1.1 + 0.08));
    const w1 = 0.55 * Math.sin(Math.PI * Math.min(1, t1 * 1.1 + 0.08));
    const a = pts[i], b = pts[i + 1];
    const c0 = base.clone().lerp(tip, t0), c1 = base.clone().lerp(tip, t1);
    // V-shaped cross section: two quads per segment, leaflets fold down.
    for (const side of [-1, 1]) {
      const a2 = new THREE.Vector3(a.x, a.y - w0 * 0.35, side * w0);
      const b2 = new THREE.Vector3(b.x, b.y - w1 * 0.35, side * w1);
      pushV(a, c0); pushV(b, c1); pushV(b2, c1.clone().multiplyScalar(0.85));
      pushV(a, c0); pushV(b2, c1.clone().multiplyScalar(0.85)); pushV(a2, c0.clone().multiplyScalar(0.85));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((verts.length / 3) * 2), 2));
  g.computeVertexNormals();
  g.applyMatrix4(mat4(origin.x, origin.y, origin.z, yaw, 0, rng.range(-0.15, 0.15)));
  return g;
}

/** Banana plant: short pseudo-stem and big paddle leaves. */
export function bananaGeometry(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const h = rng.range(1.8, 2.6);
  parts.push(part(new THREE.CylinderGeometry(0.12, 0.2, h, 7), 0x7c9a45, mat4(0, h / 2, 0)));
  const leaves = 7;
  for (let i = 0; i < leaves; i++) {
    const yaw = (i / leaves) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const len = rng.range(1.6, 2.2);
    const g = new THREE.PlaneGeometry(len, 0.55, 6, 2);
    const p = g.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k) + len / 2;
      const y = p.getY(k);
      const t = x / len;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04));
      p.setXYZ(k, x, 0.45 * Math.sin(t * 2.2) - t * t * 0.9 - Math.abs(y) * 0.25, y * w);
    }
    g.computeVertexNormals();
    parts.push(part(g, rng.chance(0.2) ? 0x9bbf45 : 0x5fae3a, mat4(0, h - 0.1, 0, yaw, 0, 0.25)));
  }
  return mergeParts(parts);
}

/** Broadleaf shade tree (mango/acacia style) with chunky low-poly canopy. */
export function treeGeometry(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const h = rng.range(2.6, 3.6);
  parts.push(part(new THREE.CylinderGeometry(0.18, 0.3, h, 7), 0x6e4e33, mat4(0, h / 2, 0)));
  parts.push(part(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 5), 0x6e4e33, mat4(0.4, h - 0.1, 0, 0, 0, -0.8)));
  const blobs = rng.int(4, 6);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2;
    const r = rng.range(0.9, 1.5);
    const col = new THREE.Color().setHSL(rng.range(0.24, 0.3), 0.55, rng.range(0.32, 0.42));
    parts.push(part(new THREE.IcosahedronGeometry(r, 1), col,
      mat4(Math.cos(a) * 1.1, h + 0.6 + rng.range(-0.2, 0.6), Math.sin(a) * 1.1, 0, 0, 0, 1, 0.75, 1)));
  }
  parts.push(part(new THREE.IcosahedronGeometry(1.5, 1), 0x4f8f34, mat4(0, h + 1.2, 0, 0, 0, 0, 1, 0.8, 1)));
  return mergeParts(parts);
}

/** Gumamela (hibiscus) bush with red/pink flowers. */
export function bushGeometry(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    parts.push(part(new THREE.IcosahedronGeometry(rng.range(0.45, 0.7), 0), new THREE.Color().setHSL(0.27, 0.5, rng.range(0.3, 0.38)),
      mat4(Math.cos(a) * 0.35, 0.45, Math.sin(a) * 0.35)));
  }
  const flower = rng.pick([0xe8384f, 0xf06292, 0xff8a3d, 0xfdd835]);
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, Math.PI * 2);
    parts.push(part(new THREE.OctahedronGeometry(0.1, 0), flower, mat4(Math.cos(a) * 0.65, rng.range(0.4, 0.95), Math.sin(a) * 0.65)));
  }
  return mergeParts(parts);
}

/** A clump of grass blades. */
export function grassGeometry(): THREE.BufferGeometry {
  // Curved, tapered blades: each blade is a two-segment strip bending outwards.
  const rng = new Rng(99);
  const verts: number[] = [];
  const cols: number[] = [];
  const dark = new THREE.Color(0x3f7f26), mid = new THREE.Color(0x6fb33a), light = new THREE.Color(0xb6de5a);
  const push = (v: number[], c: THREE.Color) => { verts.push(...v); cols.push(c.r, c.g, c.b); };
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.16);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = rng.range(0.28, 0.55);
    const w = rng.range(0.035, 0.055);
    const bend = rng.range(0.08, 0.22);
    const dir = rng.range(0, Math.PI * 2);
    const px = Math.cos(dir) * w, pz = Math.sin(dir) * w;
    const ox = Math.cos(a) * bend, oz = Math.sin(a) * bend;
    const m = [x + ox * 0.35, h * 0.55, z + oz * 0.35];
    const t = [x + ox, h, z + oz];
    const b0 = [x - px, 0, z - pz], b1 = [x + px, 0, z + pz];
    const m0 = [m[0] - px * 0.6, m[1], m[2] - pz * 0.6], m1 = [m[0] + px * 0.6, m[1], m[2] + pz * 0.6];
    push(b0, dark); push(b1, dark); push(m1, mid);
    push(b0, dark); push(m1, mid); push(m0, mid);
    push(m0, mid); push(m1, mid); push(t, light);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  // Point normals up so blades light like the ground rather than flickering.
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export function rockGeometry(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const g = new THREE.DodecahedronGeometry(0.6, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * rng.range(0.85, 1.3), Math.max(-0.1, p.getY(i) * 0.65), p.getZ(i) * rng.range(0.85, 1.2));
  }
  g.computeVertexNormals();
  return part(g, 0x8b93a3);
}

// ---------------------------------------------------------------- buildings

const PAINT = [0xf48fb1, 0x9be7c4, 0xfff176, 0x81d4fa, 0xffcc80, 0xce93d8, 0xa5d6a7, 0xffab91];
const ROOF = [0xb5543c, 0x3f7cc0, 0x5a9e5a, 0xa0a4a8, 0xc0622f];

export interface Footprint { x: number; z: number; r: number }

/**
 * Bahay kubo (nipa hut): bamboo stilts, woven walls, steep thatched roof.
 * Front faces local +z.
 */
export function addNipaHut(b: BatchBuilder, m: THREE.Matrix4, rng: Rng): void {
  const M = sharedMaterials();
  const w = rng.range(3.2, 4.2), d = rng.range(3, 3.6), lift = 0.9, wallH = 2.0;
  const geoBox = new THREE.BoxGeometry(1, 1, 1);
  const post = new THREE.CylinderGeometry(0.09, 0.1, 1, 6);
  const sub = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
    mat4(x, y, z, ry, rx, rz, sx, sy, sz).premultiply(m);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(post, M.vc, sub(sx * (w / 2 - 0.1), (lift + wallH) / 2, sz * (d / 2 - 0.1), 1, lift + wallH, 1), 0x9a7a4a);
  }
  b.add(geoBox, M.vc, sub(0, lift, 0, w + 0.3, 0.12, d + 0.3), 0x8a6a3e);
  // walls (woven)
  b.add(geoBox, M.weave, sub(0, lift + wallH / 2, 0, w, wallH, d), 0xffffff);
  // Bamboo frame on the woven walls.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(post, M.vc, sub(sx * (w / 2 + 0.02), lift + wallH / 2, sz * (d / 2 + 0.02), 1.1, wallH, 1.1), 0xc9a35a);
  }
  for (const y of [lift + 0.08, lift + wallH - 0.06]) {
    b.add(geoBox, M.vc, sub(0, y, d / 2 + 0.03, w + 0.1, 0.07, 0.07), 0xc9a35a);
    b.add(geoBox, M.vc, sub(0, y, -d / 2 - 0.03, w + 0.1, 0.07, 0.07), 0xc9a35a);
  }
  // window openings + door (dark insets on front)
  b.add(geoBox, M.vc, sub(-w * 0.22, lift + wallH * 0.55, d / 2 + 0.01, 0.9, 0.7, 0.04), 0x3a2a1a);
  b.add(geoBox, M.vc, sub(w * 0.22, lift + wallH * 0.42, d / 2 + 0.01, 0.75, 1.5, 0.04), 0x4a3320);
  // window prop shutter
  b.add(geoBox, M.weave, sub(-w * 0.22, lift + wallH * 0.92, d / 2 + 0.35, 1.0, 0.05, 0.75, 0, -0.9), 0xffffff);
  // roof: 4-sided pyramid rotated to align with walls
  const roof = new THREE.ConeGeometry(1, 1, 4, 1, true);
  b.add(roof, M.thatch, sub(0, lift + wallH + 1.05, 0, (w + 1.4) * 0.72, 2.2, (d + 1.4) * 0.72, Math.PI / 4), 0xffffff);
  b.add(new THREE.ConeGeometry(0.22, 0.35, 6), M.vc, sub(0, lift + wallH + 2.15, 0, 1, 1, 1), 0x7a5a2a);
  // steps
  for (let i = 0; i < 3; i++) {
    b.add(geoBox, M.vc, sub(w * 0.22, 0.25 + i * 0.25, d / 2 + 0.75 - i * 0.22, 0.9, 0.06, 0.28), 0x9a7a4a);
  }
  b.add(geoBox, M.vc, sub(w * 0.22 - 0.48, 0.45, d / 2 + 0.55, 0.06, 0.06, 0.9, 0, 0.75), 0x8a6a3e);
  b.add(geoBox, M.vc, sub(w * 0.22 + 0.48, 0.45, d / 2 + 0.55, 0.06, 0.06, 0.9, 0, 0.75), 0x8a6a3e);
}

/** Painted concrete house with corrugated roof. Front faces local +z. */
export function addHouse(b: BatchBuilder, m: THREE.Matrix4, rng: Rng, paint?: number): void {
  const M = sharedMaterials();
  const w = rng.range(4.5, 6.5), d = rng.range(4, 5.5), h = rng.range(2.6, 3.1);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sub = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
    mat4(x, y, z, ry, rx, rz, sx, sy, sz).premultiply(m);
  const color = paint ?? rng.pick(PAINT);
  b.add(box, M.wall, sub(0, h / 2, 0, w, h, d), color);
  b.add(box, M.vc, sub(0, 0.12, 0, w + 0.1, 0.24, d + 0.1), 0x9e9e9e);
  // gable roof: two slabs
  const roofCol = rng.pick(ROOF);
  const pitch = 0.42;
  const half = (d / 2 + 0.5) / Math.cos(pitch);
  for (const s of [-1, 1]) {
    b.add(box, M.roof, sub(0, h + Math.tan(pitch) * (d / 4 + 0.25) - 0.05, s * (d / 4 + 0.25) * 1.0, w + 0.8, 0.06, half, 0, s * pitch), roofCol);
  }
  // gable triangles
  const tri = new THREE.ShapeGeometry(new THREE.Shape([
    new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, Math.tan(pitch) * d / 2),
  ]));
  for (const s of [-1, 1]) {
    b.add(tri, M.vcDouble, sub(s * (w / 2 + 0.01), h, 0, 1, 1, 1, Math.PI / 2), color);
  }
  // Darker plinth, roof fascia boards and a front eave.
  const trim = rng.pick([0xffffff, 0x5d4037, 0x2e6fb0]);
  b.add(box, M.vc, sub(0, 0.3, 0, w + 0.06, 0.32, d + 0.06), new THREE.Color(color).multiplyScalar(0.72));
  for (const sz of [-1, 1]) {
    b.add(box, M.vc, sub(0, h + 0.02, sz * (d / 2 + 0.48), w + 0.85, 0.14, 0.04), trim);
  }
  // Door with frame and a step.
  const doorCol = rng.pick([0x7b4a2a, 0x2e6fb0, 0x8d2e2e]);
  b.add(box, M.vc, sub(-w * 0.25, 1.05, d / 2 + 0.03, 1.06, 2.16, 0.05), trim);
  b.add(box, M.vc, sub(-w * 0.25, 1.0, d / 2 + 0.05, 0.9, 2.0, 0.05), doorCol);
  b.add(box, M.vc, sub(-w * 0.25, 1.0, d / 2 + 0.08, 0.06, 0.06, 0.06), 0xd4af37);
  b.add(box, M.vc, sub(-w * 0.25, 0.08, d / 2 + 0.3, 1.2, 0.16, 0.5), 0x9e9e9e);
  /** Window: frame, capiz-style panes (pearly squares) and open shutters. */
  const windowAt = (m: THREE.Matrix4) => {
    const at = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => mat4(x, y, z, ry, 0, 0, sx, sy, sz).premultiply(m);
    b.add(box, M.vc, at(0, 0, 0, 1.0, 0.9, 0.06), trim);
    b.add(box, M.glass, at(0, 0, 0.02, 0.84, 0.74, 0.04), 0xffffff);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) {
      b.add(box, M.vc, at(-0.27 + i * 0.27, -0.24 + k * 0.24, 0.045, 0.22, 0.19, 0.01), 0xf4efe1);
    }
    for (const sx of [-1, 1]) b.add(box, M.vc, at(sx * 0.72, 0, 0.12, 0.44, 0.82, 0.04, sx * 0.5), new THREE.Color(trim).multiplyScalar(0.85));
    b.add(box, M.vc, at(0, -0.5, 0.08, 1.1, 0.06, 0.18), trim);
  };
  for (const wx of [w * 0.12, w * 0.34]) windowAt(mat4(wx, 1.6, d / 2 + 0.03).premultiply(m));
  windowAt(mat4(w / 2 + 0.03, 1.6, 0, Math.PI / 2).premultiply(m));
  windowAt(mat4(-w / 2 - 0.03, 1.6, 0, -Math.PI / 2).premultiply(m));
  // potted plants by the door
  for (const px of [-w * 0.25 - 0.8, -w * 0.25 + 0.8]) {
    b.add(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 7), M.vc, sub(px, 0.42, d / 2 + 0.45, 1, 1, 1), 0xb5603a);
    b.add(new THREE.IcosahedronGeometry(0.3, 0), M.vcFlat, sub(px, 0.8, d / 2 + 0.45, 1, 1, 1), 0x4f9a2c);
  }
}

/**
 * Sari-sari store: small house with a grilled serving window, shelves of colourful goods,
 * an awning and a bench. Sign is returned separately (unique texture).
 */
export function addSariSari(b: BatchBuilder, m: THREE.Matrix4, rng: Rng): void {
  const M = sharedMaterials();
  const w = 4.6, d = 4, h = 2.8;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sub = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
    mat4(x, y, z, ry, rx, rz, sx, sy, sz).premultiply(m);
  const paint = rng.pick([0x81d4fa, 0xfff176, 0x9be7c4]);
  // walls with a front opening: back + sides + front lower and upper strips
  b.add(box, M.wall, sub(0, h / 2, -d / 2 + 0.1, w, h, 0.2), paint);
  b.add(box, M.wall, sub(-w / 2 + 0.1, h / 2, 0, 0.2, h, d), paint);
  b.add(box, M.wall, sub(w / 2 - 0.1, h / 2, 0, 0.2, h, d), paint);
  b.add(box, M.wall, sub(0, 0.5, d / 2 - 0.1, w, 1.0, 0.2), paint);
  b.add(box, M.wall, sub(0, h - 0.3, d / 2 - 0.1, w, 0.6, 0.2), paint);
  b.add(box, M.vc, sub(0, 0.05, 0, w, 0.1, d), 0x8a8a8a);
  // dark interior
  b.add(box, M.vc, sub(0, 1.5, -d / 2 + 0.25, w - 0.4, 2.4, 0.05), 0x3b2b20);
  // shelves with goods
  for (let sy = 0; sy < 3; sy++) {
    const y = 1.1 + sy * 0.45;
    b.add(box, M.vc, sub(0, y, -d / 2 + 0.55, w - 0.6, 0.05, 0.5), 0x8a6a3e);
    for (let i = 0; i < 9; i++) {
      const gx = -w / 2 + 0.6 + i * ((w - 1.2) / 8);
      const col = rng.pick([0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xff7043, 0xffffff, 0x8e24aa]);
      b.add(box, M.vc, sub(gx, y + 0.17, -d / 2 + 0.55, 0.28, rng.range(0.22, 0.32), 0.25), col);
    }
  }
  // grill bars on the window
  for (let i = 0; i <= 12; i++) {
    b.add(box, M.vc, sub(-w / 2 + 0.25 + i * ((w - 0.5) / 12), 1.55, d / 2 - 0.02, 0.04, 1.1, 0.04), 0x4e5b66);
  }
  b.add(box, M.vc, sub(0, 1.05, d / 2 + 0.15, w - 0.2, 0.08, 0.5), 0x8a6a3e); // counter
  // hanging snack strips
  for (let i = 0; i < 6; i++) {
    const col = rng.pick([0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff]);
    b.add(box, M.vc, sub(-w / 2 + 0.6 + i * 0.7, 1.9, d / 2 + 0.08, 0.22, 0.6, 0.02), col);
  }
  // roof + awning
  b.add(box, M.roof, sub(0, h + 0.05, 0, w + 0.6, 0.06, d + 0.6, 0, 0.08), 0xa0a4a8);
  b.add(box, M.roof, sub(0, h - 0.35, d / 2 + 0.8, w + 0.4, 0.05, 1.5, 0, 0.35), rng.pick([0xe53935, 0x1e88e5, 0x43a047]));
  // bench
  b.add(box, M.vc, sub(w * 0.15, 0.45, d / 2 + 1.3, 2.0, 0.08, 0.4), 0x8a6a3e);
  for (const lx of [-0.8, 0.8]) b.add(box, M.vc, sub(w * 0.15 + lx, 0.22, d / 2 + 1.3, 0.08, 0.44, 0.35), 0x6e5030);
}

/** Barangay basketball court: slab, painted lines and two hoops. Returns nothing. */
export function addCourt(b: BatchBuilder, m: THREE.Matrix4): void {
  const M = sharedMaterials();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sub = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
    mat4(x, y, z, ry, rx, rz, sx, sy, sz).premultiply(m);
  b.add(box, M.wall, sub(0, 0.05, 0, 15, 0.1, 26), 0xbdbab3);
  // lines
  const line = 0xffffff;
  b.add(box, M.vc, sub(0, 0.11, 0, 14, 0.01, 0.12), line);
  for (const s of [-1, 1]) {
    b.add(box, M.vc, sub(s * 6.95, 0.11, 0, 0.12, 0.01, 25.5), line);
    b.add(box, M.vc, sub(0, 0.11, s * 12.75, 14, 0.01, 0.12), line);
    b.add(box, M.vc, sub(0, 0.11, s * 10.4, 4.8, 0.01, 0.12), 0xe57373);
    b.add(box, M.vc, sub(-2.4, 0.11, s * 11.6, 0.12, 0.01, 2.4), 0xe57373);
    b.add(box, M.vc, sub(2.4, 0.11, s * 11.6, 0.12, 0.01, 2.4), 0xe57373);
    // hoop
    b.add(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 8), M.vc, sub(0, 1.8, s * 13.6, 1, 1, 1), 0x546e7a);
    b.add(box, M.vc, sub(0, 3.4, s * 13.0, 0.12, 0.12, 1.3), 0x546e7a);
    b.add(box, M.vc, sub(0, 3.5, s * 12.4, 1.8, 1.1, 0.06), 0xffffff);
    b.add(box, M.vc, sub(0, 3.3, s * 12.36, 0.6, 0.45, 0.07), 0xe53935);
    b.add(new THREE.TorusGeometry(0.23, 0.025, 6, 14), M.vc, sub(0, 3.05, s * 12.1, 1, 1, 1, 0, Math.PI / 2), 0xff6f00);
  }
}

/** Clothesline with colourful laundry between two posts along local x. */
export function addClothesline(b: BatchBuilder, m: THREE.Matrix4, rng: Rng): void {
  const M = sharedMaterials();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sub = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => mat4(x, y, z, 0, 0, 0, sx, sy, sz).premultiply(m);
  const len = 5;
  for (const s of [-1, 1]) b.add(box, M.vc, sub(s * len / 2, 0.95, 0, 0.08, 1.9, 0.08), 0x8a6a3e);
  b.add(box, M.vc, sub(0, 1.85, 0, len, 0.02, 0.02), 0xeeeeee);
  for (let i = 0; i < 7; i++) {
    const col = rng.pick([0xff5252, 0xffd740, 0x40c4ff, 0xffffff, 0x69f0ae, 0xff80ab, 0x7c4dff]);
    const big = rng.chance(0.5);
    b.add(box, M.vc, sub(-len / 2 + 0.5 + i * 0.65, big ? 1.5 : 1.6, 0, 0.5, big ? 0.65 : 0.45, 0.02), col);
  }
}

export { PAINT };
