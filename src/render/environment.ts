import * as THREE from 'three';
import { SURFACES, type SurfaceId } from '../config/surfaces';
import { lerp, smoothstep } from '../core/math';
import { Rng } from '../core/rng';
import type { Track } from '../sim/track';
import { BatchBuilder, mat4 } from './batch';
import { addWind, sharedMaterials, windUniforms } from './materials';
import {
  addClothesline, addCourt, addHouse, addNipaHut, addSariSari, bananaGeometry, bushGeometry, grassGeometry, palmGeometry,
  rockGeometry, treeGeometry, type Footprint,
} from './props';
import type { QualityProfile } from './quality';
import { checkerTexture, paddyTexture, signTexture, skyTexture, speckleTexture } from './textures';

const ROAD_COLORS: Record<SurfaceId, THREE.Color> = {
  paved: new THREE.Color(0xd2cdc2),
  dirt: new THREE.Color(0xcc935c),
  gravel: new THREE.Color(0xb0a493),
  grass: new THREE.Color(0x86c24a),
  mud: new THREE.Color(0x7a5434),
};

// ------------------------------------------------------------------ noise
function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x: number, z: number): number {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { sum += valueNoise(x * f, z * f) * amp; amp *= 0.5; f *= 2.03; }
  return sum;
}

/**
 * Terrain height field. Flat around the course; rolling hills further out; dropping to a beach
 * and the sea in the south.
 */
