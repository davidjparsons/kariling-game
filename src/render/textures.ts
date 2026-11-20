import * as THREE from 'three';
import { Rng } from '../core/rng';

/** Small procedurally generated canvas textures — no external image assets needed. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const cache = new Map<string, THREE.Texture>();
function cached<T extends THREE.Texture>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

/** Greyscale speckle noise used as a detail map (multiplied with vertex colours). */
export function speckleTexture(seed = 1, size = 256, contrast = 0.22, blobs = 2200): THREE.CanvasTexture {
  return cached(`speckle${seed}-${size}-${contrast}-${blobs}`, () => {
    const [c, g] = canvas(size, size);
    const rng = new Rng(seed);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < blobs; i++) {
      const v = Math.floor(255 * (1 - rng.next() * contrast));
      g.fillStyle = `rgb(${v},${v},${v})`;
      const r = rng.range(0.6, 2.6);
      const x = rng.next() * size, y = rng.next() * size;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      // wrap
      if (x < 3 || y < 3) { g.beginPath(); g.arc(x + size, y + size, r, 0, Math.PI * 2); g.fill(); }
    }
    return toTexture(c);
  });
}

/** Road texture: soft grain with pebbles and faint tyre ruts. Tinted by vertex colour. */
export function roadTexture(): THREE.CanvasTexture {
  return cached('road', () => {
    const size = 256;
    const [c, g] = canvas(size, size);
    const rng = new Rng(7);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 3500; i++) {
      const v = Math.floor(255 * (1 - rng.next() * 0.18));
      g.fillStyle = `rgba(${v},${v},${v},0.9)`;
      g.fillRect(rng.next() * size, rng.next() * size, rng.range(1, 3), rng.range(1, 3));
    }
    for (let i = 0; i < 90; i++) {
      const x = rng.next() * size, y = rng.next() * size;
      const r = rng.range(1.5, 3.5);
      g.fillStyle = 'rgba(120,110,100,0.35)';
      g.beginPath(); g.ellipse(x + 1, y + 1, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    }
    // faint ruts along V (track direction)
    for (const u of [0.3, 0.7]) {
      const grd = g.createLinearGradient(u * size - 14, 0, u * size + 14, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.5, 'rgba(90,70,50,0.12)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(u * size - 14, 0, 28, size);
    }
    return toTexture(c);
  });
}

export function thatchTexture(): THREE.CanvasTexture {
  return cached('thatch', () => {
    const [c, g] = canvas(128, 128);
    const rng = new Rng(3);
    g.fillStyle = '#c9a25a';
    g.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++) {
      const y = row * 16;
      g.fillStyle = 'rgba(80,55,20,0.35)';
      g.fillRect(0, y + 13, 128, 3);
      for (let i = 0; i < 60; i++) {
        const x = rng.next() * 128;
        const shade = rng.range(0.75, 1.15);
        g.strokeStyle = `rgb(${Math.min(255, 200 * shade)},${Math.min(255, 160 * shade)},${Math.min(255, 90 * shade)})`;
        g.lineWidth = rng.range(0.8, 1.8);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + rng.range(-2, 2), y + 15);
        g.stroke();
      }
    }
    return toTexture(c);
  });
}

/** Woven bamboo (sawali) wall pattern. */
export function weaveTexture(): THREE.CanvasTexture {
  return cached('weave', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#d8b878';
    g.fillRect(0, 0, 128, 128);
    const s = 16;
    for (let y = 0; y < 128; y += s) {
      for (let x = 0; x < 128; x += s) {
        const horiz = ((x + y) / s) % 2 === 0;
        const grd = horiz ? g.createLinearGradient(0, y, 0, y + s) : g.createLinearGradient(x, 0, x + s, 0);
        grd.addColorStop(0, '#b8924f');
        grd.addColorStop(0.5, '#ecd29a');
        grd.addColorStop(1, '#a8823f');
        g.fillStyle = grd;
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
      }
    }
    return toTexture(c);
  });
}

/** Corrugated iron roof stripes. */
export function corrugatedTexture(): THREE.CanvasTexture {
  return cached('corrugated', () => {
    const [c, g] = canvas(64, 64);
    for (let x = 0; x < 64; x++) {
      const v = 200 + Math.round(45 * Math.sin((x / 64) * Math.PI * 8));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, 64);
    }
    return toTexture(c);
  });
}

/** Black/white checker for the start line. */
export function checkerTexture(): THREE.CanvasTexture {
  return cached('checker', () => {
    const [c, g] = canvas(64, 64);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#1b1b1b' : '#f7f7f7';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
    const t = toTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

/** Text sign/banner. */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128, font = 'bold 72px "Baloo 2", system-ui, sans-serif', sub?: string): THREE.CanvasTexture {
  return cached(`sign-${text}-${bg}-${fg}-${w}-${h}-${sub ?? ''}`, () => {
    const [c, g] = canvas(w, h);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 4);
    if (sub) {
      g.font = `bold ${Math.round(h * 0.18)}px system-ui, sans-serif`;
      g.fillText(sub, w / 2, h * 0.78);
    }
    return toTexture(c, false);
  });
}

/** Tyre tread: chevrons around the circumference (u) across the tube (v). */
export function treadTexture(style: 'chevron' | 'knobby' | 'slick' | 'block'): THREE.CanvasTexture {
  return cached(`tread-${style}`, () => {
    const [c, g] = canvas(512, 64);
    g.fillStyle = '#2a2a2c';
    g.fillRect(0, 0, 512, 64);
    // sidewalls slightly lighter
    g.fillStyle = '#323236';
    g.fillRect(0, 0, 512, 14);
    g.fillRect(0, 50, 512, 14);
    g.strokeStyle = '#151517';
    g.fillStyle = '#18181a';
    g.lineWidth = 3;
    const n = style === 'slick' ? 24 : 32;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 512;
      if (style === 'chevron') {
        g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 8, 32); g.lineTo(x, 46); g.stroke();
      } else if (style === 'knobby') {
        g.fillRect(x + 2, 18, 8, 10); g.fillRect(x + 8, 36, 8, 10);
      } else if (style === 'block') {
        g.fillRect(x + 1, 20, 12, 24);
      } else {
        g.fillRect(x, 31, 6, 2);
      }
    }
    const t = toTexture(c);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/** Soft round sprite for dust particles. */
export function puffTexture(): THREE.CanvasTexture {
  return cached('puff', () => {
    const [c, g] = canvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return toTexture(c, false);
  });
}

/** Rice paddy rows with water glints. */
export function paddyTexture(): THREE.CanvasTexture {
  return cached('paddy', () => {
    const [c, g] = canvas(128, 128);
    g.fillStyle = '#7fb8b0';
    g.fillRect(0, 0, 128, 128);
    const rng = new Rng(11);
    for (let row = 0; row < 16; row++) {
      for (let i = 0; i < 16; i++) {
        const x = i * 8 + 4 + rng.range(-1, 1), y = row * 8 + 4;
        g.fillStyle = `hsl(${85 + rng.range(-8, 8)}, 60%, ${42 + rng.range(-6, 8)}%)`;
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      }
    }
    return toTexture(c);
  });
}

/** Vertical gradient sky. */
export function skyTexture(): THREE.CanvasTexture {
  return cached('sky', () => {
    const [c, g] = canvas(4, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#2f7fd8');
    grd.addColorStop(0.3, '#6db6f0');
    grd.addColorStop(0.45, '#bfe2f6');
    grd.addColorStop(0.5, '#f3efdc');
    grd.addColorStop(1, '#f3efdc');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    return toTexture(c, false);
  });
}
