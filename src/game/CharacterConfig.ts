import * as THREE from 'three';

/**
 * Code-built cosmetic customisation for casters. Everything is generated from
 * primitive geometry (no external assets). A CharacterConfig is persisted to
 * localStorage for the player and randomised for bots.
 *
 * The seven customisable Parts mirror the Outcasters system:
 *   1. Body        → robeColor
 *   2. Face        → eyeColor
 *   3. Hair        → hair
 *   4. Head Gear   → hat
 *   5. Face Gear   → faceGear
 *   6. Weapon      → weapon
 *   7. Backpack    → accessory
 */

export type HatStyle = 'WIZARD' | 'TOP' | 'CROWN' | 'HOOD' | 'HELMET' | 'NONE';
export type AccessoryStyle = 'NONE' | 'WINGS' | 'CAPE' | 'PACK' | 'BANNER';
export type HairStyle = 'NONE' | 'MOHAWK' | 'LONG' | 'BUZZ' | 'PONYTAIL';
export type FaceGearStyle = 'NONE' | 'SHADES' | 'EYEPATCH' | 'BEARD' | 'MASK';
export type WeaponStyle = 'STAFF' | 'WAND' | 'SWORD' | 'SCYTHE';

export interface CharacterConfig {
  // 1. Body
  robeColor: number;
  // 2. Face
  eyeColor: number;
  // 3. Hair
  hair: HairStyle;
  hairColor: number;
  // 4. Head Gear
  hat: HatStyle;
  // 5. Face Gear
  faceGear: FaceGearStyle;
  // 6. Weapon
  weapon: WeaponStyle;
  // 7. Backpack
  accessory: AccessoryStyle;
  // Spell colour (affects projectile + weapon crystal + accessory tint)
  spellColor: number;
  // Rotation angle (radians) applied to head-gear for creative positioning
  hatRotation: number;
}

export const HAT_STYLES: { id: HatStyle; label: string }[] = [
  { id: 'WIZARD', label: 'Wizard' },
  { id: 'TOP', label: 'Top Hat' },
  { id: 'CROWN', label: 'Crown' },
  { id: 'HOOD', label: 'Hood' },
  { id: 'HELMET', label: 'Helmet' },
  { id: 'NONE', label: 'None' }
];

export const ACCESSORY_STYLES: { id: AccessoryStyle; label: string }[] = [
  { id: 'NONE', label: 'None' },
  { id: 'WINGS', label: 'Wings' },
  { id: 'CAPE', label: 'Cape' },
  { id: 'PACK', label: 'Jetpack' },
  { id: 'BANNER', label: 'Banner' }
];

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'NONE', label: 'None' },
  { id: 'MOHAWK', label: 'Mohawk' },
  { id: 'LONG', label: 'Long' },
  { id: 'BUZZ', label: 'Buzz' },
  { id: 'PONYTAIL', label: 'Ponytail' }
];

export const FACE_GEAR_STYLES: { id: FaceGearStyle; label: string }[] = [
  { id: 'NONE', label: 'None' },
  { id: 'SHADES', label: 'Shades' },
  { id: 'EYEPATCH', label: 'Eyepatch' },
  { id: 'BEARD', label: 'Beard' },
  { id: 'MASK', label: 'Mask' }
];

export const WEAPON_STYLES: { id: WeaponStyle; label: string }[] = [
  { id: 'STAFF', label: 'Staff' },
  { id: 'WAND', label: 'Wand' },
  { id: 'SWORD', label: 'Sword' },
  { id: 'SCYTHE', label: 'Scythe' }
];

export const EYE_COLORS = [0xfff000, 0xe0a020, 0xff3366, 0x58c040, 0xffffff, 0x00d2ff];

export const HAIR_COLORS = [0x2b1b0e, 0x8b4513, 0xffd700, 0xff3366, 0x39ff14, 0xb026ff, 0xffffff, 0x1a1a1a];

export const DEFAULT_CONFIG: CharacterConfig = {
  robeColor: 0x6b2fa0,
  spellColor: 0xe0a020,
  hat: 'WIZARD',
  accessory: 'NONE',
  eyeColor: 0xfff000,
  hair: 'NONE',
  hairColor: 0x2b1b0e,
  faceGear: 'NONE',
  weapon: 'STAFF',
  hatRotation: 0
};

const STORAGE_KEY = 'incasters_character';

export function loadCharacterConfig(): CharacterConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CharacterConfig>;
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // ignore malformed storage
  }

  // Migrate legacy per-color keys if present
  const cfg: CharacterConfig = { ...DEFAULT_CONFIG };
  const robe = localStorage.getItem('incasters_robe_color');
  const spell = localStorage.getItem('incasters_spell_color');
  if (robe) cfg.robeColor = parseInt(robe, 16);
  if (spell) cfg.spellColor = parseInt(spell, 16);
  return cfg;
}

