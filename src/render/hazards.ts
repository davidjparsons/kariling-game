import * as THREE from 'three';
import { CANAL } from '../config/hazards';
import { Rng } from '../core/rng';
import { profileHeight, type Hazard, type HazardField } from '../sim/hazards';
import { BatchBuilder, mat4 } from './batch';
import { flatTyreGeometry } from './kariling';
import { sharedMaterials } from './materials';
import { speckleTexture } from './textures';

export interface HazardBuild {
  group: THREE.Group;
  update(time: number): void;
}

/**
 * Visual models for every hazard in the field, plus concrete roadside canals.
 * Shapes follow the same height profiles the physics uses.
 */
export function buildHazards(field: HazardField, shadows: boolean): HazardBuild {
  const group = new THREE.Group();
  const track = field.track;
  const rng = new Rng(77);
  const M = sharedMaterials();
  const b = new BatchBuilder();
  const animated: ((t: number) => void)[] = [];

  const concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, map: speckleTexture(31, 128, 0.22, 900) });
  const decal = (m: THREE.MeshStandardMaterial) => { m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3; return m; };

  for (const h of field.hazards) {
    const pt = track.pointAt(h.s);
    const hw = pt.halfWidth;
    // Local frame: +z along the track, +x to the LEFT (three.js), so x = −d.
    const base = mat4(pt.x + pt.nx * h.d, 0, pt.z + pt.nz * h.d, pt.heading);
    const len = h.halfLen * 2;
    const wid = h.fullWidth ? hw * 2 + 0.6 : h.halfWid * 2;
    switch (h.type) {
      case 'cementHump': {
        // Split across the road so each painted band gets its own triangles.
        const g = extrudeProfile(h, wid, 28, Math.ceil(wid / 0.55));
        // Painted yellow/black warning stripes across the hump, weathered concrete flanks.
        colorByX(g, wid, 0.55, [0xf5c518, 0x262626], 0x9d988f);
        b.add(g, concrete, base);
        // Cat's-eye road studs along the crown and a worn concrete apron each side.
        const top = h.cfg.height;
        const stud = new THREE.BoxGeometry(0.12, 0.03, 0.09);
        for (let x = -wid / 2 + 0.55; x < wid / 2 - 0.3; x += 1.1) {
          b.add(stud, M.vc, mat4(x, top + 0.012, -h.halfLen * 0.3).premultiply(base), 0xfff3c4);
          b.add(stud, M.vc, mat4(x, top + 0.012, h.halfLen * 0.3).premultiply(base), 0xfff3c4);
        }
        for (const sz of [-1, 1]) {
          b.add(new THREE.BoxGeometry(wid, 0.012, 0.35), M.vcFlat, mat4(0, 0.006, sz * (h.halfLen + 0.15)).premultiply(base), 0x8f8a80);
        }
        break;
      }
      case 'tyreStrip': {
        // Cut-open old tyres laid end to end across the road, painted yellow/black (ref 14).
        const seg = 0.62;
        const n = Math.ceil(wid / seg);
        const shell = new THREE.CylinderGeometry(0.13, 0.13, seg - 0.03, 12, 1, true, -Math.PI / 2, Math.PI);
        shell.rotateZ(Math.PI / 2);
        shell.scale(1, h.cfg.height / 0.13, h.halfLen / 0.13);
        const ridge = new THREE.BoxGeometry(seg - 0.06, 0.02, 0.03);
        for (let i = 0; i < n; i++) {
          const x = -wid / 2 + seg * (i + 0.5);
          const col = i % 2 ? 0x1f1f1f : 0xf2c230;
          b.add(shell, M.vcDouble, mat4(x, 0, 0).premultiply(base), col);
          for (let k = -3; k <= 3; k++) {
            const a = (k / 3) * 1.1;
            b.add(ridge, M.vc, mat4(x, Math.cos(a) * h.cfg.height + 0.005, Math.sin(a) * h.halfLen * 0.95, 0, -a).premultiply(base), i % 2 ? 0x111111 : 0xd9a81f);
          }
        }
        break;
      }
      case 'dirtMound': {
        const g = heightfield(h, 18, (u, v) => profileHeight(h.cfg, u, v, false));
        tint(g, 0x8f5a30, 0.22, rng);
        shadeBySlope(g, 0.45);
        b.add(g, M.wall, base);
        for (let i = 0; i < 6; i++) {
          const u = rng.range(-0.8, 0.8), v = rng.range(-0.8, 0.8);
          const y = profileHeight(h.cfg, u, v, false);
          b.add(new THREE.DodecahedronGeometry(rng.range(0.04, 0.08), 0), M.vcFlat, mat4(-v * h.halfWid, y, u * h.halfLen, rng.range(0, 6)), 0x8d8478);
        }
        break;
      }
      case 'ramp': {
        const g = extrudeProfile(h, wid, 20);
        tint(g, 0xa9743f, 0.15, rng);
        b.add(g, M.wall, base);
        // Planks up the slope and posts at the lip.
        const rise = h.cfg.height, run = h.halfLen * 1.75;
        const ang = Math.atan2(rise, run);
        const plankLen = Math.hypot(rise, run);
        for (let i = 0; i < 5; i++) {
          const x = -wid / 2 + 0.3 + (i * (wid - 0.6)) / 4;
          b.add(new THREE.BoxGeometry(0.22, 0.03, plankLen), M.vc,
            mat4(x, rise / 2 + 0.02, -h.halfLen + run / 2, 0, -ang).premultiply(base), i % 2 ? 0x9c6b3c : 0x8a5c31);
        }
        for (const x of [-wid / 2 + 0.2, wid / 2 - 0.2]) {
          b.add(new THREE.CylinderGeometry(0.05, 0.05, rise + 0.15, 6), M.vc, mat4(x, (rise + 0.15) / 2, h.halfLen * 0.75).premultiply(base), 0x6d4c2e);
        }
        // Warning flag on the lip.
        b.add(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 5), M.vc, mat4(wid / 2 - 0.2, rise + 0.6, h.halfLen * 0.75).premultiply(base), 0x5d4037);
        b.add(new THREE.PlaneGeometry(0.35, 0.22), M.vcDouble, mat4(wid / 2 - 0.02, rise + 1.05, h.halfLen * 0.75, Math.PI / 2).premultiply(base), 0xe53935);
        break;
      }
      case 'log': {
        const r = h.cfg.height / 2;
        const logGeo = new THREE.CylinderGeometry(r, r * 1.05, wid, 14, 4);
        // Knobbly bark.
        const p = logGeo.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const k = 1 + (rng.next() - 0.5) * 0.12;
          p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
        }
        logGeo.computeVertexNormals();
        logGeo.rotateZ(Math.PI / 2);
        tint(logGeo, 0x6b4a2f, 0.25, rng);
        b.add(logGeo, M.vcFlat, mat4(0, r, 0).premultiply(base));
        for (const s of [-1, 1]) {
          b.add(new THREE.CircleGeometry(r * 0.98, 14), M.vc, mat4(s * (wid / 2 + 0.001), r, 0, s * Math.PI / 2).premultiply(base), 0xd8b98a);
          b.add(new THREE.TorusGeometry(r * 0.55, 0.008, 4, 14), M.vc, mat4(s * (wid / 2 + 0.003), r, 0, s * Math.PI / 2).premultiply(base), 0x9c7a50);
        }
        // Stub branches and a patch of moss.
        b.add(new THREE.CylinderGeometry(0.03, 0.045, 0.35, 6), M.vc, mat4(wid * 0.2, r * 1.8, 0.05, 0, 0.3, 0.6).premultiply(base), 0x5d4027);
        b.add(new THREE.CylinderGeometry(0.025, 0.035, 0.28, 6), M.vc, mat4(-wid * 0.25, r * 1.6, -0.06, 0, -0.5, -0.4).premultiply(base), 0x5d4027);
        b.add(new THREE.SphereGeometry(r * 0.6, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.vc, mat4(-wid * 0.05, r * 1.55, 0, 0, 0, 0, 1.6, 0.35, 1).premultiply(base), 0x6f9a3a);
        break;
      }
      case 'flatTyre': {
        // Lying flat on the road: the whole section sits above the surface (not half-buried),
        // slightly squashed like a deflated tyre.
        const tube = 0.085;
        const g = flatTyreGeometry(0.36, tube);
        const lift = tube * 1.04 * 0.92;
        b.add(g, M.vcDouble, mat4(0, lift, 0, rng.range(0, 6), 0, rng.range(-0.04, 0.04), 1, 0.92, 1).premultiply(base), 0x2a2a2c);
        // Faded paint band so it reads against the dirt.
        b.add(new THREE.TorusGeometry(0.265, 0.012, 4, 28).rotateX(Math.PI / 2), M.vc, mat4(0, lift * 2 - 0.004, 0).premultiply(base), 0xd8b23a);
        break;
      }
      case 'fronds': {
        // A fallen, browning coconut frond plus a dead branch.
        const rib = new THREE.CylinderGeometry(0.02, 0.035, len * 1.3, 6);
        rib.rotateX(Math.PI / 2);
        const yaw = rng.range(-0.5, 0.5);
        b.add(rib, M.vc, mat4(0, 0.03, 0, yaw).premultiply(base), 0x8a6d3b);
        const leaf = new THREE.PlaneGeometry(0.1, 0.8);
        leaf.rotateX(-Math.PI / 2);
        for (let i = 0; i < 22; i++) {
          const t = i / 21 - 0.5;
          for (const s of [-1, 1]) {
            b.add(leaf, M.vcDouble, mat4(Math.sin(yaw) * t * len * 1.2 + s * 0.36 * Math.cos(yaw), 0.05 + rng.range(0, 0.03), Math.cos(yaw) * t * len * 1.2 - s * 0.36 * Math.sin(yaw), yaw + s * 0.9).premultiply(base),
              rng.chance(0.4) ? 0xc29a3a : 0x5f9a2a);
          }
        }
        b.add(new THREE.CylinderGeometry(0.03, 0.05, h.halfWid * 1.6, 6), M.vc, mat4(h.halfWid * 0.2, 0.05, -0.4, 0, 0, Math.PI / 2 + 0.3).premultiply(base), 0x5d4027);
        break;
      }
      case 'pothole': {
        const g = blobGeometry(h.halfLen, h.halfWid, 20, rng, 0.18);
        const m = decal(new THREE.MeshStandardMaterial({ color: 0x3e3427, roughness: 0.95 }));
        const mesh = new THREE.Mesh(g, m);
        mesh.applyMatrix4(mat4(0, 0.012, 0).premultiply(base));
        mesh.receiveShadow = true;
        group.add(mesh);
        const water = new THREE.Mesh(blobGeometry(h.halfLen * 0.55, h.halfWid * 0.5, 14, rng, 0.2),
          decal(new THREE.MeshStandardMaterial({ color: 0x5b6b70, roughness: 0.08, metalness: 0.2 })));
        water.applyMatrix4(mat4(0.05, 0.014, 0).premultiply(base));
        group.add(water);
        // Broken rim chunks.
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          b.add(new THREE.BoxGeometry(0.12, 0.04, 0.08), M.vcFlat,
            mat4(Math.cos(a) * h.halfWid * 1.02, 0.03, Math.sin(a) * h.halfLen * 1.02, a + rng.range(-0.3, 0.3)).premultiply(base), 0x8d867a);
        }
        break;
      }
      case 'mud': {
        const g = blobGeometry(h.halfLen, h.halfWid, 28, rng, 0.22);
        const mesh = new THREE.Mesh(g, decal(new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.35 })));
        mesh.applyMatrix4(mat4(0, 0.01, 0).premultiply(base));
        mesh.receiveShadow = true;
        group.add(mesh);
        for (let i = 0; i < 3; i++) {
          const pud = new THREE.Mesh(blobGeometry(rng.range(0.4, 0.8), rng.range(0.3, 0.6), 12, rng, 0.25),
            decal(new THREE.MeshStandardMaterial({ color: 0x6f5a45, roughness: 0.05, metalness: 0.15 })));
          pud.applyMatrix4(mat4(rng.range(-h.halfWid * 0.5, h.halfWid * 0.5), 0.012, rng.range(-h.halfLen * 0.6, h.halfLen * 0.6), rng.range(0, 6)).premultiply(base));
          group.add(pud);
        }
        // Tyre ruts.
        for (const x of [-0.6, 0.7]) {
          const rut = new THREE.Mesh(new THREE.PlaneGeometry(0.12, len * 0.85), decal(new THREE.MeshStandardMaterial({ color: 0x3f2a16, roughness: 0.5 })));
          rut.rotation.x = -Math.PI / 2;
          rut.applyMatrix4(mat4(x, 0.013, 0, 0.05).premultiply(base));
          group.add(rut);
        }
        break;
      }
      case 'boost': {
        // Three glowing chevrons that light up in sequence.
        const chev = new THREE.Shape();
        chev.moveTo(-0.9, -0.25); chev.lineTo(0, 0.35); chev.lineTo(0.9, -0.25); chev.lineTo(0.9, 0.1); chev.lineTo(0, 0.7); chev.lineTo(-0.9, 0.1); chev.closePath();
        const cg = new THREE.ShapeGeometry(chev);
        // Shape +y is the arrow tip. rotateX(-90°) would send it to local −z (backwards along
        // the track), so lay it flat with +y → +z instead: arrows point in the racing direction.
        cg.rotateX(Math.PI / 2);
        cg.scale(wid / 2, 1, 1.2);
        // rotateX(+90°) flips the face downwards; restore an upward normal and winding.
        flipFaces(cg);
        const mats: THREE.MeshStandardMaterial[] = [];
        for (let i = 0; i < 3; i++) {
          const m = decal(new THREE.MeshStandardMaterial({ color: 0xffb300, emissive: 0xff6d00, emissiveIntensity: 0.6, roughness: 0.4 }));
          const mesh = new THREE.Mesh(cg, m);
          mesh.applyMatrix4(mat4(0, 0.016, -h.halfLen + 0.6 + i * 1.2).premultiply(base));
          group.add(mesh);
          mats.push(m);
        }
        const border = new THREE.Mesh(new THREE.PlaneGeometry(wid + 0.2, len + 0.2), decal(new THREE.MeshStandardMaterial({ color: 0x1e88e5, roughness: 0.6 })));
        border.rotation.x = -Math.PI / 2;
        border.applyMatrix4(mat4(0, 0.01, 0).premultiply(base));
        group.add(border);
        animated.push((t) => mats.forEach((m, i) => { m.emissiveIntensity = 0.4 + 1.6 * Math.max(0, Math.sin(t * 7 - i * 1.2)); }));
        break;
      }
      case 'poo': {
        // Cartoon swirl: stacked rings and a tip, with a couple of buzzing flies.
        const brown = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.35 });
        const poo = new THREE.Group();
        [[0.11, 0.035], [0.085, 0.09], [0.06, 0.14]].forEach(([r, y]) => {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.45, 8, 16), brown);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = y;
          poo.add(ring);
        });
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 8), brown);
        tip.position.y = 0.2;
        tip.rotation.z = 0.4;
        poo.add(tip);
        poo.applyMatrix4(base);
        poo.traverse((o) => { o.castShadow = true; });
        group.add(poo);
        const flyMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const flies = [0, 1].map(() => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 3), flyMat); group.add(f); return f; });
        const cx = poo.position.x, cz = poo.position.z;
        animated.push((t) => flies.forEach((f, i) => f.position.set(cx + Math.cos(t * (5 + i) + i * 3) * 0.2, 0.3 + Math.sin(t * 9 + i) * 0.06, cz + Math.sin(t * (5 + i) + i * 3) * 0.2)));
        break;
      }
    }
  }

  // ---------------------------------------------------------------- canals
  if (field.canals.length > 0) group.add(buildCanals(field));

  const built = b.build(shadows, true);
  group.add(built);
  return { group, update: (t) => animated.forEach((f) => f(t)) };
}

