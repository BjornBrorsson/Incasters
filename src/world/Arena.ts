import * as THREE from 'three';
import type { AABB } from '../engine/Physics';
import { PALETTE } from '../engine/Theme';

export interface SpawnPoint {
  x: number;
  y: number;
}

export type MapType = 'ARENA' | 'COLOSSEUM' | 'CHAMBER' | 'OBSERVATORY' | 'CATACOMBS';
export const MapType = {
  ARENA: 'ARENA' as MapType,
  COLOSSEUM: 'COLOSSEUM' as MapType,
  CHAMBER: 'CHAMBER' as MapType,
  OBSERVATORY: 'OBSERVATORY' as MapType,
  CATACOMBS: 'CATACOMBS' as MapType
};

export interface Door {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  isOpen: boolean;
  timer: number;
  openDuration: number;
  closeDuration: number;
  mesh: THREE.Mesh | null;
  wallIndex: number; // Index in the physical walls array
}

export interface JumpPad {
  x: number;
  y: number;
  radius: number;
  launchVx: number;
  launchVy: number;
  mesh: THREE.Mesh | null;
}

export interface Hazard {
  x: number;
  y: number;
  angle: number;
  rotateSpeed: number;
  fireTimer: number;
  fireInterval: number;
  fireRadius: number;
  baseWallIndex: number;
  mesh: THREE.Group | null;
}

export interface MovingWall {
  wallIndex: number;
  baseX: number;
  baseY: number;
  halfW: number;
  halfH: number;
  axis: 'x' | 'y';
  range: number;
  speed: number;
  phase: number;
  mesh: THREE.Mesh | null;
}

