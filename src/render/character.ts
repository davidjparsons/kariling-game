import * as THREE from 'three';
import type { CharacterAppearance } from '../config/appearance';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp } from '../core/math';

export type RunnerMode =
  | 'idle' | 'run' | 'struggle' | 'chase' | 'fall' | 'recover' | 'shock' | 'stunned' | 'clean' | 'eww'
  | 'celebrate' | 'sad' | 'cheer';

export interface RunnerAnimInput {
  speed: number;
  /** 0..1 pushing effort. */
  pushing: number;
  /** Body lean (rad, + = right). */
  lean: number;
  wobble: number;
  mode: RunnerMode;
  /** Seconds since entering mode. */
  modeTime: number;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

function mat(color: number, rough = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

/** Lathe from (radius, height) pairs; `sz` squashes depth so bodies aren't round tubes. */
function lathe(key: string, pts: [number, number][], segs = 16, sz = 0.78): THREE.BufferGeometry {
  return geo(key, () => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
    g.scale(1, 1, sz);
    g.computeVertexNormals();
    return g;
  });
}

/** Tapered limb segment from y=0 down to y=-len. */
function limb(key: string, r0: number, r1: number, len: number): THREE.BufferGeometry {
  return geo(key, () => {
    const g = new THREE.CylinderGeometry(r0, r1, len, 10, 1);
    g.translate(0, -len / 2, 0);
    return g;
  });
}

/** Joint with a smoothed rotation target. */
class Joint {
  target = new THREE.Euler();
  constructor(public obj: THREE.Object3D) {}
  apply(dt: number, lambda = 14): void {
    this.obj.rotation.x = damp(this.obj.rotation.x, this.target.x, lambda, dt);
    this.obj.rotation.y = damp(this.obj.rotation.y, this.target.y, lambda, dt);
    this.obj.rotation.z = damp(this.obj.rotation.z, this.target.z, lambda, dt);
  }
}

type MeshFn = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh;

/**
 * Stylised but anatomically readable runner, built from shaped primitives (lathed torso and
 * shorts, tapered limbs, hands with fingers, shaped feet, detailed face). Faces +z; right side is −x.
 */
export class Runner {
  readonly root = new THREE.Group();
  /** Grip point in the right hand. */
  readonly rightGrip = new THREE.Object3D();
  private body = new THREE.Group();
  private torsoPivot = new THREE.Group();
  private headPivot = new THREE.Group();
  private ponytail: THREE.Object3D | null = null;
  private rShoulder!: THREE.Group;
  private rElbow!: THREE.Group;
  private rHand!: THREE.Group;
  private lHand!: THREE.Group;
  private upperLen = 0;
  private lowerLen = 0;
  private j: Record<'lShoulder' | 'rShoulder' | 'lElbow' | 'rElbow' | 'lHip' | 'rHip' | 'lKnee' | 'rKnee' | 'torso' | 'head', Joint>;
  private phase = 0;
  private bob = 0;
  private baseY = 0;
  private time = 0;
  private materials: THREE.Material[] = [];
  readonly height: number;
  readonly scale: number;

