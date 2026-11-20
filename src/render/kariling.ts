import * as THREE from 'three';
import type { TyreLook } from '../config/appearance';
import type { StickConfig } from '../config/sticks';
import type { TyreConfig, TyreId } from '../config/tyres';

const TREAD: Record<TyreId, 'chevron' | 'knobby' | 'slick' | 'block'> = {
  bmx: 'chevron', mtb: 'knobby', road: 'slick', moto: 'block',
};

const texCache = new Map<string, THREE.CanvasTexture>();

/**
 * Tyre texture: u runs around the circumference, v around the tube (v=0/1 = outer tread,
 * v=0.5 = inner rim side). Painted patterns sit on the sidewalls like the decorated tyres
 * kids paint for kariling races.
 */
function tyreTexture(tyre: TyreId, look: TyreLook): THREE.CanvasTexture {
  const key = `${tyre}-${look.stripe}-${look.pattern}-${look.accent}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const W = 1024, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b2b2e';
  g.fillRect(0, 0, W, H);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  // Sidewalls are v in ~[0.15,0.4] and [0.6,0.85]; tread is the outer band near v=0/1.
  const side = (fn: (y0: number, y1: number) => void) => { fn(H * 0.16, H * 0.4); fn(H * 0.6, H * 0.84); };
  if (look.stripe != null) {
    const col = hex(look.stripe);
    const acc = hex(look.accent);
    const n = 24;
    side((y0, y1) => {
      if (look.pattern === 'plain') {
        g.fillStyle = col; g.fillRect(0, y0 + (y1 - y0) * 0.35, W, (y1 - y0) * 0.3);
      } else if (look.pattern === 'stripes') {
        // full painted bands around the tyre, alternating colour
        for (let i = 0; i < n; i++) {
          g.fillStyle = i % 2 ? col : acc;
          g.fillRect((i / n) * W, y0, W / n + 1, y1 - y0);
        }
      } else if (look.pattern === 'spots') {
        g.fillStyle = col; g.fillRect(0, y0, W, y1 - y0);
        g.fillStyle = acc;
        for (let i = 0; i < n; i++) {
          g.beginPath(); g.ellipse((i / n) * W + W / n / 2, (y0 + y1) / 2, W / n / 3, (y1 - y0) / 3, 0, 0, Math.PI * 2); g.fill();
        }
      } else {
        g.fillStyle = acc; g.fillRect(0, y0, W, y1 - y0);
        g.strokeStyle = col; g.lineWidth = (y1 - y0) * 0.3;
        g.beginPath();
        for (let i = 0; i <= n * 2; i++) {
          const x = (i / (n * 2)) * W;
          const y = i % 2 ? y0 + (y1 - y0) * 0.2 : y1 - (y1 - y0) * 0.2;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    });
  }
  // Tread band (outer): v near 0 and 1.
  const tread = TREAD[tyre];
  const drawTread = (y0: number, y1: number) => {
    g.fillStyle = '#232325';
    g.fillRect(0, y0, W, y1 - y0);
    g.fillStyle = '#131314';
    g.strokeStyle = '#131314';
    g.lineWidth = 4;
    const n = tread === 'slick' ? 40 : 56;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * W;
      const h = y1 - y0;
      if (tread === 'chevron') {
        g.beginPath(); g.moveTo(x, y0 + h * 0.1); g.lineTo(x + 10, y0 + h * 0.5); g.lineTo(x, y0 + h * 0.9); g.stroke();
      } else if (tread === 'knobby') {
        g.fillRect(x + 2, y0 + h * 0.15, 9, h * 0.3); g.fillRect(x + 9, y0 + h * 0.55, 9, h * 0.3);
      } else if (tread === 'block') {
        g.fillRect(x + 1, y0 + h * 0.1, 12, h * 0.8);
      } else {
        g.fillRect(x, y0 + h * 0.48, 8, 2);
      }
    }
  };
  drawTread(0, H * 0.16);
  drawTread(H * 0.84, H);
  // Brand-free embossed text block on one sidewall.
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = 'bold 20px system-ui, sans-serif';
  g.fillText('KARILING  •  100 PSI', W * 0.1, H * 0.31);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Upright bicycle/motorbike tyre (no rim), axle along local x, rolling about x. */
export function buildTyre(tyre: TyreConfig, look: TyreLook): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(tyre.radius - tyre.tube, tyre.tube, 14, 56);
  geo.rotateY(Math.PI / 2);
  // Flatten the tube a little so it reads as a tyre, not a donut.
  geo.scale(0.82, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tyreTexture(tyre.id, look), roughness: 0.82, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

/**
 * Pushing stick, built along +y from the grip (y=0) to the contact end (y=1), so it can be
 * scaled in y to reach the tyre exactly.
 */
export function buildStick(stick: StickConfig): { group: THREE.Group; shaft: THREE.Object3D; tip: THREE.Object3D } {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xc8a06a, roughness: 0.7 });
  const shaftGeo = new THREE.CylinderGeometry(0.016, 0.019, 1, 7);
  shaftGeo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, wood);
  shaft.castShadow = true;
  group.add(shaft);
  const tip = new THREE.Group();
  group.add(tip);
  if (stick.id === 'bottle') {
    // Half-cut clear plastic bottle cupped against the tread.
    const bottleMat = new THREE.MeshStandardMaterial({
      color: 0xe8f4ff, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.16, 12, 1, true, 0, Math.PI * 1.25), bottleMat);
    cup.position.set(0, -0.02, 0);
    tip.add(cup);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.06, 10), bottleMat);
    neck.position.set(0, -0.13, 0);
    tip.add(neck);
    const capM = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.5 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.025, 10), capM);
    cap.position.set(0, -0.17, 0);
    tip.add(cap);
  } else {
    // Small crosspiece where the stick meets the tyre.
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), wood);
    tip.add(cross);
  }
  return { group, shaft, tip };
}
