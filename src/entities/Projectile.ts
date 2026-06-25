import * as THREE from 'three';
import { Entity } from './Entity';
import { reflectVector } from '../engine/Physics';
import { sfx } from '../engine/Audio';

export interface ProjectileStats {
  damage: number;
  speed: number;
  maxBounces: number;
  maxPierces: number;
  splitLevel: number;
  color: number;
  freezeLevel?: number; // Optional freeze slow stacks
}

export class Projectile extends Entity {
  ownerId: string;
  stats: ProjectileStats;
  bouncesRemaining: number;
  piercesRemaining: number;
  splitLevel: number;
  hitCasterIds: Set<string> = new Set();
  
  // Ribbon trail particles metadata
  trailColor: number;
  
  // Keep track of the active curving steer direction (-1 for left, 1 for right, 0 for none)
  // or a target point (x, y)
  steerDirection: number = 0;
  targetPoint: { x: number; y: number } | null = null;
  curvingSpeed: number = 3.8; // Rad per second

  constructor(
    x: number,
    y: number,
    angle: number,
    ownerId: string,
    stats: ProjectileStats
  ) {
    const color = stats.color;
    
    // Create glowing projectile visual group
    const group = new THREE.Group();
    
    // Core sphere
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(geometry, material);
    group.add(core);

    // Glowing envelope
    const glowGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.5
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    group.add(glow);

    // Small point light for visual glow
    const light = new THREE.PointLight(color, 2, 2.5);
    light.position.y = 0.2;
    group.add(light);

    super(x, y, 0.25, group);
    
    this.ownerId = ownerId;
    this.stats = stats;
    this.bouncesRemaining = stats.maxBounces;
    this.piercesRemaining = stats.maxPierces;
    this.splitLevel = stats.splitLevel;
    this.trailColor = color;

    // Set initial velocity
    this.vx = Math.cos(angle) * stats.speed;
    this.vy = Math.sin(angle) * stats.speed;

    this.mesh.position.y = 0.5; // Fly height
  }

  update(dt: number) {
    // 1. Curving shot logic (steering or target tracking)
    let currentAngle = Math.atan2(this.vy, this.vx);
    const speed = this.stats.speed;

    if (this.targetPoint !== null) {
      // Curve towards the target point
      const targetAngle = Math.atan2(
        this.targetPoint.y - this.y,
        this.targetPoint.x - this.x
      );
      
      // Calculate angular difference
      let angleDiff = targetAngle - currentAngle;
      
      // Normalize angle to -PI to PI
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      // Limit turning rate
      const maxTurn = this.curvingSpeed * dt;
      if (Math.abs(angleDiff) > maxTurn) {
        currentAngle += Math.sign(angleDiff) * maxTurn;
      } else {
        currentAngle = targetAngle;
      }
    } else if (this.steerDirection !== 0) {
      // Manual steering (rotate velocity vector left or right)
      currentAngle += this.steerDirection * this.curvingSpeed * dt;
    }

    // Apply updated angle to velocity
    this.vx = Math.cos(currentAngle) * speed;
    this.vy = Math.sin(currentAngle) * speed;

    super.update(dt);
  }

  handleWallCollision(normalX: number, normalY: number) {
    if (this.bouncesRemaining > 0) {
      // Reflect projectile
      const reflected = reflectVector(this.vx, this.vy, normalX, normalY, 1.0);
      this.vx = reflected.x;
      this.vy = reflected.y;
      this.bouncesRemaining--;
      sfx.playBounce();
    } else {
      // Explode
      this.isDead = true;
    }
  }

  registerCasterHit(casterId: string): boolean {
    if (this.hitCasterIds.has(casterId)) {
      return false; // Already hit this caster (piercing through)
    }
    
    this.hitCasterIds.add(casterId);
    
    if (this.piercesRemaining > 0) {
      this.piercesRemaining--;
    } else {
      this.isDead = true;
    }
    return true;
  }
}
