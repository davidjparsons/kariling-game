import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TyreLook } from '../config/appearance';
import type { StickConfig } from '../config/sticks';
import type { TyreConfig, TyreId } from '../config/tyres';

type TreadStyle = 'chevron' | 'knobby' | 'slick' | 'block';
const TREAD: Record<TyreId, TreadStyle> = { bmx: 'chevron', mtb: 'knobby', road: 'slick', moto: 'block' };

/**
 * Tyre cross-section (radius from axle, axial offset), traced from the inner bead around the
 * outer tread and back. Revolved with LatheGeometry, so the tyre is a perfect circle.
 * Returns points plus the profile parameter where each region starts (for texturing).
 */
function tyreProfile(R: number, tube: number): THREE.Vector2[] {
  const h = tube * 2.1; // section height
  const w = tube * 2.0; // section width
  const pts: [number, number][] = [
    [R - h, -w * 0.32], // inner bead (left)
    [R - h * 0.82, -w * 0.47],
    [R - h * 0.55, -w * 0.52], // sidewall bulge
    [R - h * 0.25, -w * 0.49],
    [R - h * 0.08, -w * 0.4], // shoulder
    [R, -w * 0.25],
    [R + 0.002, 0], // crown
    [R, w * 0.25],
    [R - h * 0.08, w * 0.4],
    [R - h * 0.25, w * 0.49],
    [R - h * 0.55, w * 0.52],
    [R - h * 0.82, w * 0.47],
    [R - h, w * 0.32], // inner bead (right)
    [R - h * 1.02, 0], // inner liner
    [R - h, -w * 0.32],
  ];
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
}

const texCache = new Map<string, THREE.CanvasTexture>();

/**
 * Tyre surface texture: u = around the circumference, v = along the lathe profile
 * (0 = left bead → 0.43 crown → 0.86 right bead → inner liner). Painted sidewall patterns
 * like the decorated tyres kids race with.
 */