/** Concrete U-channel with dark water, following the road edge on canal sections. */
function buildCanals(field: HazardField): THREE.Group {
  const track = field.track;
  const g = new THREE.Group();
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const wpos: number[] = [], widx: number[] = [];
  const conc = new THREE.Color(0xb7b2a8), dark = new THREE.Color(0x6e6a63), curb = new THREE.Color(0xd6d1c6);
  for (const c of field.canals) {
    const side = c.side;
    const L = track.length;
    const span = ((c.s1 - c.s0) % L + L) % L;
    const steps = Math.ceil(span / 1);
    // Cross-section from road edge outwards: curb top, inner wall down, floor, outer wall up, outer lip.
    for (let i = 0; i <= steps; i++) {
      const s = c.s0 + (span * i) / steps;
      const pt = track.pointAt(s);
      const { inner, outer } = field.canalEdges(pt.halfWidth);
      const D = CANAL.depth;
      const prof: [number, number, THREE.Color][] = [
        [pt.halfWidth - 0.05, 0.035, curb], [inner, 0.035, curb], [inner, -D, dark], [inner + 0.05, -D, dark],
        [outer - 0.05, -D, dark], [outer, -D, dark], [outer, 0.03, curb], [outer + 0.35, 0.03, conc],
      ];
      const base = pos.length / 3;
      for (const [d, y, cc] of prof) {
        const sd = side * d;
        pos.push(pt.x + pt.nx * sd, y, pt.z + pt.nz * sd);
        col.push(cc.r, cc.g, cc.b);
      }
      const wb = wpos.length / 3;
      for (const d of [inner, outer]) {
        const sd = side * d;
        wpos.push(pt.x + pt.nx * sd, -D + 0.14, pt.z + pt.nz * sd);
      }
      if (i > 0) {
        const n = prof.length;
        for (let k = 0; k < n - 1; k++) {
          const a = base - n + k, b2 = a + 1, c2 = base + k, d2 = c2 + 1;
          if (side > 0) idx.push(a, c2, b2, b2, c2, d2); else idx.push(a, b2, c2, b2, d2, c2);
        }
        const wa = wb - 2;
        if (side > 0) widx.push(wa, wb, wa + 1, wa + 1, wb, wb + 1); else widx.push(wa, wa + 1, wb, wa + 1, wb + 1, wb);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // Flat-shade the channel so its corners stay crisp (smooth normals made it look like a pipe).
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  const mesh = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  g.add(mesh);
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wgeo.setIndex(widx);
  wgeo.computeVertexNormals();
  g.add(new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: 0x3d4f3a, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide })));
  return g;
}

