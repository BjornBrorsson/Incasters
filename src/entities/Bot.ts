import { Caster } from './Caster';
import { Projectile } from './Projectile';
import { PowerUp } from './PowerUp';
import { type AABB, testCircleVsAABB } from '../engine/Physics';

export class Bot extends Caster {
  private targetCaster: Caster | null = null;
  private stateTimer: number = 0;
  private dodgeTimer: number = 0;
  private dodgeVx: number = 0;
  private dodgeVy: number = 0;

  constructor(id: string, name: string, x: number, y: number, team: 'RED' | 'BLUE' | 'GOLD', clothingColor?: number, spellColor?: number) {
    super(id, name, x, y, team, true, clothingColor, spellColor);
  }

  aiUpdate(
    dt: number,
    allCasters: Caster[],
    projectiles: Projectile[],
    powerups: PowerUp[],
    walls: AABB[],
    coinsList: { x: number; y: number; mesh: any }[],
    safeRadius: number // Last Caster Standing mode
  ) {
    if (this.isDead) return;

    this.stateTimer -= dt;

    // 1. Scan for incoming hostile projectiles that are heading towards this bot
    let dangerousProj: Projectile | null = null;
    let minDodgeDist = 4.5;
    
    projectiles.forEach((proj) => {
      if (proj.ownerId === this.id) return;
      
      const dx = this.x - proj.x;
      const dy = this.y - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < minDodgeDist) {
        // Check if moving towards us (dot product of relative pos and velocity is negative)
        const dot = dx * proj.vx + dy * proj.vy;
        if (dot > 0.1) { // Moving in our general direction
          dangerousProj = proj;
          minDodgeDist = dist;
        }
      }
    });

    // Handle dodging state
    if (dangerousProj !== null) {
      const proj: Projectile = dangerousProj;
      // Move perpendicular to projectile velocity to dodge
      // Perpendicular vector: (-vy, vx)
      const px = -proj.vy;
      const py = proj.vx;
      const length = Math.sqrt(px * px + py * py) || 1;
      
      this.dodgeVx = (px / length) * this.getSpeed();
      this.dodgeVy = (py / length) * this.getSpeed();

      // Randomly switch direction of perp vector
      if (Math.random() < 0.05 && this.dodgeTimer <= 0) {
        this.dodgeVx = -this.dodgeVx;
        this.dodgeVy = -this.dodgeVy;
      }

      // Occassionally dash if projectile is extremely close and cooldown is up
      if (minDodgeDist < 2.0 && this.dashCooldownTimer <= 0 && Math.random() < 0.3) {
        this.dash(this.dodgeVx, this.dodgeVy);
      }

      this.vx = this.dodgeVx;
      this.vy = this.dodgeVy;
    } else {
      // 2. Regular AI behavior (Fight / Hunt powerup / Collect coins / Patrol)
      
      // Keep within the safe zone if active (Battle Royale shrinking ring)
      const distToCenter = Math.sqrt(this.x * this.x + this.y * this.y);
      const isNearFireRing = safeRadius > 0 && distToCenter > safeRadius - 3.5;

      if (isNearFireRing) {
        // Force move to center
        const angleToCenter = Math.atan2(-this.y, -this.x);
        this.vx = Math.cos(angleToCenter) * this.getSpeed();
        this.vy = Math.sin(angleToCenter) * this.getSpeed();
        this.aimAngle = angleToCenter;
      } else {
        // Select nearest enemy
        this.targetCaster = this.findNearestEnemy(allCasters);

        if (this.targetCaster) {
          const dx = this.targetCaster.x - this.x;
          const dy = this.targetCaster.y - this.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Decide action based on distance
          if (distance < 12) {
            this.aimAngle = Math.atan2(dy, dx);

            // Move towards enemy, but keep a comfortable distance
            const targetSpeed = this.getSpeed();
            if (distance > 6.5) {
              // Move closer
              this.vx = Math.cos(this.aimAngle) * targetSpeed * 0.75;
              this.vy = Math.sin(this.aimAngle) * targetSpeed * 0.75;
            } else if (distance < 3.5) {
              // Move back
              this.vx = -Math.cos(this.aimAngle) * targetSpeed * 0.75;
              this.vy = -Math.sin(this.aimAngle) * targetSpeed * 0.75;
            } else {
              // Circle strafe
              this.vx = -Math.sin(this.aimAngle) * targetSpeed * 0.6;
              this.vy = Math.cos(this.aimAngle) * targetSpeed * 0.6;
            }

            // Decide to shoot
            if (this.shootTimer <= 0 && this.ammo > 0) {
              // Outcasters Curved Shot logic:
              // Check if line of sight is clear
              const isLoSBlocked = this.checkLoSBlocked(this.targetCaster.x, this.targetCaster.y, walls);
              
              if (isLoSBlocked) {
                // Deliberately shoot at an angle offset (e.g. 25 degrees) to clear obstacles
                const shootOffset = (Math.random() < 0.5 ? -1 : 1) * (25 * Math.PI / 180);
                const fireAngle = this.aimAngle + shootOffset;
                
                // Let the engine know we want to fire a curved shot
                // The main game loop will handle spawning the projectile and setting its targetPoint
                this.shootCurvedProj(fireAngle, this.targetCaster);
              } else {
                // Clear shot
                this.shootCurvedProj(this.aimAngle, null);
              }
            }
          } else {
            // Enemy too far, hunt power-ups or coins
            this.huntResources(powerups, coinsList, () => {
              // Fallback to moving towards enemy if nothing else to collect
              const speed = this.getSpeed();
              const angle = Math.atan2(dy, dx);
              this.vx = Math.cos(angle) * speed * 0.7;
              this.vy = Math.sin(angle) * speed * 0.7;
              this.aimAngle = angle;
            });
          }
        } else {
          // No targets left (won or alone), hunt resources or patrol
          this.huntResources(powerups, coinsList, () => {
            // Slow random patrol
            if (this.stateTimer <= 0) {
              this.stateTimer = 1.5 + Math.random() * 2;
              const angle = Math.random() * Math.PI * 2;
              const speed = this.getSpeed();
              this.vx = Math.cos(angle) * speed * 0.4;
              this.vy = Math.sin(angle) * speed * 0.4;
              this.aimAngle = angle;
            }
          });
        }
      }
    }

