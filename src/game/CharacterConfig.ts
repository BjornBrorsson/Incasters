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

export type HatStyle = 'WIZARD' | 'TOP' | 'CROWN' | 'HOOD' | 'HELMET' | 'MUSHROOM' | 'TIARA' | 'JESTER' | 'TURBAN' | 'BANDANA' | 'NONE';
export type AccessoryStyle = 'NONE' | 'WINGS' | 'CAPE' | 'PACK' | 'BANNER' | 'SCARF' | 'POTIONS' | 'SHIELD_BACK' | 'FAMILIAR';
export type HairStyle = 'NONE' | 'MOHAWK' | 'LONG' | 'BUZZ' | 'PONYTAIL';
export type FaceGearStyle = 'NONE' | 'SHADES' | 'EYEPATCH' | 'BEARD' | 'MASK' | 'MONOCLE' | 'RUNE_MARK' | 'BLINDFOLD' | 'MUSTACHE';
export type WeaponStyle = 'STAFF' | 'WAND' | 'SWORD' | 'SCYTHE' | 'GRIMOIRE_FOCUS' | 'ORB_SCEPTRE' | 'BOW' | 'BROOM';

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
  { id: 'WIZARD', label: 'Wizard Hat' },
  { id: 'TOP', label: 'Top Hat' },
  { id: 'CROWN', label: 'Crown' },
  { id: 'HOOD', label: 'Cowl Hood' },
  { id: 'HELMET', label: 'Dragon Helm' },
  { id: 'MUSHROOM', label: 'Toadstool Cap' },
  { id: 'TIARA', label: 'Lunar Tiara' },
  { id: 'JESTER', label: 'Jester Bells' },
  { id: 'TURBAN', label: 'Arcane Turban' },
  { id: 'BANDANA', label: 'Dueling Bandana' },
  { id: 'NONE', label: 'None' }
];

export const ACCESSORY_STYLES: { id: AccessoryStyle; label: string }[] = [
  { id: 'NONE', label: 'None' },
  { id: 'WINGS', label: 'Dragon Wings' },
  { id: 'CAPE', label: 'Velvet Cape' },
  { id: 'PACK', label: 'Spell Grimoire' },
  { id: 'BANNER', label: 'House Banner' },
  { id: 'SCARF', label: 'House Scarf' },
  { id: 'POTIONS', label: 'Potion Flasks' },
  { id: 'SHIELD_BACK', label: 'Aegis Shield' },
  { id: 'FAMILIAR', label: 'Perched Familiar' }
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
  { id: 'MASK', label: 'Mask' },
  { id: 'MONOCLE', label: 'Brass Monocle' },
  { id: 'RUNE_MARK', label: 'Runic Mark' },
  { id: 'BLINDFOLD', label: 'Mystic Blindfold' },
  { id: 'MUSTACHE', label: 'Curled Mustache' }
];