/** Reverse triangle winding and normals (after a mirroring transform). */
function flipFaces(g: THREE.BufferGeometry): void {
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  }
  const n = g.getAttribute('normal');
  if (n) { for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); n.needsUpdate = true; }
}

/** Extrude the hazard's along-track height profile across its width (local x). */
function extrudeProfile(h: Hazard, width: number, steps: number, acrossSteps = 1): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-h.halfLen, 0);
  for (let i = 0; i <= steps; i++) {
    const u = -1 + (2 * i) / steps;
    shape.lineTo(u * h.halfLen, Math.max(0.002, profileHeight(h.cfg, u, 0, true)));
  }
  shape.lineTo(h.halfLen, 0);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: acrossSteps });
  // Shape is in XY (x = along, y = up); extrusion along +Z. Map to local: along → +z, across → x.
  g.translate(0, 0, -width / 2);
  g.rotateY(-Math.PI / 2);
  return g.toNonIndexed();
}

/** Displaced grid over the hazard footprint (local x across, z along). */
function heightfield(h: Hazard, n: number, fn: (u: number, v: number) => number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(h.halfWid * 2, h.halfLen * 2, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, Math.max(0.01, fn(z / h.halfLen, -x / h.halfWid)));
  }
  g.computeVertexNormals();
  return g;
}

