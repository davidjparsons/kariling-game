import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ItemId } from '../config/items';

/**
 * Original low-poly models for the snack power-ups and the parol (star lantern) pickup.
 * No brand packaging or logos — generic Filipino street-food looks.
 */

const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });

function add(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

/** Cola served Filipino-style: tied clear plastic bag, dark fizzy drink, a straw poking out. */
function colaBag(g: THREE.Group): void {
  // Teardrop bag: wide bottom, gathered neck.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const y = t * 0.3;
    const r = t < 0.65 ? 0.11 * Math.sin(Math.PI * (0.25 + t * 0.9)) + 0.02 : 0.11 * (1 - (t - 0.65) / 0.35) * 0.45 + 0.012;
    pts.push(new THREE.Vector2(Math.max(0.01, r), y));
  }
  const bag = new THREE.LatheGeometry(pts, 16);
  bag.scale(1, 1, 0.8);
  add(g, bag, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }));
  // The drink fills the bottom two thirds.
  const liquid = new THREE.LatheGeometry(pts.slice(0, 8).map((p) => new THREE.Vector2(p.x * 0.93, p.y)), 16);
  liquid.scale(1, 1, 0.8);
  add(g, liquid, std(0x3b1a0c, { roughness: 0.15 }));
  add(g, new THREE.CircleGeometry(0.095, 16), std(0x6b3a1f, { roughness: 0.1 }), 0, 0.175, 0, -Math.PI / 2).scale.set(1, 0.8, 1);
  // Knot + straw.
  add(g, new THREE.TorusGeometry(0.022, 0.01, 6, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }), 0, 0.29, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), std(0xe040fb, { roughness: 0.4 }), 0.01, 0.3, 0, 0, 0, -0.18);
}

export function buildItemModel(id: ItemId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'buko': {
      // Young coconut with the top cut open and a straw.
      const husk = new THREE.SphereGeometry(0.14, 14, 10);
      husk.scale(1, 1.1, 1);
      add(g, husk, std(0x7cb342), 0, 0.15, 0);
      add(g, new THREE.CircleGeometry(0.07, 14), std(0xf1f8e9), 0, 0.3, 0, -Math.PI / 2);
      add(g, new THREE.CylinderGeometry(0.009, 0.009, 0.22, 6), std(0xffffff), 0.02, 0.36, 0, 0, 0, -0.25);
      break;
    }
    case 'chippy': {
      // A little pile of curly yellow-orange corn chips (no bag artwork).
      const chip = new THREE.CylinderGeometry(0.06, 0.06, 0.01, 3);
      const cols = [0xffb300, 0xffa000, 0xffca28, 0xff8f00];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.3;
        add(g, chip, std(cols[i % 4], { roughness: 0.8 }), Math.cos(a) * 0.06, 0.04 + i * 0.022, Math.sin(a) * 0.06, a, i, 0.6 + (i % 3) * 0.4);
      }
      break;
    }
    case 'skyflakes': {
      // Square crackers with docking holes, stacked.
      const crk = new THREE.BoxGeometry(0.18, 0.018, 0.18);
      for (let i = 0; i < 3; i++) add(g, crk, std(0xf3d9a4, { roughness: 0.9 }), 0, 0.05 + i * 0.022, 0, 0, i * 0.3, 0);
      const dot = new THREE.CylinderGeometry(0.006, 0.006, 0.004, 5);
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) add(g, dot, std(0xc79a55), x * 0.05, 0.106, z * 0.05, 0, 0.6, 0);
      break;
    }
    case 'pandesal': {
      // Two soft bread rolls dusted with crumbs.
      const bun = new THREE.SphereGeometry(0.1, 12, 8);
      bun.scale(1.2, 0.75, 1);
      add(g, bun, std(0xc98a4b, { roughness: 0.9 }), -0.06, 0.08, 0);
      add(g, bun, std(0xd29a5a, { roughness: 0.9 }), 0.08, 0.1, 0.03, 0, 0.8, 0.2);
      const crumb = new THREE.SphereGeometry(0.008, 4, 3);
      for (let i = 0; i < 10; i++) add(g, crumb, std(0xf3e0bd), -0.06 + Math.cos(i) * 0.08, 0.15, Math.sin(i * 1.7) * 0.06);
      break;
    }
    case 'turon': {
      // Golden fried spring roll with caramel glaze.
      const roll = new THREE.CapsuleGeometry(0.05, 0.22, 4, 10);
      roll.rotateZ(Math.PI / 2);
      add(g, roll, std(0xe6a23c, { roughness: 0.35, metalness: 0.1, emissive: 0x5a3100, emissiveIntensity: 0.3 }), 0, 0.1, 0, 0, 0.4, 0.15);
      add(g, new THREE.TorusGeometry(0.052, 0.008, 5, 12), std(0xa0521e, { roughness: 0.2 }), 0.02, 0.1, 0, 0, 0.4 + Math.PI / 2, 0);
      break;
    }
    case 'cola':
      colaBag(g);
      break;
  }
  g.traverse((o) => { o.castShadow = false; });
  return g;
}

/**
 * Power-up pickup: a floating parol (Filipino star lantern) with a glowing centre and paper
 * tails — spins and bobs above the road. Merged into ONE vertex-coloured mesh (one draw call per
 * pickup); all parols share `material`, whose emissive glow the caller can pulse.
 */
let parolGeo: THREE.BufferGeometry | null = null;
let parolMat: THREE.MeshStandardMaterial | null = null;

export function parolMaterial(): THREE.MeshStandardMaterial {
  if (!parolMat) parolMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: 0xff6d00, emissiveIntensity: 0.35, side: THREE.DoubleSide });
  return parolMat;
}

function parolGeometry(): THREE.BufferGeometry {
  if (parolGeo) return parolGeo;
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4) => {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    if (m) geo.applyMatrix4(m);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    const c = new THREE.Color(color), n = geo.getAttribute('position').count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(geo);
  };
  const T = (x: number, y: number, z: number, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(1, 1, 1));
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 0.32 : 0.14;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const star = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.03, bevelSegments: 1 });
  put(star, 0xff3d3d, T(0, 0, -0.04));
  put(new THREE.TorusGeometry(0.12, 0.02, 6, 20), 0xffd54f, T(0, 0, 0.07));
  put(new THREE.TorusGeometry(0.12, 0.02, 6, 20), 0xffd54f, T(0, 0, -0.07));
  put(new THREE.CircleGeometry(0.1, 16), 0xfff8e1, T(0, 0, 0.075));
  put(new THREE.CircleGeometry(0.1, 16).rotateY(Math.PI), 0xfff8e1, T(0, 0, -0.075));
  const tail = () => new THREE.PlaneGeometry(0.05, 0.42).translate(0, -0.21, 0);
  put(tail(), 0xffd54f, T(-0.06, -0.24, 0, 0.12));
  put(tail(), 0xffd54f, T(0.06, -0.24, 0, -0.12));
  parolGeo = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  return parolGeo;
}

export function buildParol(): THREE.Mesh {
  return new THREE.Mesh(parolGeometry(), parolMaterial());
}
