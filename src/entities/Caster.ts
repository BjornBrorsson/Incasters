import * as THREE from 'three';
import { Entity } from './Entity';
import { PowerUpType, POWERUP_COLORS } from './PowerUp';
import type { ProjectileStats } from './Projectile';
import { sfx } from '../engine/Audio';

export class Caster extends Entity {
  id: string;
  name: string;
  team: 'RED' | 'BLUE' | 'GOLD';
  isBot: boolean;
  
  // Game Stats
  health: number = 100;
  maxHealth: number = 100;
  isDead: boolean = false;
  coins: number = 0;
  score: number = 0;
  deaths: number = 0;
  
  // Dash / Dodge Mechanics
  dashCooldown: number = 1.5; // seconds
  dashCooldownTimer: number = 0;
  dashDuration: number = 0.18; // seconds
  dashTimer: number = 0;
  isDashing: boolean = false;
  dashSpeedMultiplier: number = 2.5;
  dashVx: number = 0;
  dashVy: number = 0;

  // Shooting Cooldowns
  shootCooldown: number = 0.45; // seconds
  shootTimer: number = 0;
  ammo: number = 3;
  maxAmmo: number = 3;
  timeSinceLastShot: number = 0;

  // Power-ups (Type -> Stack Level 1, 2, or 3)
  powerups: Map<PowerUpType, number> = new Map();
  powerupSlotsOrder: PowerUpType[] = [];

  // Aiming direction
  aimAngle: number = 0;

  // Visuals reference
  staffMesh: THREE.Object3D | null = null;
  bodyGroup: THREE.Group;
  robeMesh: THREE.Mesh | null = null;
  hatBrimMesh: THREE.Mesh | null = null;
  shieldMesh: THREE.Mesh | null = null;
  clothingColor!: number;
  spellColor!: number;
  private wobbleTime: number = 0;

  // Leap Mechanics
  isLeaping: boolean = false;
  leapTimer: number = 0;
  leapDuration: number = 0.8;
  leapVx: number = 0;
  leapVy: number = 0;
  leapYOffset: number = 0;

  // Freeze Mechanics
  freezeTimer: number = 0;
  freezeLevel: number = 0;

  constructor(
    id: string,
    name: string,
    x: number,
    y: number,
    team: 'RED' | 'BLUE' | 'GOLD',
    isBot: boolean,
    clothingColor?: number,
    spellColor?: number
  ) {
    const bodyGroup = new THREE.Group();

    // Determine initial colors
    const defaultClothing = team === 'RED' ? 0xff1122 : team === 'BLUE' ? 0x0044ff : 0xffcc00;
    const defaultSpell = team === 'RED' ? 0xff3355 : team === 'BLUE' ? 0x3388ff : 0xffcc00;

    const finalClothing = clothingColor !== undefined ? clothingColor : defaultClothing;
    const finalSpell = spellColor !== undefined ? spellColor : defaultSpell;

    // 1. Robe (Body) - conical shape
    const robeGeo = new THREE.ConeGeometry(0.4, 0.9, 8);
    const robeMat = new THREE.MeshStandardMaterial({
      color: finalClothing,
      roughness: 0.5,
      metalness: 0.1
    });
    const robe = new THREE.Mesh(robeGeo, robeMat);
    robe.position.y = 0.45;
    robe.castShadow = true;
    robe.receiveShadow = true;
    bodyGroup.add(robe);

    // 2. Head - Sphere
    const headGeo = new THREE.SphereGeometry(0.28, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, // Dark shadow void under hat
      roughness: 0.8
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.9;
    head.castShadow = true;
    bodyGroup.add(head);

    // 3. Wizard Hat - Conical shape stacked on top of head, tipped back slightly
    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, 0.95, 0);

    const hatBrimGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.05, 12);
    const hatBrimMat = new THREE.MeshStandardMaterial({ color: finalClothing, roughness: 0.6 });
    const hatBrim = new THREE.Mesh(hatBrimGeo, hatBrimMat);
    hatGroup.add(hatBrim);

    const hatConeGeo = new THREE.ConeGeometry(0.3, 0.7, 10);
    // Tip the cone slightly
    hatConeGeo.translate(0, 0.35, 0);
    const hatCone = new THREE.Mesh(hatConeGeo, hatBrimMat);
    hatCone.rotation.x = -0.15; // Tip backward slightly
    hatGroup.add(hatCone);

    bodyGroup.add(hatGroup);