// Procedural Texture Generators for Discworld / Hogwarts / Pokemon aesthetic
function createCobblestoneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#2b2520';
  ctx.fillRect(0, 0, 512, 512);

  const cols = 8;
  const rows = 8;
  const cellW = 512 / cols;
  const cellH = 512 / rows;

  for (let r = 0; r < rows; r++) {
    const xOffset = (r % 2) * (cellW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + xOffset + 3;
      const y = r * cellH + 3;
      const w = cellW - 6;
      const h = cellH - 6;

      const seed = Math.sin(r * 12.9898 + c * 78.233) * 43758.5453;
      const noise = seed - Math.floor(seed);
      const baseVal = 58 + Math.floor(noise * 24);

      ctx.fillStyle = `rgb(${baseVal + 12}, ${baseVal + 6}, ${baseVal})`;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();

      // Top-left stone bevel highlight
      ctx.strokeStyle = 'rgba(255, 230, 190, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createParquetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#1c1008';
  ctx.fillRect(0, 0, 512, 512);

  const tiles = 8;
  const size = 512 / tiles;

  for (let r = 0; r < tiles; r++) {
    for (let c = 0; c < tiles; c++) {
      const isAlt = (r + c) % 2 === 0;
      ctx.fillStyle = isAlt ? '#3a2214' : '#4a2c1a';
      ctx.fillRect(c * size + 2, r * size + 2, size - 4, size - 4);

      // Gold inlay lines
      ctx.strokeStyle = 'rgba(212, 160, 32, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c * size + 5, r * size + 5, size - 10, size - 10);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createStoneWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#221c18';
  ctx.fillRect(0, 0, 512, 256);

  const rows = 6;
  const rowH = 256 / rows;

  for (let r = 0; r < rows; r++) {
    const cols = 5;
    const colW = 512 / cols;
    const xOff = (r % 2) * (colW / 2);

    for (let c = -1; c <= cols; c++) {
      const x = c * colW + xOff + 2;
      const y = r * rowH + 2;
      const w = colW - 4;
      const h = rowH - 4;

      const seed = Math.sin(r * 45.12 + c * 89.3) * 1000;
      const n = seed - Math.floor(seed);
      const val = 85 + Math.floor(n * 25);

      ctx.fillStyle = `rgb(${val + 10}, ${val + 2}, ${val - 8})`;
      ctx.fillRect(x, y, w, h);

      // Mortar highlights
      ctx.strokeStyle = 'rgba(255, 220, 180, 0.12)';
      ctx.strokeRect(x, y, w, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createObservatoryFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Dark obsidian starfield background
  ctx.fillStyle = '#0a0d18';
  ctx.fillRect(0, 0, 512, 512);

  // Celestial gold concentric rings
  ctx.strokeStyle = 'rgba(212, 160, 32, 0.28)';
  ctx.lineWidth = 3;
  [80, 160, 240].forEach(r => {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Astrolabe radiating lines
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250);
    ctx.stroke();
  }

  // Constellation stars
  ctx.fillStyle = '#ffffff';
  for (let s = 0; s < 45; s++) {
    const sx = (Math.sin(s * 73.1) * 0.5 + 0.5) * 512;
    const sy = (Math.cos(s * 91.7) * 0.5 + 0.5) * 512;
    const sr = (s % 3 === 0) ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createCatacombsFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Weathered damp mossy dungeon flagstones
  ctx.fillStyle = '#161a15';
  ctx.fillRect(0, 0, 512, 512);

  const tileSize = 64;
  for (let y = 0; y < 512; y += tileSize) {
    for (let x = 0; x < 512; x += tileSize) {
      const seed = Math.sin(x * 12.3 + y * 45.6) * 1000;
      const n = seed - Math.floor(seed);
      const val = 30 + Math.floor(n * 22);

      // Flagstone color with subtle moss tint
      ctx.fillStyle = `rgb(${val - 5}, ${val + 12}, ${val})`;
      ctx.fillRect(x + 2, y + 2, tileSize - 4, tileSize - 4);

      // Emerald moss patches in corners
      if (n > 0.6) {
        ctx.fillStyle = 'rgba(30, 140, 60, 0.25)';
        ctx.fillRect(x + 4, y + 4, 18, 18);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

export class Arena {
  width: number = 36;
  height: number = 36;
  walls: AABB[] = [];
  spawnPoints: SpawnPoint[] = [];
  powerupSpawners: SpawnPoint[] = [];
  doors: Door[] = [];
  jumpPads: JumpPad[] = [];
  hazards: Hazard[] = [];
  movingWalls: MovingWall[] = [];
  mapType: MapType = 'ARENA';

  // Fired by rotating shooting statues; wired to Game's neutral projectile spawner
  onHazardFire: ((x: number, y: number, angle: number) => void) | null = null;
  
  // ThreeJS Mesh Groups
  private arenaGroup: THREE.Group;
  private wallMaterial: THREE.MeshStandardMaterial;
  private wallCopingMaterial: THREE.MeshStandardMaterial;
  private floorMaterial: THREE.MeshStandardMaterial;
  private cauldronMaterial: THREE.MeshStandardMaterial;
  private cauldronBrewMaterial: THREE.MeshStandardMaterial;
  private doorMaterial: THREE.MeshStandardMaterial;
  private hazardMaterial: THREE.MeshStandardMaterial;
  private hazardBarrelMaterial: THREE.MeshStandardMaterial;
  private movingWallMaterial: THREE.MeshStandardMaterial;
  private bouncePadsMeshes: THREE.Mesh[] = [];
  private floatingCandles: { mesh: THREE.Group; baseY: number; phase: number }[] = [];
  private pulseTime: number = 0;

  constructor(mapType: MapType = 'ARENA') {
    this.mapType = mapType;
    this.arenaGroup = new THREE.Group();
    
    // Whimsical Castle Masonry & Gothic Academy Materials
    const wallTex = createStoneWallTexture();
    this.wallMaterial = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0x8a7c6e,
      roughness: 0.85,
      metalness: 0.05
    });

    this.wallCopingMaterial = new THREE.MeshStandardMaterial({
      color: 0xa89886,
      roughness: 0.7,
      metalness: 0.1
    });

    // Map-specific floor material
    if (mapType === 'CHAMBER') {
      this.floorMaterial = new THREE.MeshStandardMaterial({
        map: createParquetTexture(),
        roughness: 0.45,
        metalness: 0.1
      });
    } else if (mapType === 'OBSERVATORY') {
      this.floorMaterial = new THREE.MeshStandardMaterial({
        map: createObservatoryFloorTexture(),
        roughness: 0.35,
        metalness: 0.2
      });
    } else if (mapType === 'CATACOMBS') {
      this.floorMaterial = new THREE.MeshStandardMaterial({
        map: createCatacombsFloorTexture(),
        roughness: 0.85,
        metalness: 0.05
      });
    } else {
      this.floorMaterial = new THREE.MeshStandardMaterial({
        map: createCobblestoneTexture(),
        roughness: 0.8,
        metalness: 0.05
      });
    }

    // Cast-iron bubbling Potion Cauldron (Bounce Pad)
    this.cauldronMaterial = new THREE.MeshStandardMaterial({
      color: 0x222228,
      roughness: 0.4,
      metalness: 0.7
    });

    this.cauldronBrewMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.cauldronBrew,
      emissive: PALETTE.cauldronBrew,
      emissiveIntensity: 0.75,
      roughness: 0.15
    });

    this.doorMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.door,
      emissive: 0x8a5a08,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.88,
      roughness: 0.3
    });

    this.hazardMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3a30,
      roughness: 0.65,
      metalness: 0.3
    });
    this.hazardBarrelMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a020,
      emissive: 0x995500,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.6
    });
    this.movingWallMaterial = new THREE.MeshStandardMaterial({
      color: 0x5a3468,
      emissive: 0x3d1c48,
      emissiveIntensity: 0.35,
      roughness: 0.6
    });

    this.setupLayout();
  }

  private setupLayout() {
    this.walls = [];
    this.spawnPoints = [];
    this.powerupSpawners = [];
    this.doors = [];
    this.jumpPads = [];
    this.hazards = [];
    this.movingWalls = [];

    if (this.mapType === 'COLOSSEUM') {
      this.width = 48;
      this.height = 48;
    } else if (this.mapType === 'CHAMBER') {
      this.width = 24;
      this.height = 24;
    } else if (this.mapType === 'OBSERVATORY') {
      this.width = 42;
      this.height = 42;
    } else if (this.mapType === 'CATACOMBS') {
      this.width = 38;
      this.height = 38;
    } else {
      this.width = 36;
      this.height = 36;
    }

    const halfW = this.width / 2;
    const halfH = this.height / 2;

    // 1. Boundary outer walls
    this.walls.push({ minX: -halfW - 1, minY: -halfH - 1, maxX: -halfW, maxY: halfH + 1 });
    this.walls.push({ minX: halfW, minY: -halfH - 1, maxX: halfW + 1, maxY: halfH + 1 });
    this.walls.push({ minX: -halfW - 1, minY: -halfH - 1, maxX: halfW + 1, maxY: -halfH });
    this.walls.push({ minX: -halfW - 1, minY: halfH, maxX: halfW + 1, maxY: halfH + 1 });

    if (this.mapType === 'OBSERVATORY') {
      // 🌟 The Astral Observatory / Stargazer Spire
      // Central Armillary Spire Pillar
      this.walls.push({ minX: -2.5, minY: -2.5, maxX: 2.5, maxY: 2.5 });

      // 4 Astrolabe Ring Outer Pillars
      this.walls.push({ minX: -14, minY: -4, maxX: -11, maxY: 4 });
      this.walls.push({ minX: 11, minY: -4, maxX: 14, maxY: 4 });
      this.walls.push({ minX: -4, minY: -14, maxX: 4, maxY: -11 });
      this.walls.push({ minX: -4, minY: 11, maxX: 4, maxY: 14 });

      // Corner Arcane Telescopes / Bounce Pads
      this.walls.push({ minX: -9, minY: -9, maxX: -7, maxY: -7, isBouncePad: true });
      this.walls.push({ minX: 7, minY: -9, maxX: 9, maxY: -7, isBouncePad: true });
      this.walls.push({ minX: -9, minY: 7, maxX: -7, maxY: 9, isBouncePad: true });
      this.walls.push({ minX: 7, minY: 7, maxX: 9, maxY: 9, isBouncePad: true });

      // 4 Astral Warp Star Gates / Jump Pads
      const warpSpeed = 16.0;
      this.jumpPads.push({ x: -16, y: 0, radius: 1.3, launchVx: warpSpeed, launchVy: 0, mesh: null });
      this.jumpPads.push({ x: 16, y: 0, radius: 1.3, launchVx: -warpSpeed, launchVy: 0, mesh: null });
      this.jumpPads.push({ x: 0, y: -16, radius: 1.3, launchVx: 0, launchVy: warpSpeed, mesh: null });
      this.jumpPads.push({ x: 0, y: 16, radius: 1.3, launchVx: 0, launchVy: -warpSpeed, mesh: null });

      // Safe Spawns (Radius 10.5)
      const radius = 10.5;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8 + Math.PI / 8;
        this.spawnPoints.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      }

      // 6 Power-up Spawners
      this.powerupSpawners.push({ x: -10, y: 0 });
      this.powerupSpawners.push({ x: 10, y: 0 });
      this.powerupSpawners.push({ x: 0, y: -10 });
      this.powerupSpawners.push({ x: 0, y: 10 });
      this.powerupSpawners.push({ x: -12, y: -12 });
      this.powerupSpawners.push({ x: 12, y: 12 });

      // Rotating Astrolabe Prism Hazards + Moving Orbit Walls
      this.addHazard(0, 0, 1.4, 1.2, 2.0);
      this.addMovingWall(0, -15, 3.5, 1.2, 'x', 7, 0.45);
      this.addMovingWall(0, 15, 3.5, 1.2, 'x', 7, 0.45);

    } else if (this.mapType === 'CATACOMBS') {
      // 🧪 The Alchemist's Undercroft / Potion Vaults
      // Interlocking Vault Corridors & Chambers
      this.walls.push({ minX: -12, minY: -12, maxX: -6, maxY: -10 });
      this.walls.push({ minX: 6, minY: -12, maxX: 12, maxY: -10 });
      this.walls.push({ minX: -12, minY: 10, maxX: -6, maxY: 12 });
      this.walls.push({ minX: 6, minY: 10, maxX: 12, maxY: 12 });

      this.walls.push({ minX: -10, minY: -6, maxX: -8, maxY: 6 });
      this.walls.push({ minX: 8, minY: -6, maxX: 10, maxY: 6 });

      // 4 Potion Cauldron Bounce Pads
      this.walls.push({ minX: -4, minY: -4, maxX: -2, maxY: -2, isBouncePad: true });
      this.walls.push({ minX: 2, minY: -4, maxX: 4, maxY: -2, isBouncePad: true });
      this.walls.push({ minX: -4, minY: 2, maxX: -2, maxY: 4, isBouncePad: true });
      this.walls.push({ minX: 2, minY: 2, maxX: 4, maxY: 4, isBouncePad: true });

      // Vault Portcullis Doors
      this.addDoor('door_c1', -1.5, -8, 1.5, -6, 5, 4);
      this.addDoor('door_c2', -1.5, 6, 1.5, 8, 5, 4);
      this.addDoor('door_c3', -8, -1.5, -6, 1.5, 4, 5);
      this.addDoor('door_c4', 6, -1.5, 8, 1.5, 4, 5);

      // Safe Spawns (Radius 9.0)
      const radius = 9.0;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        this.spawnPoints.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      }

      // 5 Power-up Spawners
      this.powerupSpawners.push({ x: 0, y: 0 });
      this.powerupSpawners.push({ x: -12, y: 0 });
      this.powerupSpawners.push({ x: 12, y: 0 });
      this.powerupSpawners.push({ x: 0, y: -12 });
      this.powerupSpawners.push({ x: 0, y: 12 });

      // Volatile Alchemist Vats / Hazards
      this.addHazard(10, 10, 1.2, 1.0, 1.8);
      this.addHazard(-10, -10, 1.2, 1.0, 1.8);
      this.addMovingWall(-12, 0, 1.5, 3, 'y', 4, 0.35);
      this.addMovingWall(12, 0, 1.5, 3, 'y', 4, 0.35);

    } else if (this.mapType === 'COLOSSEUM') {
      // Spacius Colosseum with an open center surrounded by pillars
      // Concentric inner pillars
      this.walls.push({ minX: -8, minY: -10, maxX: -4, maxY: -8 });
      this.walls.push({ minX: 4, minY: -10, maxX: 8, maxY: -8 });
      this.walls.push({ minX: -8, minY: 8, maxX: -4, maxY: 10 });
      this.walls.push({ minX: 4, minY: 8, maxX: 8, maxY: 10 });

      // Outer pillars
      this.walls.push({ minX: -16, minY: -16, maxX: -13, maxY: -13 });
      this.walls.push({ minX: 13, minY: -16, maxX: 16, maxY: -13 });
      this.walls.push({ minX: -16, minY: 13, maxX: -13, maxY: 16 });
      this.walls.push({ minX: 13, minY: 13, maxX: 16, maxY: 16 });

      // Bounce pads (centered on outer quadrants)
      this.walls.push({ minX: -11, minY: -2, maxX: -9, maxY: 2, isBouncePad: true });
      this.walls.push({ minX: 9, minY: -2, maxX: 11, maxY: 2, isBouncePad: true });
      this.walls.push({ minX: -2, minY: -11, maxX: 2, maxY: -9, isBouncePad: true });
      this.walls.push({ minX: -2, minY: 9, maxX: 2, maxY: 11, isBouncePad: true });

      // 4 sliding security gates blocking inner paths
      this.addDoor('door_n', -1.5, -16.5, 1.5, -14.5, 6, 6);
      this.addDoor('door_s', -1.5, 14.5, 1.5, 16.5, 6, 6);
      this.addDoor('door_w', -16.5, -1.5, -14.5, 1.5, 6, 6);
      this.addDoor('door_e', 14.5, -1.5, 16.5, 1.5, 6, 6);

      // Spawns
      const radius = 11.5;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        this.spawnPoints.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      }

      // 6 Power-up Spawners
      this.powerupSpawners.push({ x: -14, y: -8 });
      this.powerupSpawners.push({ x: 14, y: -8 });
      this.powerupSpawners.push({ x: -14, y: 8 });
      this.powerupSpawners.push({ x: 14, y: 8 });
      this.powerupSpawners.push({ x: 0, y: -5 });
      this.powerupSpawners.push({ x: 0, y: 5 });

      // 4 Corner Jump pads launching casters inwards
      const jl = 15.0;
      this.jumpPads.push({ x: -20, y: -20, radius: 1.2, launchVx: jl, launchVy: jl, mesh: null });
      this.jumpPads.push({ x: 20, y: -20, radius: 1.2, launchVx: -jl, launchVy: jl, mesh: null });
      this.jumpPads.push({ x: -20, y: 20, radius: 1.2, launchVx: jl, launchVy: -jl, mesh: null });
      this.jumpPads.push({ x: 20, y: 20, radius: 1.2, launchVx: -jl, launchVy: -jl, mesh: null });

      // Hazards: central rotating shooting statue + two sliding walls
      this.addHazard(0, 0, 1.1, 1.3, 1.7);
      this.addMovingWall(0, -14, 3, 1.5, 'x', 6, 0.35);
      this.addMovingWall(0, 14, 3, 1.5, 'x', 6, 0.35);

    } else if (this.mapType === 'CHAMBER') {
      // Small labyrinth-like maze
      // Central cross wall
      this.walls.push({ minX: -1.5, minY: -1.5, maxX: 1.5, maxY: 1.5 });
      this.walls.push({ minX: -1.5, minY: -8, maxX: 1.5, maxY: -4 });
      this.walls.push({ minX: -1.5, minY: 4, maxX: 1.5, maxY: 8 });

      // Sliding doors in side partitions
      this.walls.push({ minX: -8, minY: -1.5, maxX: -6, maxY: 1.5 });
      this.addDoor('door_l', -6, -1.5, -4, 1.5, 5, 5);
      this.walls.push({ minX: 6, minY: -1.5, maxX: 8, maxY: 1.5 });
      this.addDoor('door_r', 4, -1.5, 6, 1.5, 5, 5);

      // Bounce pads
      this.walls.push({ minX: -7, minY: -7, maxX: -5, maxY: -5, isBouncePad: true });
      this.walls.push({ minX: 5, minY: 5, maxX: 7, maxY: 7, isBouncePad: true });

      // Spawns
      const radius = 6.0;
      for (let i = 0; i < 8; i++) {
        const angle = ((i + 0.5) * Math.PI * 2) / 8;
        this.spawnPoints.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      }

      // 2 Power-up Spawners
      this.powerupSpawners.push({ x: 0, y: -7 });
      this.powerupSpawners.push({ x: 0, y: 7 });

      // Hazard: a single slow sliding wall in the lower lane
      this.addMovingWall(0, -10.5, 2, 1, 'x', 3.5, 0.4);

    } else {
      // Standard ARENA
      // Central Block
      this.walls.push({ minX: -2, minY: -2, maxX: 2, maxY: 2 });

      // 4 Corner pillars
      this.walls.push({ minX: -10, minY: -10, maxX: -7, maxY: -7 });
      this.walls.push({ minX: 7, minY: -10, maxX: 10, maxY: -7 });
      this.walls.push({ minX: -10, minY: 7, maxX: -7, maxY: 10 });
      this.walls.push({ minX: 7, minY: 7, maxX: 10, maxY: 10 });

      // L-barriers
      this.walls.push({ minX: -12, minY: -2, maxX: -9, maxY: 2 });
      this.walls.push({ minX: 9, minY: -2, maxX: 12, maxY: 2 });
      this.walls.push({ minX: -2, minY: -12, maxX: 2, maxY: -9 });
      this.walls.push({ minX: -2, minY: 9, maxX: 2, maxY: 12 });

      // Bounce pads
      this.walls.push({ minX: -6, minY: -6, maxX: -4, maxY: -4, isBouncePad: true });
      this.walls.push({ minX: 4, minY: -6, maxX: 6, maxY: -4, isBouncePad: true });
      this.walls.push({ minX: -6, minY: 4, maxX: -4, maxY: 6, isBouncePad: true });
      this.walls.push({ minX: 4, minY: 4, maxX: 6, maxY: 6, isBouncePad: true });

      // 8 Spawn points
      const radius = 8.5;
      for (let i = 0; i < 8; i++) {
        const angle = ((i + 0.5) * Math.PI * 2) / 8;
        this.spawnPoints.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      }

      // 4 Power-up Spawners
      this.powerupSpawners.push({ x: -8.5, y: 0 });
      this.powerupSpawners.push({ x: 8.5, y: 0 });
      this.powerupSpawners.push({ x: 0, y: -8.5 });
      this.powerupSpawners.push({ x: 0, y: 8.5 });

      // 2 Jump pads diagonally launching inwards
      const jl = 13.0;
      this.jumpPads.push({ x: -14, y: -14, radius: 1.2, launchVx: jl, launchVy: jl, mesh: null });
      this.jumpPads.push({ x: 14, y: 14, radius: 1.2, launchVx: -jl, launchVy: -jl, mesh: null });

      // Hazards: two rotating shooting statues + a sliding wall
      this.addHazard(13, 7.5, 1.0, 1.5, 1.5);
      this.addHazard(-13, -7.5, 1.0, 1.5, 1.5);
      this.addMovingWall(0, -15, 3, 1.5, 'x', 5, 0.4);
    }
  }

  private addHazard(x: number, y: number, fireInterval: number, rotateSpeed: number, fireRadius: number) {
    // The base is a solid obstacle
    const baseWallIndex = this.walls.length;
    this.walls.push({ minX: x - 0.6, minY: y - 0.6, maxX: x + 0.6, maxY: y + 0.6 });
    this.hazards.push({
      x,
      y,
      angle: Math.random() * Math.PI * 2,
      rotateSpeed,
      fireTimer: Math.random() * fireInterval,
      fireInterval,
      fireRadius,
      baseWallIndex,
      mesh: null
    });
  }

  private addMovingWall(baseX: number, baseY: number, w: number, h: number, axis: 'x' | 'y', range: number, speed: number) {
    const wallIndex = this.walls.length;
    this.walls.push({ minX: baseX - w / 2, minY: baseY - h / 2, maxX: baseX + w / 2, maxY: baseY + h / 2 });
    this.movingWalls.push({
      wallIndex,
      baseX,
      baseY,
      halfW: w / 2,
      halfH: h / 2,
      axis,
      range,
      speed,
      phase: Math.random() * Math.PI * 2,
      mesh: null
    });
  }

  private addDoor(id: string, minX: number, minY: number, maxX: number, maxY: number, openDur: number, closeDur: number) {
    const wallIndex = this.walls.length;
    this.walls.push({ minX, minY, maxX, maxY, isOpen: false });

    this.doors.push({
      id,
      minX,
      minY,
      maxX,
      maxY,
      isOpen: false,
      timer: 0,
      openDuration: openDur,
      closeDuration: closeDur,
      mesh: null,
      wallIndex
    });
  }

  buildArena(scene: THREE.Scene) {
    scene.add(this.arenaGroup);

    // 1. Cobblestone / Parquet Courtyard Floor
    const floorGeo = new THREE.PlaneGeometry(this.width, this.height);
    const floor = new THREE.Mesh(floorGeo, this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Stone perimeter curb / border
    const curbGeo = new THREE.RingGeometry(this.width / 2 - 0.4, this.width / 2 + 0.4, 64);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 0.85 });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.rotation.x = -Math.PI / 2;
    curb.position.y = 0.015;
    curb.receiveShadow = true;
    this.arenaGroup.add(curb);

    // Golden inner runic compass ring
    const compassGeo = new THREE.RingGeometry(2.8, 3.1, 48);
    const compassMat = new THREE.MeshBasicMaterial({ color: 0xd4a020, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
    const compass = new THREE.Mesh(compassGeo, compassMat);
    compass.rotation.x = -Math.PI / 2;
    compass.position.y = 0.02;
    this.arenaGroup.add(compass);

    // 2. Instantiate all physical walls with gothic copings, banners, and buttresses
    const bannerColors = [PALETTE.scarlet, PALETTE.emerald, PALETTE.sapphire, PALETTE.octarine, PALETTE.amber];

    this.walls.forEach((wall, idx) => {
      const isDoor = this.doors.some(d => d.wallIndex === idx);
      const isMoving = this.movingWalls.some(m => m.wallIndex === idx);
      const isHazardBase = this.hazards.some(h => h.baseWallIndex === idx);
      if (isDoor || isMoving || isHazardBase) return;

      const w = wall.maxX - wall.minX;
      const h = wall.maxY - wall.minY;
      const cx = (wall.minX + wall.maxX) / 2;
      const cy = (wall.minY + wall.maxY) / 2;

      if (wall.isBouncePad) {
        // ── Bubbling Potion Cauldron (Bounce Pad) ──
        const cauldronGroup = new THREE.Group();
        cauldronGroup.position.set(cx, 0, cy);

        // Iron Cauldron Pot
        const potGeo = new THREE.CylinderGeometry(w * 0.45, w * 0.35, 0.9, 20);
        const pot = new THREE.Mesh(potGeo, this.cauldronMaterial);
        pot.position.y = 0.45;
        pot.castShadow = true;
        pot.receiveShadow = true;
        cauldronGroup.add(pot);

        // Brass Rim
        const rimGeo = new THREE.TorusGeometry(w * 0.46, 0.06, 8, 20);
        const rimMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.7, roughness: 0.3 });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.9;
        cauldronGroup.add(rim);

        // Bubbling Cauldron Brew
        const brewGeo = new THREE.CircleGeometry(w * 0.42, 20);
        const brew = new THREE.Mesh(brewGeo, this.cauldronBrewMaterial);
        brew.rotation.x = -Math.PI / 2;
        brew.position.y = 0.86;
        cauldronGroup.add(brew);

        // Cauldron magical upward glow light
        const brewLight = new THREE.PointLight(PALETTE.cauldronBrew, 0.9, 4);
        brewLight.position.y = 1.1;
        cauldronGroup.add(brewLight);

        this.arenaGroup.add(cauldronGroup);
        this.bouncePadsMeshes.push(brew);

      } else {
        // ── Weathered Castle Ashlar Wall with Stone Coping ──
        const wallGroup = new THREE.Group();
        wallGroup.position.set(cx, 0, cy);

        // Base Stone Wall
        const geom = new THREE.BoxGeometry(w, 1.4, h);
        const wallMesh = new THREE.Mesh(geom, this.wallMaterial);
        wallMesh.position.y = 0.7;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        wallGroup.add(wallMesh);

        // Beveled Stone Coping Slab on Top
        const capGeom = new THREE.BoxGeometry(w + 0.16, 0.18, h + 0.16);
        const capMesh = new THREE.Mesh(capGeom, this.wallCopingMaterial);
        capMesh.position.y = 1.45;
        capMesh.castShadow = true;
        capMesh.receiveShadow = true;
        wallGroup.add(capMesh);

        // Brass Corner Brackets
        const bracketGeo = new THREE.BoxGeometry(0.12, 0.3, 0.12);
        const bracketMat = new THREE.MeshStandardMaterial({ color: 0xc8960a, metalness: 0.8, roughness: 0.2 });
        [-w / 2, w / 2].forEach(bx => {
          [-h / 2, h / 2].forEach(bz => {
            const bracket = new THREE.Mesh(bracketGeo, bracketMat);
            bracket.position.set(bx, 1.35, bz);
            wallGroup.add(bracket);
          });
        });

        // Add Heraldic House Banner on select wide inner walls
        if (w >= 3.0 && Math.abs(cx) < this.width / 2 - 2 && Math.abs(cy) < this.height / 2 - 2) {
          const bannerColor = bannerColors[(idx + Math.floor(Math.abs(cx))) % bannerColors.length];
          const bannerGeo = new THREE.PlaneGeometry(1.0, 1.2);
          const bannerMat = new THREE.MeshStandardMaterial({
            color: bannerColor,
            roughness: 0.6,
            side: THREE.DoubleSide
          });
          const banner = new THREE.Mesh(bannerGeo, bannerMat);
          banner.position.set(0, 0.75, h / 2 + 0.02);
          banner.castShadow = true;
          wallGroup.add(banner);

          // Golden banner pole
          const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
          const pole = new THREE.Mesh(poleGeo, bracketMat);
          pole.rotation.z = Math.PI / 2;
          pole.position.set(0, 1.35, h / 2 + 0.03);
          wallGroup.add(pole);
        }

        this.arenaGroup.add(wallGroup);
      }
    });

    // 3. Render Gothic Iron Portcullis Gates (Doors)
    this.doors.forEach((door) => {
      const w = door.maxX - door.minX;
      const h = door.maxY - door.minY;
      const cx = (door.minX + door.maxX) / 2;
      const cy = (door.minY + door.maxY) / 2;

      const doorGroup = new THREE.Group();
      doorGroup.position.set(cx, 0.75, cy);

      const geom = new THREE.BoxGeometry(w, 1.5, h);
      const mesh = new THREE.Mesh(geom, this.doorMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      doorGroup.add(mesh);

      // Gold Arcane Runes on Gate
      const runeBarGeo = new THREE.BoxGeometry(w * 0.8, 0.1, h + 0.04);
      const runeBarMat = new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xd4a020, emissiveIntensity: 0.6 });
      const runeBar = new THREE.Mesh(runeBarGeo, runeBarMat);
      doorGroup.add(runeBar);

      this.arenaGroup.add(doorGroup);
      door.mesh = doorGroup as any;
    });

    // 4. Render Mystical Runic Jump Pads
    this.jumpPads.forEach((pad) => {
      const padGroup = new THREE.Group();
      padGroup.position.set(pad.x, 0.02, pad.y);

      // Ancient Stone Base
      const baseGeo = new THREE.CylinderGeometry(pad.radius, pad.radius * 1.05, 0.08, 24);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a3e34, roughness: 0.8 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.04;
      padGroup.add(base);

      // Glowing Runic Dial
      const padGeo = new THREE.RingGeometry(pad.radius * 0.45, pad.radius * 0.9, 32);
      const padMat = new THREE.MeshBasicMaterial({
        color: PALETTE.jumpPad,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.position.y = 0.085;
      padGroup.add(padMesh);

      // Mystical Arrow Indicator
      const arrowGeo = new THREE.ConeGeometry(0.18, 0.45, 4);
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      const angle = Math.atan2(pad.launchVy, pad.launchVx);
      arrow.rotation.z = angle - Math.PI / 2;
      arrow.position.y = 0.09;
      padGroup.add(arrow);

      this.arenaGroup.add(padGroup);
      pad.mesh = padGroup as any;
    });

    // 5. Spawn Floating Enchanted Candles (Discworld / Hogwarts hallmark)
    const candleCount = this.mapType === 'CHAMBER' ? 18 : this.mapType === 'COLOSSEUM' ? 24 : 14;
    const candleWaxMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.35 });
    const candleFlameMat = new THREE.MeshBasicMaterial({ color: PALETTE.candleFlame });

    for (let i = 0; i < candleCount; i++) {
      const cGroup = new THREE.Group();
      const angle = (i / candleCount) * Math.PI * 2 + Math.random() * 0.2;
      const dist = 3.5 + Math.random() * (this.width / 2 - 5);
      const cx = Math.cos(angle) * dist;
      const cz = Math.sin(angle) * dist;
      const baseY = 2.2 + Math.random() * 1.5;

      // Wax body
      const candleH = 0.3 + Math.random() * 0.25;
      const waxGeo = new THREE.CylinderGeometry(0.045, 0.05, candleH, 8);
      const wax = new THREE.Mesh(waxGeo, candleWaxMat);
      wax.position.y = candleH / 2;
      wax.castShadow = true;
      cGroup.add(wax);

      // Flickering Flame Teardrop
      const flameGeo = new THREE.ConeGeometry(0.04, 0.1, 8);
      const flame = new THREE.Mesh(flameGeo, candleFlameMat);
      flame.position.y = candleH + 0.06;
      cGroup.add(flame);

      // Tiny warm glow point light on every few candles
      if (i % 3 === 0) {
        const cLight = new THREE.PointLight(PALETTE.candleFlame, 0.7, 4.5);
        cLight.position.y = candleH + 0.08;
        cGroup.add(cLight);
      }

      cGroup.position.set(cx, baseY, cz);
      this.arenaGroup.add(cGroup);
      this.floatingCandles.push({ mesh: cGroup, baseY, phase: Math.random() * Math.PI * 2 });
    }

    // 6. Rotating Gargoyle Shooting Statues (Hazards)
    this.hazards.forEach((hz) => {
      const group = new THREE.Group();

      const baseGeo = new THREE.BoxGeometry(1.2, 1.7, 1.2);
      const base = new THREE.Mesh(baseGeo, this.hazardMaterial);
      base.position.y = 0.85;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Stone Owl / Gargoyle Sentinel on top
      const headGeo = new THREE.SphereGeometry(0.35, 10, 10);
      const head = new THREE.Mesh(headGeo, this.hazardMaterial);
      head.position.y = 1.75;
      head.castShadow = true;
      group.add(head);

      // Glowing mystical eyes
      const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd23d });
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(0.3, 1.8, 0.14);
      group.add(eyeL);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(0.3, 1.8, -0.14);
      group.add(eyeR);

      // Brass dragon-head barrel
      const barrelGeo = new THREE.ConeGeometry(0.24, 0.9, 8);
      const barrel = new THREE.Mesh(barrelGeo, this.hazardBarrelMaterial);
      barrel.rotation.z = -Math.PI / 2;
      barrel.position.set(0.6, 1.5, 0);
      group.add(barrel);

      const hzLight = new THREE.PointLight(0xff7722, 1.2, 6);
      hzLight.position.set(0.7, 1.5, 0);
      group.add(hzLight);

      group.position.set(hz.x, 0, hz.y);
      this.arenaGroup.add(group);
      hz.mesh = group;
    });

    // 7. Render Gothic Moving Bookcases / Walls
    this.movingWalls.forEach((mw) => {
      const wallGroup = new THREE.Group();
      wallGroup.position.set(mw.baseX, 0, mw.baseY);

      const geom = new THREE.BoxGeometry(mw.halfW * 2, 1.5, mw.halfH * 2);
      const mesh = new THREE.Mesh(geom, this.movingWallMaterial);
      mesh.position.y = 0.75;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wallGroup.add(mesh);

      const capGeom = new THREE.BoxGeometry(mw.halfW * 2 + 0.12, 0.16, mw.halfH * 2 + 0.12);
      const capMesh = new THREE.Mesh(capGeom, this.wallCopingMaterial);
      capMesh.position.y = 1.48;
      wallGroup.add(capMesh);

      this.arenaGroup.add(wallGroup);
      mw.mesh = wallGroup as any;
    });

    // 8. Ambient Magic Embers & Dust Motes
    const particlesGeo = new THREE.BufferGeometry();
    const count = this.mapType === 'COLOSSEUM' ? 450 : this.mapType === 'CHAMBER' ? 250 : 350;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * (this.width + 10);
      positions[i + 1] = 0.2 + Math.random() * 8.0;
      positions[i + 2] = (Math.random() - 0.5) * (this.height + 10);
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMat = new THREE.PointsMaterial({
      size: 0.12,
      color: PALETTE.candleFlame,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    const starfield = new THREE.Points(particlesGeo, particlesMat);
    this.arenaGroup.add(starfield);
  }

  update(dt: number) {
    this.pulseTime += dt * 3.0;
    
    // Animate bubbling cauldron potion brew
    this.bouncePadsMeshes.forEach((brew) => {
      brew.rotation.z += dt * 0.8;
      const s = 1.0 + Math.sin(this.pulseTime * 2) * 0.04;
      brew.scale.set(s, s, 1.0);
    });

    // Animate Floating Enchanted Candles (gentle vertical bobbing)
    this.floatingCandles.forEach((c) => {
      const bob = Math.sin(this.pulseTime * 0.8 + c.phase) * 0.18;
      c.mesh.position.y = c.baseY + bob;
    });

    // Update doors timers and mesh height slides
    this.doors.forEach((door) => {
      door.timer += dt;

      if (door.isOpen) {
        if (door.timer >= door.openDuration) {
          door.isOpen = false;
          door.timer = 0;
          this.walls[door.wallIndex].isOpen = false;
        }
        if (door.mesh) {
          door.mesh.position.y += (-0.8 - door.mesh.position.y) * 8 * dt;
        }
      } else {
        if (door.timer >= door.closeDuration) {
          door.isOpen = true;
          door.timer = 0;
          this.walls[door.wallIndex].isOpen = true;
        }
        if (door.mesh) {
          door.mesh.position.y += (0.75 - door.mesh.position.y) * 8 * dt;
        }
      }
    });

    // Rotate jump pads
    this.jumpPads.forEach((pad) => {
      if (pad.mesh) {
        pad.mesh.rotation.y += dt * 0.9;
      }
    });

    // Rotate shooting statues and fire on interval
    this.hazards.forEach((hz) => {
      hz.angle += hz.rotateSpeed * dt;
      if (hz.mesh) hz.mesh.rotation.y = -hz.angle;
      hz.fireTimer -= dt;
      if (hz.fireTimer <= 0) {
        hz.fireTimer = hz.fireInterval;
        const sx = hz.x + Math.cos(hz.angle) * hz.fireRadius;
        const sy = hz.y + Math.sin(hz.angle) * hz.fireRadius;
        this.onHazardFire?.(sx, sy, hz.angle);
      }
    });

    // Slide moving walls and update their physics AABB live
    this.movingWalls.forEach((mw) => {
      const offset = Math.sin(this.pulseTime * mw.speed + mw.phase) * mw.range;
      const cx = mw.baseX + (mw.axis === 'x' ? offset : 0);
      const cy = mw.baseY + (mw.axis === 'y' ? offset : 0);
      const wall = this.walls[mw.wallIndex];
      wall.minX = cx - mw.halfW;
      wall.maxX = cx + mw.halfW;
      wall.minY = cy - mw.halfH;
      wall.maxY = cy + mw.halfH;
      if (mw.mesh) mw.mesh.position.set(cx, 0.75, cy);
    });
  }

  destroy(scene: THREE.Scene) {
    scene.remove(this.arenaGroup);
    this.arenaGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.bouncePadsMeshes = [];
    this.floatingCandles = [];
    this.doors = [];
    this.jumpPads = [];
    this.hazards = [];
    this.movingWalls = [];
  }
}
