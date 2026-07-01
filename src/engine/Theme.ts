import * as THREE from 'three';

/**
 * Central palette for the bright, vibrant, toy-like art direction (Outcasters homage).
 * Keeping every environment colour here means the look can be tuned in one place.
 */
export const PALETTE = {
  // Sky / atmosphere
  skyTop: 0x7b9fd4,
  skyBottom: 0xd4b483,
  fog: 0xc8a86e,
  fogDensity: 0.006,

  // Ground
  floor: 0x5a7a3a,
  floorGridMajor: 0x7aaa4a,
  floorGridMinor: 0x4a6a2a,

  // Structures
  wall: 0xa09070,
  wallEdge: 0x4a3820,

  // Interactive elements
  bouncePad: 0xc86428,
  bouncePadRing: 0xffe0a0,
  door: 0xd4a020,
  jumpPad: 0x58c040,
  border: 0xd4a020,
  star: 0xffe080,

  // Lighting
  ambient: 0xfff5e0,
  hemiSky: 0xc8d4f0,
  hemiGround: 0x5a4a20
} as const;

/**
 * Builds a vertical gradient sky dome using per-vertex colours (no custom shader needed).
 * Rendered on the inside (BackSide) so the camera sits within it.
 */
export function createSkyDome(radius = 220): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const top = new THREE.Color(PALETTE.skyTop);
  const bottom = new THREE.Color(PALETTE.skyBottom);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) / radius + 1) / 2, 0, 1);
    c.copy(bottom).lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'skyDome';
  return mesh;
}
