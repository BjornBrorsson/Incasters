import * as THREE from 'three';
import { Entity } from './Entity';

export type PowerUpType = 'BOUNCE' | 'PIERCE' | 'SPLIT' | 'HASTE' | 'SHIELD' | 'FREEZE' | 'WALLRUN';
export const PowerUpType = {
  BOUNCE: 'BOUNCE' as PowerUpType,
  PIERCE: 'PIERCE' as PowerUpType,
  SPLIT: 'SPLIT' as PowerUpType,
  HASTE: 'HASTE' as PowerUpType,
  SHIELD: 'SHIELD' as PowerUpType,
  FREEZE: 'FREEZE' as PowerUpType,
  WALLRUN: 'WALLRUN' as PowerUpType
};


export const POWERUP_COLORS: Record<PowerUpType, number> = {
  BOUNCE: 0xffaa00, // Neon Orange
  PIERCE: 0xaa00ff, // Purple
  SPLIT: 0x00dfff,  // Neon Cyan
  HASTE: 0x39ff14,  // Neon Green
  SHIELD: 0xffffff, // White
  FREEZE: 0x4df0ff, // Ice Blue
  WALLRUN: 0x00e0b0 // Teal (hugs walls)
};

export const POWERUP_NAMES: Record<PowerUpType, string> = {
  BOUNCE: 'BOUNCE',
  PIERCE: 'PIERCE',
  SPLIT: 'SPLIT',
  HASTE: 'HASTE',
  SHIELD: 'SHIELD',
  FREEZE: 'FREEZE',
  WALLRUN: 'WALL-RUN'
};

export const POWERUP_SYMBOLS: Record<PowerUpType, string> = {
  BOUNCE: '⚡↪',
  PIERCE: '🏹',
  SPLIT: 'ᛦ',
  HASTE: '⚡',
  SHIELD: '🛡️',
  FREEZE: '❄️',
  WALLRUN: '〰️'
};

function createSymbolTexture(type: PowerUpType, color: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cssColor = `#${color.toString(16).padStart(6, '0')}`;
    
    // 1. Outer circular badge background
    ctx.fillStyle = 'rgba(12, 16, 28, 0.92)';
    ctx.beginPath();
    ctx.arc(128, 128, 116, 0, Math.PI * 2);
    ctx.fill();

    // Glowing border ring
    ctx.strokeStyle = cssColor;
    ctx.lineWidth = 10;
    ctx.shadowColor = cssColor;
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 2. Custom Icon Graphics (unmistakable at any distance)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === 'BOUNCE') {
      // Wall on right
      ctx.fillStyle = cssColor;
      ctx.fillRect(180, 50, 16, 80);
      // Arrow bouncing off wall
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(60, 115);
      ctx.lineTo(170, 90);
      ctx.lineTo(60, 65);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(85, 50);
      ctx.lineTo(60, 65);
      ctx.lineTo(85, 80);
      ctx.stroke();
    } else if (type === 'SPLIT') {
      // 3-way spread arrows
      ctx.strokeStyle = cssColor;
      ctx.beginPath();
      ctx.moveTo(128, 135);
      ctx.lineTo(128, 55); // center
      ctx.moveTo(128, 135);
      ctx.lineTo(68, 70); // left
      ctx.moveTo(128, 135);
      ctx.lineTo(188, 70); // right
      ctx.stroke();
      // 3 arrow tips
      ctx.fillStyle = '#ffffff';
      [ {x: 128, y: 50}, {x: 65, y: 65}, {x: 191, y: 65} ].forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (type === 'PIERCE') {
      // Target ring pierced by central spear
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(128, 90, 30, 0, Math.PI * 2);
      ctx.stroke();
      // Piercing spear
      ctx.strokeStyle = cssColor;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(50, 130);
      ctx.lineTo(206, 50);
      ctx.stroke();
      // Arrowhead
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(215, 45);
      ctx.lineTo(180, 48);
      ctx.lineTo(200, 75);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'HASTE') {
      // Dual lightning bolts / speed wings
      ctx.fillStyle = cssColor;
      ctx.beginPath();
      ctx.moveTo(135, 45);
      ctx.lineTo(95, 95);
      ctx.lineTo(130, 95);
      ctx.lineTo(120, 140);
      ctx.lineTo(165, 85);
      ctx.lineTo(130, 85);
      ctx.closePath();
      ctx.fill();
      // Speed streaks
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(60, 75); ctx.lineTo(90, 75);
      ctx.moveTo(50, 95); ctx.lineTo(85, 95);
      ctx.moveTo(65, 115); ctx.lineTo(100, 115);
      ctx.stroke();
    } else if (type === 'SHIELD') {
      // Hexagonal barrier shield
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.strokeStyle = cssColor;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(128, 48);
      ctx.lineTo(185, 75);
      ctx.lineTo(185, 115);
      ctx.lineTo(128, 142);
      ctx.lineTo(71, 115);
      ctx.lineTo(71, 75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Inner cross/star
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(128, 65); ctx.lineTo(128, 125);
      ctx.moveTo(98, 95); ctx.lineTo(158, 95);
      ctx.stroke();
    } else if (type === 'FREEZE') {
      // 6-point snowflake crystal
      ctx.strokeStyle = cssColor;
      ctx.lineWidth = 8;
      for (let i = 0; i < 3; i++) {
        const rad = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(128 - Math.cos(rad) * 45, 92 - Math.sin(rad) * 45);
        ctx.lineTo(128 + Math.cos(rad) * 45, 92 + Math.sin(rad) * 45);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(128, 92, 9, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'WALLRUN') {
      // Wall block + hugging wave arrow
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(80, 55, 96, 75);
      ctx.strokeStyle = cssColor;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(55, 130);
      ctx.lineTo(55, 55);
      ctx.lineTo(195, 55);
      ctx.stroke();
      // Arrowhead
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(205, 55);
      ctx.lineTo(180, 42);
      ctx.lineTo(180, 68);
      ctx.closePath();
      ctx.fill();
    }

    // 3. Bold Text Pill Label at bottom
    ctx.fillStyle = cssColor;
    ctx.beginPath();
    ctx.roundRect(38, 168, 180, 48, 24);
    ctx.fill();

    ctx.fillStyle = '#0a0d18';
    ctx.font = '900 24px Outfit, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWERUP_NAMES[type], 128, 192);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const POWERUP_TEXTURE_CACHE = new Map<PowerUpType, THREE.CanvasTexture>();
const POWERUP_SPRITE_MAT_CACHE = new Map<PowerUpType, THREE.SpriteMaterial>();
const POWERUP_STANDARD_MAT_CACHE = new Map<PowerUpType, THREE.MeshStandardMaterial>();
const POWERUP_RING_MAT_CACHE = new Map<PowerUpType, THREE.MeshBasicMaterial>();
const POWERUP_GROUND_MAT_CACHE = new Map<PowerUpType, THREE.MeshBasicMaterial>();

const SHARED_OCTAHEDRON_GEO = new THREE.OctahedronGeometry(0.4, 0);
const SHARED_INNER_OCTAHEDRON_GEO = new THREE.OctahedronGeometry(0.2, 0);
const SHARED_INNER_WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const SHARED_POWERUP_RING_GEO = new THREE.RingGeometry(0.5, 0.6, 16);
const SHARED_POWERUP_GROUND_RING_GEO = new THREE.RingGeometry(0.45, 0.7, 16);

function getPowerUpTexture(type: PowerUpType): THREE.CanvasTexture {
  let tex = POWERUP_TEXTURE_CACHE.get(type);
  if (!tex) {
    tex = createSymbolTexture(type, POWERUP_COLORS[type]);
    POWERUP_TEXTURE_CACHE.set(type, tex);
  }
  return tex;
}

function getPowerUpSpriteMaterial(type: PowerUpType): THREE.SpriteMaterial {
  let mat = POWERUP_SPRITE_MAT_CACHE.get(type);
  if (!mat) {
    mat = new THREE.SpriteMaterial({ map: getPowerUpTexture(type), transparent: true, depthWrite: false });
    POWERUP_SPRITE_MAT_CACHE.set(type, mat);
  }
  return mat;
}

function getPowerUpStandardMaterial(type: PowerUpType): THREE.MeshStandardMaterial {
  let mat = POWERUP_STANDARD_MAT_CACHE.get(type);
  if (!mat) {
    const color = POWERUP_COLORS[type];
    mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.8
    });
    POWERUP_STANDARD_MAT_CACHE.set(type, mat);
  }
  return mat;
}

function getPowerUpRingMaterial(type: PowerUpType): THREE.MeshBasicMaterial {
  let mat = POWERUP_RING_MAT_CACHE.get(type);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: POWERUP_COLORS[type], side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    POWERUP_RING_MAT_CACHE.set(type, mat);
  }
  return mat;
}

function getPowerUpGroundMaterial(type: PowerUpType): THREE.MeshBasicMaterial {
  let mat = POWERUP_GROUND_MAT_CACHE.get(type);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: POWERUP_COLORS[type], side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    POWERUP_GROUND_MAT_CACHE.set(type, mat);
  }
  return mat;
}