  constructor(public look: CharacterAppearance) {
    const adult = look.age === 'adult';
    this.scale = adult ? 1.3 : 1;
    this.height = (adult ? 1.27 : 1.24) * this.scale;
    this.root.add(this.body);
    this.body.scale.setScalar(this.scale);

    const skin = this.m(mat(look.skin, 0.62));
    const shirt = this.m(mat(look.shirtColor, 0.8));
    const shirtDark = this.m(mat(new THREE.Color(look.shirtColor).multiplyScalar(0.78).getHex(), 0.8));
    const bottoms = this.m(mat(look.bottomsColor, 0.85));
    const hairM = this.m(mat(look.hairColor, 0.55));
    const shoe = this.m(mat(look.footwearColor, 0.6));
    const white = this.m(mat(0xffffff, 0.25));
    const iris = this.m(mat(0x4a2c17, 0.3));
    const black = this.m(mat(0x121212, 0.3));
    const sole = this.m(mat(0x3d3b39, 0.9));
    const lip = this.m(mat(new THREE.Color(look.skin).lerp(new THREE.Color(0xa0453f), 0.45).getHex(), 0.5));

    const mesh: MeshFn = (g, m, parent, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };

    // Proportions (child units; adults are scaled and get a relatively smaller head).
    const hipY = adult ? 0.6 : 0.56;
    const thigh = adult ? 0.29 : 0.27, shin = adult ? 0.28 : 0.26;
    const torsoH = adult ? 0.36 : 0.32;
    const shoulderW = adult ? 0.165 : 0.15;

    // ---- pelvis + torso (lathed, flattened front-to-back)
    this.torsoPivot.position.y = hipY;
    this.body.add(this.torsoPivot);
    const shortsLen = look.bottoms === 'shorts' ? 1 : 1;
    mesh(lathe(`pelvis${adult}`, [[0.001, -0.06], [0.1, -0.05], [0.118, 0.0], [0.112, 0.06], [0.104, 0.09], [0.001, 0.09]], 16, 0.72 * shortsLen), bottoms, this.torsoPivot);
    // Waistband.
    mesh(geo('band', () => new THREE.TorusGeometry(0.106, 0.012, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.72)), bottoms, this.torsoPivot, 0, 0.085, 0);
    const torsoPts: [number, number][] = [
      [0.001, 0.07], [0.104, 0.07], [0.108, 0.12], [0.112, 0.18], [0.122, torsoH * 0.72], [0.128, torsoH * 0.86],
      [0.118, torsoH * 0.96], [0.075, torsoH + 0.01], [0.045, torsoH + 0.02], [0.001, torsoH + 0.02],
    ];
    const sleeveless = look.shirt === 'tank';
    mesh(lathe(`torso${adult}`, torsoPts, 18, 0.66), shirt, this.torsoPivot);
    // Shirt hem + collar.
    mesh(geo('hem', () => new THREE.TorusGeometry(0.106, 0.009, 6, 18).rotateX(Math.PI / 2).scale(1, 1, 0.68)), shirtDark, this.torsoPivot, 0, 0.075, 0);
    if (look.shirt === 'jersey') {
      // Side panels + number on the back.
      const stripe = this.m(mat(0xffffff, 0.6));
      for (const s of [-1, 1]) {
        const p = mesh(geo('jside', () => new THREE.BoxGeometry(0.012, torsoH * 0.6, 0.06)), stripe, this.torsoPivot, s * 0.122, torsoH * 0.5, 0);
        p.rotation.z = s * 0.06;
      }
      const num = mesh(geo('jnum', () => new THREE.PlaneGeometry(0.09, 0.1)), this.m(new THREE.MeshStandardMaterial({ map: numberTexture(7), transparent: true })), this.torsoPivot, 0, torsoH * 0.62, -0.088);
      num.rotation.y = Math.PI;
    } else if (!sleeveless) {
      mesh(geo('collar', () => new THREE.TorusGeometry(0.05, 0.011, 6, 16).rotateX(Math.PI / 2 - 0.25)), shirtDark, this.torsoPivot, 0, torsoH + 0.005, 0.008);
    } else {
      // Tank top: show the shoulders and arm holes.
      for (const s of [-1, 1]) mesh(geo('shoulderSkin', () => new THREE.SphereGeometry(0.046, 10, 8)), skin, this.torsoPivot, s * shoulderW, torsoH - 0.02, 0);
    }
    // Neck.
    mesh(geo('neck', () => new THREE.CylinderGeometry(0.036, 0.042, 0.08, 10)), skin, this.torsoPivot, 0, torsoH + 0.04, 0);

    // ---- head
    this.headPivot.position.y = torsoH + 0.07;
    this.torsoPivot.add(this.headPivot);
    const headR = adult ? 0.118 : 0.132;
    this.buildFace(headR, skin, white, iris, black, lip, hairM, mesh, look);

    // ---- arms (tapered, with hands)
    this.upperLen = adult ? 0.2 : 0.165;
    this.lowerLen = adult ? 0.18 : 0.15;
    const mkArm = (side: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * shoulderW, torsoH - 0.035, 0);
      this.torsoPivot.add(shoulder);
      const upperM = sleeveless ? skin : shirt;
      mesh(geo('deltoid', () => new THREE.SphereGeometry(0.044, 10, 8)), upperM, shoulder);
      if (!sleeveless) {
        mesh(limb(`sleeve${adult}`, 0.046, 0.042, this.upperLen * 0.55), shirt, shoulder);
        mesh(limb(`upperSkin${adult}`, 0.034, 0.03, this.upperLen * 0.5), skin, shoulder, 0, -this.upperLen * 0.5, 0);
      } else {
        mesh(limb(`upperBare${adult}`, 0.036, 0.03, this.upperLen), skin, shoulder);
      }
      const elbow = new THREE.Group();
      elbow.position.y = -this.upperLen;
      shoulder.add(elbow);
      mesh(geo('elbowJ', () => new THREE.SphereGeometry(0.03, 8, 6)), skin, elbow);
      mesh(limb(`forearm${adult}`, 0.03, 0.024, this.lowerLen), skin, elbow);
      const hand = this.buildHand(skin, mesh, side);
      hand.position.y = -this.lowerLen;
      elbow.add(hand);
      return { shoulder, elbow, hand };
    };
    const lArm = mkArm(1);
    const rArm = mkArm(-1);
    this.rShoulder = rArm.shoulder;
    this.rElbow = rArm.elbow;
    this.rHand = rArm.hand;
    this.lHand = lArm.hand;
    this.rightGrip.position.set(0, -0.045, 0.012);
    this.rHand.add(this.rightGrip);

