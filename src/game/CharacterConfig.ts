import * as THREE from 'three';

/**
 * Code-built cosmetic customisation for casters. Everything is generated from
 * primitive geometry (no external assets). A CharacterConfig is persisted to
 * localStorage for the player and randomised for bots.
 */

export type HatStyle = 'WIZARD' | 'TOP' | 'CROWN' | 'NONE';
export type AccessoryStyle = 'NONE' | 'WINGS' | 'CAPE' | 'PACK';

export interface CharacterConfig {
  robeColor: number;
  spellColor: number;
  hat: HatStyle;
  accessory: AccessoryStyle;
  eyeColor: number;
}

export const HAT_STYLES: { id: HatStyle; label: string }[] = [
  { id: 'WIZARD', label: 'Wizard' },
  { id: 'TOP', label: 'Top Hat' },
  { id: 'CROWN', label: 'Crown' },
  { id: 'NONE', label: 'None' }
];

export const ACCESSORY_STYLES: { id: AccessoryStyle; label: string }[] = [
  { id: 'NONE', label: 'None' },
  { id: 'WINGS', label: 'Wings' },
  { id: 'CAPE', label: 'Cape' },
  { id: 'PACK', label: 'Jetpack' }
];

export const EYE_COLORS = [0xfff000, 0x00f0ff, 0xff3366, 0x39ff14, 0xffffff];

export const DEFAULT_CONFIG: CharacterConfig = {
  robeColor: 0xff007f,
  spellColor: 0x00f0ff,
  hat: 'WIZARD',
  accessory: 'NONE',
  eyeColor: 0xfff000
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
    eyeColor: pick(EYE_COLORS)
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
  }

  return group;
}

/** Builds the back accessory group (wings / cape / jetpack), tinted with spell colour. */
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
  }

  return group;
}
