import * as THREE from 'three';
import { corrugatedTexture, roadTexture, speckleTexture, thatchTexture, weaveTexture } from './textures';

/** Shared uniforms for animated vegetation. */
export const windUniforms = { uTime: { value: 0 } };

/**
 * Inject a cheap wind sway into a standard material. Displacement grows with local height,
 * phase varies per instance so a grove doesn't move in lock-step.
 */
export function addWind(mat: THREE.Material, strength: number, instanced: boolean): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float wPhase = ${instanced ? 'instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07' : '0.0'};
        float wH = max(position.y, 0.0);
        float wAmt = ${strength.toFixed(4)} * wH * wH;
        transformed.x += sin(uTime * 1.4 + wPhase) * wAmt;
        transformed.z += cos(uTime * 1.1 + wPhase * 1.3) * wAmt * 0.6;`,
      );
  };
  mat.customProgramCacheKey = () => `wind-${strength}-${instanced}`;
}

let _mats: ReturnType<typeof createMaterials> | null = null;

function createMaterials() {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  const speck = speckleTexture(5, 128, 0.18, 900);
  return {
    /** Generic vertex-coloured surface (paint, wood, etc). */
    vc: std({ vertexColors: true }),
    vcFlat: std({ vertexColors: true, flatShading: true }),
    vcDouble: std({ vertexColors: true, side: THREE.DoubleSide }),
    wall: std({ vertexColors: true, map: speck }),
    weave: std({ vertexColors: true, map: weaveTexture() }),
    thatch: std({ vertexColors: true, map: thatchTexture(), side: THREE.DoubleSide }),
    roof: std({ vertexColors: true, map: corrugatedTexture(), roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide }),
    glass: std({ color: 0x2c4a63, roughness: 0.25, metalness: 0.2 }),
    road: new THREE.MeshStandardMaterial({
      vertexColors: true, map: roadTexture(), roughness: 0.95, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false,
    }),
  };
}

export function sharedMaterials() {
  if (!_mats) _mats = createMaterials();
  return _mats;
}
