import * as THREE from 'three';
import { Entity } from './Entity';
import { PowerUpType, POWERUP_COLORS } from './PowerUp';
import type { ProjectileStats } from './Projectile';
import { sfx } from '../engine/Audio';
import { buildHat, buildAccessory, buildHair, buildFaceGear, buildWeapon } from '../game/CharacterConfig';
import type { CharacterConfig } from '../game/CharacterConfig';
import { NameTag } from '../engine/NameTag';

function teamColor(team: 'RED' | 'BLUE' | 'GOLD'): string {
  return team === 'RED' ? '#ff3355' : team === 'BLUE' ? '#3388ff' : '#ffd700';
}

export interface PowerUpFusion {
  name: string;
  desc: string;
  icon: string;
}

export function getActiveFusions(powerups: Map<PowerUpType, number>): PowerUpFusion[] {
  const fusions: PowerUpFusion[] = [];
  const has = (t: PowerUpType) => (powerups.get(t) || 0) > 0;

  if (has(PowerUpType.FREEZE) && has(PowerUpType.SPLIT)) {
    fusions.push({ name: 'Frost Shards', desc: 'Splits leave slowing frost zones', icon: '❄️' });
  }
  if (has(PowerUpType.FREEZE) && has(PowerUpType.BOUNCE)) {
    fusions.push({ name: 'Permafrost', desc: 'Ricochets spawn freezing frost rings', icon: '🧊' });
  }
  if (has(PowerUpType.SPLIT) && has(PowerUpType.PIERCE)) {
    fusions.push({ name: 'Forking Shards', desc: 'Piercing splits through enemies', icon: '⚡' });
  }
  if (has(PowerUpType.HASTE) && has(PowerUpType.WALLRUN)) {
    fusions.push({ name: 'Orbital Glide', desc: 'Speed boost and corner acceleration', icon: '🌀' });
  }
  if (has(PowerUpType.SHIELD) && has(PowerUpType.BOUNCE)) {
    fusions.push({ name: 'Deflect Barrier', desc: 'Shield reflects enemy spells', icon: '🛡️' });
  }
  return fusions;
}

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
  shootCooldown: number = 0.6; // seconds
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
  hatGroup: THREE.Object3D | null = null;
  accessoryGroup: THREE.Object3D | null = null;
  hairGroup: THREE.Object3D | null = null;
  faceGearGroup: THREE.Object3D | null = null;
  shieldMesh: THREE.Mesh | null = null;
  weaponCrystal: THREE.Object3D | null = null;
  weaponLight: THREE.Object3D | null = null;
  /** Floating billboard nametag above the caster's head (Issue #17). */
  nameTag: NameTag;
  leftEyeGroup: THREE.Group | null = null;
  rightEyeGroup: THREE.Group | null = null;
  clothingColor!: number;
  spellColor!: number;
  characterConfig: Partial<CharacterConfig> | null = null;
  private wobbleTime: number = 0;
  private blinkTimer: number = 2.5;

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
    spellColor?: number,
    config?: Partial<CharacterConfig>
  ) {
    const bodyGroup = new THREE.Group();

    // Determine initial colors
    const defaultClothing = team === 'RED' ? 0xa61c28 : team === 'BLUE' ? 0x1e498f : 0xd4a020;
    const defaultSpell = team === 'RED' ? 0xff3355 : team === 'BLUE' ? 0x33aaff : 0xffcc00;

    const finalClothing = config?.robeColor ?? (clothingColor !== undefined ? clothingColor : defaultClothing);
    const finalSpell = config?.spellColor ?? (spellColor !== undefined ? spellColor : defaultSpell);
    const hatStyle = config?.hat ?? 'WIZARD';
    const accessoryStyle = config?.accessory ?? 'NONE';
    const eyeColorVal = config?.eyeColor ?? 0xfff000;
    const hairStyle = config?.hair ?? 'NONE';
    const hairColorVal = config?.hairColor ?? 0x2b1b0e;
    const faceGearStyle = config?.faceGear ?? 'NONE';
    const weaponStyle = config?.weapon ?? 'STAFF';
    const hatRotation = config?.hatRotation ?? 0;

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.8, roughness: 0.25 });

    // 1. Robe (Body) - conical shape with velvet texture & gold embroidered hem
    const robeGeo = new THREE.ConeGeometry(0.42, 0.92, 12);
    const robeMat = new THREE.MeshStandardMaterial({
      color: finalClothing,
      roughness: 0.45,
      metalness: 0.1,
      emissive: finalClothing,
      emissiveIntensity: 0.12
    });
    const robe = new THREE.Mesh(robeGeo, robeMat);
    robe.position.y = 0.46;
    robe.castShadow = true;
    robe.receiveShadow = true;
    bodyGroup.add(robe);

    // Gold embroidered hem trim
    const hemGeo = new THREE.TorusGeometry(0.42, 0.025, 6, 16);
    const hem = new THREE.Mesh(hemGeo, goldMat);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.04;
    bodyGroup.add(hem);

    // Leather belt with gold buckle
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x2a180e, roughness: 0.8 });
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12), beltMat);
    belt.position.y = 0.38;
    bodyGroup.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.06), goldMat);
    buckle.position.set(0, 0.38, 0.32);
    bodyGroup.add(buckle);

    // 2. Head - Sphere
    const headGeo = new THREE.SphereGeometry(0.28, 12, 10);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x16141a, // Mystical shadow void under hat
      roughness: 0.8
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.9;
    head.castShadow = true;
    bodyGroup.add(head);

    // 3. Hair (rendered under the hat so it peeks out)
    const hairGroup = buildHair(hairStyle, hairColorVal);
    bodyGroup.add(hairGroup);

    // 3b. Head gear (configurable cosmetic part)
    const hatGroup = buildHat(hatStyle, finalClothing);
    if (hatRotation) hatGroup.rotation.y = hatRotation;
    bodyGroup.add(hatGroup);

    // 3c. Face gear (shades / eyepatch / beard / mask)
    const faceGearGroup = buildFaceGear(faceGearStyle, finalClothing);
    bodyGroup.add(faceGearGroup);

    // 3d. Back accessory (wings / cape / tome / banner), tinted with the spell colour
    const accessoryGroup = buildAccessory(accessoryStyle, finalSpell);
    bodyGroup.add(accessoryGroup);

    // 4. Expressive Pokémon-style Layered Eyes (White sclera + Iris + Pupil + Catchlight Sparkle)
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeIrisMat = new THREE.MeshBasicMaterial({ color: eyeColorVal });
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeSparkleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    function createExpressiveEye(isLeft: boolean): THREE.Group {
      const eyeG = new THREE.Group();

      // White Sclera
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), eyeWhiteMat);
      sclera.scale.set(1.0, 1.3, 0.4);
      eyeG.add(sclera);

      // Colored Iris
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeIrisMat);
      iris.position.set(0, 0, 0.02);
      iris.scale.set(1.0, 1.2, 0.4);
      eyeG.add(iris);

      // Dark Pupil
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyePupilMat);
      pupil.position.set(isLeft ? 0.008 : -0.008, 0, 0.035);
      eyeG.add(pupil);

      // White Anime Catchlight
      const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), eyeSparkleMat);
      sparkle.position.set(0.015, 0.02, 0.045);
      eyeG.add(sparkle);

      return eyeG;
    }

    const leftEye = createExpressiveEye(true);
    leftEye.position.set(-0.09, 0.9, 0.23);
    bodyGroup.add(leftEye);

    const rightEye = createExpressiveEye(false);
    rightEye.position.set(0.09, 0.9, 0.23);
    bodyGroup.add(rightEye);

    // 5. Weapon (aiming indicator) — staff / wand / sword / scythe
    const weapon = buildWeapon(weaponStyle, finalSpell);
    const staffGroup = weapon.group;
    bodyGroup.add(staffGroup);

    // 6. Cute Wizard Sleeves and Hands holding weapon
    const handMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.6 });
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), handMat);
    hand.position.set(0.32, 0.45, 0.18);
    bodyGroup.add(hand);

    // 7. Shield bubble mesh (wireframe glow sphere, hidden initially)
    const shieldGeo = new THREE.SphereGeometry(0.62, 14, 14);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x7be4ff,
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
    this.characterConfig = config || null;
    this.bodyGroup = bodyGroup;
    this.staffMesh = staffGroup;
    this.leftEyeGroup = leftEye;
    this.rightEyeGroup = rightEye;
    this.clothingColor = finalClothing;
    this.spellColor = finalSpell;
    this.robeMesh = robe;
    this.hatGroup = hatGroup;
    this.accessoryGroup = accessoryGroup;
    this.hairGroup = hairGroup;
    this.faceGearGroup = faceGearGroup;
    this.weaponCrystal = weapon.crystal;
    this.weaponLight = weapon.light;
    this.shieldMesh = shieldBubble;

    this.nameTag = new NameTag(name, teamColor(team));
    bodyGroup.add(this.nameTag.sprite);
  }

  getSpeed(): number {
    const baseSpeed = 3.6;
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
      speed: 7.0,
      maxBounces: 0,
      maxPierces: 0,
      splitLevel: 0,
      color: this.spellColor,
      freezeLevel: 0,
      wallRunLevel: 0
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

    // 6. WALLRUN stack: projectile hugs and glides along walls
    const wallrun = this.powerups.get(PowerUpType.WALLRUN) || 0;
    stats.wallRunLevel = wallrun;

    // 7. Synergies and Elemental Fusions
    stats.isFrostShards = freeze > 0 && split > 0;
    stats.isPermafrostRicochet = freeze > 0 && bounce > 0;
    stats.isPiercingShards = split > 0 && pierce > 0;
    stats.isOrbitalGlide = haste > 0 && wallrun > 0;

    // If there's an active power-up combination, color-mix the shot
    if (this.powerupSlotsOrder.length > 0) {
      if (stats.isFrostShards) stats.color = 0x50e0ff;
      else if (stats.isPiercingShards) stats.color = 0xbf55ff;
      else if (stats.isOrbitalGlide) stats.color = 0x20f5a0;
      else {
        const primaryPowerUp = this.powerupSlotsOrder[0];
        stats.color = POWERUP_COLORS[primaryPowerUp];
      }
    }

    return stats;
  }

  getFireRateCooldown(): number {
    const haste = this.powerups.get(PowerUpType.HASTE) || 0;
    // Lower cooldown (faster firing) by 18% per stack
    return this.shootCooldown / (1 + haste * 0.25);
  }

  collectPowerUp(type: PowerUpType) {
    if (type === PowerUpType.SHIELD) sfx.playShieldOn();
    else if (type === PowerUpType.HASTE) sfx.playHaste();
    else if (type === PowerUpType.FREEZE) sfx.playFreeze();
    else if (type === PowerUpType.BOUNCE) sfx.playBounce();
    else if (type === PowerUpType.SPLIT) sfx.playSplit();
    else if (type === PowerUpType.PIERCE) sfx.playPierce();
    else if (type === PowerUpType.WALLRUN) sfx.playWallRun();
    else sfx.playPowerupCollect();

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
    if (this.hatGroup) {
      this.hatGroup.traverse((m) => {
        if (m instanceof THREE.Mesh && m.material instanceof THREE.MeshStandardMaterial) {
          m.material.color.setHex(clothingColor);
        }
      });
    }
    if (this.accessoryGroup) {
      this.accessoryGroup.traverse((m) => {
        if (m instanceof THREE.Mesh && m.material instanceof THREE.MeshStandardMaterial) {
          m.material.color.setHex(spellColor);
        }
      });
    }
    this.updateStaffVisuals();
    this.nameTag.setColor(teamColor(this.team));
  }

  private updateStaffVisuals() {
    if (!this.weaponCrystal) return;
    const crystalMesh = this.weaponCrystal.children[0] as THREE.Mesh | undefined;
    const lightObj = this.weaponLight?.children[0] as THREE.PointLight | undefined;

    if (crystalMesh) {
      let color = this.spellColor;
      if (this.powerupSlotsOrder.length > 0) {
        color = POWERUP_COLORS[this.powerupSlotsOrder[this.powerupSlotsOrder.length - 1]];
      }

      if (crystalMesh.material instanceof THREE.MeshBasicMaterial) {
        crystalMesh.material.color.setHex(color);
      }
      if (lightObj) {
        lightObj.color.setHex(color);
      }
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
        sfx.playShieldBreak(this.id === 'player' ? 1.0 : 0.4);
      } else {
        this.powerups.set(PowerUpType.SHIELD, newLevel);
        sfx.playShieldOn(this.id === 'player' ? 0.8 : 0.3);
      }

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

    // Trigger visual hit flash
    this.triggerHitFlash();

    if (this.health <= 0) {
      this.isDead = true;
      this.deaths++;
      this.nameTag.setVisible(false);
    }
    return true; // Damage dealt!
  }

  private triggerHitFlash() {
    this.bodyGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          const origEmissive = mat.emissive.getHex();
          const origIntensity = mat.emissiveIntensity;
          mat.emissive.setHex(0xffffff);
          mat.emissiveIntensity = 0.85;

          setTimeout(() => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.emissive.setHex(origEmissive);
              mat.emissiveIntensity = origIntensity;
            }
          }, 90);
        }
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

    // 2b. Animate Expressive Eyes (Blinking + Shooting Squint)
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2.5 + Math.random() * 2.0;
    }
    const isBlinkingNow = this.blinkTimer < 0.12;
    const isShootingSquint = this.shootTimer > this.getFireRateCooldown() - 0.2;
    const eyeScaleY = isBlinkingNow ? 0.1 : isShootingSquint ? 0.45 : 1.0;

    if (this.leftEyeGroup && this.rightEyeGroup) {
      this.leftEyeGroup.scale.y = eyeScaleY;
      this.rightEyeGroup.scale.y = eyeScaleY;
    }

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
        this.robeMesh.material.emissive.setHex(this.clothingColor);
        this.robeMesh.material.emissiveIntensity = 0.12;
      }
    }
  }

  reset() {
    this.health = 100;
    this.isDead = false;
    this.nameTag.setVisible(true);
    this.powerups.clear();
    this.powerupSlotsOrder = [];
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
    
    // Fully restore pristine clothing, hat, accessory and staff colors on respawn
    this.updateColors(this.clothingColor, this.spellColor);
  }

  destroy(scene: THREE.Scene) {
    this.nameTag.dispose();
    super.destroy(scene);
  }
}
