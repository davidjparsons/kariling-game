import * as THREE from 'three';
import { damp } from '../core/math';
import type { Dog } from '../sim/dogs';
import { bubbleMaterial } from './racerView';

const COATS = [
  { base: 0xc8915a, patch: 0xf2e2c8 }, // tan with cream
  { base: 0x8a5a33, patch: 0x3b2a1e }, // brown with dark saddle
  { base: 0xe9dcc4, patch: 0x9a6b42 }, // cream with brown spots
];

/**
 * Stylised askal: lean body, deep chest, long legs, pointed ears, curled tail.
 * Animated procedurally: lying, sitting, trotting, galloping, barking and tail wags.
 */
export class DogView {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private jaw: THREE.Mesh;
  private tail = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group; front: boolean; side: number }[] = [];
  private bubble: THREE.Sprite;
  private bubbleTime = 0;
  private phase = 0;
  private sitK = 0;
  private lieK = 0;
  private time = 0;
  private mats: THREE.Material[] = [];

  constructor(id: number) {
    const coat = COATS[id % COATS.length];
    const m = (c: number, r = 0.85) => { const mm = new THREE.MeshStandardMaterial({ color: c, roughness: r }); this.mats.push(mm); return mm; };
    const base = m(coat.base), patch = m(coat.patch), dark = m(0x1a1410, 0.4), pink = m(0xd9777a, 0.5);
    const add = (g: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      return o;
    };
    this.root.add(this.body);
    this.body.position.y = 0.42;
    // Body: lathed barrel along z with a deeper chest and tucked waist.
    const prof: [number, number][] = [[0.001, -0.3], [0.08, -0.28], [0.1, -0.15], [0.095, 0], [0.12, 0.12], [0.125, 0.2], [0.1, 0.28], [0.001, 0.3]];
    const bodyGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14);
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.scale(0.8, 1, 1);
    add(bodyGeo, base, this.body);
    // Saddle patch on the back.
    const saddle = add(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), patch, this.body, 0, 0.04, -0.02);
    saddle.scale.set(0.9, 0.7, 1.9);
    // Neck + head.
    const neck = add(new THREE.CylinderGeometry(0.05, 0.065, 0.18, 8), base, this.body, 0, 0.09, 0.27);
    neck.rotation.x = 0.7;
    this.head.position.set(0, 0.17, 0.35);
    this.body.add(this.head);
    const skull = add(new THREE.SphereGeometry(0.075, 12, 10), base, this.head);
    skull.scale.set(0.9, 0.85, 1);
    const snout = add(new THREE.CylinderGeometry(0.032, 0.045, 0.11, 8), patch, this.head, 0, -0.02, 0.09);
    snout.rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.02, 8, 6), dark, this.head, 0, -0.005, 0.15);
    this.jaw = add(new THREE.BoxGeometry(0.05, 0.015, 0.08), pink, this.head, 0, -0.05, 0.08) as THREE.Mesh;
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.012, 6, 5), dark, this.head, s * 0.035, 0.025, 0.06);
      const ear = add(new THREE.ConeGeometry(0.032, 0.09, 4), id % 2 && s > 0 ? patch : base, this.head, s * 0.045, 0.08, -0.01);
      ear.rotation.set(-0.2, 0, s * -0.35);
    }
    // Legs: two segments each.
    for (const front of [true, false]) {
      for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.06, -0.02, front ? 0.18 : -0.2);
        this.body.add(hip);
        const upper = new THREE.CylinderGeometry(0.03, 0.022, 0.2, 6);
        upper.translate(0, -0.1, 0);
        add(upper, base, hip);
        const knee = new THREE.Group();
        knee.position.y = -0.2;
        hip.add(knee);
        const lower = new THREE.CylinderGeometry(0.02, 0.017, 0.2, 6);
        lower.translate(0, -0.1, 0);
        add(lower, id % 3 === 0 ? patch : base, knee);
        add(new THREE.SphereGeometry(0.024, 6, 4), patch, knee, 0, -0.2, 0.012).scale.set(1, 0.6, 1.4);
        this.legs.push({ hip, knee, front, side });
      }
    }
    // Curled tail.
    this.tail.position.set(0, 0.06, -0.29);
    this.body.add(this.tail);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, -0.05), new THREE.Vector3(0, 0.17, 0.02), new THREE.Vector3(0, 0.13, 0.07)]);
    add(new THREE.TubeGeometry(curve, 10, 0.018, 5), base, this.tail);
    this.bubble = new THREE.Sprite(bubbleMaterial('ARF!'));
    this.bubble.scale.set(0.8, 0.4, 1);
    this.bubble.visible = false;
    this.bubble.renderOrder = 10;
    this.root.add(this.bubble);
  }

  say(text: string, seconds = 0.9, bg = '#ffffff'): void {
    this.bubble.material = bubbleMaterial(text, bg);
    this.bubble.visible = true;
    this.bubbleTime = seconds;
  }

  update(dt: number, dog: Dog, groundY = 0): void {
    this.time += dt;
    this.root.position.set(dog.x, groundY, dog.z);
    this.root.rotation.y = dog.heading;
    const moving = dog.speed > 0.3;
    const gallop = dog.state === 'chase';
    const restPose = (dog.state === 'idle' || dog.state === 'cooldown') && !moving;
    this.sitK = damp(this.sitK, restPose && dog.pose === 1 ? 1 : 0, 6, dt);
    this.lieK = damp(this.lieK, restPose && dog.pose === 0 ? 1 : 0, 4, dt);
    const stride = gallop ? 14 : 8;
    this.phase += dt * (moving ? stride * Math.min(1.2, dog.speed / (gallop ? 9 : 2)) : 0);
    const sw = moving ? (gallop ? 0.9 : 0.5) : 0;
    for (const l of this.legs) {
      const off = gallop ? (l.front ? 0 : Math.PI * 0.9) + (l.side > 0 ? 0.25 : 0) : (l.front === (l.side > 0) ? 0 : Math.PI);
      let hipX = Math.sin(this.phase + off) * sw;
      let kneeX = Math.max(0, Math.cos(this.phase + off)) * sw * (l.front ? -0.9 : 0.9);
      // Sitting: back legs folded under, front straight. Lying: all folded.
      if (!l.front) { hipX = hipX * (1 - this.sitK) - 1.1 * this.sitK; kneeX = kneeX * (1 - this.sitK) + 1.9 * this.sitK; }
      hipX = hipX * (1 - this.lieK) + (l.front ? -1.4 : 1.3) * this.lieK;
      kneeX = kneeX * (1 - this.lieK) + (l.front ? 0.2 : -2.2) * this.lieK;
      l.hip.rotation.x = hipX;
      l.knee.rotation.x = kneeX;
    }
    const bounce = moving ? Math.abs(Math.sin(this.phase)) * (gallop ? 0.06 : 0.02) : 0;
    this.body.position.y = 0.42 - 0.12 * this.sitK - 0.3 * this.lieK + bounce;
    this.body.rotation.x = -0.45 * this.sitK + (gallop ? Math.sin(this.phase) * 0.1 : 0);
    const barking = dog.state === 'alert' || (gallop && Math.sin(this.time * 9) > 0.6);
    this.head.rotation.x = barking ? -0.35 + Math.sin(this.time * 18) * 0.1 : this.lieK * 0.4 + this.sitK * 0.3;
    this.head.rotation.y = restPose ? Math.sin(this.time * 0.6 + dog.id) * 0.4 : 0;
    this.jaw.rotation.x = barking ? Math.max(0, Math.sin(this.time * 18)) * 0.5 : 0;
    this.tail.rotation.z = Math.sin(this.time * (gallop || dog.state === 'return' ? 16 : 5)) * (dog.state === 'cooldown' && !moving ? 0.15 : 0.5);
    this.tail.rotation.x = gallop ? 0.6 : 0;
    if (this.bubbleTime > 0) {
      this.bubbleTime -= dt;
      this.bubble.position.set(0, 1.05, 0);
      if (this.bubbleTime <= 0) this.bubble.visible = false;
    }
  }

  dispose(): void {
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }
}
