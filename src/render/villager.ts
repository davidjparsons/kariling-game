import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, damp } from '../core/math';
import { Rng } from '../core/rng';
import { legFk } from './character';

/**
 * Lightweight villager for crowds (pedestrians, basketball players): the whole body is ONE
 * skinned mesh with rigid per-part skinning, so each person is a single draw call on phones,
 * while still having proper hips, knees, shoulders and elbows (same joint conventions as the
 * runner: knees bend forward, elbows flex one way, the lowest foot rests on the ground).
 */
export type VillagerMode = 'idle' | 'walk' | 'run' | 'look' | 'startled' | 'chat' | 'dribble' | 'pass' | 'shoot' | 'defend' | 'cheer';

export interface VillagerLook {
  adult: boolean;
  skin: number;
  hair: number;
  shirt: number;
  bottoms: number;
  /** Dress/skirt instead of shorts. */
  skirt: boolean;
  longBottoms: boolean;
  cap: boolean;
  /** Jersey number stripe (basketball). */
  jersey: boolean;
  feet: number;
}

const SKINS = [0xf1c9a5, 0xd9a47a, 0xc68a5e, 0xa86e45, 0x8a5634];
const SHIRTS = [0xffffff, 0xef5350, 0x42a5f5, 0xffee58, 0x66bb6a, 0xab47bc, 0xff7043, 0x26c6da, 0xf48fb1];
const BOTTOMS = [0x37474f, 0x5d4037, 0x1565c0, 0x9e9e9e, 0x283593, 0x6d4c41];

export function randomLook(rng: Rng, adult = rng.chance(0.6)): VillagerLook {
  const skirt = rng.chance(0.3);
  return {
    adult, skin: rng.pick(SKINS), hair: rng.pick([0x1c1410, 0x2a1a10, 0x3b2314, adult && rng.chance(0.2) ? 0xb0b0b0 : 0x1c1410]),
    shirt: rng.pick(SHIRTS), bottoms: rng.pick(BOTTOMS), skirt, longBottoms: !skirt && adult && rng.chance(0.4),
    cap: !skirt && rng.chance(0.25), jersey: false, feet: rng.pick([0x1e88e5, 0xe53935, 0x212121, 0xffffff]),
  };
}

// Proportions (child units; adults scale up).
const HIP_X = 0.065, HIP_DROP = 0.03, THIGH = 0.27, SHIN = 0.27, SOLE = 0.035;
const TORSO = 0.32, SHOULDER_X = 0.145, UPPER = 0.17, LOWER = 0.16;

