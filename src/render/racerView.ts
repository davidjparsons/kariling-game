import * as THREE from 'three';
import type { RacerLoadout } from '../config/appearance';
import { STICKS } from '../config/sticks';
import { TYRES } from '../config/tyres';
import { damp, dampAngle } from '../core/math';
import type { RacerPhysicsState } from '../sim/physics';
import { Runner, type RunnerMode } from './character';
import { buildStick, buildTyre } from './kariling';
import { puffTexture } from './textures';

export interface RacerVisualState {
  x: number;
  z: number;
  heading: number;
  phys: RacerPhysicsState;
}

const UP = new THREE.Vector3(0, 1, 0);
let blobMat: THREE.MeshBasicMaterial | null = null;
function blobMaterial(): THREE.MeshBasicMaterial {
  if (!blobMat) {
    blobMat = new THREE.MeshBasicMaterial({ map: puffTexture(), color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
  }
  return blobMat;
}

/** Runner + tyre + stick for one racer, driven from physics state. */
export class RacerView {
  readonly group = new THREE.Group();
  readonly runner: Runner;
  readonly tyreRoot = new THREE.Group();
  private spin = new THREE.Group();
  private stick: ReturnType<typeof buildStick>;
  private runnerShadow: THREE.Mesh;
  private tyreShadow: THREE.Mesh;
  private runnerPos = new THREE.Vector3();
  private runnerYaw = 0;
  private runnerSpeed = 0;
  private initialised = false;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  readonly radius: number;
  /** Override for end-of-race reactions. */
  forcedMode: RunnerMode | null = null;
  /** Static state for showroom display (menus). */
  userState: RacerPhysicsState | null = null;
  private forcedTime = 0;

  constructor(public loadout: RacerLoadout) {
    const tyre = TYRES[loadout.tyreId];
    this.radius = tyre.radius;
    this.runner = new Runner(loadout.appearance);
    this.group.add(this.runner.root);
    this.spin.add(buildTyre(tyre, loadout.tyreLook));
    this.tyreRoot.add(this.spin);
    this.group.add(this.tyreRoot);
    this.stick = buildStick(STICKS[loadout.stickId]);
    this.group.add(this.stick.group);
    const blob = new THREE.PlaneGeometry(1, 1);
    blob.rotateX(-Math.PI / 2);
    this.runnerShadow = new THREE.Mesh(blob, blobMaterial());
    this.runnerShadow.scale.set(0.7, 1, 0.7);
    this.tyreShadow = new THREE.Mesh(blob, blobMaterial());
    this.tyreShadow.scale.set(0.35, 1, this.radius * 2.4);
    this.runnerShadow.renderOrder = this.tyreShadow.renderOrder = 2;
    this.group.add(this.runnerShadow, this.tyreShadow);
  }

  setForcedMode(mode: RunnerMode | null): void {
    if (mode !== this.forcedMode) this.forcedTime = 0;
    this.forcedMode = mode;
  }

  update(dt: number, v: RacerVisualState): void {
    const p = v.phys;
    const h = v.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = -fz, rz = fx;
    const r = this.radius;

    // ---------- tyre
    const wob = p.wobble * 0.28 * Math.sin(p.wobblePhase);
    const lean = p.lean + wob;
    const leanAbs = Math.min(Math.abs(lean), 1.45);
    const sideShift = Math.sin(leanAbs) * r * Math.sign(lean);
    this.tyreRoot.position.set(v.x + rx * sideShift, Math.cos(leanAbs) * r + 0.01, v.z + rz * sideShift);
    this.tyreRoot.rotation.set(0, 0, 0);
    this.tyreRoot.rotation.order = 'YZX';
    this.tyreRoot.rotation.y = h + p.wobble * 0.08 * Math.sin(p.wobblePhase * 1.3);
    this.tyreRoot.rotation.z = lean;
    this.spin.rotation.x = p.roll;
    this.tyreShadow.position.set(v.x, 0.05, v.z);
    this.tyreShadow.rotation.y = h;

    // ---------- runner placement: behind and to the left of the tyre
    const mode: RunnerMode = this.forcedMode ?? (p.control === 'lost' ? (p.lostPhase === 'pickup' ? 'recover' : 'fall') : p.speed > 0.4 ? 'run' : 'idle');
    const back = mode === 'recover' ? 0.75 : mode === 'fall' ? 1.05 : 1.2 + Math.min(0.25, p.speed * 0.02);
    const leftOff = 0.36 + Math.max(0, -p.lean) * 0.25;
    const tx = v.x - fx * back - rx * leftOff;
    const tz = v.z - fz * back - rz * leftOff;
    if (!this.initialised) {
      this.runnerPos.set(tx, 0, tz);
      this.runnerYaw = h;
      this.initialised = true;
    }
    const prevX = this.runnerPos.x, prevZ = this.runnerPos.z;
    // Stiff follow so the runner never drifts far, but with a little lag for life.
    this.runnerPos.x = damp(this.runnerPos.x, tx, 16, dt);
    this.runnerPos.z = damp(this.runnerPos.z, tz, 16, dt);
    const moved = dt > 0 ? Math.hypot(this.runnerPos.x - prevX, this.runnerPos.z - prevZ) / dt : 0;
    this.runnerSpeed = damp(this.runnerSpeed, Math.min(moved, 16), 10, dt);
    const towardTyre = Math.atan2(v.x - this.runnerPos.x, v.z - this.runnerPos.z);
    const yawTarget = h + Math.max(-0.5, Math.min(0.5, ((towardTyre - h + Math.PI * 3) % (Math.PI * 2)) - Math.PI)) * 0.5;
    this.runnerYaw = dampAngle(this.runnerYaw, yawTarget, 10, dt);
    this.runner.root.position.copy(this.runnerPos);
    this.runner.root.rotation.y = this.runnerYaw;
    this.runnerShadow.position.set(this.runnerPos.x, 0.04, this.runnerPos.z);

    if (this.forcedMode) this.forcedTime += dt;
    this.runner.animate(dt, {
      speed: mode === 'run' ? Math.max(this.runnerSpeed, p.speed * 0.9) : this.runnerSpeed,
      pushing: p.pushing,
      lean: p.lean,
      wobble: p.wobble,
      mode,
      modeTime: this.forcedMode ? this.forcedTime : p.controlTime,
    });

    // ---------- stick from hand to the back of the tyre
    this.group.updateMatrixWorld(true);
    const grip = this.runner.rightGrip.getWorldPosition(this.tmpA);
    if (mode === 'celebrate' || mode === 'cheer') {
      // Raised in triumph: stick points up out of the hand.
      this.stick.group.position.copy(grip);
      this.stick.group.quaternion.setFromUnitVectors(UP, this.tmpB.set(0.15, 1, 0.1).normalize());
      this.stick.shaft.scale.y = 0.9;
      this.stick.tip.position.y = 0.9;
      return;
    }
    const contact = this.tmpB.set(0, -r * 0.42, -r * 0.93);
    this.tyreRoot.localToWorld(contact);
    const dir = contact.clone().sub(grip);
    const len = dir.length();
    dir.normalize();
    this.stick.group.position.copy(grip);
    this.stick.group.quaternion.setFromUnitVectors(UP, dir);
    this.stick.shaft.scale.y = len;
    this.stick.tip.position.y = len;
  }

  dispose(): void {
    // Runner geometries are cached and shared; dispose its materials plus our own tyre/stick meshes.
    this.runner.dispose();
    for (const root of [this.tyreRoot, this.stick.group]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      });
    }
  }
}