/** Irregular flat blob (puddles, potholes, mud) in the XZ plane. */
function blobGeometry(rz: number, rx: number, n: number, rng: Rng, jag: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 - jag / 2 + rng.next() * jag;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * rz * k;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Bake a noisy base colour into a vertex-colour attribute. */
function tint(g: THREE.BufferGeometry, color: number, noise: number, rng: Rng): void {
  const n = g.getAttribute('position').count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 - noise / 2 + rng.next() * noise;
    arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** Stripe a geometry's top surface by local x (painted humps); sides get `side` colour. */
function colorByX(g: THREE.BufferGeometry, width: number, band: number, colors: number[], side: number): void {
  const p = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const arr = new Float32Array(p.count * 3);
  const cs = colors.map((c) => new THREE.Color(c));
  const sc = new THREE.Color(side);
  // Colour per triangle so stripes have crisp edges.
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const up = (nrm.getY(i) + nrm.getY(i + 1) + nrm.getY(i + 2)) / 3;
    const c = up > 0.3 ? cs[Math.floor((cx + width / 2) / band) % cs.length] : sc;
    for (let k = 0; k < 3; k++) { arr[(i + k) * 3] = c.r; arr[(i + k) * 3 + 1] = c.g; arr[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** Darken steep faces so mounds read against a same-coloured road. */
function shadeBySlope(g: THREE.BufferGeometry, k: number): void {
  const n = g.getAttribute('normal'), c = g.getAttribute('color');
  for (let i = 0; i < n.count; i++) {
    const f = 1 - k * (1 - n.getY(i)) + 0.12 * Math.max(0, n.getZ(i));
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
}
