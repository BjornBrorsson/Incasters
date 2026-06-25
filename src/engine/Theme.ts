import * as THREE from 'three';

/**
 * Central palette for the bright, vibrant, toy-like art direction (Outcasters homage).
 * Keeping every environment colour here means the look can be tuned in one place.
 */
export const PALETTE = {
  // Sky / atmosphere
  skyTop: 0x3f9bff,
  skyBottom: 0xd9f2ff,
  fog: 0xcfe9ff,
  fogDensity: 0.0072,

  // Ground
  floor: 0x47699f,
  floorGridMajor: 0xeaf6ff,
  floorGridMinor: 0x6f93c4,

  // Structures
  wall: 0xeef2fb,
  wallEdge: 0x243049,

  // Interactive elements
  bouncePad: 0xff4f9a,
  bouncePadRing: 0xffffff,
  door: 0xffa733,
  jumpPad: 0x39ff7a,
  border: 0x21d4ff,
  star: 0xffffff,

  // Lighting
  ambient: 0xffffff,
  hemiSky: 0xdaf0ff,
  hemiGround: 0x4a5d82
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
