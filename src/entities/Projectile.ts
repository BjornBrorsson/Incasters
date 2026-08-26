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
  isFrostShards?: boolean;
  isPermafrostRicochet?: boolean;
  isPiercingShards?: boolean;
  isOrbitalGlide?: boolean;
}

// Static shared projectile geometries and materials to avoid WebGL buffer thrashing
const SHARED_CORE_GEO = new THREE.SphereGeometry(0.18, 6, 6);
const SHARED_GLOW_GEO = new THREE.SphereGeometry(0.32, 8, 6);
const SHARED_RING_GEO = new THREE.RingGeometry(0.24, 0.36, 12);
const SHARED_CORE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const SHARED_STAR_RING_MAT = new THREE.MeshBasicMaterial({
  color: 0xffe259,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.75
});
const PROJ_GLOW_MAT_CACHE = new Map<number, THREE.MeshBasicMaterial>();

function getCachedGlowMaterial(color: number): THREE.MeshBasicMaterial {
  let mat = PROJ_GLOW_MAT_CACHE.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55
    });
    PROJ_GLOW_MAT_CACHE.set(color, mat);
  }
  return mat;
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
  initialAngle: number = 0;
  totalTurnAngle: number = 0;
  hasCurved: boolean = false;

  constructor(
    x: number,
    y: number,
    angle: number,
    ownerId: string,
    stats: ProjectileStats
  ) {
    const color = stats.color;
    
    // Create glowing wand-spark projectile visual group using shared static geometries
    const group = new THREE.Group();
    
    // Core white-hot spark sphere
    const core = new THREE.Mesh(SHARED_CORE_GEO, SHARED_CORE_MAT);
    group.add(core);

    // Glowing elemental aura
    const glow = new THREE.Mesh(SHARED_GLOW_GEO, getCachedGlowMaterial(color));
    group.add(glow);

    // Orbiting celestial stardust ring (Discworld / Pokemon star spark)
    const starRing = new THREE.Mesh(SHARED_RING_GEO, SHARED_STAR_RING_MAT);
    starRing.rotation.x = Math.PI / 3;
    group.add(starRing);

    super(x, y, 0.25, group);
    
    this.ownerId = ownerId;
    this.stats = stats;
    this.bouncesRemaining = stats.maxBounces;
    this.piercesRemaining = stats.maxPierces;
    this.splitLevel = stats.splitLevel;
    this.wallRunLevel = stats.wallRunLevel || 0;
    this.trailColor = color;
    this.initialAngle = angle;

    // Set initial velocity
    this.vx = Math.cos(angle) * stats.speed;
    this.vy = Math.sin(angle) * stats.speed;

    this.mesh.position.y = 0.55; // Fly height
  }

  override destroy(scene: THREE.Scene) {
    // Simply remove mesh from scene without disposing shared static geometries/materials
    scene.remove(this.mesh);
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
      let turn = 0;
      if (Math.abs(angleDiff) > maxTurn) {
        turn = Math.sign(angleDiff) * maxTurn;
        currentAngle += turn;
      } else {
        turn = angleDiff;
        currentAngle = targetAngle;
      }
      this.totalTurnAngle += Math.abs(turn);
      if (this.totalTurnAngle >= 0.25) {
        this.hasCurved = true;
      }
    } else if (this.steerDirection !== 0) {
      // Manual steering (rotate velocity vector left or right)
      const turn = this.steerDirection * this.curvingSpeed * dt;
      currentAngle += turn;
      this.totalTurnAngle += Math.abs(turn);
      if (this.totalTurnAngle >= 0.25) {
        this.hasCurved = true;
      }
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
      const baseSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || this.stats.speed;
      const speed = this.stats.isOrbitalGlide ? baseSpeed * 1.25 : baseSpeed;
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
      if (firstWallContact) {
        sfx.playWallRun(this.ownerId === 'player' ? 0.9 : 0.4);
      }
      return;
    }

    if (this.bouncesRemaining > 0) {
      // Reflect projectile
      const reflected = reflectVector(this.vx, this.vy, normalX, normalY, 1.0);
      this.vx = reflected.x;
      this.vy = reflected.y;
      this.bouncesRemaining--;
      sfx.playBounce(this.ownerId === 'player' ? 0.9 : 0.4);
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
      sfx.playPierce(this.ownerId === 'player' ? 0.9 : 0.4);
    } else {
      this.isDead = true;
      this.playFizzleOnDestroy = true;
    }
    return true;
  }
}
