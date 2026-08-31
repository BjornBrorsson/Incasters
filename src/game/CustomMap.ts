import type { AABB } from '../engine/Physics';
import { PowerUpType } from '../entities/PowerUp';
import { type MapType } from '../world/Arena';
import { type GameModeType } from '../world/GameModes';

export interface CustomTargetDummyDef {
  id: string;
  x: number;
  y: number;
  health: number;
  radius: number;
  isMoving?: boolean;
  moveAxis?: 'x' | 'y';
  moveRange?: number;
  moveSpeed?: number;
}

export interface CustomPortalDef {
  id1: string;
  x1: number;
  y1: number;
  id2: string;
  x2: number;
  y2: number;
}

export interface CustomPowerupDef {
  x: number;
  y: number;
  type: PowerUpType;
}

export interface CustomSpeedRuneDef {
  id: string;
  x: number;
  y: number;
}

export interface CustomHazardDef {
  x: number;
  y: number;
  angle?: number;
  rotateSpeed?: number;
  fireInterval?: number;
}

export interface CustomMovingWallDef {
  baseX: number;
  baseY: number;
  halfW: number;
  halfH: number;
  axis: 'x' | 'y';
  range: number;
  speed: number;
}

export interface CustomDestructiblePropDef {
  type: 'URN' | 'BARREL' | 'MANA_CRYSTAL';
  x: number;
  y: number;
}

export interface CustomDoorDef {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  openDuration?: number;
  closeDuration?: number;
}

export interface CustomJumpPadDef {
  x: number;
  y: number;
  launchVx?: number;
  launchVy?: number;
}

export interface ClearCheckRecord {
  completed: boolean;
  clearTime: number;
  clearShots: number;
  clearedAt: number;
  verifierSignature?: string;
}

export interface CustomMapData {
  version: number;
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  description: string;
  tip?: string;
  mode: GameModeType | 'TRIAL';
  theme: MapType;
  size: { width: number; height: number };
  
  // Scoring / Clear Check limits
  parTime: number; // in seconds
  maxShots: number; // max shots for 3 stars
  star2Time?: number;
  clearCheck?: ClearCheckRecord;

  // Placed map elements
  playerSpawn: { x: number; y: number };
  botSpawns?: { x: number; y: number; team?: 'RED' | 'BLUE' }[];
  dummies?: CustomTargetDummyDef[];
  walls: AABB[];
  powerups?: CustomPowerupDef[];
  portals?: CustomPortalDef[];
  bouncePads?: AABB[];
  speedRunes?: CustomSpeedRuneDef[];
  hazards?: CustomHazardDef[];
  movingWalls?: CustomMovingWallDef[];
  destructibleProps?: CustomDestructiblePropDef[];
  doors?: CustomDoorDef[];
  jumpPads?: CustomJumpPadDef[];
  cauldronZone?: { x: number; y: number; radius: number };
  createdAt?: number;
  updatedAt?: number;
}

export interface CustomMapSummary {
  id: string;
  title: string;
  author: string;
  mode: string;
  theme: MapType;
  isCleared: boolean;
  clearTime?: number;
  clearShots?: number;
  elementCount: number;
  updatedAt: number;
}

const STORAGE_KEY_CUSTOM_MAPS = 'incasters_custom_maps_v1';

/**
 * Validates that a CustomMapData object satisfies structural and safety constraints.
 */