    // ---- legs
    const mkLeg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.064, hipY - 0.03, 0);
      this.body.add(hip);
      const trousers = look.bottoms === 'trousers';
      // Shorts leg (flared) then skin, or full trousers.
      mesh(limb(`shortLeg${adult}`, 0.062, 0.066, thigh * (trousers ? 1 : 0.62)), bottoms, hip);
      if (!trousers) mesh(limb(`thighSkin${adult}`, 0.048, 0.04, thigh * 0.42), skin, hip, 0, -thigh * 0.58, 0);
      const knee = new THREE.Group();
      knee.position.y = -thigh;
      hip.add(knee);
      mesh(geo('kneeJ', () => new THREE.SphereGeometry(0.041, 8, 6)), trousers ? bottoms : skin, knee);
      mesh(limb(`shin${adult}${trousers}`, trousers ? 0.046 : 0.039, trousers ? 0.044 : 0.03, shin), trousers ? bottoms : skin, knee);
      // Calf bulge at the back.
      if (!trousers) mesh(geo('calf', () => new THREE.SphereGeometry(0.036, 8, 6).scale(0.9, 1.6, 0.9)), skin, knee, 0, -shin * 0.35, -0.01);
      const foot = new THREE.Group();
      foot.position.y = -shin;
      knee.add(foot);
      this.buildFoot(foot, look, skin, shoe, sole, mesh);
      return { hip, knee };
    };
    const lLeg = mkLeg(1);
    const rLeg = mkLeg(-1);

    this.j = {
      lShoulder: new Joint(lArm.shoulder), rShoulder: new Joint(rArm.shoulder),
      lElbow: new Joint(lArm.elbow), rElbow: new Joint(rArm.elbow),
      lHip: new Joint(lLeg.hip), rHip: new Joint(rLeg.hip),
      lKnee: new Joint(lLeg.knee), rKnee: new Joint(rLeg.knee),
      torso: new Joint(this.torsoPivot), head: new Joint(this.headPivot),
    };
    this.bake();
  }

  /**
   * Merge each joint's static meshes into one vertex-coloured mesh. Keeps all the modelled
   * detail but cuts ~90 draw calls per character to ~20 (important on phones).
   */
  private bake(): void {
    const shared = this.m(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    const nodes: THREE.Object3D[] = [];
    this.root.traverse((o) => { if (!(o as THREE.Mesh).isMesh) nodes.push(o); });
    const color = new THREE.Color();
    for (const node of nodes) {
      const meshes = node.children.filter((c): c is THREE.Mesh => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return false;
        const mat = m.material as THREE.MeshStandardMaterial;
        return !mat.transparent && !mat.map;
      });
      if (meshes.length < 2) continue;
      const parts: THREE.BufferGeometry[] = [];
      for (const m of meshes) {
        m.updateMatrix();
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        color.copy((m.material as THREE.MeshStandardMaterial).color);
        const n = g.getAttribute('position').count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        parts.push(g);
        node.remove(m);
      }
      const merged = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, shared);
      mesh.castShadow = true;
      mesh.userData.baked = true;
      node.add(mesh);
    }
  }

  private m<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  /** Mitten palm + four fingers + thumb, curled for gripping. */
  private buildHand(skin: THREE.Material, mesh: MeshFn, side: number): THREE.Group {
    const hand = new THREE.Group();
    mesh(geo('palm', () => new THREE.BoxGeometry(0.05, 0.055, 0.024).translate(0, -0.026, 0)), skin, hand);
    for (let i = 0; i < 4; i++) {
      const f = mesh(geo('finger', () => new THREE.CylinderGeometry(0.0075, 0.0068, 0.032, 6).translate(0, -0.016, 0)), skin, hand, -0.018 + i * 0.012, -0.052, 0.002);
      f.rotation.x = 0.9; // curled
    }
    const thumb = mesh(geo('thumb', () => new THREE.CylinderGeometry(0.009, 0.008, 0.03, 6).translate(0, -0.015, 0)), skin, hand, side * 0.026, -0.018, 0.01);
    thumb.rotation.set(0.6, 0, side * 0.7);
    return hand;
  }

  private buildFoot(foot: THREE.Group, look: CharacterAppearance, skin: THREE.Material, shoe: THREE.Material, sole: THREE.Material, mesh: MeshFn): void {
    const bareFoot = () => {
      mesh(geo('heel', () => new THREE.SphereGeometry(0.03, 8, 6)), skin, foot, 0, -0.012, -0.012);
      mesh(geo('footTop', () => new THREE.BoxGeometry(0.058, 0.035, 0.11).translate(0, 0, 0.045)), skin, foot, 0, -0.014, 0);
      mesh(geo('toes', () => new THREE.SphereGeometry(0.03, 8, 6).scale(1, 0.6, 0.8)), skin, foot, 0, -0.018, 0.1);
    };
    if (look.footwear === 'barefoot') {
      bareFoot();
    } else if (look.footwear === 'sandals') {
      bareFoot();
      mesh(geo('sandalSole', () => new THREE.BoxGeometry(0.07, 0.016, 0.16).translate(0, 0, 0.04)), sole, foot, 0, -0.04, 0);
      // V-shaped toe strap (tsinelas).
      for (const s of [-1, 1]) {
        const strap = mesh(geo('strap', () => new THREE.BoxGeometry(0.008, 0.012, 0.07)), shoe, foot, s * 0.018, -0.0, 0.07);
        strap.rotation.y = s * 0.55;
      }
    } else {
      mesh(geo('shoeBody', () => new THREE.BoxGeometry(0.068, 0.05, 0.13).translate(0, 0, 0.04)), shoe, foot, 0, -0.012, 0);
      mesh(geo('shoeToe', () => new THREE.SphereGeometry(0.035, 10, 8).scale(1, 0.75, 1)), shoe, foot, 0, -0.018, 0.1);
      mesh(geo('shoeSole', () => new THREE.BoxGeometry(0.074, 0.016, 0.17).translate(0, 0, 0.045)), this.m(mat(0xf5f5f5, 0.7)), foot, 0, -0.042, 0);
      mesh(geo('laces', () => new THREE.BoxGeometry(0.03, 0.006, 0.05)), this.m(mat(0xffffff, 0.6)), foot, 0, 0.014, 0.055);
    }
  }

  private buildFace(
    r: number, skin: THREE.Material, white: THREE.Material, iris: THREE.Material, black: THREE.Material,
    lip: THREE.Material, hairM: THREE.Material, mesh: MeshFn, look: CharacterAppearance,
  ): void {
    const hp = this.headPivot;
    // Skull with a narrower jaw and chin (deformed sphere, not a ball).
    const skull = geo(`skull${r}`, () => {
      const g = new THREE.SphereGeometry(r, 18, 14);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const t = clamp(-y / r, 0, 1); // lower half
        const jaw = 1 - 0.2 * t * t;
        const chin = z > 0 ? 1 + 0.08 * t : 1 - 0.05 * t;
        p.setXYZ(i, x * jaw, y * (y < 0 ? 1.1 : 1.02), z * chin * (y > 0 ? 0.98 : 1));
      }
      g.computeVertexNormals();
      return g;
    });
    mesh(skull, skin, hp, 0, r, 0);
    const face = new THREE.Group();
    face.position.set(0, r, 0);
    hp.add(face);
    for (const s of [-1, 1]) {
      // Eye: sclera, iris, pupil, highlight, upper lid line.
      const ex = s * r * 0.36, ey = r * 0.1, ez = r * 0.84;
      const sclera = mesh(geo('sclera', () => new THREE.SphereGeometry(0.03, 12, 10)), white, face, ex, ey, ez);
      sclera.scale.set(0.95, 1.1, 0.5);
      mesh(geo('iris', () => new THREE.CircleGeometry(0.018, 14)), iris, face, ex, ey - 0.002, ez + 0.016);
      mesh(geo('pupil', () => new THREE.CircleGeometry(0.009, 12)), black, face, ex, ey - 0.002, ez + 0.0165);
      mesh(geo('glint', () => new THREE.CircleGeometry(0.004, 8)), white, face, ex + 0.006, ey + 0.006, ez + 0.017);
      const lid = mesh(geo('lid', () => new THREE.TorusGeometry(0.029, 0.005, 5, 12, Math.PI)), black, face, ex, ey + 0.002, ez + 0.005);
      lid.scale.set(1, 1.1, 0.6);
      const brow = mesh(geo('brow', () => new THREE.CapsuleGeometry(0.006, 0.034, 3, 6).rotateZ(Math.PI / 2)), hairM, face, s * r * 0.36, r * 0.38, r * 0.86);
      brow.rotation.set(-0.2, 0, s * -0.12);
      // Ear: C-shaped rim + lobe.
      const ear = mesh(geo('ear', () => new THREE.TorusGeometry(0.022, 0.009, 6, 10, Math.PI * 1.4)), skin, face, s * r * 0.97, -r * 0.02, -r * 0.05);
      ear.rotation.set(0, s * Math.PI / 2, Math.PI * 0.8);
      mesh(geo('earFill', () => new THREE.SphereGeometry(0.018, 8, 6).scale(0.4, 1, 0.8)), skin, face, s * r * 0.98, -r * 0.02, -r * 0.05);
    }
    // Nose: small wedge with nostrils.
    const nose = mesh(geo('nose', () => new THREE.ConeGeometry(0.019, 0.042, 8).rotateX(-Math.PI / 2 + 0.35)), skin, face, 0, -r * 0.12, r * 0.98);
    nose.scale.set(1, 1, 0.9);
    mesh(geo('noseTip', () => new THREE.SphereGeometry(0.016, 8, 6)), skin, face, 0, -r * 0.2, r * 1.04);
    // Mouth: lips in a smile.
    const smile = mesh(geo('smile', () => new THREE.TorusGeometry(0.033, 0.008, 6, 14, Math.PI * 0.85)), lip, face, 0, -r * 0.4, r * 0.88);
    smile.rotation.z = Math.PI + Math.PI * 0.075;
    if (look.age === 'child') {
      for (const s of [-1, 1]) {
        const blush = mesh(geo('blush', () => new THREE.CircleGeometry(0.018, 12)),
          this.m(new THREE.MeshStandardMaterial({ color: 0xff8a80, transparent: true, opacity: 0.35 })), face, s * r * 0.58, -r * 0.18, r * 0.82);
        blush.rotation.y = s * 0.55;
      }
    }
    this.buildHair(look, r, hairM, mesh);
  }

  private buildHair(look: CharacterAppearance, r: number, hairM: THREE.Material, mesh: MeshFn): void {
    const hp = this.headPivot;
    const cap = geo(`hairCap${r}`, () => new THREE.SphereGeometry(r * 1.07, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55));
    const fringe = (n: number, len: number) => {
      for (let i = 0; i < n; i++) {
        const a = -0.9 + (i / (n - 1)) * 1.8;
        const tuft = mesh(geo(`tuft${len}`, () => new THREE.ConeGeometry(0.026, len, 5)), hairM, hp, Math.sin(a) * r * 0.8, r * 1.55, Math.cos(a) * r * 0.82);
        tuft.rotation.set(Math.PI - 0.6, 0, -a * 0.5);
      }
    };
    switch (look.hair) {
      case 'short': {
        mesh(cap, hairM, hp, 0, r * 1.02, -r * 0.05).rotation.x = -0.28;
        fringe(5, 0.05);
        break;
      }
      case 'spiky': {
        mesh(cap, hairM, hp, 0, r * 1.02, -r * 0.05).rotation.x = -0.28;
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const s = mesh(geo('spike', () => new THREE.ConeGeometry(0.03, 0.09, 5)), hairM, hp, Math.cos(a) * r * 0.55, r * 1.85, Math.sin(a) * r * 0.55 - 0.02);
          s.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
        }
        break;
      }
      case 'curly': {
        for (let ring = 0; ring < 3; ring++) {
          const n = 10 - ring * 3;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + ring;
            const rr = r * (0.82 - ring * 0.25);
            mesh(geo('curl', () => new THREE.IcosahedronGeometry(0.048, 1)), hairM, hp, Math.cos(a) * rr, r * (1.45 + ring * 0.25), Math.sin(a) * rr - 0.02);
          }
        }
        break;
      }
      case 'bob': {
        mesh(cap, hairM, hp, 0, r * 1.0, -r * 0.03).rotation.x = -0.2;
        const sides = geo(`bobSides${r}`, () => new THREE.CylinderGeometry(r * 1.1, r * 1.16, r * 1.0, 18, 1, true, Math.PI * 0.32, Math.PI * 1.36));
        mesh(sides, hairM, hp, 0, r * 0.82, -r * 0.03).material = hairM;
        fringe(6, 0.06);
        break;
      }
      case 'ponytail': {
        mesh(cap, hairM, hp, 0, r * 1.02, -r * 0.05).rotation.x = -0.22;
        fringe(4, 0.045);
        const tie = new THREE.Group();
        tie.position.set(0, r * 1.5, -r * 0.88);
        hp.add(tie);
        const tail = mesh(geo('tail', () => new THREE.ConeGeometry(0.05, 0.22, 8).translate(0, -0.11, 0).rotateX(Math.PI)), hairM, tie, 0, -0.01, -0.02);
        tail.rotation.x = Math.PI + 0.25;
        mesh(geo('band', () => new THREE.TorusGeometry(0.03, 0.01, 6, 10)), this.m(mat(0xff4081)), tie, 0, 0, 0);
        this.ponytail = tie;
        break;
      }
      case 'cap': {
        const capM = this.m(mat(0xd32f2f, 0.6));
        mesh(cap, capM, hp, 0, r * 1.02, -r * 0.02).rotation.x = -0.1;
        const visor = mesh(geo('visor', () => new THREE.CylinderGeometry(0.1, 0.1, 0.012, 18, 1, false, 0, Math.PI)), capM, hp, 0, r * 1.38, r * 0.72);
        visor.rotation.set(0.12, -Math.PI / 2, 0);
        mesh(geo('capButton', () => new THREE.SphereGeometry(0.012, 6, 4)), capM, hp, 0, r * 2.12, -r * 0.05);
        break;
      }
    }
  }

  /** Advance procedural animation. */
  animate(dt: number, a: RunnerAnimInput): void {
    this.time += dt;
    const j = this.j;
    const run = clamp(a.speed / 7, 0, 1);
    const stride = 0.6 + a.speed * 0.12;
    this.phase += (a.speed / stride) * Math.PI * dt;
    const p = this.phase;
    const sinP = Math.sin(p), cosP = Math.cos(p);
    let bobTarget = 0;
    let bodyY = 0;
    for (const k of Object.values(j)) k.target.set(0, 0, 0);
    let lambda = 14;
    const t = this.time;

    const runLegs = (amp: number) => {
      j.lHip.target.x = -sinP * 0.85 * amp;
      j.rHip.target.x = sinP * 0.85 * amp;
      j.lKnee.target.x = (0.15 + Math.max(0, cosP) * 1.3) * amp;
      j.rKnee.target.x = (0.15 + Math.max(0, -cosP) * 1.3) * amp;
      bobTarget = Math.abs(sinP) * 0.055 * amp;
    };

    switch (a.mode) {
      case 'idle': {
        const br = Math.sin(t * 2.2) * 0.03;
        j.torso.target.set(0.06 + br, 0, 0);
        j.head.target.set(-0.05, Math.sin(t * 0.7) * 0.2, 0);
        j.lShoulder.target.set(0.05, 0, 0.12);
        j.lElbow.target.x = -0.3;
        j.rShoulder.target.set(-0.6, 0, -0.15);
        j.rElbow.target.x = -0.5;
        j.lKnee.target.x = 0.08; j.rKnee.target.x = 0.08;
        j.lHip.target.x = -0.04; j.rHip.target.x = -0.04;
        break;
      }
      case 'run':
      case 'struggle':
      case 'chase': {
        const amp = 0.25 + 0.75 * run;
        const effort = a.pushing;
        const struggle = a.mode === 'struggle';
        const chase = a.mode === 'chase';
        const lunge = chase ? 0.25 : 0;
        j.torso.target.set(0.14 + 0.22 * run * (0.5 + effort * 0.5) + lunge, sinP * 0.12 * run, -a.lean * 0.35);
        j.head.target.set(-0.15 * run - lunge * 0.6, -sinP * 0.1 * run, a.lean * 0.15);
        runLegs(chase ? Math.max(amp, 0.9) : amp);
        j.lShoulder.target.set(sinP * 0.9 * amp, 0, 0.18);
        j.lElbow.target.x = -0.9 - 0.3 * amp;
        j.rShoulder.target.set(-0.8, 0.1, -0.15);
        j.rElbow.target.x = -0.4;
        if (struggle || a.wobble > 0.35) {
          // Fighting to keep it upright: free arm out for balance, wobbly head and torso.
          const w = Math.max(a.wobble, struggle ? 0.6 : 0);
          j.lShoulder.target.set(-0.4 + Math.sin(t * 14) * 0.5 * w, 0, 0.9 * w);
          j.lElbow.target.x = -0.3;
          j.torso.target.z += Math.sin(t * 11) * 0.12 * w;
          j.head.target.y += Math.sin(t * 17) * 0.15 * w;
        }
        if (chase) { j.lShoulder.target.set(-1.3 + sinP * 0.3, 0, 0.2); j.lElbow.target.x = -0.2; }
        break;
      }
      case 'fall': {
        const flail = Math.sin(t * 18) * 0.5;
        j.torso.target.set(0.55, 0, a.lean * 0.3);
        j.head.target.set(-0.2, 0, 0);
        j.lShoulder.target.set(-2.2 + flail, 0, 0.7);
        j.rShoulder.target.set(-2.0 - flail, 0, -0.7);
        j.lHip.target.x = -0.6; j.rHip.target.x = 0.3;
        j.lKnee.target.x = 0.9; j.rKnee.target.x = 0.5;
        bodyY = -Math.min(1, a.modeTime * 3) * 0.1;
        lambda = 18;
        break;
      }
      case 'recover':
      case 'clean': {
        const k = a.mode === 'clean' ? 1 : Math.sin(clamp(a.modeTime / 0.65, 0, 1) * Math.PI);
        j.torso.target.set(0.35 + k * 0.7, 0, 0);
        j.head.target.set(-0.4 * k, 0, 0);
        j.lHip.target.x = -1.0 * k; j.rHip.target.x = -1.0 * k;
        j.lKnee.target.x = 1.8 * k; j.rKnee.target.x = 1.8 * k;
        j.rShoulder.target.set(-1.2 - 0.3 * k, 0, -0.2);
        if (a.mode === 'clean') {
          // Scrubbing the tyre with a leaf.
          const scrub = Math.sin(t * 16);
          j.lShoulder.target.set(-1.3, 0.2 * scrub, 0.3);
          j.lElbow.target.x = -0.6 + scrub * 0.35;
          j.head.target.y = Math.sin(t * 3) * 0.25;
        } else {
          j.lShoulder.target.set(-1.0 * k, 0, 0.3);
        }
        bodyY = -0.2 * k;
        break;
      }
      case 'shock': {
        // Hands on head at the canal edge.
        j.lShoulder.target.set(-2.6, 0, 0.9); j.lElbow.target.x = -2.0;
        j.rShoulder.target.set(-2.6, 0, -0.9); j.rElbow.target.x = -2.0;
        j.torso.target.set(0.25, 0, 0);
        j.head.target.set(0.35, Math.sin(t * 6) * 0.3, 0);
        j.lKnee.target.x = 0.2; j.rKnee.target.x = 0.2;
        break;
      }
      case 'stunned': {
        // Dizzy sway.
        j.torso.target.set(0.1, 0, Math.sin(t * 5) * 0.2);
        j.head.target.set(0.1, Math.sin(t * 7) * 0.4, Math.cos(t * 5) * 0.25);
        j.lShoulder.target.set(-0.3, 0, 0.6 + Math.sin(t * 6) * 0.3);
        j.rShoulder.target.set(-0.5, 0, -0.5);
        j.lKnee.target.x = 0.35; j.rKnee.target.x = 0.35;
        bodyY = -0.04;
        break;
      }
      case 'eww': {
        // Hand pinching the nose, head turned away — while still running.
        const amp = 0.25 + 0.75 * run;
        runLegs(amp);
        j.torso.target.set(0.1, 0, 0);
        j.head.target.set(-0.1, 0.6, 0.1);
        j.lShoulder.target.set(-2.3, -0.4, 0.4); j.lElbow.target.x = -2.0;
        j.rShoulder.target.set(-0.8, 0.1, -0.15); j.rElbow.target.x = -0.4;
        break;
      }
      case 'celebrate':
      case 'cheer': {
        const hop = a.mode === 'celebrate' ? Math.abs(Math.sin(t * 6)) : Math.abs(Math.sin(t * 4 + this.look.skin)) * 0.5;
        bodyY = hop * 0.22;
        const wave = Math.sin(t * 10) * 0.35;
        j.lShoulder.target.set(-2.8, 0, 0.35 + wave);
        j.rShoulder.target.set(-2.8, 0, -0.35 - wave);
        j.lElbow.target.x = -0.3; j.rElbow.target.x = -0.3;
        j.lKnee.target.x = 0.6 * (1 - hop); j.rKnee.target.x = 0.6 * (1 - hop);
        j.lHip.target.x = -0.3 * (1 - hop); j.rHip.target.x = -0.3 * (1 - hop);
        j.head.target.set(-0.25, Math.sin(t * 3) * 0.2, 0);
        break;
      }
      case 'sad': {
        j.torso.target.set(0.35, 0, 0);
        j.head.target.set(0.55, 0, 0);
        j.lShoulder.target.set(0.15, 0, 0.05);
        j.rShoulder.target.set(-0.3, 0, -0.05);
        j.lElbow.target.x = -0.1; j.rElbow.target.x = -0.3;
        j.lKnee.target.x = 0.1; j.rKnee.target.x = 0.1;
        bodyY = Math.sin(t * 1.5) * 0.01;
        break;
      }
    }
    for (const k of Object.values(j)) k.apply(dt, lambda);
    this.bob = damp(this.bob, bobTarget, 20, dt);
    this.baseY = damp(this.baseY, bodyY, 12, dt);
    this.body.position.y = this.baseY + this.bob;
    if (this.ponytail) this.ponytail.rotation.x = lerp(0.1, 0.8, run) + Math.sin(p * 2) * 0.25 * run;
  }

  /**
   * Two-bone IK: bend the right shoulder/elbow so the grip reaches `target` (world space).
   * Returns how far the grip still is from the target (0 = reached).
   */
  aimRightHand(target: THREE.Vector3): number {
    const parent = this.torsoPivot;
    parent.updateWorldMatrix(true, false);
    const tl = parent.worldToLocal(target.clone());
    const s = this.rShoulder.position;
    const d = tl.clone().sub(s);
    const L1 = this.upperLen, L2 = this.lowerLen + 0.045;
    const dist = clamp(d.length(), 0.05, L1 + L2 - 1e-3);
    const dir = d.normalize();
    // Elbow points down/back/outward (right side = −x).
    const pole = new THREE.Vector3(-0.4, -1, -0.6).normalize();
    const bendAxis = new THREE.Vector3().crossVectors(dir, pole).normalize();
    const a1 = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
    const elbowInterior = Math.acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1));
    const upperDir = dir.clone().applyAxisAngle(bendAxis, -a1);
    // Shoulder basis: −Y along the upper arm, X along the bend axis.
    const y = upperDir.clone().negate();
    const x = bendAxis.clone().sub(y.clone().multiplyScalar(bendAxis.dot(y))).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    this.rShoulder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const bend = Math.PI - elbowInterior;
    // Pick the elbow direction that actually points the forearm at the target.
    const elbowPos = s.clone().add(upperDir.clone().multiplyScalar(L1));
    const toT = tl.clone().sub(elbowPos).normalize();
    let best = 0, bestDot = -Infinity;
    for (const sign of [1, -1]) {
      const fore = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), sign * bend).applyQuaternion(this.rShoulder.quaternion);
      const dot = fore.dot(toT);
      if (dot > bestDot) { bestDot = dot; best = sign; }
    }
    this.rElbow.rotation.set(best * bend, 0, 0);
    this.rElbow.quaternion.setFromEuler(this.rElbow.rotation);
    // Keep the joint targets in sync so the next frame blends from here.
    this.j.rShoulder.target.copy(this.rShoulder.rotation);
    this.j.rElbow.target.copy(this.rElbow.rotation);
    this.root.updateMatrixWorld(true);
    return this.rightGrip.getWorldPosition(new THREE.Vector3()).distanceTo(target);
  }

  /** World orientation of the right hand (for aligning the stick in FK poses). */
  get rightHand(): THREE.Object3D {
    return this.rHand;
  }

  get leftHand(): THREE.Object3D {
    return this.lHand;
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.baked) m.geometry.dispose(); });
  }
}

const numCache = new Map<number, THREE.CanvasTexture>();
function numberTexture(n: number): THREE.CanvasTexture {
  let t = numCache.get(n);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 32, 34);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  numCache.set(n, t);
  return t;
}