function tyreTexture(tyre: TyreId, look: TyreLook): THREE.CanvasTexture {
  const key = `${tyre}-${look.stripe}-${look.pattern}-${look.accent}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const W = 1024, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  // Row for profile parameter v (canvas y grows downward; texture flipY puts v=0 at the bottom).
  const row = (v: number) => H * (1 - v);
  g.fillStyle = '#2c2c2f';
  g.fillRect(0, 0, W, H);
  // Subtle sidewall rib lines.
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 2;
  for (const v of [0.12, 0.2, 0.66, 0.74]) { g.beginPath(); g.moveTo(0, row(v)); g.lineTo(W, row(v)); g.stroke(); }
  // Painted sidewalls (both sides).
  const bands: [number, number][] = [[0.1, 0.27], [0.6, 0.77]];
  if (look.stripe != null) {
    const col = hex(look.stripe), acc = hex(look.accent);
    const n = 24;
    for (const [v0, v1] of bands) {
      const y0 = row(v1), y1 = row(v0), hgt = y1 - y0;
      if (look.pattern === 'plain') { g.fillStyle = col; g.fillRect(0, y0 + hgt * 0.35, W, hgt * 0.3); }
      else if (look.pattern === 'stripes') {
        for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? col : acc; g.fillRect((i / n) * W, y0, W / n + 1, hgt); }
      } else if (look.pattern === 'spots') {
        g.fillStyle = col; g.fillRect(0, y0, W, hgt);
        g.fillStyle = acc;
        for (let i = 0; i < n; i++) { g.beginPath(); g.ellipse((i + 0.5) / n * W, y0 + hgt / 2, W / n / 3, hgt / 3, 0, 0, Math.PI * 2); g.fill(); }
      } else {
        g.fillStyle = acc; g.fillRect(0, y0, W, hgt);
        g.strokeStyle = col; g.lineWidth = hgt * 0.28;
        g.beginPath();
        for (let i = 0; i <= n * 2; i++) { const x = (i / (n * 2)) * W; const y = i % 2 ? y0 + hgt * 0.2 : y1 - hgt * 0.2; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
    }
  }
  // Crown: darker rubber with the centre groove / tread pattern printed between blocks.
  const cy0 = row(0.52), cy1 = row(0.33);
  g.fillStyle = '#202022';
  g.fillRect(0, cy0, W, cy1 - cy0);
  g.fillStyle = '#141415';
  const style = TREAD[tyre];
  const N = 64;
  for (let i = 0; i < N; i++) {
    const x = (i / N) * W;
    if (style === 'slick') g.fillRect(x, (cy0 + cy1) / 2 - 1, 10, 2);
    else if (style === 'chevron') { g.fillRect(x, cy0 + 4, 3, cy1 - cy0 - 8); }
  }
  // Moulded lettering on one sidewall (no brands).
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = 'bold 15px system-ui, sans-serif';
  for (const x of [80, 600]) g.fillText('KARILING · 20 x 2.125 · 65 PSI', x, row(0.07));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Raised tread blocks around the crown, one pattern per tyre type. Axle along local Y here. */
function treadBlocks(R: number, tube: number, style: TreadStyle): THREE.BufferGeometry | null {
  if (style === 'slick') return null;
  const parts: THREE.BufferGeometry[] = [];
  const w = tube * 2;
  const N = style === 'knobby' ? 30 : style === 'block' ? 34 : 40;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const add = (geo: THREE.BufferGeometry, angle: number, axial: number, yaw = 0) => {
    // Block sits on the crown at `angle` around the axle (Y), pointing radially out.
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const pos = radial.clone().multiplyScalar(R - 0.004).add(new THREE.Vector3(0, axial, 0));
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)), // tangent
      new THREE.Vector3(0, 1, 0), // axial
      radial,
    ));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw));
    m.compose(pos, q, new THREE.Vector3(1, 1, 1));
    parts.push(geo.clone().applyMatrix4(m));
  };
  const depth = style === 'knobby' ? 0.014 : 0.009;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (style === 'chevron') {
      const bar = new THREE.BoxGeometry(0.012, w * 0.32, depth);
      add(bar, a, -w * 0.13, 0.5);
      add(bar, a, w * 0.13, -0.5);
    } else if (style === 'knobby') {
      const knob = new THREE.BoxGeometry(0.03, 0.026, depth);
      add(knob, a, (i % 2 ? 1 : -1) * w * 0.2);
      add(new THREE.BoxGeometry(0.022, 0.018, depth), a + Math.PI / N, 0);
      const side = new THREE.BoxGeometry(0.024, 0.02, depth);
      add(side, a, (i % 2 ? -1 : 1) * w * 0.36);
    } else {
      const block = new THREE.BoxGeometry(0.026, w * 0.3, depth);
      add(block, a, -w * 0.18);
      add(block, a + Math.PI / N, w * 0.18);
    }
  }
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Upright tyre (no rim), axle along local X, rolling about X. Circular lathe profile + tread. */
export function buildTyre(tyre: TyreConfig, look: TyreLook): THREE.Group {
  const g = new THREE.Group();
  const R = tyre.radius, tube = tyre.tube;
  const lathe = new THREE.LatheGeometry(tyreProfile(R, tube), 56);
  lathe.rotateZ(Math.PI / 2); // axle Y → X
  const mat = new THREE.MeshStandardMaterial({ map: tyreTexture(tyre.id, look), roughness: 0.85, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(lathe, mat);
  mesh.castShadow = true;
  g.add(mesh);
  const blocks = treadBlocks(R, tube, TREAD[tyre.id]);
  if (blocks) {
    blocks.rotateZ(Math.PI / 2);
    const bm = new THREE.Mesh(blocks, new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.9 }));
    bm.castShadow = true;
    g.add(bm);
  }
  return g;
}

/** Plain lathe tyre lying flat (for obstacles). Axle along Y. */
export function flatTyreGeometry(R: number, tube: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(tyreProfile(R, tube), 40);
}

export type ScoopMaterial = 'tin' | 'bottle';

/**
 * Stick + scoop. The shaft runs along +Y from the grip (y = 0) to the scoop (y = length).
 * The scoop is a separate object so it can sit exactly on the tyre while the shaft points at it.
 */
export function buildStick(stick: StickConfig, length: number): {
  shaft: THREE.Group; scoop: THREE.Group; length: number; scoopRadius: number;
} {
  const shaft = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xc49a62, roughness: 0.75 });
  const geo = new THREE.CylinderGeometry(0.012, 0.015, length, 8);
  geo.translate(0, length / 2, 0);
  const m = new THREE.Mesh(geo, wood);
  m.castShadow = true;
  shaft.add(m);
  // A couple of darker grip wraps (rattan/tape).
  const wrapMat = new THREE.MeshStandardMaterial({ color: 0x6d4a2b, roughness: 0.9 });
  for (const y of [0.02, 0.07]) {
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.035, 8), wrapMat);
    wrap.position.y = y;
    shaft.add(wrap);
  }
  const material: ScoopMaterial = stick.id === 'bottle' ? 'bottle' : 'tin';
  const scoop = buildScoop(material);
  return { shaft, scoop, length, scoopRadius: 0.05 };
}

/**
 * Half-cylinder scoop (cut pineapple tin or vinegar bottle). Local frame:
 *   +Y = channel axis (tangent to the tyre), +Z = solid back (away from the tyre), X = across the tread.
 * The concave side opens towards −Z, where the tyre tread sits.
 */
function buildScoop(kind: ScoopMaterial): THREE.Group {
  const g = new THREE.Group();
  const r = 0.05, len = 0.17;
  const half = new THREE.CylinderGeometry(r, r, len, 14, 1, true, -Math.PI / 2, Math.PI);
  let mat: THREE.MeshStandardMaterial;
  if (kind === 'tin') {
    mat = new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: 0xe9f5ff, roughness: 0.15, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  }
  const shell = new THREE.Mesh(half, mat);
  shell.castShadow = true;
  g.add(shell);
  if (kind === 'tin') {
    // Ridges pressed into the tin + a rolled rim.
    const ridgeMat = new THREE.MeshStandardMaterial({ color: 0xaab0b8, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
    for (const y of [-0.03, 0, 0.03]) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(r + 0.002, 0.003, 4, 14, Math.PI), ridgeMat);
      ridge.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
      ridge.position.y = y;
      g.add(ridge);
    }
    // Faded label strip on the outside.
    const label = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.003, r + 0.003, 0.05, 14, 1, true, -Math.PI / 3, (Math.PI * 2) / 3),
      new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.6, side: THREE.DoubleSide }));
    label.position.y = -0.015;
    g.add(label);
  } else {
    // Bottle shoulder narrowing towards the stick, with a red cap.
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.022, r, 0.05, 14, 1, true, -Math.PI / 2, Math.PI), mat);
    shoulder.rotation.x = Math.PI / 2;
    shoulder.position.set(0, 0, 0.03);
    g.add(shoulder);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5 }));
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, 0, 0.06);
    g.add(cap);
  }
  // Bracket fixing the scoop to the stick end.
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.8 }));
  bracket.position.set(0, 0, r + 0.012);
  g.add(bracket);
  return g;
}