export class PowerUp extends Entity {
  type: PowerUpType;
  private hoverTime: number = Math.random() * 100;

  constructor(x: number, y: number, type: PowerUpType) {
    // Visual representation: floating glowing diamond using cached assets
    const group = new THREE.Group();

    // Core shape
    const mesh = new THREE.Mesh(SHARED_OCTAHEDRON_GEO, getPowerUpStandardMaterial(type));
    mesh.castShadow = true;
    group.add(mesh);

    // Inner glowing core
    const innerMesh = new THREE.Mesh(SHARED_INNER_OCTAHEDRON_GEO, SHARED_INNER_WHITE_MAT);
    group.add(innerMesh);

    // Ring around the diamond
    const ring = new THREE.Mesh(SHARED_POWERUP_RING_GEO, getPowerUpRingMaterial(type));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const symbol = new THREE.Sprite(getPowerUpSpriteMaterial(type));
    symbol.position.y = 0.82;
    symbol.scale.set(0.92, 0.92, 0.92);
    group.add(symbol);

    // Ground aura ring
    const groundRing = new THREE.Mesh(SHARED_POWERUP_GROUND_RING_GEO, getPowerUpGroundMaterial(type));
    groundRing.rotation.x = Math.PI / 2;
    groundRing.position.y = -0.45;
    group.add(groundRing);

    super(x, y, 0.45, group);
    this.type = type;
    this.mesh.position.y = 0.55; // Hover height
  }

  update(dt: number) {
    super.update(dt);
    this.hoverTime += dt * 3;

    // Hover effect
    this.mesh.position.y = 0.5 + Math.sin(this.hoverTime) * 0.15;

    // Spinning effect
    const model = this.mesh.children[0];
    if (model) {
      model.rotation.y += dt * 2;
      model.rotation.x += dt * 0.5;
    }
    const ring = this.mesh.children[2];
    if (ring) {
      ring.rotation.z -= dt * 1.5;
    }
  }

  override destroy(scene: THREE.Scene) {
    // Remove mesh without destroying cached textures / materials / geometries
    scene.remove(this.mesh);
  }
}
