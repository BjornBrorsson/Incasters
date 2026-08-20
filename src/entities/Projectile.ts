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
  wallRunLevel?: number; // Optional wall-gliding stacks
}

export class Projectile extends Entity {
  ownerId: string;
  stats: ProjectileStats;
  bouncesRemaining: number;
  piercesRemaining: number;
  splitLevel: number;
  wallRunLevel: number;
  isWallRunning: boolean = false;
  age: number = 0;
  playFizzleOnDestroy: boolean = false;
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

    super(x, y, 0.25, group);
    
    this.ownerId = ownerId;
    this.stats = stats;
    this.bouncesRemaining = stats.maxBounces;
    this.piercesRemaining = stats.maxPierces;
    this.splitLevel = stats.splitLevel;
    this.wallRunLevel = stats.wallRunLevel || 0;
    this.trailColor = color;

    // Set initial velocity
    this.vx = Math.cos(angle) * stats.speed;
    this.vy = Math.sin(angle) * stats.speed;

    this.mesh.position.y = 0.5; // Fly height
  }

  update(dt: number) {
    // Safety lifetime so wall-running / bouncing shots can never live forever
    this.age += dt;
    if (this.age > 8 && !this.isDead) {
      this.isDead = true;
      this.playFizzleOnDestroy = true;
    }

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

  handleWallCollision(normalX: number, normalY: number, overlapX: number = 0, overlapY: number = 0) {
    // Wallrunner: glide along the wall surface instead of bouncing or exploding
    if (this.wallRunLevel > 0) {
      const firstWallContact = !this.isWallRunning;

      // Push out to the wall surface
      this.x += overlapX;
      this.y += overlapY;

      // Project the velocity onto the wall tangent (perpendicular to the normal)
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || this.stats.speed;
      let tx = -normalY;
      let ty = normalX;
      if (this.vx * tx + this.vy * ty < 0) {
        tx = -tx;
        ty = -ty;
      }
      this.vx = tx * speed;
      this.vy = ty * speed;

      // Commit to the wall: stop any curving / guidance
      this.targetPoint = null;
      this.steerDirection = 0;
      this.isWallRunning = true;
      if (firstWallContact) sfx.playWallHit(this.ownerId === 'player' ? 0.85 : 0.3);
      return;
    }

    if (this.bouncesRemaining > 0) {
      // Reflect projectile
      const reflected = reflectVector(this.vx, this.vy, normalX, normalY, 1.0);
      this.vx = reflected.x;
      this.vy = reflected.y;
      this.bouncesRemaining--;
      sfx.playWallHit(this.ownerId === 'player' ? 0.85 : 0.3);
    } else {
      // Explode
      this.isDead = true;
      this.playFizzleOnDestroy = true;
      sfx.playWallHit(this.ownerId === 'player' ? 0.85 : 0.3);
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
      this.playFizzleOnDestroy = true;
    }
    return true;
  }
}
