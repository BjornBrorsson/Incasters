import * as THREE from 'three';

/**
 * Central palette for the whimsical Arcane Academy art direction
 * (Discworld + Hogwarts + Pokémon fusion).
 * Rich cobblestones, gothic sandstone, aged mahogany, antique brass, and glowing Octarine.
 */
export const PALETTE = {
  // Sky / Castle Atmosphere (Twilight magical dusk)
  skyTop: 0x1f274a,      // Deep twilight indigo
  skyMiddle: 0x3d3568,   // Arcane violet twilight
  skyBottom: 0xc87d55,   // Warm sunset amber glow
  fog: 0x2e2748,
  fogDensity: 0.005,

  // Ground / Courtyard
  floor: 0x3d3630,       // Weathered stone cobblestone
  floorGridMajor: 0x5a5048,
  floorGridMinor: 0x322c26,

  // Structures & Masonry
  wall: 0x6e6052,        // Hogwarts weathered sandstone
  wallTop: 0x8a7a6a,     // Stone coping slabs
  wallEdge: 0x2c2620,    // Dark mortar crevice
  woodTrim: 0x3e2415,    // Dark antique oak
  brassTrim: 0xd4a020,   // Antique wizarding brass

  // House & College Colors (Gryffindor, Slytherin, Ravenclaw, Hufflepuff inspired)
  scarlet: 0xa61c28,
  gold: 0xf5b722,
  emerald: 0x1c6e42,
  silver: 0xc4cdd5,
  sapphire: 0x1e498f,
  bronze: 0x9c6838,
  amber: 0xd98218,
  amethyst: 0x6e2594,

  // Mystical Energies & Discworld Octarine
  octarine: 0x8a2be2,    // Discworld 8th color (iridescent violet-cyan)
  octarineGlow: 0x39ffb8,
  candleFlame: 0xffa834,
  candleGlow: 0xff7018,

  // Interactive Elements
  cauldronBrew: 0x2be28a,
  bouncePad: 0x8e421a,
  bouncePadRing: 0xffc444,
  door: 0xd4a020,
  jumpPad: 0x28a060,
  border: 0xd4a020,
  star: 0xffe259,

  // Lighting
  ambient: 0xffeed4,     // Warm torch/candle ambient
  hemiSky: 0xb8c8f0,     // Cool skylight
  hemiGround: 0x483a2a,  // Warm earthy ground reflection
  sunLight: 0xffe0a8     // Golden sunlight
} as const;

/** Map-specific themes for unique atmospheric immersion */
export const MAP_THEMES = {
  ARENA: {
    name: 'Unseen Courtyard',
    floorColor: 0x423c36,
    wallColor: 0x6e6052,
    accentColor: 0xa61c28,
    bannerColor: 0xa61c28,
    props: 'candles_banners_gargoyles'
  },
  COLOSSEUM: {
    name: 'Dueling Amphitheater',
    floorColor: 0x5a4a38,
    wallColor: 0x7a6a58,
    accentColor: 0xd4a020,
    bannerColor: 0x1e498f,
    props: 'braziers_cauldrons_runes'
  },
  CHAMBER: {
    name: 'Forbidden Arcanum',
    floorColor: 0x2a1c14,
    wallColor: 0x48382c,
    accentColor: 0x8a2be2,
    bannerColor: 0x1c6e42,
    props: 'books_candles_alembics'
  },
  OBSERVATORY: {
    name: 'Astral Observatory',
    floorColor: 0x0c1224,
    wallColor: 0x24283b,
    accentColor: 0x00d2ff,
    bannerColor: 0x1f274a,
    props: 'astrolabes_constellations_crystals'
  },
  CATACOMBS: {
    name: "Alchemist's Undercroft",
    floorColor: 0x161a15,
    wallColor: 0x384236,
    accentColor: 0x39ff14,
    bannerColor: 0x1c6e42,
    props: 'potion_vats_slime_mushrooms'
  }
} as const;

/**
 * Builds a 3-stop vertical gradient sky dome with castle twilight dusk.
 */
export function createSkyDome(radius = 220): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const top = new THREE.Color(PALETTE.skyTop);
  const mid = new THREE.Color(PALETTE.skyMiddle);
  const bottom = new THREE.Color(PALETTE.skyBottom);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) / radius + 1) / 2, 0, 1);
    if (t < 0.5) {
      c.copy(bottom).lerp(mid, t * 2);
    } else {
      c.copy(mid).lerp(top, (t - 0.5) * 2);
    }
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

