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

export const POWERUP_SYMBOLS: Record<PowerUpType, string> = {
  BOUNCE: '↻',
  PIERCE: '➤',
  SPLIT: 'Y',
  HASTE: '»',
  SHIELD: '⬡',
  FREEZE: '✦',
  WALLRUN: '∿'
};

function createSymbolTexture(type: PowerUpType, color: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const cssColor = `#${color.toString(16).padStart(6, '0')}`;
    context.fillStyle = 'rgba(5, 8, 18, 0.88)';
    context.beginPath();
    context.arc(64, 64, 52, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = cssColor;
    context.lineWidth = 8;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = '900 72px Outfit, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(POWERUP_SYMBOLS[type], 64, 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class PowerUp extends Entity {
  type: PowerUpType;
  private hoverTime: number = Math.random() * 100;
  private symbolTexture: THREE.CanvasTexture;
  private symbolMaterial: THREE.SpriteMaterial;

  constructor(x: number, y: number, type: PowerUpType) {
    // Visual representation: floating glowing diamond
    const group = new THREE.Group();
    const color = POWERUP_COLORS[type];

    // Core shape
    const geometry = new THREE.OctahedronGeometry(0.4, 0);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.8
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    group.add(mesh);

    // Inner glowing core
    const innerGeom = new THREE.OctahedronGeometry(0.2, 0);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const innerMesh = new THREE.Mesh(innerGeom, innerMat);
    group.add(innerMesh);

    // Ring around the diamond
    const ringGeom = new THREE.RingGeometry(0.5, 0.6, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const symbolTexture = createSymbolTexture(type, color);
    const symbolMaterial = new THREE.SpriteMaterial({ map: symbolTexture, transparent: true, depthWrite: false });
    const symbol = new THREE.Sprite(symbolMaterial);
    symbol.position.y = 0.65;
    symbol.scale.set(0.72, 0.72, 0.72);
    group.add(symbol);

    super(x, y, 0.4, group);
    this.type = type;
    this.symbolTexture = symbolTexture;
    this.symbolMaterial = symbolMaterial;
    this.mesh.position.y = 0.5; // Hover height
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

  destroy(scene: THREE.Scene) {
    this.symbolTexture.dispose();
    this.symbolMaterial.dispose();
    super.destroy(scene);
  }
}