    // Call base class update to apply movement and animation
    super.update(dt);
  }

  private findNearestEnemy(casters: Caster[]): Caster | null {
    let nearest: Caster | null = null;
    let minDist = Infinity;

    casters.forEach((c) => {
      if (c.id === this.id || c.isDead) return;
      
      // If team mode is active, don't shoot teammates
      if (this.team !== 'GOLD' && c.team === this.team) return;

      const dx = c.x - this.x;
      const dy = c.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        minDist = dist;
        nearest = c;
      }
    });

    return nearest;
  }

  private huntResources(
    powerups: PowerUp[],
    coinsList: { x: number; y: number }[],
    fallback: () => void
  ) {
    let nearestRes: { x: number; y: number } | null = null;
    let minDist = Infinity;

    // First priority: Power-ups
    powerups.forEach((pu) => {
      const dx = pu.x - this.x;
      const dy = pu.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist && dist < 15) {
        minDist = dist;
        nearestRes = pu;
      }
    });

    // Second priority: Coins (if close)
    if (!nearestRes) {
      coinsList.forEach((coin) => {
        const dx = coin.x - this.x;
        const dy = coin.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist < 12) {
          minDist = dist;
          nearestRes = coin;
        }
      });
    }

    if (nearestRes) {
      const angle = Math.atan2((nearestRes as any).y - this.y, (nearestRes as any).x - this.x);
      const speed = this.getSpeed();
      this.vx = Math.cos(angle) * speed * 0.85;
      this.vy = Math.sin(angle) * speed * 0.85;
      this.aimAngle = angle;
    } else {
      fallback();
    }
  }

  private checkLoSBlocked(tx: number, ty: number, walls: AABB[]): boolean {
    // Cast a quick ray to check if we intersect any wall AABB
    // We can approximate by checking points along the line segment
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const checkX = this.x + (tx - this.x) * t;
      const checkY = this.y + (ty - this.y) * t;
      
      const tempCircle = { x: checkX, y: checkY, radius: this.radius };
      for (const wall of walls) {
        if (testCircleVsAABB(tempCircle, wall).collided) {
          return true; // Blocked!
        }
      }
    }
    return false;
  }

  // Event hook filled by the Game Manager
  public onAiShoot: ((angle: number, targetCaster: Caster | null) => void) | null = null;

  private shootCurvedProj(angle: number, target: Caster | null) {
    if (this.onAiShoot) {
      this.onAiShoot(angle, target);
      this.shootTimer = this.getFireRateCooldown();
    }
  }
}
