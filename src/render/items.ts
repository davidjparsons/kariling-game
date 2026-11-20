import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROJECTILES, type ItemId, type ProjectileId } from '../config/items';

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

export function buildItemModel(id: ItemId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'buko': {
      // Whole green husk, tapered crown and a small brown stem.
      const husk = new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.12, 0.03), new THREE.Vector2(0.19, 0.11),
        new THREE.Vector2(0.22, 0.21), new THREE.Vector2(0.19, 0.31), new THREE.Vector2(0.115, 0.39),
        new THREE.Vector2(0.045, 0.44), new THREE.Vector2(0, 0.45),
      ], 10);
      add(g, husk, std(0x82b936, { flatShading: true, emissive: 0x304600, emissiveIntensity: 0.22 }));
      add(g, new THREE.CylinderGeometry(0.026, 0.045, 0.056, 6), std(0x664b29), 0, 0.447);
      break;
    }
    case 'saging': {
      const mat = std(0xffd532, { emissive: 0x835700, emissiveIntensity: 0.25 });
      const flap = new THREE.CapsuleGeometry(0.043, 0.21, 3, 6);
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI * 2 / 3;
        add(g, flap, mat, Math.sin(angle) * 0.12, 0.05, Math.cos(angle) * 0.12,
          1.3 * Math.cos(angle), 0, -1.3 * Math.sin(angle));
      }
      add(g, new THREE.ConeGeometry(0.045, 0.16, 6), mat, 0, 0.11);
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
    case 'turon': {
      // Golden fried spring roll with caramel glaze.
      const roll = new THREE.CapsuleGeometry(0.05, 0.22, 4, 10);
      roll.rotateZ(Math.PI / 2);
      add(g, roll, std(0xe6a23c, { roughness: 0.35, metalness: 0.1, emissive: 0x5a3100, emissiveIntensity: 0.3 }), 0, 0.1, 0, 0, 0.4, 0.15);
      add(g, new THREE.TorusGeometry(0.052, 0.008, 5, 12), std(0xa0521e, { roughness: 0.2 }), 0.02, 0.1, 0, 0, 0.4 + Math.PI / 2, 0);
      break;
    }
  }
  g.traverse((o) => { o.castShadow = false; });
  return g;
}

export function buildProjectileModel(id: ProjectileId): THREE.Group {
  const group = new THREE.Group();
  const model = buildItemModel(id);
  model.position.y = id === 'buko' ? -0.225 : id === 'saging' ? -PROJECTILES.saging.radius : -0.08;
  if (id === 'skyflakes') model.rotation.x = Math.PI / 2;
  group.add(model);
  return group;
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