    // 4. Glowing eyes - 2 small spheres
    const eyeGeo = new THREE.SphereGeometry(0.05, 4, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff000 }); // Yellow glowing eyes

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.09, 0.9, 0.22);
    bodyGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.09, 0.9, 0.22);
    bodyGroup.add(rightEye);

    // 5. Wizard Staff (aiming indicator)
    const staffGroup = new THREE.Group();
    // Offset staff to the side
    staffGroup.position.set(0.4, 0.45, 0.1);

    const staffPoleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6);
    const staffPoleMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 }); // Wooden rod
    const staffPole = new THREE.Mesh(staffPoleGeo, staffPoleMat);
    staffPole.rotation.x = Math.PI / 2; // Point forward
    staffGroup.add(staffPole);

    // Crystal bulb at the tip
    const crystalGeo = new THREE.DodecahedronGeometry(0.12, 0);
    const crystalMat = new THREE.MeshBasicMaterial({ color: finalSpell });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(0, 0, 0.55); // Top of the staff
    staffGroup.add(crystal);

    // Add a point light to staff crystal for dynamic color casting
    const staffLight = new THREE.PointLight(finalSpell, 0.8, 1.5);
    staffLight.position.set(0, 0, 0.55);
    staffGroup.add(staffLight);

    bodyGroup.add(staffGroup);

    // 6. Shield bubble mesh (wireframe glow sphere, hidden initially)
    const shieldGeo = new THREE.SphereGeometry(0.6, 12, 12);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      wireframe: true
    });
    const shieldBubble = new THREE.Mesh(shieldGeo, shieldMat);
    shieldBubble.visible = false;
    bodyGroup.add(shieldBubble);

    super(x, y, 0.45, bodyGroup);

    this.id = id;
    this.name = name;
    this.team = team;
    this.isBot = isBot;
    this.bodyGroup = bodyGroup;
    this.staffMesh = staffGroup;
    this.clothingColor = finalClothing;
    this.spellColor = finalSpell;
    this.robeMesh = robe;
    this.hatBrimMesh = hatBrim;
    this.shieldMesh = shieldBubble;
  }

  getSpeed(): number {
    const baseSpeed = 4.8;
    const hasteStack = this.powerups.get(PowerUpType.HASTE) || 0;
    // +22% move speed per stack
    let speed = baseSpeed * (1 + hasteStack * 0.22);

    // Apply freeze slow: -30% speed per stack level (max 70% slow)
    if (this.freezeTimer > 0 && this.freezeLevel > 0) {
      const slowMultiplier = Math.max(0.3, 1 - this.freezeLevel * 0.3);
      speed *= slowMultiplier;
    }

    return speed;
  }

  getProjectileStats(): ProjectileStats {
    const stats: ProjectileStats = {
      damage: 25,
      speed: 8.5,
      maxBounces: 0,
      maxPierces: 0,
      splitLevel: 0,
      color: this.spellColor,
      freezeLevel: 0
    };

    // 1. HASTE stack: projectile speed +25% per stack
    const haste = this.powerups.get(PowerUpType.HASTE) || 0;
    stats.speed *= (1 + haste * 0.25);

    // 2. BOUNCE stack: bounces: level 1 = 1, level 2 = 2, level 3 = 5
    const bounce = this.powerups.get(PowerUpType.BOUNCE) || 0;
    if (bounce === 1) stats.maxBounces = 1;
    else if (bounce === 2) stats.maxBounces = 2;
    else if (bounce >= 3) stats.maxBounces = 5;

    // 3. PIERCE stack: pierces: level 1 = 1, level 2 = 2, level 3 = infinite (99)
    const pierce = this.powerups.get(PowerUpType.PIERCE) || 0;
    if (pierce === 1) stats.maxPierces = 1;
    else if (pierce === 2) stats.maxPierces = 2;
    else if (pierce >= 3) stats.maxPierces = 99;

    // 4. SPLIT stack: level 1 = 1, level 2 = 2, level 3 = 3
    const split = this.powerups.get(PowerUpType.SPLIT) || 0;
    stats.splitLevel = split;

    // 5. FREEZE stack
    const freeze = this.powerups.get(PowerUpType.FREEZE) || 0;
    stats.freezeLevel = freeze;

    // If there's an active power-up combination, color-mix the shot
    if (this.powerupSlotsOrder.length > 0) {
      // Prioritize the highest-level power-up color or first slot color
      const primaryPowerUp = this.powerupSlotsOrder[0];
      stats.color = POWERUP_COLORS[primaryPowerUp];
    }

    return stats;
  }

  getFireRateCooldown(): number {
    const haste = this.powerups.get(PowerUpType.HASTE) || 0;
    // Lower cooldown (faster firing) by 18% per stack
    return this.shootCooldown / (1 + haste * 0.25);
  }

  collectPowerUp(type: PowerUpType) {
    sfx.playPowerup();

    if (this.powerups.has(type)) {
      // Increment existing powerup stack (max 3)
      const currentLevel = this.powerups.get(type)!;
      this.powerups.set(type, Math.min(currentLevel + 1, 3));
    } else {
      // Add new power-up type
      if (this.powerupSlotsOrder.length >= 3) {
        // Discard oldest powerup to make room
        const oldest = this.powerupSlotsOrder.shift()!;
        this.powerups.delete(oldest);
      }
      this.powerups.set(type, 1);
      this.powerupSlotsOrder.push(type);
    }

    // Dynamic staff crystal color update based on power-ups
    this.updateStaffVisuals();
  }

  updateColors(clothingColor: number, spellColor: number) {
    this.clothingColor = clothingColor;
    this.spellColor = spellColor;
    
    if (this.robeMesh && this.robeMesh.material instanceof THREE.Material) {
      (this.robeMesh.material as THREE.MeshStandardMaterial).color.setHex(clothingColor);
    }
    if (this.hatBrimMesh && this.hatBrimMesh.material instanceof THREE.Material) {
      (this.hatBrimMesh.material as THREE.MeshStandardMaterial).color.setHex(clothingColor);
    }
    this.updateStaffVisuals();
  }

  private updateStaffVisuals() {
    if (!this.staffMesh) return;
    const crystal = this.staffMesh.children[1] as THREE.Mesh;
    const light = this.staffMesh.children[2] as THREE.PointLight;
    
    if (crystal && light) {
      let color = this.spellColor;
      if (this.powerupSlotsOrder.length > 0) {
        color = POWERUP_COLORS[this.powerupSlotsOrder[this.powerupSlotsOrder.length - 1]];
      }
      
      if (crystal.material instanceof THREE.MeshBasicMaterial) {
        crystal.material.color.setHex(color);
      }
      light.color.setHex(color);
    }
  }

  takeDamage(amount: number): boolean {
    if (this.isDead || this.isDashing) return false;

    // Check Shield PowerUp absorption
    const shieldLevel = this.powerups.get(PowerUpType.SHIELD) || 0;
    if (shieldLevel > 0) {
      const newLevel = shieldLevel - 1;
      if (newLevel <= 0) {
        this.powerups.delete(PowerUpType.SHIELD);
        this.powerupSlotsOrder = this.powerupSlotsOrder.filter(t => t !== PowerUpType.SHIELD);
      } else {
        this.powerups.set(PowerUpType.SHIELD, newLevel);
      }
      sfx.playBounce(); // deflect sound

      // Trigger a shield bubble hit flash
      if (this.shieldMesh && this.shieldMesh.material instanceof THREE.MeshBasicMaterial) {
        const mat = this.shieldMesh.material;
        mat.opacity = 0.85;
        setTimeout(() => {
          mat.opacity = 0.35;
        }, 150);
      }
      this.updateStaffVisuals();
      return false; // Damage blocked!
    }
    
    this.health = Math.max(0, this.health - amount);
    sfx.playHit();

    // Trigger visual hit flash
    this.triggerHitFlash();

    if (this.health <= 0) {
      this.isDead = true;
      this.deaths++;
    }
    return true; // Damage dealt!
  }

  private triggerHitFlash() {
    this.bodyGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material;
        const origColor = mat.color ? mat.color.getHex() : 0x000000;
        
        // Temporarily set to red/white
        if (mat.color) mat.color.setHex(0xffffff);
        
        setTimeout(() => {
          if (!this.isDead && mat.color) {
            mat.color.setHex(origColor);
          }
        }, 100);
      }
    });
  }

  dash(inputDirectionX: number, inputDirectionY: number) {
    if (this.dashCooldownTimer > 0 || this.isDashing || this.isDead) return;

    // Use current velocity or facing angle if no input direction is provided
    let dx = inputDirectionX;
    let dy = inputDirectionY;
    
    if (dx === 0 && dy === 0) {
      dx = Math.cos(this.aimAngle);
      dy = Math.sin(this.aimAngle);
    }

    // Normalize
    const length = Math.sqrt(dx * dx + dy * dy);
    this.dashVx = (dx / length) * this.getSpeed() * this.dashSpeedMultiplier;
    this.dashVy = (dy / length) * this.getSpeed() * this.dashSpeedMultiplier;

    this.isDashing = true;
    this.dashTimer = this.dashDuration;
    this.dashCooldownTimer = this.dashCooldown;
    
    sfx.playDash();
  }

  update(dt: number) {
    if (this.isDead) return;

    // 1. Manage timers
    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer -= dt;
    }

    if (this.shootTimer > 0) {
      this.shootTimer -= dt;
    }

    this.timeSinceLastShot += dt;

    if (this.ammo < this.maxAmmo) {
      if (this.timeSinceLastShot >= 1.5) {
        this.ammo = Math.min(this.maxAmmo, this.ammo + 1);
        this.timeSinceLastShot = 0;
      }
    } else {
      if (this.timeSinceLastShot > 1.5) {
        this.timeSinceLastShot = 1.5;
      }
    }

    // Freeze timer decay
    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
      if (this.freezeTimer <= 0) {
        this.freezeTimer = 0;
        this.freezeLevel = 0;
      }
    }

    // 2. Movement logic (handles normal moving, dashing, leaping, or aiming)
    if (this.isLeaping) {
      this.vx = this.leapVx;
      this.vy = this.leapVy;
      this.leapTimer -= dt;
      
      const progress = 1 - (this.leapTimer / this.leapDuration); // 0 to 1
      this.leapYOffset = Math.sin(progress * Math.PI) * 2.8; // Max height 2.8 units
      this.bodyGroup.position.y = this.leapYOffset;
      
      // Spin during leap
      this.bodyGroup.rotation.y += dt * 8.0;
      this.bodyGroup.rotation.x = Math.sin(progress * Math.PI) * 0.4;

      if (this.leapTimer <= 0) {
        this.isLeaping = false;
        this.leapTimer = 0;
        this.leapYOffset = 0;
        this.bodyGroup.position.y = 0;
        this.bodyGroup.rotation.x = 0;
        this.vx = 0;
        this.vy = 0;
        sfx.playHit(); // landing sound
      }
    } else if (this.isDashing) {
      this.vx = this.dashVx;
      this.vy = this.dashVy;
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.isDashing = false;
        this.vx = 0;
        this.vy = 0;
      }
    } else {
      // Normal movement is set externally by controls/AI (this.vx and this.vy)
      // Wobble character while moving to simulate walking animation
      const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (currentSpeed > 0.1) {
        this.wobbleTime += dt * 14;
        this.bodyGroup.rotation.z = Math.sin(this.wobbleTime) * 0.12; // tilt left/right
        this.bodyGroup.position.y = Math.abs(Math.sin(this.wobbleTime)) * 0.08; // bounce up/down
      } else {
        this.bodyGroup.rotation.z = 0;
        this.bodyGroup.position.y = 0;
        this.wobbleTime = 0;
      }
    }

    // Update entity physics position
    super.update(dt);

    // 3. Align staff and face character towards the aiming angle (if not leaping!)
    if (!this.isLeaping) {
      this.bodyGroup.rotation.y = -this.aimAngle + Math.PI / 2; // Rotate body to aim direction
    }

    // Tilt the staff slightly while shooting
    if (this.staffMesh) {
      if (this.shootTimer > this.getFireRateCooldown() - 0.15) {
        // Staff thrust recoil animation
        this.staffMesh.position.z = 0.25;
      } else {
        this.staffMesh.position.z = 0.1;
      }
    }

    // 4. Update shield bubble visibility, spin, and scale pulse
    const shieldLevel = this.powerups.get(PowerUpType.SHIELD) || 0;
    if (this.shieldMesh) {
      this.shieldMesh.visible = shieldLevel > 0;
      if (this.shieldMesh.visible) {
        this.shieldMesh.rotation.y += dt * 1.5;
        this.shieldMesh.rotation.x += dt * 0.5;
        // Pulse bubble scale
        const scale = 1.0 + Math.sin(this.wobbleTime * 0.5 || Date.now() * 0.005) * 0.04;
        this.shieldMesh.scale.set(scale, scale, scale);
      }
    }

    // 5. Update freeze visual emissive effect
    if (this.freezeTimer > 0) {
      if (this.robeMesh && this.robeMesh.material instanceof THREE.MeshStandardMaterial) {
        this.robeMesh.material.emissive.setHex(0x0055ff);
        this.robeMesh.material.emissiveIntensity = 0.45;
      }
    } else {
      if (this.robeMesh && this.robeMesh.material instanceof THREE.MeshStandardMaterial) {
        this.robeMesh.material.emissive.setHex(0x000000);
        this.robeMesh.material.emissiveIntensity = 0;
      }
    }
  }

  reset() {
    this.health = 100;
    this.isDead = false;
    this.powerups.clear();
    this.powerupSlotsOrder = [];
    this.updateStaffVisuals();
    this.vx = 0;
    this.vy = 0;
    this.isDashing = false;
    this.isLeaping = false;
    this.leapTimer = 0;
    this.leapYOffset = 0;
    this.freezeTimer = 0;
    this.freezeLevel = 0;
    this.ammo = this.maxAmmo;
    this.timeSinceLastShot = 0;
    if (this.shieldMesh) this.shieldMesh.visible = false;
    if (this.robeMesh && this.robeMesh.material instanceof THREE.MeshStandardMaterial) {
      this.robeMesh.material.emissive.setHex(0x000000);
      this.robeMesh.material.emissiveIntensity = 0;
    }
  }
}