export const WEAPON_STYLES: { id: WeaponStyle; label: string }[] = [
  { id: 'STAFF', label: 'Elder Staff' },
  { id: 'WAND', label: 'Dueling Wand' },
  { id: 'SWORD', label: 'Silver Rapier' },
  { id: 'SCYTHE', label: 'Astral Scythe' },
  { id: 'GRIMOIRE_FOCUS', label: 'Grimoire Tome' },
  { id: 'ORB_SCEPTRE', label: 'Orb Sceptre' },
  { id: 'BOW', label: 'Mystic Bow' },
  { id: 'BROOM', label: 'Witch Broom' }
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

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.1,
    emissive: color,
    emissiveIntensity: 0.1
  });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.8, roughness: 0.25 });

  if (style === 'WIZARD') {
    // Discworld Archchancellor / Sorting Hat: Floppy brim + curved cone + star embroidery
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 16), mat);
    group.add(brim);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 16), goldMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.05;
    group.add(band);

    const coneGeo = new THREE.ConeGeometry(0.32, 0.75, 12);
    coneGeo.translate(0, 0.38, 0);
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.rotation.x = -0.22;
    cone.rotation.z = 0.1;
    group.add(cone);

    const tipGeo = new THREE.ConeGeometry(0.14, 0.35, 8);
    tipGeo.translate(0, 0.18, 0);
    const tip = new THREE.Mesh(tipGeo, mat);
    tip.position.set(0.08, 0.72, -0.15);
    tip.rotation.x = -0.55;
    tip.rotation.z = -0.2;
    group.add(tip);

    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe259 });
    for (let s = 0; s < 3; s++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), starMat);
      const sa = s * 2.0;
      star.position.set(Math.cos(sa) * 0.22, 0.3 + s * 0.15, Math.sin(sa) * 0.22);
      group.add(star);
    }
  } else if (style === 'TOP') {
    // Scholastic Headmaster Hat with gold band & quill
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.05, 16), mat);
    group.add(brim);

    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.65, 16), mat);
    top.position.y = 0.34;
    group.add(top);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), goldMat);
    band.position.y = 0.1;
    group.add(band);

    const quillGeo = new THREE.ConeGeometry(0.04, 0.3, 4);
    const quillMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const quill = new THREE.Mesh(quillGeo, quillMat);
    quill.position.set(0.32, 0.35, 0.05);
    quill.rotation.z = -0.3;
    group.add(quill);
  } else if (style === 'CROWN') {
    // Dueling Champion's Diadem with embedded gems
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.25, metalness: 0.85 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12, 1, true), metalMat);
    band.position.y = 0.12;
    group.add(band);
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), metalMat);
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.3, 0.32, Math.sin(a) * 0.3);
      group.add(spike);

      if (i % 2 === 0) {
        const gem = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.05, 0),
          new THREE.MeshBasicMaterial({ color: i === 0 ? 0xff2244 : i === 2 ? 0x2288ff : 0x22dd66 })
        );
        gem.position.set(Math.cos(a) * 0.33, 0.12, Math.sin(a) * 0.33);
        group.add(gem);
      }
    }
  } else if (style === 'HOOD') {
    // Gothic Dueling Cowl with stitched border
    const hoodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hoodMat);
    hood.position.y = 0.08;
    group.add(hood);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 8), hoodMat);
    tip.position.set(0, 0.36, -0.12);
    tip.rotation.x = -0.35;
    group.add(tip);

    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 6, 16), goldMat);
    hem.position.set(0, 0.05, 0.08);
    group.add(hem);
  } else if (style === 'HELMET') {
    // Dragon-Tamer / Knight Helm with gilded visor and plume
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a929e, roughness: 0.3, metalness: 0.85 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), metalMat);
    dome.position.y = 0.06;
    group.add(dome);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.8, roughness: 0.3 })
    );
    visor.position.set(0, 0.12, 0.26);
    group.add(visor);

    const plumeMat = new THREE.MeshStandardMaterial({ color: 0xa61c28, roughness: 0.6 });
    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.38), plumeMat);
    plume.position.set(0, 0.34, -0.05);
    group.add(plume);
  } else if (style === 'MUSHROOM') {
    // Whimsical Pokémon Parasect / Fairy Toadstool Cap with white polka dots
    const shroomRed = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), shroomRed);
    cap.position.y = 0.08;
    cap.scale.set(1.15, 0.8, 1.15);
    group.add(cap);

    // Pale cream gills rim underneath
    const gills = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: 0xf5eedc, roughness: 0.9 })
    );
    gills.position.y = 0.06;
    group.add(gills);

    // White polka dot spots
    const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const spotCoords = [
      { x: 0, y: 0.38, z: 0, s: 0.09 },
      { x: 0.32, y: 0.25, z: 0.2, s: 0.07 },
      { x: -0.32, y: 0.25, z: 0.2, s: 0.07 },
      { x: 0.28, y: 0.25, z: -0.25, s: 0.07 },
      { x: -0.28, y: 0.25, z: -0.25, s: 0.07 }
    ];
    spotCoords.forEach(c => {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(c.s, 6, 6), spotMat);
      spot.position.set(c.x, c.y, c.z);
      group.add(spot);
    });
  } else if (style === 'TIARA') {
    // Lunar Crescent Gem Tiara
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xe6eef8, metalness: 0.9, roughness: 0.15 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 6, 16, Math.PI), silverMat);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 0.08, 0.04);
    group.add(band);

    // Crescent moon center
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 16, Math.PI * 1.3), silverMat);
    moon.position.set(0, 0.24, 0.32);
    moon.rotation.z = Math.PI * 0.35;
    group.add(moon);

    // Glowing sapphire star
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.06, 0),
      new THREE.MeshBasicMaterial({ color: 0x00d2ff })
    );
    gem.position.set(0, 0.24, 0.34);
    group.add(gem);
  } else if (style === 'JESTER') {
    // Dual-belled Harlequin Jester Cap
    const capMatA = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const capMatB = new THREE.MeshStandardMaterial({ color: 0x8b2500, roughness: 0.5 });

    // Left horn
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 8), capMatA);
    hornL.position.set(-0.25, 0.35, 0);
    hornL.rotation.z = 0.55;
    hornL.rotation.x = -0.2;
    group.add(hornL);

    // Right horn
    const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 8), capMatB);
    hornR.position.set(0.25, 0.35, 0);
    hornR.rotation.z = -0.55;
    hornR.rotation.x = -0.2;
    group.add(hornR);

    // Brass bells
    const bellL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), goldMat);
    bellL.position.set(-0.48, 0.48, -0.08);
    group.add(bellL);

    const bellR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), goldMat);
    bellR.position.set(0.48, 0.48, -0.08);
    group.add(bellR);
  } else if (style === 'TURBAN') {
    // Arcane Jeweled Silk Turban with Ruby and Plume
    const silkMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const turbanDome = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), silkMat);
    turbanDome.position.y = 0.15;
    turbanDome.scale.set(1.1, 0.85, 1.1);
    group.add(turbanDome);

    // Front gold brooch
    const brooch = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), goldMat);
    brooch.position.set(0, 0.16, 0.36);
    group.add(brooch);

    // Ruby center
    const ruby = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: 0xff1133 }));
    ruby.position.set(0, 0.16, 0.4);
    group.add(ruby);

    // Peacock feather plume
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.42, 6),
      new THREE.MeshStandardMaterial({ color: 0x00a896, roughness: 0.4 })
    );
    plume.position.set(0, 0.42, 0.3);
    plume.rotation.x = -0.2;
    group.add(plume);
  } else if (style === 'BANDANA') {
    // Ninja / Shinobi Dueling Bandana with trailing ribbons
    const clothMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16), clothMat);
    wrap.rotation.x = Math.PI / 2;
    wrap.position.set(0, 0.04, 0);
    group.add(wrap);

    // Metal forehead protector plate
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.09, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xd0d5dd, metalness: 0.8, roughness: 0.25 })
    );
    plate.position.set(0, 0.05, 0.32);
    group.add(plate);

    // Trailing ribbons behind
    const ribL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.38, 0.02), clothMat);
    ribL.position.set(-0.06, -0.15, -0.36);
    ribL.rotation.x = 0.25;
    ribL.rotation.z = 0.15;
    group.add(ribL);

    const ribR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.02), clothMat);
    ribR.position.set(0.06, -0.12, -0.36);
    ribR.rotation.x = 0.3;
    ribR.rotation.z = -0.15;
    group.add(ribR);
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
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), mat);
      spike.position.set(0, 0.38, -0.12 + i * 0.12);
      group.add(spike);
    }
  } else if (style === 'LONG') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.12), mat);
    back.position.set(0, -0.15, -0.28);
    group.add(back);
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