export function saveCharacterConfig(cfg: CharacterConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomCharacterConfig(robeColor: number, spellColor: number): CharacterConfig {
  return {
    robeColor,
    spellColor,
    hat: pick(HAT_STYLES).id,
    accessory: pick(ACCESSORY_STYLES).id,
    eyeColor: pick(EYE_COLORS),
    hair: pick(HAIR_STYLES).id,
    hairColor: pick(HAIR_COLORS),
    faceGear: pick(FACE_GEAR_STYLES).id,
    weapon: pick(WEAPON_STYLES).id,
    hatRotation: 0
  };
}

/** Builds the head-gear group (positioned on top of the head). */
export function buildHat(style: HatStyle, color: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0.95, 0);
  if (style === 'NONE') return group;

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });

  if (style === 'WIZARD') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 12), mat);
    group.add(brim);
    const coneGeo = new THREE.ConeGeometry(0.3, 0.7, 10);
    coneGeo.translate(0, 0.35, 0);
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.rotation.x = -0.15;
    group.add(cone);
  } else if (style === 'TOP') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), mat);
    group.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.6, 16), mat);
    top.position.y = 0.32;
    group.add(top);
  } else if (style === 'CROWN') {
    const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12, 1, true), metalMat);
    band.position.y = 0.12;
    group.add(band);
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), metalMat);
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3);
      group.add(spike);
    }
  } else if (style === 'HOOD') {
    const hoodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide });
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hoodMat);
    hood.position.y = 0.08;
    group.add(hood);
    // Pointed tip
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), hoodMat);
    tip.position.set(0, 0.35, -0.1);
    tip.rotation.x = -0.3;
    group.add(tip);
  } else if (style === 'HELMET') {
    const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.8 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), metalMat);
    dome.position.y = 0.06;
    group.add(dome);
    // Visor slit
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.06, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    visor.position.set(0, 0.12, 0.26);
    group.add(visor);
    // Crest
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.3), metalMat);
    crest.position.set(0, 0.3, 0);
    group.add(crest);
  }

  return group;
}

/** Builds hair geometry on top of / around the head. */
export function buildHair(style: HairStyle, color: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0.9, 0);
  if (style === 'NONE') return group;

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

  if (style === 'MOHAWK') {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.4), mat);
    strip.position.y = 0.18;
    group.add(strip);
    // Tip spikes
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), mat);
      spike.position.set(0, 0.38, -0.12 + i * 0.12);
      group.add(spike);
    }
  } else if (style === 'LONG') {
    // Back hair flowing down
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), mat);
    back.position.set(0, -0.15, -0.28);
    group.add(back);
    // Side bangs
    const bangL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.3), mat);
    bangL.position.set(-0.26, 0.05, 0.1);
    group.add(bangL);
    const bangR = bangL.clone();
    bangR.position.x = 0.26;
    group.add(bangR);
  } else if (style === 'BUZZ') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), mat);
    cap.position.y = 0.05;
    group.add(cap);
  } else if (style === 'PONYTAIL') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
    cap.position.y = 0.04;
    group.add(cap);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.5, 6), mat);
    tail.position.set(0, -0.05, -0.34);
    tail.rotation.x = 0.3;
    group.add(tail);
  }

  return group;
}

/** Builds face gear (glasses, eyepatch, beard, mask) attached to the face. */
export function buildFaceGear(style: FaceGearStyle, color: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0.9, 0);
  if (style === 'NONE') return group;

  if (style === 'SHADES') {
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.9 });
    const frameMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });
    const lensGeo = new THREE.BoxGeometry(0.16, 0.1, 0.04);
    const left = new THREE.Mesh(lensGeo, lensMat);
    left.position.set(-0.11, 0.02, 0.24);
    group.add(left);
    const right = new THREE.Mesh(lensGeo, lensMat);
    right.position.set(0.11, 0.02, 0.24);
    group.add(right);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.04), frameMat);
    bridge.position.set(0, 0.02, 0.24);
    group.add(bridge);
  } else if (style === 'EYEPATCH') {
    const patchMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), patchMat);
    patch.position.set(-0.1, 0.02, 0.25);
    group.add(patch);
    const strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.02, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    strap.rotation.y = Math.PI / 2;
    strap.position.set(0, 0.02, 0);
    group.add(strap);
  } else if (style === 'BEARD') {
    const beardMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), beardMat);
    beard.position.set(0, -0.18, 0.12);
    beard.scale.set(1, 0.7, 0.8);
    group.add(beard);
  } else if (style === 'MASK') {
    const maskMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), maskMat);
    mask.position.set(0, -0.05, 0.18);
    group.add(mask);
    // Eye holes
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const holeL = new THREE.Mesh(new THREE.CircleGeometry(0.04, 6), holeMat);
    holeL.position.set(-0.09, 0.02, 0.25);
    group.add(holeL);
    const holeR = holeL.clone();
    holeR.position.x = 0.09;
    group.add(holeR);
  }

  return group;
}