export function validateCustomMap(map: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!map || typeof map !== 'object') {
    return { valid: false, errors: ['Map data must be a valid JSON object'] };
  }

  if (typeof map.title !== 'string' || !map.title.trim()) {
    errors.push('Map title is required');
  }

  if (!map.playerSpawn || typeof map.playerSpawn.x !== 'number' || typeof map.playerSpawn.y !== 'number') {
    errors.push('Player spawn point is required with valid x and y coordinates');
  }

  if (!Array.isArray(map.walls) || map.walls.length < 4) {
    errors.push('Map must contain at least perimeter boundary walls (minimum 4 walls)');
  }

  if (map.mode === 'TRIAL') {
    if (!Array.isArray(map.dummies) || map.dummies.length === 0) {
      errors.push('Trickshot Trial challenges must have at least 1 target dummy');
    }
  }

  const validThemes: MapType[] = ['ARENA', 'COLOSSEUM', 'CHAMBER', 'OBSERVATORY', 'CATACOMBS'];
  if (!validThemes.includes(map.theme)) {
    errors.push(`Invalid map theme: ${map.theme}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitizes map data to prevent malformed properties or XSS in titles/authors.
 */
export function sanitizeCustomMap(map: CustomMapData): CustomMapData {
  const sanitizedTitle = (map.title || 'Untitled Challenge').trim().slice(0, 48);
  const sanitizedAuthor = (map.author || 'Anonymous Wizard').trim().slice(0, 32);
  const sanitizedSubtitle = (map.subtitle || '').trim().slice(0, 64);
  const sanitizedDesc = (map.description || '').trim().slice(0, 160);
  const sanitizedTip = (map.tip || '').trim().slice(0, 160);

  const width = Math.min(Math.max(Number(map.size?.width) || 36, 20), 60);
  const height = Math.min(Math.max(Number(map.size?.height) || 36, 20), 60);

  const validThemes: MapType[] = ['ARENA', 'COLOSSEUM', 'CHAMBER', 'OBSERVATORY', 'CATACOMBS'];
  const sanitizedTheme: MapType = validThemes.includes(map.theme) ? map.theme : 'ARENA';

  return {
    version: 1,
    id: map.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: sanitizedTitle,
    subtitle: sanitizedSubtitle,
    author: sanitizedAuthor,
    description: sanitizedDesc,
    tip: sanitizedTip,
    mode: map.mode || 'TRIAL',
    theme: sanitizedTheme,
    size: { width, height },
    parTime: Math.max(1, Number(map.parTime) || 12),
    maxShots: Math.max(1, Number(map.maxShots) || 3),
    star2Time: map.star2Time ? Math.max(1, Number(map.star2Time)) : Math.round((Number(map.parTime) || 12) * 1.5),
    clearCheck: map.clearCheck ? {
      completed: Boolean(map.clearCheck.completed),
      clearTime: Number(map.clearCheck.clearTime) || 0,
      clearShots: Number(map.clearCheck.clearShots) || 0,
      clearedAt: Number(map.clearCheck.clearedAt) || Date.now(),
      verifierSignature: map.clearCheck.verifierSignature
    } : undefined,
    playerSpawn: {
      x: Number(map.playerSpawn?.x) || 0,
      y: Number(map.playerSpawn?.y) || 0
    },
    botSpawns: Array.isArray(map.botSpawns) ? map.botSpawns.map((s) => ({
      x: Number(s.x) || 0,
      y: Number(s.y) || 0,
      team: s.team === 'RED' || s.team === 'BLUE' ? s.team : undefined
    })) : [],
    dummies: Array.isArray(map.dummies) ? map.dummies.map((d, idx) => ({
      id: d.id || `dummy_${idx}`,
      x: Number(d.x) || 0,
      y: Number(d.y) || 0,
      health: Math.max(5, Math.min(200, Number(d.health) || 30)),
      radius: Math.max(0.4, Math.min(2.0, Number(d.radius) || 0.75)),
      isMoving: Boolean(d.isMoving),
      moveAxis: d.moveAxis === 'y' ? 'y' : 'x',
      moveRange: Number(d.moveRange) || 4,
      moveSpeed: Number(d.moveSpeed) || 2
    })) : [],
    walls: Array.isArray(map.walls) ? map.walls.map((w) => ({
      minX: Number(w.minX) || 0,
      minY: Number(w.minY) || 0,
      maxX: Number(w.maxX) || 0,
      maxY: Number(w.maxY) || 0
    })) : [],
    powerups: Array.isArray(map.powerups) ? map.powerups.map((p) => ({
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      type: p.type || PowerUpType.HASTE
    })) : [],
    portals: Array.isArray(map.portals) ? map.portals.map((p, idx) => ({
      id1: p.id1 || `portal_${idx}a`,
      x1: Number(p.x1) || 0,
      y1: Number(p.y1) || 0,
      id2: p.id2 || `portal_${idx}b`,
      x2: Number(p.x2) || 0,
      y2: Number(p.y2) || 0
    })) : [],
    bouncePads: Array.isArray(map.bouncePads) ? map.bouncePads.map((b) => ({
      minX: Number(b.minX) || 0,
      minY: Number(b.minY) || 0,
      maxX: Number(b.maxX) || 0,
      maxY: Number(b.maxY) || 0
    })) : [],
    speedRunes: Array.isArray(map.speedRunes) ? map.speedRunes.map((r, idx) => ({
      id: r.id || `rune_${idx}`,
      x: Number(r.x) || 0,
      y: Number(r.y) || 0
    })) : [],
    hazards: Array.isArray(map.hazards) ? map.hazards.map((h) => ({
      x: Number(h.x) || 0,
      y: Number(h.y) || 0,
      angle: Number(h.angle) || 0,
      rotateSpeed: Number(h.rotateSpeed) || 1.2,
      fireInterval: Number(h.fireInterval) || 3.0
    })) : [],
    movingWalls: Array.isArray(map.movingWalls) ? map.movingWalls.map((m) => ({
      baseX: Number(m.baseX) || 0,
      baseY: Number(m.baseY) || 0,
      halfW: Math.max(0.5, Number(m.halfW) || 1),
      halfH: Math.max(0.5, Number(m.halfH) || 1),
      axis: m.axis === 'y' ? 'y' : 'x',
      range: Number(m.range) || 4,
      speed: Number(m.speed) || 1.5
    })) : [],
    destructibleProps: Array.isArray(map.destructibleProps) ? map.destructibleProps.map((p) => ({
      type: p.type === 'BARREL' || p.type === 'MANA_CRYSTAL' ? p.type : 'URN',
      x: Number(p.x) || 0,
      y: Number(p.y) || 0
    })) : [],
    doors: Array.isArray(map.doors) ? map.doors.map((d) => ({
      minX: Number(d.minX) || 0,
      minY: Number(d.minY) || 0,
      maxX: Number(d.maxX) || 0,
      maxY: Number(d.maxY) || 0,
      openDuration: Number(d.openDuration) || 4.0,
      closeDuration: Number(d.closeDuration) || 4.0
    })) : [],
    jumpPads: Array.isArray(map.jumpPads) ? map.jumpPads.map((j) => ({
      x: Number(j.x) || 0,
      y: Number(j.y) || 0,
      launchVx: Number(j.launchVx) || 0,
      launchVy: Number(j.launchVy) || 0
    })) : [],
    cauldronZone: map.cauldronZone ? {
      x: Number(map.cauldronZone.x) || 0,
      y: Number(map.cauldronZone.y) || 0,
      radius: Math.max(2, Math.min(8, Number(map.cauldronZone.radius) || 4))
    } : undefined,
    createdAt: map.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

/**
 * Creates perimeter walls for a given width and height.
 */
export function createPerimeterWalls(width: number, height: number): AABB[] {
  const halfW = width / 2;
  const halfH = height / 2;
  const wallThick = 1.0;

  return [
    // West wall
    { minX: -halfW, minY: -halfH, maxX: -halfW + wallThick, maxY: halfH },
    // East wall
    { minX: halfW - wallThick, minY: -halfH, maxX: halfW, maxY: halfH },
    // South wall
    { minX: -halfW, minY: -halfH, maxX: halfW, maxY: -halfH + wallThick },
    // North wall
    { minX: -halfW, minY: halfH - wallThick, maxX: halfW, maxY: halfH }
  ];
}

/**
 * Built-in starter templates for the Challenge Editor.
 */
export const MAP_TEMPLATES: Record<string, () => CustomMapData> = {
  BLANK_COURTYARD: () => ({
    version: 1,
    id: `template_courtyard_${Date.now()}`,
    title: 'New Trickshot Challenge',
    subtitle: 'Craft your magical obstacle course',
    author: 'Wizard Architect',
    description: 'A blank canvas ready for training dummies, walls, and arcane portals.',
    tip: 'Curve your spells around pillars to hit concealed targets.',
    mode: 'TRIAL',
    theme: 'ARENA',
    size: { width: 36, height: 36 },
    parTime: 12.0,
    maxShots: 3,
    star2Time: 18.0,
    playerSpawn: { x: 0, y: -10 },
    dummies: [
      { id: 'dummy_1', x: 0, y: 8, health: 30, radius: 0.75 }
    ],
    walls: [
      ...createPerimeterWalls(36, 36),
      // Central stone pillar
      { minX: -3, minY: -1, maxX: 3, maxY: 2 }
    ],
    powerups: [
      { x: -5, y: -6, type: PowerUpType.HASTE }
    ]
  }),

  PORTAL_MAZE: () => ({
    version: 1,
    id: `template_portal_${Date.now()}`,
    title: 'Arcane Warp Gauntlet',
    subtitle: 'Teleportation & Angle Mastery',
    author: 'Grand Enchanter',
    description: 'Route your curved projectiles through warp vortexes to strike guarded targets.',
    tip: 'Spells retain their velocity and curvature angle when traveling through portals.',
    mode: 'TRIAL',
    theme: 'OBSERVATORY',
    size: { width: 36, height: 36 },
    parTime: 10.0,
    maxShots: 2,
    star2Time: 15.0,
    playerSpawn: { x: -10, y: -10 },
    dummies: [
      { id: 'dummy_warp', x: 10, y: 10, health: 35, radius: 0.75 }
    ],
    walls: [
      ...createPerimeterWalls(36, 36),
      { minX: -6, minY: -16, maxX: -4, maxY: 4 },
      { minX: 4, minY: -4, maxX: 6, maxY: 16 }
    ],
    portals: [
      { id1: 'warp_a', x1: -10, y1: 0, id2: 'warp_b', x2: 0, y2: 10 }
    ],
    speedRunes: [
      { id: 'rune_1', x: -10, y: -5 }
    ]
  }),

  DUEL_ARENA: () => ({
    version: 1,
    id: `template_duel_${Date.now()}`,
    title: 'Gladiator Amphitheater',
    subtitle: 'Competitive Battle Grounds',
    author: 'Arena Master',
    description: 'Symmetric dueling arena with cover partitions and speed boost rings.',
    tip: 'Dodge-dash across the central corridor to flank opponents.',
    mode: 'BATTLE_ROYALE',
    theme: 'COLOSSEUM',
    size: { width: 42, height: 42 },
    parTime: 60.0,
    maxShots: 20,
    playerSpawn: { x: 0, y: -14 },
    botSpawns: [
      { x: 0, y: 14 },
      { x: -14, y: 0 },
      { x: 14, y: 0 }
    ],
    walls: [
      ...createPerimeterWalls(42, 42),
      { minX: -6, minY: -4, maxX: -4, maxY: 4 },
      { minX: 4, minY: -4, maxX: 6, maxY: 4 }
    ],
    powerups: [
      { x: 0, y: 0, type: PowerUpType.SPLIT }
    ]
  })
};

const memoryStorage: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {}
  return memoryStorage[key] || null;
}

function safeSetItem(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryStorage[key] = val;
}

/**
 * LocalStorage manager for saving and retrieving custom maps on the user's device.
 */
export class CustomMapStorage {
  static getAll(): CustomMapData[] {
    try {
      const raw = safeGetItem(STORAGE_KEY_CUSTOM_MAPS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((m) => sanitizeCustomMap(m));
    } catch {
      return [];
    }
  }

  static getSummaries(): CustomMapSummary[] {
    const maps = this.getAll();
    return maps.map((m) => {
      let count = (m.walls?.length || 0) + (m.dummies?.length || 0) + (m.powerups?.length || 0) +
                  (m.portals?.length || 0) + (m.speedRunes?.length || 0) + (m.hazards?.length || 0) +
                  (m.movingWalls?.length || 0) + (m.destructibleProps?.length || 0) + (m.doors?.length || 0);
      return {
        id: m.id,
        title: m.title,
        author: m.author,
        mode: m.mode,
        theme: m.theme,
        isCleared: Boolean(m.clearCheck?.completed),
        clearTime: m.clearCheck?.clearTime,
        clearShots: m.clearCheck?.clearShots,
        elementCount: count,
        updatedAt: m.updatedAt || m.createdAt || Date.now()
      };
    });
  }

  static getById(id: string): CustomMapData | null {
    const maps = this.getAll();
    const found = maps.find((m) => m.id === id);
    return found ? sanitizeCustomMap(found) : null;
  }

  static save(map: CustomMapData): void {
    const sanitized = sanitizeCustomMap(map);
    const maps = this.getAll();
    const existingIndex = maps.findIndex((m) => m.id === sanitized.id);

    if (existingIndex >= 0) {
      maps[existingIndex] = sanitized;
    } else {
      maps.unshift(sanitized);
    }

    try {
      safeSetItem(STORAGE_KEY_CUSTOM_MAPS, JSON.stringify(maps));
    } catch (e) {
      console.warn('Failed to persist custom map to storage', e);
    }
  }

  static delete(id: string): boolean {
    const maps = this.getAll();
    const filtered = maps.filter((m) => m.id !== id);
    if (filtered.length === maps.length) return false;

    try {
      safeSetItem(STORAGE_KEY_CUSTOM_MAPS, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }

  static duplicate(id: string): CustomMapData | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const copy: CustomMapData = {
      ...existing,
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: `${existing.title} (Copy)`,
      clearCheck: undefined, // Duplicates require fresh clear check
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.save(copy);
    return copy;
  }
}
