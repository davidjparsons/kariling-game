import * as THREE from 'three';
import type { CharacterAppearance } from '../config/appearance';
import { clamp, damp, lerp } from '../core/math';

export type RunnerMode = 'idle' | 'run' | 'fall' | 'recover' | 'celebrate' | 'sad' | 'cheer';

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

/**
 * Stylised runner built from primitives. Faces +z; its right side is -x.
 * All animation is procedural and blends smoothly between modes.
 */
export class Runner {
  readonly root = new THREE.Group();
  /** Point in the right hand where the stick is held (world position via getWorldPosition). */
  readonly rightGrip = new THREE.Object3D();
  private body = new THREE.Group();
  private torsoPivot = new THREE.Group();
  private headPivot = new THREE.Group();
  private ponytail: THREE.Object3D | null = null;
  private j: Record<'lShoulder' | 'rShoulder' | 'lElbow' | 'rElbow' | 'lHip' | 'rHip' | 'lKnee' | 'rKnee' | 'torso' | 'head', Joint>;
  private phase = 0;
  private bob = 0;
  private baseY = 0;
  private time = 0;
  private materials: THREE.Material[] = [];
  readonly height: number;

  constructor(public look: CharacterAppearance) {
    const adult = look.age === 'adult';
    const scale = adult ? 1.32 : 1;
    this.height = 1.3 * scale;
    this.root.add(this.body);
    this.body.scale.setScalar(scale);

    const skin = this.m(mat(look.skin, 0.65));
    const shirt = this.m(mat(look.shirtColor));
    const bottoms = this.m(mat(look.bottomsColor));
    const hairM = this.m(mat(look.hairColor, 0.6));
    const shoe = this.m(mat(look.footwearColor, 0.6));
    const white = this.m(mat(0xffffff, 0.3));
    const black = this.m(mat(0x161616, 0.3));
    const sole = this.m(mat(0x3a3a3a, 0.9));

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    const capsule = (r: number, len: number) => geo(`cap${r}-${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 10));
    const sphere = (r: number) => geo(`sph${r}`, () => new THREE.SphereGeometry(r, 16, 12));

    const hipY = adult ? 0.6 : 0.56;
    const legLen = adult ? 0.3 : 0.27;
    // ---- pelvis + torso
    this.torsoPivot.position.y = hipY;
    this.body.add(this.torsoPivot);
    const pelvis = mesh(sphere(0.12), bottoms, this.torsoPivot, 0, 0.02, 0);
    pelvis.scale.set(1.15, 0.85, 0.85);
    const torsoLen = adult ? 0.24 : 0.17;
    const torso = mesh(capsule(0.13, torsoLen), look.shirt === 'tank' ? shirt : shirt, this.torsoPivot, 0, 0.13 + torsoLen / 2, 0);
    torso.scale.set(1.12, 1, 0.78);
    if (look.shirt === 'jersey') {
      const stripe = this.m(mat(0xffffff, 0.6));
      const s = mesh(geo('jstripe', () => new THREE.BoxGeometry(0.02, 0.3, 0.2)), stripe, torso, 0.135, 0, 0);
      s.scale.set(1, torsoLen / 0.17, 1);
      mesh(geo('jstripe', () => new THREE.BoxGeometry(0.02, 0.3, 0.2)), stripe, torso, -0.135, 0, 0).scale.set(1, torsoLen / 0.17, 1);
    }
    const shoulderY = 0.13 + torsoLen + 0.06;
    mesh(geo('neck', () => new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8)), skin, this.torsoPivot, 0, shoulderY + 0.03, 0);

    // ---- head
    this.headPivot.position.y = shoulderY + 0.06;
    this.torsoPivot.add(this.headPivot);
    const headR = adult ? 0.15 : 0.17;
    const head = mesh(sphere(headR), skin, this.headPivot, 0, headR, 0);
    head.scale.set(1, 1.02, 0.96);
    const face = new THREE.Group();
    face.position.set(0, headR, 0);
    this.headPivot.add(face);
    for (const s of [-1, 1]) {
      const eye = mesh(geo('eyeW', () => new THREE.SphereGeometry(0.038, 10, 8)), white, face, s * headR * 0.36, headR * 0.12, headR * 0.86);
      eye.scale.set(0.9, 1.15, 0.5);
      mesh(geo('pupil', () => new THREE.SphereGeometry(0.022, 8, 6)), black, face, s * headR * 0.36, headR * 0.1, headR * 0.93);
      const brow = mesh(geo('brow', () => new THREE.BoxGeometry(0.05, 0.012, 0.012)), hairM, face, s * headR * 0.38, headR * 0.42, headR * 0.86);
      brow.rotation.z = s * -0.15;
      mesh(geo('ear', () => new THREE.SphereGeometry(0.035, 8, 6)), skin, face, s * headR * 0.98, 0, 0);
    }
    mesh(geo('nose', () => new THREE.SphereGeometry(0.022, 8, 6)), skin, face, 0, -headR * 0.12, headR * 0.98);
    const smile = mesh(geo('smile', () => new THREE.TorusGeometry(0.04, 0.009, 6, 12, Math.PI)), this.m(mat(0x7a2e2e, 0.5)), face, 0, -headR * 0.33, headR * 0.88);
    smile.rotation.z = Math.PI;
    if (look.gender === 'girl' || look.age === 'child') {
      for (const s of [-1, 1]) {
        const blush = mesh(geo('blush', () => new THREE.SphereGeometry(0.025, 8, 6)), this.m(new THREE.MeshStandardMaterial({ color: 0xff8a80, transparent: true, opacity: 0.45 })), face, s * headR * 0.55, -headR * 0.15, headR * 0.8);
        blush.scale.set(1, 0.6, 0.4);
      }
    }
    this.buildHair(look, headR, hairM, mesh, sphere);

    // ---- arms
    const armUpper = adult ? 0.17 : 0.14;
    const armLower = adult ? 0.16 : 0.13;
    const mkArm = (side: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.17, shoulderY - 0.02, 0);
      this.torsoPivot.add(shoulder);
      const sleeve = look.shirt === 'tank' ? skin : shirt;
      mesh(capsule(0.05, armUpper * 0.45), sleeve, shoulder, 0, -armUpper * 0.3, 0);
      mesh(capsule(0.042, armUpper * 0.5), skin, shoulder, 0, -armUpper * 0.62, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -armUpper - 0.02;
      shoulder.add(elbow);
      mesh(capsule(0.04, armLower), skin, elbow, 0, -armLower / 2 - 0.02, 0);
      mesh(sphere(0.05), skin, elbow, 0, -armLower - 0.06, 0);
      return { shoulder, elbow };
    };
    const lArm = mkArm(1);
    const rArm = mkArm(-1);
    this.rightGrip.position.set(0, -armLower - 0.07, 0.01);
    rArm.elbow.add(this.rightGrip);

    // ---- legs
    const mkLeg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.075, hipY - 0.02, 0);
      this.body.add(hip);
      const longPants = look.bottoms === 'trousers';
      mesh(capsule(0.06, legLen * 0.55), bottoms, hip, 0, -legLen * 0.32, 0);
      mesh(capsule(0.052, legLen * 0.45), longPants ? bottoms : skin, hip, 0, -legLen * 0.7, 0);
      const knee = new THREE.Group();
      knee.position.y = -legLen - 0.03;
      hip.add(knee);
      mesh(capsule(0.048, legLen * 0.8), longPants ? bottoms : skin, knee, 0, -legLen / 2, 0);
      const foot = new THREE.Group();
      foot.position.y = -legLen - 0.04;
      knee.add(foot);
      if (look.footwear === 'barefoot') {
        mesh(geo('footB', () => new THREE.CapsuleGeometry(0.04, 0.08, 4, 8).rotateX(Math.PI / 2)), skin, foot, 0, -0.01, 0.04);
      } else if (look.footwear === 'sandals') {
        mesh(geo('footB', () => new THREE.CapsuleGeometry(0.04, 0.08, 4, 8).rotateX(Math.PI / 2)), skin, foot, 0, 0, 0.04);
        mesh(geo('sole', () => new THREE.BoxGeometry(0.1, 0.02, 0.2)), sole, foot, 0, -0.04, 0.04);
        mesh(geo('strap', () => new THREE.BoxGeometry(0.105, 0.025, 0.04)), shoe, foot, 0, -0.005, 0.07);
      } else {
        mesh(geo('shoe', () => new THREE.CapsuleGeometry(0.05, 0.1, 4, 8).rotateX(Math.PI / 2)), shoe, foot, 0, -0.01, 0.045);
        mesh(geo('sole2', () => new THREE.BoxGeometry(0.1, 0.025, 0.2)), sole, foot, 0, -0.045, 0.045);
      }
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
  }

  private m<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private buildHair(
    look: CharacterAppearance, r: number, hairM: THREE.Material,
    mesh: (g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D, x?: number, y?: number, z?: number) => THREE.Mesh,
    sphere: (r: number) => THREE.BufferGeometry,
  ): void {
    const cap = geo(`hairCap${r}`, () => new THREE.SphereGeometry(r * 1.06, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52));
    const hp = this.headPivot;
    switch (look.hair) {
      case 'short': {
        const c = mesh(cap, hairM, hp, 0, r * 1.02, -r * 0.04);
        c.rotation.x = -0.25;
        break;
      }
      case 'spiky': {
        const c = mesh(cap, hairM, hp, 0, r * 1.02, -r * 0.04);
        c.rotation.x = -0.25;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const s = mesh(geo('spike', () => new THREE.ConeGeometry(0.04, 0.1, 5)), hairM, hp, Math.cos(a) * r * 0.5, r * 1.85, Math.sin(a) * r * 0.5 - 0.02);
          s.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        }
        break;
      }
      case 'curly': {
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const y = r * (1.45 + (i % 2) * 0.25);
          mesh(sphere(0.06), hairM, hp, Math.cos(a) * r * 0.75, y, Math.sin(a) * r * 0.75 - 0.02);
        }
        mesh(sphere(0.1), hairM, hp, 0, r * 1.75, -0.02);
        break;
      }
      case 'bob': {
        const c = mesh(cap, hairM, hp, 0, r * 1.0, -r * 0.03);
        c.rotation.x = -0.2;
        const back = mesh(geo(`bobBack${r}`, () => new THREE.SphereGeometry(r * 1.1, 14, 10, Math.PI * 0.15, Math.PI * 1.7, Math.PI * 0.3, Math.PI * 0.45)), hairM, hp, 0, r * 0.95, -0.01);
        back.rotation.y = Math.PI;
        break;
      }
      case 'ponytail': {
        const c = mesh(cap, hairM, hp, 0, r * 1.02, -r * 0.04);
        c.rotation.x = -0.2;
        const tie = new THREE.Group();
        tie.position.set(0, r * 1.45, -r * 0.85);
        hp.add(tie);
        const tail = mesh(geo('tail', () => new THREE.CapsuleGeometry(0.05, 0.16, 4, 8)), hairM, tie, 0, -0.1, -0.03);
        tail.rotation.x = 0.3;
        mesh(geo('band', () => new THREE.TorusGeometry(0.035, 0.012, 6, 10)), this.m(mat(0xff4081)), tie, 0, 0, 0);
        this.ponytail = tie;
        break;
      }
      case 'cap': {
        const c = mesh(cap, this.m(mat(0xd32f2f, 0.6)), hp, 0, r * 1.02, -r * 0.02);
        c.rotation.x = -0.12;
        const visor = mesh(geo('visor', () => new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, 0, Math.PI)), this.m(mat(0xd32f2f, 0.6)), hp, 0, r * 1.35, r * 0.75);
        visor.rotation.set(0.15, -Math.PI / 2, 0);
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

    switch (a.mode) {
      case 'idle': {
        const br = Math.sin(this.time * 2.2) * 0.03;
        j.torso.target.set(0.05 + br, 0, 0);
        j.head.target.set(-0.05, Math.sin(this.time * 0.7) * 0.2, 0);
        j.lShoulder.target.set(0.05, 0, 0.12);
        j.lElbow.target.set(-0.3, 0, 0);
        j.rShoulder.target.set(-0.55, 0, -0.15);
        j.rElbow.target.set(-0.5, 0, 0);
        j.lKnee.target.x = 0.05; j.rKnee.target.x = 0.05;
        break;
      }
      case 'run': {
        const amp = 0.25 + 0.75 * run;
        const effort = a.pushing;
        j.torso.target.set(0.12 + 0.22 * run * (0.5 + effort * 0.5), sinP * 0.12 * run, -a.lean * 0.35);
        j.head.target.set(-0.15 * run, -sinP * 0.1 * run, a.lean * 0.15);
        j.lHip.target.x = -sinP * 0.85 * amp;
        j.rHip.target.x = sinP * 0.85 * amp;
        j.lKnee.target.x = (0.15 + Math.max(0, cosP) * 1.3) * amp;
        j.rKnee.target.x = (0.15 + Math.max(0, -cosP) * 1.3) * amp;
        j.lShoulder.target.set(sinP * 0.9 * amp, 0, 0.18);
        j.lElbow.target.x = -0.9 - 0.3 * amp;
        // Stick arm: reaches forward/down with a push pulse.
        const pulse = Math.sin(this.time * (6 + a.speed * 0.8)) * 0.1 * effort;
        j.rShoulder.target.set(-0.75 - 0.25 * run + pulse, 0.15, -0.2);
        j.rElbow.target.x = -0.35 - pulse;
        bobTarget = Math.abs(sinP) * 0.06 * amp;
        if (a.wobble > 0.4) { j.lShoulder.target.z += 0.6 * a.wobble; j.head.target.y += Math.sin(this.time * 18) * 0.12 * a.wobble; }
        break;
      }
      case 'fall': {
        const t = a.modeTime;
        const flail = Math.sin(this.time * 18) * 0.5;
        j.torso.target.set(0.55, 0, a.lean * 0.3);
        j.head.target.set(-0.2, 0, 0);
        j.lShoulder.target.set(-2.2 + flail, 0, 0.7);
        j.rShoulder.target.set(-2.0 - flail, 0, -0.7);
        j.lHip.target.x = -0.6; j.rHip.target.x = 0.3;
        j.lKnee.target.x = 0.9; j.rKnee.target.x = 0.5;
        bodyY = -Math.min(1, t * 3) * 0.12;
        lambda = 18;
        break;
      }
      case 'recover': {
        // Crouch, scoop the tyre up, rise.
        const t = clamp(a.modeTime / 0.85, 0, 1);
        const crouch = Math.sin(t * Math.PI);
        j.torso.target.set(0.3 + crouch * 0.7, 0, 0);
        j.head.target.set(-0.4 * crouch, 0, 0);
        j.lHip.target.x = -1.0 * crouch; j.rHip.target.x = -1.0 * crouch;
        j.lKnee.target.x = 1.8 * crouch; j.rKnee.target.x = 1.8 * crouch;
        j.rShoulder.target.set(-1.2 - 0.3 * crouch, 0, -0.2);
        j.lShoulder.target.set(-1.0 * crouch, 0, 0.3);
        bodyY = -0.22 * crouch;
        break;
      }
      case 'celebrate':
      case 'cheer': {
        const hop = a.mode === 'celebrate' ? Math.abs(Math.sin(this.time * 6)) : Math.abs(Math.sin(this.time * 4 + this.look.skin)) * 0.5;
        bodyY = hop * 0.22;
        const wave = Math.sin(this.time * 10) * 0.35;
        j.lShoulder.target.set(-2.8, 0, 0.35 + wave);
        j.rShoulder.target.set(-2.8, 0, -0.35 - wave);
        j.lElbow.target.x = -0.3; j.rElbow.target.x = -0.3;
        j.lKnee.target.x = 0.6 * (1 - hop); j.rKnee.target.x = 0.6 * (1 - hop);
        j.lHip.target.x = -0.3 * (1 - hop); j.rHip.target.x = -0.3 * (1 - hop);
        j.head.target.set(-0.25, Math.sin(this.time * 3) * 0.2, 0);
        break;
      }
      case 'sad': {
        j.torso.target.set(0.35, 0, 0);
        j.head.target.set(0.55, 0, 0);
        j.lShoulder.target.set(0.15, 0, 0.05);
        j.rShoulder.target.set(-0.3, 0, -0.05);
        j.lElbow.target.x = -0.1; j.rElbow.target.x = -0.3;
        j.lKnee.target.x = 0.1; j.rKnee.target.x = 0.1;
        bodyY = Math.sin(this.time * 1.5) * 0.01;
        break;
      }
    }
    for (const k of Object.values(j)) k.apply(dt, lambda);
    this.bob = damp(this.bob, bobTarget, 20, dt);
    this.baseY = damp(this.baseY, bodyY, 12, dt);
    this.body.position.y = this.baseY + this.bob;
    if (this.ponytail) {
      this.ponytail.rotation.x = lerp(0.2, 0.9, run) + Math.sin(p * 2) * 0.25 * run;
    }
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}
