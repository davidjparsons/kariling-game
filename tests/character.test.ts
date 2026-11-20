import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYER, type CharacterAppearance } from '../src/config/appearance';
import { legFk, legIk, Runner, type RunnerMode } from '../src/render/character';

const adult: CharacterAppearance = { ...DEFAULT_PLAYER.appearance, age: 'adult', bottoms: 'trousers', footwear: 'sneakers', shirt: 'tee' };
const child: CharacterAppearance = { ...DEFAULT_PLAYER.appearance };

describe('leg IK', () => {
  it('round-trips through forward kinematics with knees bending forward', () => {
    const L1 = 0.27, L2 = 0.26;
    const out = new THREE.Vector3();
    for (const t of [[0.05, -0.45, 0.12], [-0.03, -0.38, -0.2], [0.0, -0.5, 0.0], [0.02, -0.3, 0.25]]) {
      const d = new THREE.Vector3(...t);
      const ik = legIk(d, L1, L2);
      expect(ik.k).toBeGreaterThanOrEqual(0); // never hyper-extends backwards
      legFk(ik.hx, ik.hz, ik.k, L1, L2, out);
      expect(out.distanceTo(d)).toBeLessThan(1e-3);
    }
  });

  it('clamps unreachable targets to a straight leg instead of breaking', () => {
    const ik = legIk(new THREE.Vector3(0, -2, 0), 0.27, 0.26);
    expect(ik.k).toBeLessThan(0.1);
    expect(Number.isFinite(ik.hx)).toBe(true);
  });
});

/** Run a runner through a mode over a ground function and report the foot clearances seen. */
function simulate(look: CharacterAppearance, mode: RunnerMode, speed: number, ground: (x: number, z: number) => number, seconds = 3) {
  const r = new Runner(look);
  r.ground = ground;
  let minClear = Infinity, maxLowest = -Infinity;
  const dt = 1 / 60;
  let x = 0;
  for (let i = 0; i < seconds / dt; i++) {
    x += speed * dt;
    r.root.position.set(0, ground(0, x), x);
    r.root.rotation.y = 0;
    r.animate(dt, { speed, pushing: 1, lean: 0, wobble: 0, mode, modeTime: i * dt });
    if (i < 30) continue; // let smoothing settle
    const [a, b] = r.footClearance;
    minClear = Math.min(minClear, a, b);
    maxLowest = Math.max(maxLowest, Math.min(a, b));
  }
  return { minClear, maxLowest };
}

describe('character ground contact', () => {
  const flat = () => 0;
  const slope = (_x: number, z: number) => z * 0.12;
  // A cement hump every 6 m.
  const humps = (_x: number, z: number) => { const u = ((z % 6) + 6) % 6 - 3; return Math.abs(u) < 0.8 ? 0.13 * Math.cos((u / 0.8) * Math.PI / 2) : 0; };

  for (const [name, look] of [['child', child], ['adult', adult]] as const) {
    for (const [gname, g] of [['flat', flat], ['slope', slope], ['humps', humps]] as const) {
      it(`${name} feet never sink and one foot stays planted while running (${gname})`, () => {
        const { minClear, maxLowest } = simulate(look, 'run', 6, g);
        expect(minClear).toBeGreaterThan(-0.012);
        expect(maxLowest).toBeLessThan(0.05);
      });
    }
    for (const mode of ['idle', 'recover', 'clean', 'stunned', 'shock', 'sad', 'fall'] as RunnerMode[]) {
      it(`${name} ${mode} pose rests on the ground`, () => {
        const { minClear, maxLowest } = simulate(look, mode, 0, flat, 1.5);
        expect(minClear).toBeGreaterThan(-0.012);
        expect(maxLowest).toBeLessThan(0.02);
      });
    }
  }

  it('the pushing arm reaches a grip point with the elbow bent naturally', () => {
    const r = new Runner(child);
    r.animate(1 / 60, { speed: 4, pushing: 1, lean: 0, wobble: 0, mode: 'run', modeTime: 0 });
    r.root.updateMatrixWorld(true);
    const sh = r.rightShoulderWorld(new THREE.Vector3());
    // Forward-down-right of the shoulder, within reach.
    const target = sh.clone().add(new THREE.Vector3(-0.08, -0.22, 0.12));
    const miss = r.aimRightHand(target);
    expect(miss).toBeLessThan(0.02);
    const elbow = r.rightHand.parent!; // hand → elbow group
    expect(elbow.rotation.x).toBeLessThanOrEqual(0); // elbows only flex one way
  });
});