const BONES = ['root', 'hips', 'spine', 'head', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow', 'lHip', 'lKnee', 'rHip', 'rKnee'] as const;
type BoneName = typeof BONES[number];

export class Villager {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  private bones: Record<BoneName, THREE.Bone>;
  private phase = Math.random() * 6;
  private t = Math.random() * 10;
  private material: THREE.MeshStandardMaterial;
  readonly scale: number;
  /** Right-hand position (world) for holding a basketball. */
  readonly hand = new THREE.Object3D();

  constructor(public look: VillagerLook) {
    this.scale = look.adult ? 1.28 : 0.95;
    const b = {} as Record<BoneName, THREE.Bone>;
    for (const n of BONES) { b[n] = new THREE.Bone(); b[n].name = n; }
    const legLen = THIGH + SHIN;
    b.hips.position.y = SOLE + HIP_DROP + legLen * 0.99;
    b.root.add(b.hips);
    b.spine.position.y = 0.07; b.hips.add(b.spine);
    b.head.position.y = TORSO + 0.06; b.spine.add(b.head);
    b.lShoulder.position.set(SHOULDER_X, TORSO - 0.04, 0); b.spine.add(b.lShoulder);
    b.rShoulder.position.set(-SHOULDER_X, TORSO - 0.04, 0); b.spine.add(b.rShoulder);
    b.lElbow.position.y = -UPPER; b.lShoulder.add(b.lElbow);
    b.rElbow.position.y = -UPPER; b.rShoulder.add(b.rElbow);
    b.lHip.position.set(HIP_X, -HIP_DROP, 0); b.hips.add(b.lHip);
    b.rHip.position.set(-HIP_X, -HIP_DROP, 0); b.hips.add(b.rHip);
    b.lKnee.position.y = -THIGH; b.lHip.add(b.lKnee);
    b.rKnee.position.y = -THIGH; b.rHip.add(b.rKnee);
    this.bones = b;
    b.root.updateMatrixWorld(true);
    b.rElbow.add(this.hand);
    this.hand.position.set(0, -LOWER - 0.05, 0.02);

    // ---- geometry: parts in bone space → bind pose, one bone each.
    const parts: THREE.BufferGeometry[] = [];
    const col = new THREE.Color();
    const addPart = (bone: BoneName, g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4) => {
      const geo = g.index ? g.toNonIndexed() : g.clone();
      if (m) geo.applyMatrix4(m);
      geo.applyMatrix4(b[bone].matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      const n = geo.getAttribute('position').count;
      const c = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      col.set(color);
      const bi = BONES.indexOf(bone);
      for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; si[i * 4] = bi; sw[i * 4] = 1; }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      parts.push(geo);
      g.dispose();
    };
    const T = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    const limb = (r0: number, r1: number, len: number) => new THREE.CylinderGeometry(r0, r1, len, 8).translate(0, -len / 2, 0);
    const L = look;
    // Pelvis / skirt.
    if (L.skirt) addPart('hips', new THREE.CylinderGeometry(0.1, 0.17, 0.3, 12, 1, true), L.bottoms, T(0, -0.1, 0, 1, 1, 0.8));
    addPart('hips', new THREE.SphereGeometry(0.115, 12, 8), L.skirt ? L.shirt : L.bottoms, T(0, 0.01, 0, 1, 0.8, 0.75));
    // Torso, neck.
    addPart('spine', new THREE.CylinderGeometry(0.125, 0.105, TORSO, 12), L.shirt, T(0, TORSO / 2, 0, 1, 1, 0.7));
    addPart('spine', new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), L.shirt, T(0, TORSO, 0, 1, 0.45, 0.7));
    if (L.jersey) addPart('spine', new THREE.BoxGeometry(0.02, TORSO * 0.8, 0.02), 0xffffff, T(0.118, TORSO * 0.5, 0));
    if (L.jersey) addPart('spine', new THREE.BoxGeometry(0.02, TORSO * 0.8, 0.02), 0xffffff, T(-0.118, TORSO * 0.5, 0));
    addPart('spine', new THREE.CylinderGeometry(0.035, 0.04, 0.08, 8), L.skin, T(0, TORSO + 0.03, 0));
    // Head: skull, hair, eyes, nose.
    const hr = L.adult ? 0.11 : 0.125;
    addPart('head', new THREE.SphereGeometry(hr, 14, 10), L.skin, T(0, hr, 0, 0.95, 1.05, 1));
    addPart('head', new THREE.SphereGeometry(hr * 1.06, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), L.cap ? 0xd32f2f : L.hair, T(0, hr * 1.1, -0.01));
    if (L.cap) addPart('head', new THREE.CylinderGeometry(0.09, 0.09, 0.012, 12, 1, false, 0, Math.PI), 0xd32f2f, T(0, hr * 1.4, hr * 0.7));
    if (L.skirt) addPart('head', new THREE.SphereGeometry(hr * 0.9, 10, 8), L.hair, T(0, hr * 0.7, -hr * 0.45, 1, 1.2, 0.6));
    for (const s of [-1, 1]) addPart('head', new THREE.SphereGeometry(0.016, 6, 4), 0x1b1b1b, T(s * hr * 0.36, hr * 1.05, hr * 0.88));
    addPart('head', new THREE.SphereGeometry(0.018, 6, 4), L.skin, T(0, hr * 0.85, hr * 1.0));
    // Arms (short sleeve + skin) and hands.
    for (const [sh, el] of [['lShoulder', 'lElbow'], ['rShoulder', 'rElbow']] as [BoneName, BoneName][]) {
      addPart(sh, new THREE.SphereGeometry(0.045, 8, 6), L.shirt);
      addPart(sh, limb(0.045, 0.04, UPPER * 0.5), L.shirt);
      addPart(sh, limb(0.033, 0.03, UPPER * 0.55), L.skin, T(0, -UPPER * 0.45, 0));
      addPart(el, new THREE.SphereGeometry(0.031, 8, 6), L.skin);
      addPart(el, limb(0.03, 0.025, LOWER), L.skin);
      addPart(el, new THREE.SphereGeometry(0.035, 8, 6), L.skin, T(0, -LOWER - 0.02, 0, 0.8, 1.1, 0.6));
    }
    // Legs, knees, shins, feet with sandals/shoes.
    for (const [hip, knee] of [['lHip', 'lKnee'], ['rHip', 'rKnee']] as [BoneName, BoneName][]) {
      const longB = L.longBottoms;
      addPart(hip, new THREE.SphereGeometry(0.06, 8, 6), L.skirt ? L.skin : L.bottoms);
      if (L.skirt) addPart(hip, limb(0.05, 0.042, THIGH), L.skin);
      else {
        addPart(hip, limb(0.06, 0.055, longB ? THIGH : THIGH * 0.6), L.bottoms);
        if (!longB) addPart(hip, limb(0.046, 0.041, THIGH * 0.45), L.skin, T(0, -THIGH * 0.55, 0));
      }
      addPart(knee, new THREE.SphereGeometry(longB ? 0.05 : 0.042, 8, 6), longB ? L.bottoms : L.skin);
      addPart(knee, limb(longB ? 0.048 : 0.04, longB ? 0.042 : 0.03, SHIN), longB ? L.bottoms : L.skin);
      addPart(knee, new THREE.BoxGeometry(0.065, 0.04, 0.15), L.feet, T(0, -SHIN - SOLE + 0.02, 0.035));
    }
    const merged = mergeGeometries(parts, false)!;
    parts.forEach((g) => g.dispose());
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    this.mesh = new THREE.SkinnedMesh(merged, this.material);
    this.mesh.add(b.root);
    this.mesh.bind(new THREE.Skeleton(BONES.map((n) => b[n])));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.scale.setScalar(this.scale);
  }

  /** Pose for this frame. `speed` drives the walk/run cycle (m/s). */
  update(dt: number, mode: VillagerMode, speed: number, modeTime = 0): void {
    const b = this.bones;
    this.t += dt;
    const t = this.t;
    const stride = mode === 'run' ? 0.9 : 0.55;
    this.phase += (speed / this.scale / stride) * Math.PI * dt;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const set = (n: BoneName, x: number, y = 0, z = 0, k = 14) => {
      const r = b[n].rotation;
      r.set(damp(r.x, x, k, dt), damp(r.y, y, k, dt), damp(r.z, z, k, dt));
    };
    let hipL = 0, hipR = 0, kneeL = 0.05, kneeR = 0.05, hop = 0;
    let spineX = 0.03, spineZ = 0, headY = 0, headX = 0;
    let lsh: [number, number, number] = [0.05, 0, 0.1], rsh: [number, number, number] = [0.05, 0, -0.1];
    let lel = -0.15, rel = -0.15;
    switch (mode) {
      case 'walk': case 'run': {
        const a = mode === 'run' ? 0.85 : clamp(0.35 + speed * 0.12, 0.35, 0.6);
        hipL = -s * a; hipR = s * a;
        kneeL = 0.1 + Math.max(0, c) * a * 1.4; kneeR = 0.1 + Math.max(0, -c) * a * 1.4;
        lsh = [s * a * 0.9, 0, 0.12]; rsh = [-s * a * 0.9, 0, -0.12];
        lel = rel = mode === 'run' ? -1.2 : -0.35;
        spineX = mode === 'run' ? 0.25 : 0.06;
        break;
      }
      case 'look': headY = Math.sin(t * 3.2) * 0.9; break;
      case 'chat': {
        headY = Math.sin(t * 0.8) * 0.4;
        rsh = [-0.5 - 0.3 * Math.max(0, Math.sin(t * 2.5)), 0, -0.2]; rel = -1.1;
        spineZ = Math.sin(t * 0.6) * 0.05;
        break;
      }
      case 'startled': {
        // Cartoon "whoa!": arms up, lean back, little hop.
        const k = Math.min(1, modeTime * 6);
        lsh = [-2.4 * k, 0, 0.6]; rsh = [-2.4 * k, 0, -0.6]; lel = rel = -0.4;
        spineX = -0.25 * k; headX = -0.3 * k;
        hop = Math.max(0, Math.sin(Math.min(1, modeTime * 3) * Math.PI)) * 0.08;
        hipL = -0.3 * k; kneeL = 0.5 * k;
        break;
      }
      case 'dribble': {
        // Low stance, right hand pumping the ball.
        hipL = hipR = -0.35; kneeL = kneeR = 0.7; spineX = 0.3;
        rsh = [-0.55 + Math.sin(t * 9) * 0.25, 0, -0.25]; rel = -0.5;
        lsh = [-0.6, 0, 0.5]; lel = -0.8;
        break;
      }
      case 'pass': {
        const k = Math.sin(Math.min(1, modeTime * 2.5) * Math.PI);
        lsh = [-1.3 * k, 0, 0.2]; rsh = [-1.3 * k, 0, -0.2]; lel = rel = -1.2 * (1 - k);
        spineX = 0.15;
        break;
      }
      case 'shoot': {
        // Knees bend, jump, both arms extend up.
        const ph = Math.min(1, modeTime / 0.9);
        const crouch = ph < 0.3 ? ph / 0.3 : Math.max(0, 1 - (ph - 0.3) / 0.15);
        hop = ph > 0.35 && ph < 0.85 ? Math.sin(((ph - 0.35) / 0.5) * Math.PI) * 0.25 : 0;
        hipL = hipR = -0.6 * crouch; kneeL = kneeR = 1.1 * crouch;
        const arm = ph < 0.3 ? -1.4 : -2.8;
        rsh = [arm, 0, -0.15]; lsh = [arm + 0.2, 0, 0.25]; rel = ph < 0.45 ? -1.6 : -0.2; lel = -1.2;
        headX = -0.25;
        break;
      }
      case 'defend': {
        hipL = hipR = -0.45; kneeL = kneeR = 0.85; spineX = 0.25;
        lsh = [-0.4, 0, 1.0 + Math.sin(t * 4) * 0.2]; rsh = [-0.4, 0, -1.0 - Math.sin(t * 4 + 1) * 0.2];
        lel = rel = -0.4;
        break;
      }
      case 'cheer': {
        const w = Math.sin(t * 9) * 0.3;
        lsh = [-2.7, 0, 0.3 + w]; rsh = [-2.7, 0, -0.3 - w]; lel = rel = -0.3;
        hop = Math.abs(Math.sin(t * 5)) * 0.06;
        break;
      }
      default:
        spineX = 0.03 + Math.sin(t * 1.7) * 0.015;
        headY = Math.sin(t * 0.5) * 0.3;
    }
    set('lHip', hipL); set('rHip', hipR);
    set('lKnee', Math.max(0, kneeL)); set('rKnee', Math.max(0, kneeR));
    set('spine', spineX, 0, spineZ); set('head', headX, headY, 0);
    set('lShoulder', ...lsh); set('rShoulder', ...rsh);
    set('lElbow', Math.min(0, lel)); set('rElbow', Math.min(0, rel));
    // Lowest foot on the ground (plus any jump).
    const tmp = new THREE.Vector3();
    const yL = legFk(b.lHip.rotation.x, b.lHip.rotation.z, b.lKnee.rotation.x, THIGH, SHIN, tmp).y;
    const yR = legFk(b.rHip.rotation.x, b.rHip.rotation.z, b.rKnee.rotation.x, THIGH, SHIN, tmp).y;
    b.hips.position.y = SOLE + HIP_DROP - Math.min(yL, yR) + hop;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.skeleton.dispose();
  }
}
