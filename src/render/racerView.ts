import * as THREE from 'three';
import type { RacerLoadout } from '../config/appearance';
import { STICK_LENGTH } from '../config/gameplay';
import { STICKS } from '../config/sticks';
import { TYRES } from '../config/tyres';
import { SURFACES } from '../config/surfaces';
import type { RacerPhysicsState } from '../sim/physics';
import { Runner, type GroundHeightFn, type RunnerMode } from './character';
import { buildStick, buildTyre } from './kariling';
import { puffTexture } from './textures';
import { clamp } from '../core/math';
import { ITEMS, type ItemId } from '../config/items';
import { buildItemModel } from './items';

export interface RacerVisualState {
  x: number;
  z: number;
  heading: number;
  rx: number;
  rz: number;
  rHeading: number;
  phys: RacerPhysicsState;
  /** Ground height under the tyre and under the runner. */
  tyreGround: number;
  runnerGround: number;
  /** World ground height sampler near this racer (feet, stick and scoop placement). */
  ground?: GroundHeightFn;
}

const UP = new THREE.Vector3(0, 1, 0);
let blobMat: THREE.MeshBasicMaterial | null = null;
function blobMaterial(): THREE.MeshBasicMaterial {
  if (!blobMat) blobMat = new THREE.MeshBasicMaterial({ map: puffTexture(), color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
  return blobMat;
}

const bubbleCache = new Map<string, THREE.SpriteMaterial>();
/** Comic speech bubble sprite material. */
export function bubbleMaterial(text: string, bg = '#ffffff', fg = '#2b1d12'): THREE.SpriteMaterial {
  const key = `${text}|${bg}|${fg}`;
  let m = bubbleCache.get(key);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.strokeStyle = '#2b1d12';
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(10, 10, 236, 84, 36);
  g.moveTo(110, 92); g.lineTo(128, 122); g.lineTo(146, 92);
  g.fill(); g.stroke();
  g.fillStyle = bg;
  g.fillRect(112, 84, 32, 12);
  g.fillStyle = fg;
  g.font = 'bold 56px "Baloo 2", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
  bubbleCache.set(key, m);
  return m;
}

/** Runner + tyre + stick/scoop for one racer, driven from the simulation state. */
export class RacerView {
  readonly group = new THREE.Group();
  readonly runner: Runner;
  readonly tyreRoot = new THREE.Group();
  private spin = new THREE.Group();
  private shaft: THREE.Group;
  private scoop: THREE.Group;
  private stickLength: number;
  private runnerShadow: THREE.Mesh;
  private tyreShadow: THREE.Mesh;
  private stars = new THREE.Group();
  private stink = new THREE.Group();
  private bubble: THREE.Sprite;
  /** Coconut stability shield around the tyre, and the golden glow of a Golden Roll. */
  private shield: THREE.Mesh;
  private golden: THREE.Mesh;
  /** Snack model that pops up over the runner when an item is used. */
  private itemPop = new THREE.Group();
  private itemModels = new Map<ItemId, THREE.Group>();
  private itemPopTime = 0;
  private bubbleTime = 0;
  private reaction: RunnerMode | null = null;
  private reactionTime = 0;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private scoopLocalPos = new THREE.Vector3();
  private scoopLocalQuat = new THREE.Quaternion();
  private scoopBackLocal = new THREE.Vector3();
  private scoopLowLocal = new THREE.Vector3();
  private channelR = 0.08;
  private scoopBeta = -1;
  /** Scoop angle below the hub on the rear tread (rad). */
  static readonly SCOOP_BETA = 0.38;
  readonly radius: number;
  private readonly tube: number;
  /** Override for end-of-race reactions. */
  forcedMode: RunnerMode | null = null;
  private forcedTime = 0;
  /** Static state for showroom display (menus). */
  userState: RacerPhysicsState | null = null;
  private modeTime = 0;
  private lastMode: RunnerMode = 'idle';

  constructor(public loadout: RacerLoadout) {
    const tyre = TYRES[loadout.tyreId];
    this.radius = tyre.radius;
    this.tube = tyre.tube;
    this.runner = new Runner(loadout.appearance);
    this.group.add(this.runner.root);
    this.spin.add(buildTyre(tyre, loadout.tyreLook));
    this.tyreRoot.add(this.spin);
    this.group.add(this.tyreRoot);
    this.stickLength = STICK_LENGTH[loadout.appearance.age];
    const stick = buildStick(STICKS[loadout.stickId], this.stickLength);
    this.shaft = stick.shaft;
    this.scoop = stick.scoop;
    this.group.add(this.shaft, this.scoop);

    // Scoop pose relative to the (non-spinning) tyre: on the rear tread, ~25° below the hub,
    // its channel cupping the tread (axis along the tyre's tangent, opening towards the hub).
    const tube = tyre.tube;
    this.channelR = tube * 1.18 + 0.008;
    const scale = this.channelR / stick.scoopRadius;
    this.scoop.scale.set(scale, 1, scale);
    this.setScoopAngle(RacerView.SCOOP_BETA);

    const blob = new THREE.PlaneGeometry(1, 1);
    blob.rotateX(-Math.PI / 2);
    this.runnerShadow = new THREE.Mesh(blob, blobMaterial());
    this.runnerShadow.scale.set(0.6 * this.runner.scale, 1, 0.6 * this.runner.scale);
    this.tyreShadow = new THREE.Mesh(blob, blobMaterial());
    this.tyreShadow.scale.set(0.3, 1, this.radius * 2.4);
    this.runnerShadow.renderOrder = this.tyreShadow.renderOrder = 2;
    this.group.add(this.runnerShadow, this.tyreShadow);

    // Cartoon dizzy stars.
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), starMat);
      s.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.2, 0, Math.sin((i / 5) * Math.PI * 2) * 0.2);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.group.add(this.stars);
    // Stink lines for a dirty tyre (green wiggles).
    const stinkMat = new THREE.MeshBasicMaterial({ color: 0x8bc34a, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 3; i++) {
      const pts = Array.from({ length: 8 }, (_, k) => new THREE.Vector3(Math.sin(k * 1.2 + i) * 0.04, k * 0.05, 0));
      const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.008, 4), stinkMat);
      line.position.set((i - 1) * 0.12, 0, 0);
      this.stink.add(line);
    }
    this.stink.visible = false;
    this.group.add(this.stink);
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 1.55, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0xaed581, emissive: 0x558b2f, emissiveIntensity: 0.4, transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.2 }),
    );
    this.shield.visible = false;
    this.golden = new THREE.Mesh(
      new THREE.TorusGeometry(this.radius * 1.08, 0.025, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.golden.rotation.y = Math.PI / 2;
    this.golden.visible = false;
    this.tyreRoot.add(this.golden);
    this.group.add(this.shield, this.itemPop);
    this.itemPop.visible = false;
    this.bubble = new THREE.Sprite(bubbleMaterial('!'));
    this.bubble.scale.set(0.7, 0.35, 1);
    this.bubble.visible = false;
    this.bubble.renderOrder = 10;
    this.group.add(this.bubble);
  }

  /**
   * Scoop pose relative to the (non-spinning) tyre: on the rear tread, `beta` below the hub,
   * its channel cupping the tread (axis along the tyre's tangent, opening towards the hub).
   */
  private setScoopAngle(beta: number): void {
    if (Math.abs(beta - this.scoopBeta) < 1e-4) return;
    this.scoopBeta = beta;
    const tube = TYRES[this.loadout.tyreId].tube;
    const n = new THREE.Vector3(0, -Math.sin(beta), -Math.cos(beta));
    const t = new THREE.Vector3(0, n.z, -n.y);
    const a = new THREE.Vector3(1, 0, 0);
    const rc = this.radius - tube * 1.05;
    this.scoopLocalPos.copy(n).multiplyScalar(rc);
    this.scoopLocalQuat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, t, n));
    this.scoopBackLocal.copy(n).multiplyScalar(rc + this.channelR + 0.02);
    // Lowest point of the scoop shell: its lower end, on the outside of the channel.
    this.scoopLowLocal.copy(n).multiplyScalar(rc + this.channelR).addScaledVector(t, 0.085);
  }

  /** Pop the used snack up over the runner's head for a moment. */
  showItem(id: ItemId): void {
    for (const m of this.itemModels.values()) m.visible = false;
    let m = this.itemModels.get(id);
    if (!m) { m = buildItemModel(id); m.scale.setScalar(1.6); this.itemModels.set(id, m); this.itemPop.add(m); }
    m.visible = true;
    this.itemPop.visible = true;
    this.itemPopTime = 1.3;
    this.bubble.material = bubbleMaterial(ITEMS[id].effect.split(' ')[0] + '!', '#fff59d');
    this.bubble.visible = true;
    this.bubbleTime = 1.1;
  }

  setForcedMode(mode: RunnerMode | null): void {
    if (mode !== this.forcedMode) this.forcedTime = 0;
    this.forcedMode = mode;
  }

  /** Show a short reaction (pose + bubble), e.g. 'eww' after rolling through poo. */
  react(text: string, mode: RunnerMode | null, seconds = 1.1, bg = '#ffffff'): void {
    this.bubble.material = bubbleMaterial(text, bg);
    this.bubble.visible = true;
    this.bubbleTime = seconds;
    if (mode) { this.reaction = mode; this.reactionTime = seconds; }
  }

  private modeFor(p: RacerPhysicsState): RunnerMode {
    if (this.forcedMode) return this.forcedMode;
    if (p.control === 'lost') return p.lostPhase === 'pickup' ? 'recover' : p.lostPhase === 'canal' ? 'shock' : p.controlTime < 0.45 ? 'fall' : 'chase';
    if (p.stun > 0) return 'stunned';
    if (p.cleaning > 0) return 'clean';
    if (this.reaction) return this.reaction;
    if (p.separated) return 'chase';
    if (p.control === 'unstable') return 'struggle';
    return p.rSpeed > 0.4 || p.speed > 0.4 ? 'run' : 'idle';
  }

  update(dt: number, v: RacerVisualState): void {
    const p = v.phys;
    const h = v.heading;
    const r = this.radius;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rxv = -fz, rzv = fx;

    // ---------- tyre
    const wob = p.wobble * 0.3 * Math.sin(p.wobblePhase);
    const lean = p.lean + (p.control === 'lost' ? 0 : wob);
    const leanAbs = Math.min(Math.abs(lean), 1.45);
    const sideShift = Math.sin(leanAbs) * r * Math.sign(lean);
    // A leaning tyre rests on its shoulder, not its centreline: lift by the section half-width.
    const shoulderLift = Math.sin(leanAbs) * this.tube * 0.85;
    // Rough ground visibly jostles the wheel (render-only; physics keeps the true contact).
    const surf = SURFACES[p.surface];
    const shake = p.grounded && p.control !== 'lost' ? surf.roughness * Math.min(1, p.speed / 7) * 0.018 : 0;
    const jitter = shake * Math.max(0, Math.sin(p.roll * 2.3) * Math.sin(p.roll * 5.1 + 1));
    this.tyreRoot.position.set(v.x + rxv * sideShift, p.y + Math.cos(leanAbs) * r + shoulderLift + 0.004 + jitter, v.z + rzv * sideShift);
    this.tyreRoot.rotation.order = 'YZX';
    this.tyreRoot.rotation.set(0, h + p.wobble * 0.07 * Math.sin(p.wobblePhase * 1.3), lean);
    this.spin.rotation.x = p.roll;
    const shadowFade = Math.max(0.15, 1 - (p.y - v.tyreGround) * 0.8);
    this.tyreShadow.position.set(v.x, v.tyreGround + 0.04, v.z);
    this.tyreShadow.rotation.y = h;
    this.tyreShadow.scale.set(0.3 * shadowFade + 0.1, 1, r * 2.4 * shadowFade);

    // ---------- runner (position comes from the simulation)
    const mode = this.modeFor(p);
    if (mode !== this.lastMode) { this.modeTime = 0; this.lastMode = mode; }
    this.modeTime += dt;
    this.runner.root.position.set(v.rx, v.runnerGround, v.rz);
    this.runner.root.rotation.y = v.rHeading;
    this.runner.ground = v.ground ?? null;
    this.runnerShadow.position.set(v.rx, v.runnerGround + 0.035, v.rz);
    if (this.forcedMode) this.forcedTime += dt;
    // Sugar rush: frantic legs.
    const anim = p.fx.item.cola > 0 ? ITEMS.cola.mods.anim ?? 1 : 1;
    this.runner.animate(dt, {
      speed: (mode === 'run' || mode === 'struggle' || mode === 'chase' || mode === 'eww' ? Math.max(p.rSpeed, mode === 'chase' ? 6 : 0) : p.rSpeed) * anim,
      pushing: p.pushing,
      lean: p.lean,
      wobble: p.wobble,
      mode,
      modeTime: this.forcedMode ? this.forcedTime : p.control === 'lost' ? p.controlTime : this.modeTime,
    });
    this.group.updateMatrixWorld(true);

    // ---------- stick + scoop
    const attached = !this.forcedMode && p.control !== 'lost' && !p.separated && p.grounded && p.stickContact > 0.3
      && p.stun <= 0 && p.cleaning <= 0 && mode !== 'eww';
    const L = this.stickLength;
    const gnd = v.ground;
    if (attached) {
      // Scoop sits on the rear tread. If the ground behind the tyre is higher (a hump, a ramp
      // lip, a lean towards that side) roll the scoop up the tread until it clears the surface.
      this.tyreRoot.updateMatrixWorld(true);
      this.tyreRoot.getWorldQuaternion(this.tmpQ);
      let beta = RacerView.SCOOP_BETA;
      this.setScoopAngle(beta);
      if (gnd) {
        for (let it = 0; it < 3; it++) {
          const low = this.tyreRoot.localToWorld(this.tmpB.copy(this.scoopLowLocal));
          const pen = gnd(low.x, low.z) + 0.012 - low.y;
          if (pen <= 0) break;
          beta = Math.max(-0.35, beta - pen / Math.max(0.15, this.radius) - 0.02);
          this.setScoopAngle(beta);
        }
      }
      this.scoop.quaternion.copy(this.tmpQ).multiply(this.scoopLocalQuat);
      this.scoop.position.copy(this.scoopLocalPos);
      this.tyreRoot.localToWorld(this.scoop.position);
      const back = this.tyreRoot.localToWorld(this.tmpB.copy(this.scoopBackLocal));
      // The stick is rigid: the grip lies one stick length from the scoop, on the line towards
      // the runner's real shoulder; the arm IK then reaches for it (elbow bending naturally).
      const shoulder = this.runner.rightShoulderWorld(this.tmpA);
      const toShoulder = shoulder.sub(back);
      const dist = toShoulder.length();
      toShoulder.normalize();
      // A little push-pull with the stride, so the hand visibly works the stick.
      const pump = Math.sin(p.pushPhase * Math.PI * 2) * 0.025 * p.pushing;
      const gripTarget = back.clone().addScaledVector(toShoulder, Math.min(L, dist - 0.06) + pump);
      this.runner.aimRightHand(gripTarget);
      const grip = this.runner.rightGrip.getWorldPosition(this.tmpA);
      const dir = back.clone().sub(grip);
      const len = dir.length();
      this.shaft.position.copy(grip);
      this.shaft.quaternion.setFromUnitVectors(UP, dir.normalize());
      this.shaft.scale.set(1, Math.min(1.12, len / L), 1);
    } else {
      // Held loosely: the stick points forward-down from the hand, scoop on the end — but never
      // through the ground.
      const grip = this.runner.rightGrip.getWorldPosition(this.tmpA);
      const rh = v.rHeading;
      const raised = mode === 'celebrate' || mode === 'cheer' || mode === 'shock';
      const dir = raised
        ? this.tmpB.set(0.15, 1, 0.1).normalize()
        : this.tmpB.set(Math.sin(rh) * 0.75, mode === 'clean' || mode === 'recover' ? -0.75 : -0.5, Math.cos(rh) * 0.75).normalize();
      if (!raised) {
        const ex = grip.x + dir.x * L, ez = grip.z + dir.z * L;
        const floor = (gnd ? gnd(ex, ez) : v.runnerGround) + 0.07;
        const minDy = (floor - grip.y) / L;
        if (dir.y < minDy) {
          const dy = clamp(minDy, -1, 1);
          const hz = Math.sqrt(1 - dy * dy);
          const hl = Math.hypot(dir.x, dir.z) || 1;
          dir.set((dir.x / hl) * hz, dy, (dir.z / hl) * hz);
        }
      }
      this.shaft.position.copy(grip);
      this.shaft.quaternion.setFromUnitVectors(UP, dir);
      this.shaft.scale.set(1, 1, 1);
      const end = grip.clone().addScaledVector(dir, L);
      this.scoop.position.copy(end);
      // Scoop back faces the hand; channel axis horizontal.
      const zAxis = dir.clone().negate();
      const xAxis = new THREE.Vector3().crossVectors(UP, zAxis).normalize();
      if (xAxis.lengthSq() < 1e-4) xAxis.set(1, 0, 0);
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
      this.scoop.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    }

    // ---------- effects
    const headY = v.runnerGround + this.runner.height + 0.12;
    this.shield.visible = p.fx.shieldHits > 0 && p.fx.item.buko > 0;
    if (this.shield.visible) {
      this.shield.position.set(v.x, p.y + r, v.z);
      const blink = p.fx.item.buko < 1.5 ? 0.5 + 0.5 * Math.sin(performance.now() / 70) : 1;
      (this.shield.material as THREE.MeshStandardMaterial).opacity = 0.22 * blink;
    }
    this.golden.visible = p.fx.item.turon > 0;
    if (this.itemPopTime > 0) {
      this.itemPopTime -= dt;
      const k = 1 - this.itemPopTime / 1.3;
      this.itemPop.position.set(v.rx, headY + 0.75 + k * 0.35, v.rz);
      this.itemPop.rotation.y += dt * 5;
      this.itemPop.scale.setScalar(Math.min(1, k * 6) * (this.itemPopTime < 0.25 ? this.itemPopTime / 0.25 : 1));
      if (this.itemPopTime <= 0) this.itemPop.visible = false;
    }
    this.stars.visible = p.stun > 0;
    if (this.stars.visible) {
      this.stars.position.set(v.rx, headY, v.rz);
      this.stars.rotation.y += dt * 6;
    }
    this.stink.visible = p.dirt > 0.05;
    if (this.stink.visible) {
      this.stink.position.set(v.x, p.y + r * 1.9, v.z);
      this.stink.rotation.y = h + Math.PI / 2;
      this.stink.children.forEach((c, i) => { c.position.y = ((performance.now() / 900 + i * 0.33) % 1) * 0.15; });
    }
    if (this.bubbleTime > 0) {
      this.bubbleTime -= dt;
      this.bubble.position.set(v.rx, headY + 0.32, v.rz);
      if (this.bubbleTime <= 0) this.bubble.visible = false;
    }
    if (this.reactionTime > 0) {
      this.reactionTime -= dt;
      if (this.reactionTime <= 0) this.reaction = null;
    }
  }

  dispose(): void {
    // Runner geometries are cached and shared; dispose its materials plus our own tyre/stick meshes.
    this.runner.dispose();
    for (const root of [this.tyreRoot, this.shaft, this.scoop, this.stars, this.stink, this.shield, this.itemPop]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose(); // textures are cached and shared
        }
      });
    }
  }
}