export class Terrain {
  private coarse: { x: number; z: number }[];
  constructor(private track: Track) {
    this.coarse = track.samples.filter((_, i) => i % 3 === 0).map((s) => ({ x: s.x, z: s.z }));
  }
  coastZ(x: number): number {
    return -42 + 7 * Math.sin(x * 0.018) + 4 * Math.sin(x * 0.051 + 1.3);
  }
  distToTrack(x: number, z: number): number {
    let best = Infinity;
    for (const p of this.coarse) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
  heightAt(x: number, z: number, dist = this.distToTrack(x, z)): number {
    const flat = this.track.maxHalfWidth + this.track.def.vergeWidth + 10;
    const hillT = smoothstep(flat, flat + 45, dist);
    const coast = this.coastZ(x);
    const inland = smoothstep(coast, coast + 40, z);
    let h = (fbm(x * 0.012, z * 0.012) * 26 - 6) * hillT * inland;
    h = Math.max(h, (fbm(x * 0.05, z * 0.05) - 0.5) * 0.6 * hillT);
    if (z < coast + 6) h -= (coast + 6 - z) * 0.11;
    return h;
  }
}

export interface EnvironmentBuild {
  group: THREE.Group;
  terrain: Terrain;
  /** Static footprints (buildings, trees) for camera avoidance. */
  colliders: Footprint[];
  spectatorSpots: { x: number; z: number; heading: number }[];
  update(time: number): void;
  dispose(): void;
}

export function buildEnvironment(track: Track, q: QualityProfile, seed = 1): EnvironmentBuild {
  const group = new THREE.Group();
  const rng = new Rng(seed);
  const terrain = new Terrain(track);
  const colliders: Footprint[] = [];
  const M = sharedMaterials();
  const disposables: { dispose(): void }[] = [];

  const edge = (s: number) => track.sampleAt(s).halfWidth + track.def.vergeWidth;
  const L = track.length;

  /** True if a footprint circle is clear of the course and other placed objects. */
  const placed: Footprint[] = [];
  const isFree = (x: number, z: number, r: number, trackMargin: number) => {
    const p = track.project(x, z);
    if (Math.abs(p.d) < track.barrierOffset(p) + r + trackMargin) return false;
    for (const f of placed) if ((f.x - x) ** 2 + (f.z - z) ** 2 < (f.r + r) ** 2) return false;
    return true;
  };

  // ---------------------------------------------------------------- sky, sea, light fog backdrop
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;
  group.add(sky);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ color: 0x23b3d9, roughness: 0.18, metalness: 0.05, map: speckleTexture(21, 256, 0.12, 1400) }),
  );
  (sea.material as THREE.MeshStandardMaterial).map!.repeat.set(160, 160);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.55;
  sea.receiveShadow = false;
  group.add(sea);

  // ---------------------------------------------------------------- terrain
  const cx = track.samples.reduce((a, s) => a + s.x, 0) / track.count;
  const cz = track.samples.reduce((a, s) => a + s.z, 0) / track.count;
  const size = 640;
  const segs = q.terrainSegments;
  const tgeo = new THREE.PlaneGeometry(size, size, segs, segs);
  tgeo.rotateX(-Math.PI / 2);
  tgeo.translate(cx, 0, cz + 40);
  const tpos = tgeo.getAttribute('position');
  const tcol = new Float32Array(tpos.count * 3);
  const grassA = new THREE.Color(0x7dbf45), grassB = new THREE.Color(0x5e9e36), grassC = new THREE.Color(0x9ccd55);
  const sand = new THREE.Color(0xeedcab), wetSand = new THREE.Color(0xc9b483), hill = new THREE.Color(0x4f8a33);
  const c = new THREE.Color();
  for (let i = 0; i < tpos.count; i++) {
    const x = tpos.getX(i), z = tpos.getZ(i);
    const dist = terrain.distToTrack(x, z);
    const h = terrain.heightAt(x, z, dist);
    tpos.setY(i, h);
    const n = fbm(x * 0.04, z * 0.04);
    c.copy(grassA).lerp(grassB, smoothstep(0.35, 0.7, n)).lerp(grassC, smoothstep(0.6, 0.9, fbm(x * 0.11 + 9, z * 0.11)) * 0.6);
    c.lerp(hill, smoothstep(3, 14, h) * 0.7);
    const coast = terrain.coastZ(x);
    const beach = 1 - smoothstep(coast + 4, coast + 12, z);
    c.lerp(sand, beach);
    if (h < -0.2) c.lerp(wetSand, smoothstep(-0.2, -0.6, h));
    tcol[i * 3] = c.r; tcol[i * 3 + 1] = c.g; tcol[i * 3 + 2] = c.b;
  }
  tgeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  tgeo.computeVertexNormals();
  const gtex = speckleTexture(13, 256, 0.25, 3000);
  const tmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: gtex.clone() });
  tmat.map!.repeat.set(size / 6, size / 6);
  tmat.map!.needsUpdate = true;
  const tmesh = new THREE.Mesh(tgeo, tmat);
  tmesh.receiveShadow = true;
  group.add(tmesh);
  disposables.push(tgeo, tmat);

  // ---------------------------------------------------------------- road ribbon
  {
    const n = track.count;
    const cols = 6;
    const pos: number[] = [], col: number[] = [], uv: number[] = [];
    const idx: number[] = [];
    const smoothCol = (i: number) => {
      const acc = new THREE.Color(0, 0, 0);
      const W = 5;
      for (let k = -W; k <= W; k++) acc.add(ROAD_COLORS[track.samples[(i + k + n) % n].surface]);
      return acc.multiplyScalar(1 / (2 * W + 1));
    };
    for (let i = 0; i <= n; i++) {
      const smp = track.samples[i % n];
      const hw = smp.halfWidth;
      const rc = smoothCol(i % n);
      const offs = [-hw - 1.3, -hw + 0.5, -hw * 0.35, hw * 0.35, hw - 0.5, hw + 1.3];
      const alphas = [0, 1, 1, 1, 1, 0];
      const shades = [0.92, 0.95, 1.03, 1.03, 0.95, 0.92];
      for (let k = 0; k < cols; k++) {
        pos.push(smp.x + smp.nx * offs[k], 0.03, smp.z + smp.nz * offs[k]);
        col.push(rc.r * shades[k], rc.g * shades[k], rc.b * shades[k], alphas[k]);
        uv.push(offs[k] / 4, (i * track.spacing) / 4);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < cols - 1; k++) {
        const a = i * cols + k, b = a + 1, c2 = a + cols, d = c2 + 1;
        idx.push(a, b, c2, b, d, c2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = M.road;
    mat.vertexColors = true;
    const road = new THREE.Mesh(g, mat);
    road.receiveShadow = true;
    road.renderOrder = 1;
    group.add(road);
    disposables.push(g);
  }

  // ---------------------------------------------------------------- start line + arch
  {
    const sp = track.pointAt(0);
    const hw = sp.halfWidth;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, 1.4),
      new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    (line.material as THREE.MeshStandardMaterial).map!.repeat.set(hw * 2 / 0.7 / 4, 2 / 4);
    line.rotation.order = 'YXZ';
    line.rotation.y = sp.heading;
    line.rotation.x = -Math.PI / 2;
    line.position.set(sp.x, 0.045, sp.z);
    line.receiveShadow = true;
    group.add(line);

    const arch = new BatchBuilder();
    const base = mat4(sp.x, 0, sp.z, sp.heading);
    const pole = new THREE.CylinderGeometry(0.16, 0.2, 5.2, 8);
    for (const s of [-1, 1]) {
      const m = mat4(-s * (hw + 0.9), 2.6, 0).premultiply(base);
      arch.add(pole, M.vc, m, 0xc9a35a);
      // bamboo nodes
      for (let k = 0; k < 5; k++) arch.add(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 8), M.vc, mat4(-s * (hw + 0.9), 0.6 + k * 1.05, 0).premultiply(base), 0x9c7a3a);
    }
    group.add(arch.build());
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2 + 1.8, 1.25),
      new THREE.MeshStandardMaterial({
        map: signTexture('KARILING', '#e53935', '#fff8e1', 1024, 160, 'bold 110px "Baloo 2", system-ui, sans-serif', 'BARANGAY DASH • START / FINISH'),
        side: THREE.DoubleSide, roughness: 0.8,
      }),
    );
    banner.position.set(sp.x, 4.7, sp.z);
    banner.rotation.y = sp.heading + Math.PI;
    banner.castShadow = true;
    group.add(banner);
  }

  // ---------------------------------------------------------------- bamboo fence (barriers)
  {
    const postGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6);
    postGeo.translate(0, 0.5, 0);
    const railGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 5);
    railGeo.rotateX(Math.PI / 2);
    const step = 2.6;
    const postsPerSide = Math.floor(L / step);
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0xbf9b55, roughness: 0.8 }), postsPerSide * 2);
    const rails = new THREE.InstancedMesh(railGeo, new THREE.MeshStandardMaterial({ color: 0xd2b26a, roughness: 0.75 }), postsPerSide * 4);
    const m = new THREE.Matrix4();
    const q4 = new THREE.Quaternion();
    let pi = 0, ri = 0;
    const startClear = 3; // gap at the start arch
    for (const side of [-1, 1]) {
      let prev: THREE.Vector3 | null = null;
      for (let k = 0; k < postsPerSide; k++) {
        const s = k * step;
        const p = track.pointAt(s);
        const off = side * (p.halfWidth + track.def.vergeWidth + 0.15);
        const v = new THREE.Vector3(p.x + p.nx * off, 0, p.z + p.nz * off);
        const nearStart = s < startClear || s > L - startClear;
        if (!nearStart) {
          m.compose(v, q4.identity(), new THREE.Vector3(1, rng.range(0.9, 1.1), 1));
          posts.setMatrixAt(pi++, m);
        }
        if (prev && !nearStart) {
          const mid = prev.clone().add(v).multiplyScalar(0.5);
          const len = prev.distanceTo(v);
          const yaw = Math.atan2(v.x - prev.x, v.z - prev.z);
          for (const h of [0.45, 0.85]) {
            m.compose(new THREE.Vector3(mid.x, h, mid.z), q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, len));
            rails.setMatrixAt(ri++, m);
          }
        }
        prev = nearStart ? null : v;
      }
    }
    posts.count = pi;
    rails.count = ri;
    posts.castShadow = rails.castShadow = q.shadows;
    posts.receiveShadow = rails.receiveShadow = true;
    group.add(posts, rails);
  }

  // ---------------------------------------------------------------- banderitas (fiesta bunting)
  const buntings: THREE.Mesh[] = [];
  {
    const spots = [0.06, 0.3, 0.4, 0.5, 0.82];
    const flagCols = [0xe53935, 0xfdd835, 0x1e88e5, 0x43a047, 0xff7043, 0xffffff, 0x8e24aa, 0xec407a];
    for (const f of spots) {
      const s = f * L;
      const p = track.pointAt(s);
      const span = p.halfWidth + track.def.vergeWidth - 0.2;
      const b = new BatchBuilder();
      const base = mat4(p.x, 0, p.z, p.heading);
      const pole = new THREE.CylinderGeometry(0.06, 0.07, 4.6, 6);
      b.add(pole, M.vc, mat4(-span, 2.3, 0).premultiply(base), 0x8a6a3e);
      b.add(pole, M.vc, mat4(span, 2.3, 0).premultiply(base), 0x8a6a3e);
      const nFlags = Math.floor(span * 2 / 0.55);
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0, 0, -0.42, 0], 3));
      tri.computeVertexNormals();
      for (let i = 0; i <= nFlags; i++) {
        const t = i / nFlags;
        const x = lerp(-span, span, t);
        const y = 4.4 - Math.sin(t * Math.PI) * 0.9;
        b.add(tri, M.vcDouble, mat4(x, y, 0).premultiply(base), flagCols[i % flagCols.length]);
      }
      // string
      for (let i = 0; i < 12; i++) {
        const t0 = i / 12, t1 = (i + 1) / 12;
        const x0 = lerp(-span, span, t0), x1 = lerp(-span, span, t1);
        const y0 = 4.4 - Math.sin(t0 * Math.PI) * 0.9, y1 = 4.4 - Math.sin(t1 * Math.PI) * 0.9;
        const len = Math.hypot(x1 - x0, y1 - y0);
        b.add(new THREE.BoxGeometry(len, 0.02, 0.02), M.vc, mat4((x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, Math.atan2(y1 - y0, x1 - x0)).premultiply(base), 0xffffff);
      }
      const g = b.build(false, false);
      group.add(g);
      buntings.push(...(g.children as THREE.Mesh[]));
    }
  }

  // ---------------------------------------------------------------- buildings
  const buildings = new BatchBuilder();
  const signs: THREE.Mesh[] = [];
  const addSign = (m: THREE.Matrix4, text: string, sub: string, bg: string) => {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.8),
      new THREE.MeshStandardMaterial({ map: signTexture(text, bg, '#ffffff', 512, 128, 'bold 64px "Baloo 2", system-ui, sans-serif', sub), roughness: 0.7 }),
    );
    sign.applyMatrix4(m);
    signs.push(sign);
    group.add(sign);
  };

  /** Place a building facing the road at arc length s on a side (±1). */
  const placeFacing = (s: number, side: number, back: number, r: number, fn: (m: THREE.Matrix4) => void): boolean => {
    const p = track.pointAt(s);
    const off = side * (edge(s) + back + r);
    const x = p.x + p.nx * off, z = p.z + p.nz * off;
    if (!isFree(x, z, r, 1.2)) return false;
    if (Math.abs(terrain.heightAt(x, z)) > 0.4) return false;
    // face the road: local +z toward the centreline
    const yaw = Math.atan2(p.x - x, p.z - z);
    const m = mat4(x, terrain.heightAt(x, z), z, yaw);
    fn(m);
    placed.push({ x, z, r });
    colliders.push({ x, z, r });
    return true;
  };

  // Village layout by lap fraction.
  type Kind = 'house' | 'hut' | 'store' | 'line';
  const zones: { from: number; to: number; kinds: Kind[]; density: number }[] = [
    { from: 0.02, to: 0.16, kinds: ['house', 'house', 'store', 'line'], density: 0.75 },
    { from: 0.18, to: 0.3, kinds: ['hut', 'house'], density: 0.55 },
    { from: 0.3, to: 0.56, kinds: ['house', 'hut', 'store', 'house', 'line', 'hut'], density: 0.85 },
    { from: 0.58, to: 0.72, kinds: ['hut'], density: 0.3 },
    { from: 0.74, to: 0.97, kinds: ['house', 'hut', 'house', 'line'], density: 0.6 },
  ];
  let storeCount = 0;
  for (const zn of zones) {
    for (let f = zn.from; f < zn.to; f += 13 / L) {
      for (const side of [-1, 1]) {
        if (!rng.chance(zn.density)) continue;
        const s = f * L + rng.range(-3, 3);
        const kind = rng.pick(zn.kinds);
        if (kind === 'store' && storeCount >= 3) continue;
        const back = rng.range(1.5, 4);
        if (kind === 'house') placeFacing(s, side, back, 3.6, (m) => addHouse(buildings, m, rng));
        else if (kind === 'hut') placeFacing(s, side, back, 3.0, (m) => addNipaHut(buildings, m, rng));
        else if (kind === 'line') placeFacing(s, side, back, 2.8, (m) => addClothesline(buildings, m, rng));
        else if (kind === 'store') {
          placeFacing(s, side, 1.2, 3.4, (m) => {
            addSariSari(buildings, m, rng);
            addSign(mat4(0, 3.25, 2.05).premultiply(m), 'SARI-SARI STORE', storeCount === 0 ? "Aling Nena's" : storeCount === 1 ? "Mang Tonyo's" : "Tindahan ni Lola", ['#1565c0', '#c62828', '#2e7d32'][storeCount % 3]);
            storeCount++;
          });
        }
      }
    }
  }

  // Basketball court in the infield near the start straight (right side = infield).
  for (let tries = 0; tries < 30; tries++) {
    const s = (0.04 + tries * 0.008) * L;
    const p = track.pointAt(s);
    const off = edge(s) + 16;
    const x = p.x + p.nx * off, z = p.z + p.nz * off;
    if (isFree(x, z, 14, 1)) {
      addCourt(buildings, mat4(x, 0, z, p.heading));
      placed.push({ x, z, r: 14 });
      break;
    }
  }

  group.add(buildings.build(q.shadows, true));

  // ---------------------------------------------------------------- rice paddies by the gravel stretch
  {
    const pmat = new THREE.MeshStandardMaterial({ map: paddyTexture(), roughness: 0.35, metalness: 0.05 });
    pmat.map = pmat.map!.clone();
    pmat.map.repeat.set(3, 3);
    pmat.map.needsUpdate = true;
    const dikes = new BatchBuilder();
    for (let f = 0.56; f < 0.74; f += 0.03) {
      for (const side of [-1, 1]) {
        const s = f * L;
        const p = track.pointAt(s);
        const w = rng.range(12, 16), d = rng.range(10, 14);
        const off = side * (edge(s) + 2 + d / 2);
        const x = p.x + p.nx * off, z = p.z + p.nz * off;
        if (!isFree(x, z, Math.max(w, d) / 2, 0.5)) continue;
        if (Math.abs(terrain.heightAt(x, z)) > 0.3) continue;
        const paddy = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pmat);
        paddy.rotation.order = 'YXZ';
        paddy.rotation.y = p.heading;
        paddy.rotation.x = -Math.PI / 2;
        paddy.position.set(x, 0.06, z);
        paddy.receiveShadow = true;
        group.add(paddy);
        const base = mat4(x, 0, z, p.heading);
        const box = new THREE.BoxGeometry(1, 1, 1);
        for (const sx of [-1, 1]) dikes.add(box, M.vc, mat4(sx * w / 2, 0.1, 0, 0, 0, 0, 0.4, 0.22, d + 0.4).premultiply(base), 0x8aa84a);
        for (const sz of [-1, 1]) dikes.add(box, M.vc, mat4(0, 0.1, sz * d / 2, 0, 0, 0, w, 0.22, 0.4).premultiply(base), 0x8aa84a);
        placed.push({ x, z, r: Math.max(w, d) / 2 });
      }
    }
    group.add(dikes.build(false, true));
  }

  // ---------------------------------------------------------------- vegetation (instanced)
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], cast: boolean) => {
    if (list.length === 0) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = cast && q.shadows;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
    disposables.push(geo);
  };
  const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  addWind(palmMat, 0.0018, true);
  const bananaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  addWind(bananaMat, 0.02, true);
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  addWind(grassMat, 0.35, true);
  disposables.push(palmMat, bananaMat, treeMat, grassMat);

  const palmVariants = [palmGeometry(1, 7.5), palmGeometry(2, 8.5), palmGeometry(3, 6.5)];
  const palmLists: THREE.Matrix4[][] = [[], [], []];
  const bananas: THREE.Matrix4[] = [], trees: THREE.Matrix4[] = [], bushes: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [];
  const at = (x: number, z: number, yaw: number, s: number) => mat4(x, terrain.heightAt(x, z) - 0.05, z, yaw, 0, 0, s, s, s);

  const scatter = (count: number, minOff: number, maxOff: number, r: number, cb: (x: number, z: number) => void) => {
    let made = 0;
    for (let tries = 0; tries < count * 6 && made < count; tries++) {
      const s = rng.range(0, L);
      const p = track.pointAt(s);
      const side = rng.chance(0.5) ? 1 : -1;
      const off = side * (edge(s) + rng.range(minOff, maxOff));
      const x = p.x + p.nx * off + rng.range(-3, 3), z = p.z + p.nz * off + rng.range(-3, 3);
      if (!isFree(x, z, r, 0.4)) continue;
      cb(x, z);
      placed.push({ x, z, r });
      made++;
    }
  };
  const fol = q.foliage;
  // Palms lining the course and on the beach.
  scatter(Math.round(120 * fol), 1.2, 30, 1.3, (x, z) => {
    palmLists[rng.int(0, 2)].push(at(x, z, rng.range(0, Math.PI * 2), rng.range(0.85, 1.2)));
    colliders.push({ x, z, r: 0.6 });
  });
  scatter(Math.round(110 * fol), 30, 140, 1.5, (x, z) => palmLists[rng.int(0, 2)].push(at(x, z, rng.range(0, Math.PI * 2), rng.range(0.9, 1.3))));
  scatter(Math.round(55 * fol), 1, 18, 1.2, (x, z) => bananas.push(at(x, z, rng.range(0, 6.28), rng.range(0.9, 1.25))));
  scatter(Math.round(40 * fol), 6, 40, 2.4, (x, z) => { trees.push(at(x, z, rng.range(0, 6.28), rng.range(0.9, 1.3))); colliders.push({ x, z, r: 1.5 }); });
  scatter(Math.round(80 * fol), 60, 200, 2.5, (x, z) => trees.push(at(x, z, rng.range(0, 6.28), rng.range(1, 1.6))));
  scatter(Math.round(70 * fol), 0.6, 12, 0.8, (x, z) => bushes.push(at(x, z, rng.range(0, 6.28), rng.range(0.8, 1.2))));
  scatter(Math.round(40 * fol), 0.4, 25, 0.8, (x, z) => rocks.push(at(x, z, rng.range(0, 6.28), rng.range(0.4, 1.1))));

  palmVariants.forEach((g, i) => instanced(g, palmMat, palmLists[i], true));
  instanced(bananaGeometry(4), bananaMat, bananas, true);
  instanced(treeGeometry(5), treeMat, trees, true);
  instanced(bushGeometry(6), treeMat, bushes, false);
  instanced(rockGeometry(7), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), rocks, true);

  // Grass tufts: on the verges and around the course.
  {
    const list: THREE.Matrix4[] = [];
    for (let i = 0; i < q.grass; i++) {
      const s = rng.range(0, L);
      const p = track.pointAt(s);
      const side = rng.chance(0.5) ? 1 : -1;
      const near = rng.chance(0.55);
      const off = side * (p.halfWidth + (near ? rng.range(0.6, track.def.vergeWidth + 0.5) : rng.range(track.def.vergeWidth + 0.5, 35)));
      const x = p.x + p.nx * off + rng.range(-1, 1), z = p.z + p.nz * off + rng.range(-1, 1);
      if (z < terrain.coastZ(x) + 10) continue;
      const sc = rng.range(0.8, 1.6);
      list.push(mat4(x, terrain.heightAt(x, z), z, rng.range(0, 6.28), 0, 0, sc, sc * rng.range(0.8, 1.3), sc));
    }
    instanced(grassGeometry(), grassMat, list, false);
  }

  // ---------------------------------------------------------------- mountains + clouds
  {
    const b = new BatchBuilder();
    const mmat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: true });
    for (let i = 0; i < 26; i++) {
      const a = lerp(-0.15, Math.PI + 0.15, i / 25) + rng.range(-0.05, 0.05); // north arc (z > 0)
      const r = rng.range(430, 600);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r + 40;
      const h = rng.range(70, 160);
      const g = new THREE.ConeGeometry(rng.range(70, 120), h, 7, 3);
      const p = g.getAttribute('position');
      for (let k = 0; k < p.count; k++) if (p.getY(k) > -h / 2 + 1 && p.getY(k) < h / 2 - 1) p.setX(k, p.getX(k) * rng.range(0.85, 1.15));
      b.add(g, mmat, mat4(x, h / 2 - 8, z, rng.range(0, 6)), new THREE.Color().setHSL(0.3, 0.35, rng.range(0.28, 0.36)));
    }
    // a small island out at sea
    b.add(new THREE.ConeGeometry(60, 40, 8, 2), mmat, mat4(cx + 120, 8, cz - 380, 0.4), 0x3f7f3a);
    const mg = b.build(false, false);
    group.add(mg);

    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdde8f0, emissiveIntensity: 0.35, flatShading: false, fog: false });
    const cb = new BatchBuilder();
    for (let i = 0; i < 18; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(250, 650);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = rng.range(90, 160);
      const puffs = rng.int(4, 7);
      for (let k = 0; k < puffs; k++) {
        const s = rng.range(14, 26);
        cb.add(new THREE.IcosahedronGeometry(1, 2), cloudMat, mat4(x + (k - puffs / 2) * s * 0.9, y + rng.range(-3, 6), z + rng.range(-8, 8), 0, 0, 0, s, s * 0.6, s * 0.8));
      }
    }
    const clouds = cb.build(false, false);
    clouds.name = 'clouds';
    group.add(clouds);
  }

  // ---------------------------------------------------------------- spectator spots near the start
  const spectatorSpots: { x: number; z: number; heading: number }[] = [];
  for (const [f, side] of [[0.012, -1], [0.02, -1], [0.98, 1], [0.03, 1], [0.97, -1], [0.04, -1], [0.33, 1], [0.45, -1]] as [number, number][]) {
    const s = f * L;
    const p = track.pointAt(s);
    const off = side * (edge(s) + 1.0);
    const x = p.x + p.nx * off, z = p.z + p.nz * off;
    spectatorSpots.push({ x, z, heading: Math.atan2(p.x - x, p.z - z) });
  }

  const clouds = group.getObjectByName('clouds');
  return {
    group, terrain, colliders, spectatorSpots,
    update(time: number) {
      windUniforms.uTime.value = time;
      if (clouds) clouds.position.x = Math.sin(time * 0.01) * 30;
      buntings.forEach((m, i) => { m.rotation.z = Math.sin(time * 2 + i) * 0.004; });
      const seaMap = (sea.material as THREE.MeshStandardMaterial).map!;
      seaMap.offset.set(time * 0.002, time * 0.0013);
    },
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      for (const d of disposables) d.dispose();
      for (const sgn of signs) (sgn.material as THREE.Material).dispose();
    },
  };
}

export function surfaceDustColor(id: SurfaceId): number {
  return SURFACES[id].dustColor;
}

