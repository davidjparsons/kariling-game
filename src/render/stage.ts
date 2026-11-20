import * as THREE from 'three';
import { QUALITY, type Quality, type QualityProfile } from './quality';

/** Renderer, scene and lighting. One instance for the app's lifetime. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  quality: Quality;
  profile: QualityProfile;
  /** Dynamic resolution scale (drops when FPS is low). */
  private resScale = 1;
  private sunOffset = new THREE.Vector3(-38, 62, -30);

  constructor(container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.profile = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ antialias: this.profile.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'game-canvas';

    this.scene.fog = new THREE.Fog(0xd7ecf5, 140, 720);
    this.scene.background = new THREE.Color(0xbfe2f6);
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6f9a45, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d2, 2.7);
    this.sun.position.copy(this.sunOffset);
    const sc = this.sun.shadow.camera;
    sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 10; sc.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.applyQuality(quality);
    this.resize();
  }

  applyQuality(q: Quality): void {
    this.quality = q;
    this.profile = QUALITY[q];
    this.resScale = 1;
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.sun.castShadow = this.profile.shadows;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; }
    this.sun.shadow.mapSize.set(this.profile.shadowMapSize, this.profile.shadowMapSize);
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.needsUpdate = true; });
    });
    this.updatePixelRatio();
  }

  private updatePixelRatio(): void {
    const pr = Math.min(window.devicePixelRatio || 1, this.profile.pixelRatio) * this.resScale;
    this.renderer.setPixelRatio(Math.max(0.6, pr));
  }

  /** Called by the frame loop with a smoothed FPS to keep things responsive on slow devices. */
  adaptResolution(fps: number): void {
    if (fps < 42 && this.resScale > 0.65) { this.resScale -= 0.1; this.updatePixelRatio(); this.resize(); }
    else if (fps > 58 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.05); this.updatePixelRatio(); this.resize(); }
  }

  /** Keep the shadow frustum centred on the action. */
  followSun(x: number, z: number): void {
    this.sun.position.set(x + this.sunOffset.x, this.sunOffset.y, z + this.sunOffset.z);
    this.sun.target.position.set(x, 0, z);
  }

  resize(camera?: THREE.PerspectiveCamera): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }
}