/** Builds face gear (glasses, eyepatch, beard, mask, monocle, runes, blindfold, mustache). */
export function buildFaceGear(style: FaceGearStyle, color: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(0, 0.9, 0);
  if (style === 'NONE') return group;

  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.85, roughness: 0.25 });

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
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const holeL = new THREE.Mesh(new THREE.CircleGeometry(0.04, 6), holeMat);
    holeL.position.set(-0.09, 0.02, 0.25);
    group.add(holeL);
    const holeR = holeL.clone();
    holeR.position.x = 0.09;
    group.add(holeR);
  } else if (style === 'MONOCLE') {
    // Brass Scholar's Monocle over right eye with hanging chain
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12),
      new THREE.MeshStandardMaterial({ color: 0xdff5ff, roughness: 0.1, transparent: true, opacity: 0.6 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0.11, 0.02, 0.25);
    group.add(lens);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16), goldMat);
    rim.position.set(0.11, 0.02, 0.25);
    group.add(rim);

    // Hanging gold chain
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.24, 4),
      goldMat
    );
    chain.position.set(0.18, -0.1, 0.22);
    chain.rotation.z = -0.15;
    group.add(chain);
  } else if (style === 'RUNE_MARK') {
    // Glowing Arcane Forehead/Cheek Rune
    const runeMat = new THREE.MeshBasicMaterial({ color });
    const runeA = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.02), runeMat);
    runeA.position.set(-0.1, 0.12, 0.25);
    group.add(runeA);

    const runeB = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), runeMat);
    runeB.position.set(-0.1, 0.12, 0.25);
    group.add(runeB);
  } else if (style === 'BLINDFOLD') {
    // Mystic Cloth Blindfold with Embroidered Golden Eye
    const foldMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.8 });
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.14), foldMat);
    band.position.set(0, 0.02, 0.22);
    group.add(band);

    // Gold embroidered mystic eye
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), goldMat);
    eye.position.set(0, 0.02, 0.3);
    group.add(eye);
  } else if (style === 'MUSTACHE') {
    // Distinguished Curled Wizard Mustache
    const mustMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), mustMat);
    mid.position.set(0, -0.08, 0.26);
    group.add(mid);

    // Left curl
    const curlL = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), mustMat);
    curlL.position.set(-0.1, -0.06, 0.25);
    curlL.rotation.z = -1.2;
    group.add(curlL);

    // Right curl
    const curlR = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), mustMat);
    curlR.position.set(0.1, -0.06, 0.25);
    curlR.rotation.z = 1.2;
    group.add(curlR);
  }

  return group;
}