/** Builds the weapon group (staff / wand / sword / scythe). Returns a group
 *  positioned at the caster's side with a crystal/light at index 1 and 2. */
export function buildWeapon(style: WeaponStyle, spellColor: number): { group: THREE.Group; crystal: THREE.Object3D; light: THREE.Object3D } {
  const group = new THREE.Group();
  group.position.set(0.4, 0.45, 0.1);

  const crystal = new THREE.Object3D();
  const light = new THREE.Object3D();

  if (style === 'STAFF') {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6),
      new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
    );
    pole.rotation.x = Math.PI / 2;
    group.add(pole);

    const crystalMesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.55);
    group.add(crystalMesh);
    crystal.add(crystalMesh);

    const crystalLight = new THREE.PointLight(spellColor, 0.8, 1.5);
    crystalLight.position.set(0, 0, 0.55);
    group.add(crystalLight);
    light.add(crystalLight);
  } else if (style === 'WAND') {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })
    );
    pole.rotation.x = Math.PI / 2;
    group.add(pole);

    const crystalMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09, 0),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.35);
    group.add(crystalMesh);
    crystal.add(crystalMesh);

    const crystalLight = new THREE.PointLight(spellColor, 0.7, 1.2);
    crystalLight.position.set(0, 0, 0.35);
    group.add(crystalLight);
    light.add(crystalLight);
  } else if (style === 'SWORD') {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.7, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.2, metalness: 0.9 })
    );
    blade.rotation.x = Math.PI / 2;
    blade.position.z = 0.35;
    group.add(blade);

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.04, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.4, metalness: 0.6 })
    );
    guard.position.z = 0.05;
    group.add(guard);

    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.18, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 })
    );
    hilt.rotation.x = Math.PI / 2;
    hilt.position.z = -0.06;
    group.add(hilt);

    // Pommel gem (acts as the "crystal" for color updates)
    const crystalMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, -0.16);
    group.add(crystalMesh);
    crystal.add(crystalMesh);

    const crystalLight = new THREE.PointLight(spellColor, 0.5, 1.0);
    crystalLight.position.set(0, 0, -0.16);
    group.add(crystalLight);
    light.add(crystalLight);
  } else if (style === 'SCYTHE') {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.85 })
    );
    pole.rotation.x = Math.PI / 2;
    group.add(pole);

    // Curved blade
    const blade = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.03, 6, 12, Math.PI * 0.6),
      new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.2, metalness: 0.9 })
    );
    blade.position.set(0, 0.05, 0.55);
    blade.rotation.set(Math.PI / 2, 0, -Math.PI * 0.2);
    group.add(blade);

    // Glow orb at the joint (acts as crystal)
    const crystalMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 6),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.55);
    group.add(crystalMesh);
    crystal.add(crystalMesh);

    const crystalLight = new THREE.PointLight(spellColor, 0.6, 1.2);
    crystalLight.position.set(0, 0, 0.55);
    group.add(crystalLight);
    light.add(crystalLight);
  }

  return { group, crystal, light };
}

/** Builds the back accessory group (wings / cape / jetpack / banner), tinted with spell colour. */
export function buildAccessory(style: AccessoryStyle, color: number): THREE.Group {
  const group = new THREE.Group();
  if (style === 'NONE') return group;

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.2,
    emissive: color,
    emissiveIntensity: 0.18
  });

  if (style === 'WINGS') {
    const wingGeo = new THREE.ConeGeometry(0.18, 0.7, 4);
    const left = new THREE.Mesh(wingGeo, mat);
    left.position.set(-0.32, 0.55, -0.18);
    left.rotation.set(Math.PI / 2, 0, 0.5);
    group.add(left);
    const right = new THREE.Mesh(wingGeo, mat);
    right.position.set(0.32, 0.55, -0.18);
    right.rotation.set(Math.PI / 2, 0, -0.5);
    group.add(right);
  } else if (style === 'CAPE') {
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.9),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide })
    );
    cape.position.set(0, 0.5, -0.33);
    cape.rotation.x = 0.18;
    group.add(cape);
  } else if (style === 'PACK') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), mat);
    pack.position.set(0, 0.55, -0.34);
    group.add(pack);
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    tank.position.set(0.12, 0.55, -0.42);
    group.add(tank);
  } else if (style === 'BANNER') {
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
    );
    pole.position.set(0.28, 0.6, -0.3);
    group.add(pole);
    // Flag
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.45),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.15 })
    );
    flag.position.set(0.46, 0.85, -0.3);
    group.add(flag);
  }

  return group;
}
