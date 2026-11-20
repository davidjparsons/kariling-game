import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collects transformed geometries per material and merges them into one mesh each,
 * so a whole village of buildings costs a handful of draw calls.
 */
export class BatchBuilder {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4, color?: THREE.ColorRepresentation): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    // Normalise attributes so everything can merge.
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    }
    const n = g.getAttribute('position').count;
    const col = new THREE.Color(color ?? 0xffffff);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    let list = this.groups.get(mat);
    if (!list) { list = []; this.groups.set(mat, list); }
    list.push(g);
  }

  /** Convenience: add with position/rotationY/scale. */
  place(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotY = 0, sx = 1, sy = sx, sz = sx, color?: THREE.ColorRepresentation, parent?: THREE.Matrix4): void {
    this.m.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(sx, sy, sz),
    );
    if (parent) this.m.premultiply(parent);
    this.add(geo, mat, this.m, color);
  }

  build(castShadow = true, receiveShadow = true): THREE.Group {
    const out = new THREE.Group();
    for (const [mat, geos] of this.groups) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      out.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.groups.clear();
    return out;
  }
}

/** A transform helper for building compound objects relative to a parent matrix. */
export function mat4(x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
}