/** Builds the weapon group (staff, wand, sword, scythe, grimoire focus, orb sceptre, bow, broom). */
export function buildWeapon(style: WeaponStyle, spellColor: number): { group: THREE.Group; crystal: THREE.Object3D; light: THREE.Object3D } {
  const group = new THREE.Group();
  group.position.set(0.4, 0.45, 0.1);

  const crystal = new THREE.Object3D();
  const light = new THREE.Object3D();
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.8, roughness: 0.25 });

  if (style === 'STAFF') {
    // Gnarled Elder Oak Staff with twisted root top
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.045, 1.05, 8),
      new THREE.MeshStandardMaterial({ color: 0x482e1d, roughness: 0.9 })
    );
    pole.rotation.x = Math.PI / 2;
    group.add(pole);

    [-0.2, 0.1, 0.35].forEach(pz => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.015, 6, 12), goldMat);
      ring.position.z = pz;
      group.add(ring);
    });

    const crystalMesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.58);
    group.add(crystalMesh);
    crystal.add(crystalMesh);
  } else if (style === 'WAND') {
    // 11-inch Ollivanders Dueling Wand
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 8), goldMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.1;
    group.add(handle);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.03, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x24170d, roughness: 0.75 })
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.42;
    group.add(shaft);

    const crystalMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.08, 0),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.7);
    group.add(crystalMesh);
    crystal.add(crystalMesh);
  } else if (style === 'SWORD') {
    // Silver Dueling Rapier
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.75, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xe0e6ed, roughness: 0.15, metalness: 0.95 })
    );
    blade.rotation.x = Math.PI / 2;
    blade.position.z = 0.38;
    group.add(blade);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.06), goldMat);
    guard.position.z = 0.05;
    group.add(guard);

    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a1c24, roughness: 0.8 })
    );
    hilt.rotation.x = Math.PI / 2;
    hilt.position.z = -0.06;
    group.add(hilt);

    const crystalMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.06, 0),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, -0.16);
    group.add(crystalMesh);
    crystal.add(crystalMesh);
  } else if (style === 'SCYTHE') {
    // Astral Scythe
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.15, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.85 })
    );
    pole.rotation.x = Math.PI / 2;
    group.add(pole);

    const blade = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.035, 8, 16, Math.PI * 0.65),
      new THREE.MeshStandardMaterial({ color: 0x7be4ff, roughness: 0.2, metalness: 0.8, emissive: 0x114488, emissiveIntensity: 0.4 })
    );
    blade.position.set(0, 0.05, 0.58);
    blade.rotation.set(Math.PI / 2, 0, -Math.PI * 0.2);
    group.add(blade);

    const crystalMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.58);
    group.add(crystalMesh);
    crystal.add(crystalMesh);
  } else if (style === 'GRIMOIRE_FOCUS') {
    // Open Floating Spellbook Focus radiating arcane runes
    const bookCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.03, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x3d1c10, roughness: 0.8 })
    );
    bookCover.position.set(0, 0.1, 0.4);
    bookCover.rotation.set(0.4, 0, 0);
    group.add(bookCover);

    const pages = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.06, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.9 })
    );
    pages.position.set(0, 0.14, 0.4);
    pages.rotation.set(0.4, 0, 0);
    group.add(pages);

    const crystalMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.1, 0),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0.25, 0.4);
    group.add(crystalMesh);
    crystal.add(crystalMesh);
  } else if (style === 'ORB_SCEPTRE') {
    // Golden Sceptre with floating crystal orb & orbital rings
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.035, 0.85, 8),
      goldMat
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.25;
    group.add(shaft);

    const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 16), goldMat);
    ringA.position.z = 0.65;
    group.add(ringA);

    const crystalMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 8),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.65);
    group.add(crystalMesh);
    crystal.add(crystalMesh);
  } else if (style === 'BOW') {
    // Mystic Luminous Energy Bow
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x2b384e, metalness: 0.7, roughness: 0.3 });
    const limb = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.03, 6, 16, Math.PI * 0.9),
      limbMat
    );
    limb.position.set(0, 0, 0.35);
    limb.rotation.set(Math.PI / 2, 0, -Math.PI * 0.45);
    group.add(limb);

    // Glowing string
    const stringMat = new THREE.MeshBasicMaterial({ color: spellColor });
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.65, 4), stringMat);
    str.position.set(0, 0, 0.22);
    group.add(str);

    const crystalMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.08, 0),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.35);
    group.add(crystalMesh);
    crystal.add(crystalMesh);
  } else if (style === 'BROOM') {
    // Witch's Flying Broomstick Focus
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.035, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.85 })
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.2;
    group.add(handle);

    // Twig bristles
    const bristles = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x8b6508, roughness: 0.9 })
    );
    bristles.rotation.x = -Math.PI / 2;
    bristles.position.set(0, 0, -0.32);
    group.add(bristles);

    const crystalMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07, 0),
      new THREE.MeshBasicMaterial({ color: spellColor })
    );
    crystalMesh.position.set(0, 0, 0.65);
    group.add(crystalMesh);
    crystal.add(crystalMesh);
  }

  return { group, crystal, light };
}

