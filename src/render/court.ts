import * as THREE from 'three';
import { Rng } from '../core/rng';
import { BatchBuilder, mat4 } from './batch';
import { sharedMaterials } from './materials';
import { randomLook, Villager, type VillagerMode } from './villager';

/**
 * Barangay basketball court: painted concrete court with full markings, two hoops with
 * backboards and nets, chain-link fencing, a bench and a sign — plus a pick-up game of six
 * villagers on a simple looping script (dribble → pass → drive → shoot → rebound).
 * Local frame: court centre at the origin, long axis along +z, +x across.
 */
const W = 15, LEN = 28;

function courtTexture(): THREE.CanvasTexture {
  const px = 18; // pixels per metre
  const c = document.createElement('canvas');
  c.width = W * px; c.height = LEN * px;
  const g = c.getContext('2d')!;
  const m = (v: number) => v * px;
  g.fillStyle = '#3f7d4a'; g.fillRect(0, 0, c.width, c.height); // green surround
  g.fillStyle = '#c4672f'; g.fillRect(m(0.4), m(0.4), m(W - 0.8), m(LEN - 0.8)); // orange court
  const cx = c.width / 2, cy = c.height / 2;
  g.strokeStyle = '#ffffff'; g.lineWidth = m(0.06) + 1;
  g.strokeRect(m(0.4), m(0.4), m(W - 0.8), m(LEN - 0.8));
  g.beginPath(); g.moveTo(m(0.4), cy); g.lineTo(m(W - 0.4), cy); g.stroke();
  g.beginPath(); g.arc(cx, cy, m(1.8), 0, Math.PI * 2); g.stroke();
  for (const end of [-1, 1]) {
    const base = end < 0 ? m(0.4) : c.height - m(0.4);
    const dir = -end; // towards centre
    const hoopY = base + dir * m(1.575);
    // Key (painted), free-throw circle, three-point arc.
    g.fillStyle = '#2f6fb0';
    g.fillRect(cx - m(2.45), Math.min(base, base + dir * m(5.8)), m(4.9), m(5.8));
    g.strokeRect(cx - m(2.45), Math.min(base, base + dir * m(5.8)), m(4.9), m(5.8));
    g.beginPath(); g.arc(cx, base + dir * m(5.8), m(1.8), 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(cx - m(6.6), base); g.lineTo(cx - m(6.6), hoopY);
    g.arc(cx, hoopY, m(6.75), dir > 0 ? Math.PI - 0.08 : Math.PI + 0.08, dir > 0 ? 0.08 : -0.08, dir > 0);
    g.lineTo(cx + m(6.6), base);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function chainLinkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(200,205,210,0.95)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function signTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1565c0'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffd54f'; g.fillRect(0, 84, 512, 12);
  g.fillStyle = '#ffffff'; g.font = 'bold 50px "Baloo 2", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('BARANGAY COURT', 256, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Player { v: Villager; x: number; z: number; tx: number; tz: number; team: number; mode: VillagerMode; modeTime: number }

export interface CourtBuild {
  group: THREE.Group;
  update(dt: number): void;
  /** World positions of ball bounces since the last update (for sound). */
  bounces: THREE.Vector3[];
  dispose(): void;
}

export function buildCourt(m: THREE.Matrix4, shadows: boolean, playerCount = 6, seed = 5): CourtBuild {
  const group = new THREE.Group();
  group.applyMatrix4(m);
  const M = sharedMaterials();
  const disposables: { dispose(): void }[] = [];

  // ---- surface
  const tex = courtTexture();
  const surfMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const surf = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 0.08, LEN + 1), [M.wall, M.wall, surfMat, M.wall, M.wall, M.wall]);
  surf.position.y = 0.04;
  surf.receiveShadow = true;
  group.add(surf);
  disposables.push(tex, surfMat, surf.geometry);

  // ---- hoops, fence posts, bench (batched)
  const b = new BatchBuilder();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sub = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0) => mat4(x, y, z, ry, rx, 0, sx, sy, sz);
  for (const s of [-1, 1]) {
    const zEnd = s * (LEN / 2 + 0.6);
    b.add(new THREE.CylinderGeometry(0.09, 0.11, 3.5, 8), M.vc, sub(0, 1.75, zEnd, 1, 1, 1), 0x37474f);
    b.add(box, M.vc, sub(0, 3.35, s * (LEN / 2 - 0.1), 0.1, 0.1, 1.4), 0x37474f);
    b.add(box, M.vc, sub(0, 3.45, s * (LEN / 2 - 0.75), 1.8, 1.05, 0.05), 0xffffff);
    b.add(box, M.vc, sub(0, 3.25, s * (LEN / 2 - 0.78), 0.59, 0.45, 0.02), 0xe53935);
    b.add(box, M.vc, sub(0, 3.25, s * (LEN / 2 - 0.785), 0.5, 0.36, 0.02), 0xffffff);
    b.add(new THREE.TorusGeometry(0.23, 0.018, 6, 16).rotateX(Math.PI / 2), M.vc, sub(0, 3.05, s * (LEN / 2 - 1.0), 1, 1, 1), 0xff6f00);
    // Padding at the base of the pole.
    b.add(box, M.vc, sub(0, 0.8, zEnd, 0.32, 1.6, 0.32), 0x1565c0);
  }
  // Fence posts and top rails round the court (gap on the road side for the entrance).
  const fx = W / 2 + 1, fz = LEN / 2 + 1.4, fh = 3.2;
  const posts: [number, number][] = [];
  for (let z = -fz; z <= fz + 0.01; z += 3.5) posts.push([-fx, z], [fx, z]);
  for (let x = -fx + 3.5; x < fx; x += 3.5) posts.push([x, -fz], [x, fz]);
  for (const [x, z] of posts) b.add(new THREE.CylinderGeometry(0.04, 0.04, fh, 6), M.vc, sub(x, fh / 2, z, 1, 1, 1), 0x9ea7ad);
  for (const [x0, z0, x1, z1] of [[-fx, -fz, -fx, fz], [fx, -fz, fx, fz], [-fx, -fz, fx, -fz], [-fx, fz, fx, fz]]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    b.add(new THREE.CylinderGeometry(0.03, 0.03, len, 5).rotateX(Math.PI / 2), M.vc, sub((x0 + x1) / 2, fh, (z0 + z1) / 2, 1, 1, 1, Math.atan2(x1 - x0, z1 - z0)), 0x9ea7ad);
  }
  // Wooden bench for the waiting team, and a sari-sari style drinks cooler.
  b.add(box, M.vc, sub(fx - 0.6, 0.45, 4, 0.4, 0.06, 4), 0x8d6e63);
  for (const z of [2.2, 5.8]) b.add(box, M.vc, sub(fx - 0.6, 0.22, z, 0.35, 0.44, 0.08), 0x6d4c41);
  b.add(box, M.vc, sub(fx - 0.6, 0.3, -3, 0.5, 0.6, 0.7), 0xe53935);
  group.add(b.build(shadows, true));

  // ---- chain-link panels (one transparent material)
  const link = chainLinkTexture();
  const linkMat = new THREE.MeshStandardMaterial({ map: link, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4, depthWrite: false });
  const panel = (x: number, z: number, w: number, ry: number) => {
    const t = link.clone();
    t.repeat.set(w / 0.25, fh / 0.25);
    t.needsUpdate = true;
    const mm = linkMat.clone();
    mm.map = t;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, fh), mm);
    p.position.set(x, fh / 2, z);
    p.rotation.y = ry;
    group.add(p);
    disposables.push(t, mm, p.geometry);
  };
  panel(-fx, 0, fz * 2, Math.PI / 2);
  panel(fx, 0, fz * 2, Math.PI / 2);
  panel(0, -fz, fx * 2, 0);
  panel(0, fz, fx * 2, 0);
  disposables.push(link, linkMat);

  // ---- sign over the road-side fence
  const signMat = new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.7, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.95), signMat);
  sign.position.set(-fx - 0.05, fh + 0.6, 0);
  sign.rotation.y = -Math.PI / 2;
  group.add(sign);
  for (const z of [-2.3, 2.3]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), M.vc);
    pole.position.set(-fx - 0.05, fh + 0.3, z);
    group.add(pole);
  }
  disposables.push(signMat, signMat.map!, sign.geometry);

  // ---- players + ball
  const rng = new Rng(seed);
  const teamCol = [0xd32f2f, 0x1976d2];
  const players: Player[] = [];
  for (let i = 0; i < playerCount; i++) {
    const look = randomLook(rng, true);
    look.shirt = teamCol[i % 2];
    look.bottoms = i % 2 ? 0x0d47a1 : 0xb71c1c;
    look.skirt = false; look.longBottoms = false; look.jersey = true; look.cap = false;
    const v = new Villager(look);
    group.add(v.root);
    const x = rng.range(-5, 5), z = rng.range(-10, 10);
    players.push({ v, x, z, tx: x, tz: z, team: i % 2, mode: 'idle', modeTime: 0 });
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe8711c, roughness: 0.6 }));
  ball.castShadow = shadows;
  group.add(ball);
  disposables.push(ball.geometry, ball.material as THREE.Material);

  // Script: the ball carrier dribbles towards a hoop, passes or shoots; a teammate/opponent
  // takes over. Simple, readable, loops forever.
  type Phase = 'dribble' | 'pass' | 'shoot';
  let carrier = 0, phase: Phase = 'dribble', phaseT = 0, phaseLen = 2.5;
  let from = new THREE.Vector3(), to = new THREE.Vector3();
  let target = 1;
  let dribbleBeat = 0;
  const bounces: THREE.Vector3[] = [];
  const hoopPos = (team: number) => new THREE.Vector3(0, 3.05, (team === 0 ? 1 : -1) * (LEN / 2 - 1.0));
  const handPos = (p: Player, out = new THREE.Vector3()) => {
    p.v.hand.getWorldPosition(out);
    return group.worldToLocal(out);
  };

  const startPhase = (ph: Phase) => {
    phase = ph; phaseT = 0;
    const c = players[carrier];
    if (ph === 'dribble') {
      phaseLen = rng.range(1.8, 3.2);
      const hz = hoopPos(c.team).z;
      c.tx = rng.range(-4, 4); c.tz = hz - Math.sign(hz) * rng.range(3, 7);
      c.mode = 'dribble';
    } else if (ph === 'pass') {
      const mates = players.map((_, i) => i).filter((i) => i !== carrier && players[i].team === c.team);
      target = mates.length ? mates[rng.int(0, mates.length - 1)] : (carrier + 1) % players.length;
      phaseLen = 0.7;
      c.mode = 'pass';
      from = handPos(c);
      to = new THREE.Vector3(players[target].x, 1.0, players[target].z);
    } else {
      phaseLen = 1.4;
      c.mode = 'shoot';
      from = handPos(c);
      to = hoopPos(c.team);
    }
    c.modeTime = 0;
  };
  startPhase('dribble');

  const update = (dt: number) => {
    bounces.length = 0;
    phaseT += dt;
    const c = players[carrier];
    // Everyone else jogs to loose spots: attackers spread out, defenders mark the carrier.
    players.forEach((p, i) => {
      p.modeTime += dt;
      if (i !== carrier) {
        if (p.team !== c.team) {
          p.tx = c.x + (i % 3 - 1) * 1.5; p.tz = c.z + Math.sign(hoopPos(c.team).z) * 1.4;
          p.mode = Math.hypot(p.x - c.x, p.z - c.z) < 3 ? 'defend' : 'run';
        } else if (Math.abs(p.tx - p.x) + Math.abs(p.tz - p.z) < 0.3 && rng.chance(dt * 0.4)) {
          p.tx = rng.range(-5.5, 5.5); p.tz = hoopPos(c.team).z - Math.sign(hoopPos(c.team).z) * rng.range(2, 8);
        }
      }
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      const speed = i === carrier && phase !== 'dribble' ? 0 : Math.min(d * 2, i === carrier ? 3 : 3.5);
      if (d > 0.05) {
        p.x += (dx / d) * speed * dt; p.z += (dz / d) * speed * dt;
        p.v.root.rotation.y = Math.atan2(dx, dz);
      }
      if (i === carrier && phase !== 'dribble') {
        const t = hoopPos(c.team);
        p.v.root.rotation.y = Math.atan2(t.x - p.x, t.z - p.z);
      }
      p.x = Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.6, p.x));
      p.z = Math.max(-LEN / 2 + 0.6, Math.min(LEN / 2 - 0.6, p.z));
      p.v.root.position.set(p.x, 0.08, p.z);
      const mode: VillagerMode = i === carrier ? p.mode : p.team !== c.team ? p.mode : speed > 0.4 ? 'run' : 'idle';
      p.v.update(dt, mode === 'run' && speed < 0.4 ? 'idle' : mode, speed, p.modeTime);
    });

    const hand = handPos(c);
    if (phase === 'dribble') {
      // Ball bounces between the hand and the floor in front of the carrier.
      dribbleBeat += dt * 3.2;
      const k = Math.abs(Math.sin(dribbleBeat * Math.PI));
      const fwd = c.v.root.rotation.y;
      ball.position.set(hand.x + Math.sin(fwd) * 0.15, 0.2 + k * (hand.y - 0.2), hand.z + Math.cos(fwd) * 0.15);
      if (Math.floor(dribbleBeat) !== Math.floor(dribbleBeat - dt * 3.2)) bounces.push(group.localToWorld(ball.position.clone()));
      if (phaseT > phaseLen) startPhase(rng.chance(0.55) ? 'pass' : 'shoot');
    } else if (phase === 'pass' || phase === 'shoot') {
      const lead = phase === 'shoot' ? 0.45 : 0.15; // wind-up before release
      const u = Math.max(0, (phaseT - lead) / (phaseLen - lead));
      if (u <= 0) ball.position.copy(hand);
      else {
        const arc = phase === 'shoot' ? 2.2 : 0.6;
        ball.position.lerpVectors(from, to, Math.min(1, u)).y += Math.sin(Math.min(1, u) * Math.PI) * arc;
      }
      if (phaseT > phaseLen) {
        if (phase === 'shoot') {
          // Swish (or not) — drop through the rim, then a defender grabs the rebound.
          ball.position.copy(hoopPos(c.team)).setY(1.2);
          bounces.push(group.localToWorld(ball.position.clone()));
          const others = players.map((_, i) => i).filter((i) => players[i].team !== c.team);
          carrier = others[rng.int(0, others.length - 1)];
        } else {
          carrier = target;
        }
        players[carrier].x = Math.max(-W / 2 + 0.6, Math.min(W / 2 - 0.6, players[carrier].x));
        startPhase('dribble');
      }
    }
  };

  return {
    group, update, bounces,
    dispose() {
      for (const p of players) p.v.dispose();
      for (const d of disposables) d.dispose();
      group.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && !(mm instanceof THREE.SkinnedMesh)) mm.geometry.dispose(); });
    },
  };
}