/** Builds the back accessory group (wings, cape, pack, banner, scarf, potions, shield, familiar). */
export function buildAccessory(style: AccessoryStyle, color: number): THREE.Group {
  const group = new THREE.Group();
  if (style === 'NONE') return group;

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.2,
    emissive: color,
    emissiveIntensity: 0.2
  });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.8, roughness: 0.25 });

  if (style === 'WINGS') {
    const wingGeo = new THREE.ConeGeometry(0.2, 0.75, 4);
    const left = new THREE.Mesh(wingGeo, mat);
    left.position.set(-0.34, 0.55, -0.18);
    left.rotation.set(Math.PI / 2, 0, 0.55);
    group.add(left);

    const right = new THREE.Mesh(wingGeo, mat);
    right.position.set(0.34, 0.55, -0.18);
    right.rotation.set(Math.PI / 2, 0, -0.55);
    group.add(right);
  } else if (style === 'CAPE') {
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.95),
      new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide })
    );
    cape.position.set(0, 0.5, -0.34);
    cape.rotation.x = 0.18;
    group.add(cape);

    const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), goldMat);
    clasp.position.set(0, 0.85, -0.26);
    group.add(clasp);
  } else if (style === 'PACK') {
    const bookMat = new THREE.MeshStandardMaterial({ color: 0x3d2012, roughness: 0.8 });
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.14), bookMat);
    book.position.set(0, 0.55, -0.36);
    book.rotation.y = 0.15;
    group.add(book);

    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.16), goldMat);
    lock.position.set(0.12, 0.55, -0.36);
    group.add(lock);

    const ribbonMat = new THREE.MeshBasicMaterial({ color });
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.28), ribbonMat);
    ribbon.position.set(0, 0.26, -0.36);
    group.add(ribbon);
  } else if (style === 'BANNER') {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.25, 6),
      goldMat
    );
    pole.position.set(0.28, 0.62, -0.3);
    group.add(pole);

    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), goldMat);
    finial.position.set(0.28, 1.26, -0.3);
    group.add(finial);

    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.5),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.15 })
    );
    flag.position.set(0.48, 0.88, -0.3);
    group.add(flag);
  } else if (style === 'SCARF') {
    // Flowing Collegiate House Scarf with fringe
    const scarfMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
    const neck = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 16), scarfMat);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(0, 0.72, 0.02);
    group.add(neck);

    const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.65), scarfMat);
    tail.position.set(-0.12, 0.42, -0.32);
    tail.rotation.set(0.2, 0.1, 0.05);
    group.add(tail);
  } else if (style === 'POTIONS') {
    // Leather Potion Flask Bandolier with 3 Glowing Vials
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.8, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x3d2012, roughness: 0.85 })
    );
    strap.position.set(0, 0.55, -0.32);
    strap.rotation.z = 0.35;
    group.add(strap);

    const potionColors = [0xff2244, 0x00d2ff, 0x39ff14];
    potionColors.forEach((pColor, idx) => {
      const vial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.045, 0.12, 8),
        new THREE.MeshBasicMaterial({ color: pColor })
      );
      vial.position.set(-0.12 + idx * 0.12, 0.45 + idx * 0.1, -0.35);
      group.add(vial);

      const cork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.03, 6),
        new THREE.MeshStandardMaterial({ color: 0x8a6234 })
      );
      cork.position.set(-0.12 + idx * 0.12, 0.52 + idx * 0.1, -0.35);
      group.add(cork);
    });
  } else if (style === 'SHIELD_BACK') {
    // Heraldic Aegis Roundshield strapped to back
    const shieldMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16), shieldMat);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(0, 0.55, -0.32);
    group.add(shield);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 16), goldMat);
    rim.position.set(0, 0.55, -0.34);
    group.add(rim);

    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), goldMat);
    boss.position.set(0, 0.55, -0.35);
    group.add(boss);
  } else if (style === 'FAMILIAR') {
    // Miniature Glowing Magical Spirit Owl/Wisp hovering above shoulder
    const wispMat = new THREE.MeshBasicMaterial({ color });
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), wispMat);
    wisp.position.set(0.34, 0.95, -0.15);
    group.add(wisp);

    // Tiny spirit wings
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const wingL = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), wingMat);
    wingL.position.set(0.26, 0.98, -0.15);
    wingL.rotation.z = 1.1;
    group.add(wingL);

    const wingR = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), wingMat);
    wingR.position.set(0.42, 0.98, -0.15);
    wingR.rotation.z = -1.1;
    group.add(wingR);
  }

  return group;
}

/**
 * Curated Archetypes for Bots to guarantee that every caster in a match has
 * a distinct, recognizable silhouette, unique hat, unique weapon, unique accessory,
 * and distinct colors.
 */
export const BOT_ARCHETYPES: Array<{
  name: string;
  robeColor: number;
  spellColor: number;
  hat: HatStyle;
  weapon: WeaponStyle;
  accessory: AccessoryStyle;
  faceGear: FaceGearStyle;
  hair: HairStyle;
  eyeColor: number;
}> = [
  {
    name: 'Glitch',
    robeColor: 0x2e7d32, // Forest Green
    spellColor: 0xd4a020, // Gold
    hat: 'WIZARD',
    weapon: 'STAFF',
    accessory: 'PACK',
    faceGear: 'BEARD',
    hair: 'NONE',
    eyeColor: 0xfff000
  },
  {
    name: 'Spike',
    robeColor: 0x8b2500, // Crimson
    spellColor: 0x6b2fa0, // Violet
    hat: 'HOOD',
    weapon: 'SCYTHE',
    accessory: 'CAPE',
    faceGear: 'MASK',
    hair: 'MOHAWK',
    eyeColor: 0xff3366
  },
  {
    name: 'Glimmer',
    robeColor: 0x1a5c8a, // Slate Blue
    spellColor: 0x00d2ff, // Cyan
    hat: 'TIARA',
    weapon: 'ORB_SCEPTRE',
    accessory: 'FAMILIAR',
    faceGear: 'MONOCLE',
    hair: 'LONG',
    eyeColor: 0x00d2ff
  },
  {
    name: 'Vortex',
    robeColor: 0x4a3080, // Deep Purple
    spellColor: 0x58c040, // Sage
    hat: 'MUSHROOM',
    weapon: 'GRIMOIRE_FOCUS',
    accessory: 'POTIONS',
    faceGear: 'RUNE_MARK',
    hair: 'PONYTAIL',
    eyeColor: 0x58c040
  },
  {
    name: 'Echo',
    robeColor: 0xb07820, // Ochre
    spellColor: 0xc84030, // Scarlet
    hat: 'TURBAN',
    weapon: 'BROOM',
    accessory: 'SCARF',
    faceGear: 'MUSTACHE',
    hair: 'BUZZ',
    eyeColor: 0xe0a020
  },
  {
    name: 'Frost',
    robeColor: 0x004488, // Cobalt
    spellColor: 0x7be4ff, // Frost Ice
    hat: 'HELMET',
    weapon: 'SWORD',
    accessory: 'SHIELD_BACK',
    faceGear: 'BLINDFOLD',
    hair: 'NONE',
    eyeColor: 0xffffff
  },
  {
    name: 'Blaze',
    robeColor: 0xc84030, // Scarlet
    spellColor: 0xffe200, // Sun Yellow
    hat: 'BANDANA',
    weapon: 'BOW',
    accessory: 'BANNER',
    faceGear: 'SHADES',
    hair: 'MOHAWK',
    eyeColor: 0xfff000
  },
  {
    name: 'Zephyr',
    robeColor: 0x3d2012, // Umber
    spellColor: 0x39ff14, // Lime
    hat: 'JESTER',
    weapon: 'WAND',
    accessory: 'WINGS',
    faceGear: 'EYEPATCH',
    hair: 'LONG',
    eyeColor: 0x39ff14
  }
];

export function generateDistinctBotConfigs(count: number, playerConfig: CharacterConfig): CharacterConfig[] {
  // Filter out archetypes that match the player's chosen hat or robe to maximize contrast
  const pool = BOT_ARCHETYPES.filter(
    (a) => a.robeColor !== playerConfig.robeColor && a.hat !== playerConfig.hat
  );
  const candidates = pool.length >= count ? pool : BOT_ARCHETYPES;

  const configs: CharacterConfig[] = [];
  for (let i = 0; i < count; i++) {
    const arch = candidates[i % candidates.length];
    configs.push({
      robeColor: arch.robeColor,
      spellColor: arch.spellColor,
      hat: arch.hat,
      weapon: arch.weapon,
      accessory: arch.accessory,
      faceGear: arch.faceGear,
      hair: arch.hair,
      hairColor: 0x2b1b0e,
      eyeColor: arch.eyeColor,
      hatRotation: 0
    });
  }
  return configs;
}
