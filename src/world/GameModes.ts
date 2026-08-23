import * as THREE from 'three';
import { Caster } from '../entities/Caster';
import { sfx } from '../engine/Audio';
import { PALETTE } from '../engine/Theme';

export type GameModeType = 'BATTLE_ROYALE' | 'TEAM_BATTLE' | 'GOLD_RUSH';
export const GameModeType = {
  BATTLE_ROYALE: 'BATTLE_ROYALE' as GameModeType,
  TEAM_BATTLE: 'TEAM_BATTLE' as GameModeType,
  GOLD_RUSH: 'GOLD_RUSH' as GameModeType
};


export interface Coin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mesh: THREE.Mesh;
  hoverTime: number;
  isSpilled: boolean;
  spillTimer: number;
}

export interface BankZone {
  x: number;
  y: number;
  radius: number;
  mesh: THREE.Group;
  controllingTeam: 'RED' | 'BLUE' | null;
  depositTimer: number;
  relocateTimer: number;
}

export class GameModeManager {
  type: GameModeType;
  
  // Battle Royale variables
  safeRadius: number = 18;
  maxSafeRadius: number = 18;
  private stormMesh: THREE.Mesh | null = null;
  private stormWallMesh: THREE.Mesh | null = null;
  private stormFlames: THREE.Points | null = null;
  private stormFlameData: Float32Array | null = null;
  private stormFlameCount = 180;
  private stormPulseTime = 0;
  
  // Team Battle variables
  redScore: number = 0;
  blueScore: number = 0;
  respawnTimers: Map<string, number> = new Map(); // casterId -> remaining time
  
  // Gold Rush variables
  coins: Coin[] = [];
  private coinGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12);
  private coinMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700, // Shiny gold
    roughness: 0.1,
    metalness: 0.9,
    emissive: 0xaa8800,
    emissiveIntensity: 0.3
  });
  private coinSpawnTimer: number = 0;

  // Gold Rush banking (team capture-and-hold)
  bank: BankZone | null = null;
  goldTarget: number = 50;
  private bankSpots: { x: number; y: number }[] = [];
  private prevBankControl: 'RED' | 'BLUE' | null = null;
  private bankPulse: number = 0;

  // Announcements callback wired by Game to the on-screen Fx announcer
  onAnnounce: ((text: string, color?: string) => void) | null = null;
  onCasterDied: ((killer: Caster | null, victim: Caster) => void) | null = null;
  private announcedFinalDuel: boolean = false;

  // General timers
  matchTimer: number = 120; // 2 minutes
  isGameOver: boolean = false;
  winnerText: string = '';

  constructor(type: GameModeType) {
    this.type = type;
  }

  initMode(scene: THREE.Scene, casters: Caster[], bankSpots: { x: number; y: number }[] = [], initialSafeRadius?: number) {
    this.isGameOver = false;
    this.winnerText = '';
    this.matchTimer = this.type === GameModeType.BATTLE_ROYALE ? 150 : 120;

    // Scale safe radius with map if provided
    if (initialSafeRadius !== undefined && initialSafeRadius > 0) {
      this.maxSafeRadius = initialSafeRadius;
    } else {
      this.maxSafeRadius = 16.5;
    }
    this.safeRadius = this.maxSafeRadius;

    // Reset scores
    this.redScore = 0;
    this.blueScore = 0;
    this.respawnTimers.clear();
    this.announcedFinalDuel = false;
    this.prevBankControl = null;
    this.bankSpots = bankSpots;

    // Remove any existing mode meshes
    this.cleanup(scene);

    if (this.type === GameModeType.BATTLE_ROYALE) {
      // Create glowing Octarine Arcane Seal (Discworld 8th color magical boundary)
      const ringGeo = new THREE.RingGeometry(this.safeRadius - 0.35, this.safeRadius + 0.45, 80);
      const ringMat = new THREE.MeshBasicMaterial({
        color: PALETTE.octarine,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85
      });
      this.stormMesh = new THREE.Mesh(ringGeo, ringMat);
      this.stormMesh.rotation.x = Math.PI / 2;
      this.stormMesh.position.y = 0.03;
      scene.add(this.stormMesh);

      // Inner magical glow ring with ethereal cyan-violet blending
      const glowGeo = new THREE.RingGeometry(this.safeRadius - 0.7, this.safeRadius - 0.1, 80);
      const glowMat = new THREE.MeshBasicMaterial({
        color: PALETTE.octarineGlow,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.rotation.x = Math.PI / 2;
      glowMesh.position.y = 0.02;
      glowMesh.name = 'stormGlow';
      scene.add(glowMesh);
      this.stormMesh.add(glowMesh);

      // Create ethereal translucent arcane boundary cylinder
      const wallGeo = new THREE.CylinderGeometry(this.safeRadius, this.safeRadius, 14, 80, 1, true);
      const wallMat = new THREE.MeshBasicMaterial({
        color: PALETTE.octarine,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      this.stormWallMesh = new THREE.Mesh(wallGeo, wallMat);
      this.stormWallMesh.position.y = 7;
      scene.add(this.stormWallMesh);

      // Animated flame & rune particles around the ring perimeter
      this.createStormFlames(scene);

      // Distribute teams to FFA (Gold/Neutral)
      casters.forEach((c) => {
        c.team = 'GOLD';
      });

    } else if (this.type === GameModeType.TEAM_BATTLE) {
      // Divide teams 4v4: Scarlet House vs Sapphire House
      casters.forEach((c, idx) => {
        c.team = idx % 2 === 0 ? 'RED' : 'BLUE';
        c.reset();
        
        // Force thematic Hogwarts collegiate colors
        if (c.team === 'RED') {
          c.updateColors(PALETTE.scarlet, 0xff3355); // Scarlet robes & crimson wand sparks
        } else {
          c.updateColors(PALETTE.sapphire, 0x33aaff); // Sapphire robes & cyan wand sparks
        }
      });

    } else if (this.type === GameModeType.GOLD_RUSH) {
      // Two teams race to BANK golden Galleons at the ancient Vault
      casters.forEach((c, idx) => {
        c.team = idx % 2 === 0 ? 'RED' : 'BLUE';
        c.reset();
        c.coins = 0;
        if (c.team === 'RED') {
          c.updateColors(PALETTE.scarlet, 0xff3355);
        } else {
          c.updateColors(PALETTE.sapphire, 0x33aaff);
        }
      });

      this.coinSpawnTimer = 0;
      for (let i = 0; i < 12; i++) {
        this.spawnRandomCoin(scene);
      }

      // Create the Bank Vault at a random open spawner spot
      const spots = this.bankSpots.length > 0 ? this.bankSpots : [{ x: 0, y: 0 }];
      this.createBank(scene, spots[Math.floor(Math.random() * spots.length)]);
    }
  }

  update(dt: number, scene: THREE.Scene, casters: Caster[], spawnPoints: { x: number; y: number }[]) {
    if (this.isGameOver) return;

    this.matchTimer -= dt;
    if (this.matchTimer <= 0) {
      this.matchTimer = 0;
      this.endGame(casters);
      return;
    }

    // 1. Handle Respawning for Team Battle & Gold Rush
    if (this.type === GameModeType.TEAM_BATTLE || this.type === GameModeType.GOLD_RUSH) {
      casters.forEach((c) => {
        if (c.isDead) {
          let time = this.respawnTimers.get(c.id) || 3.0;
          time -= dt;
          if (time <= 0) {
            // Respawn
            const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
            c.reset();
            if (this.type === GameModeType.TEAM_BATTLE || this.type === GameModeType.GOLD_RUSH) {
              if (c.team === 'RED') c.updateColors(0xff1122, 0xff1122);
              else if (c.team === 'BLUE') c.updateColors(0x0044ff, 0x00d2ff);
            }
            c.x = sp.x;
            c.y = sp.y;
            c.syncMeshPosition();
            scene.add(c.mesh);
            this.respawnTimers.delete(c.id);
          } else {
            this.respawnTimers.set(c.id, time);
          }
        }
      });
    }

    // 2. Handle Battle Royale Shrinking Storm
    if (this.type === GameModeType.BATTLE_ROYALE) {
      // Slowly shrink radius down to 1.5
      this.safeRadius = Math.max(1.5, this.safeRadius - dt * 0.15);

      // Pulsing animation for the ring opacity
      this.stormPulseTime += dt;
      const pulse = 0.75 + Math.sin(this.stormPulseTime * 3.0) * 0.15;

      // Sync visual ring/cylinder scales
      if (this.stormMesh && this.stormWallMesh) {
        const scale = this.safeRadius / this.maxSafeRadius;
        this.stormMesh.scale.set(scale, scale, 1.0);
        this.stormWallMesh.scale.set(scale, 1.0, scale);

        // Pulse the ring opacity for a "breathing" fire effect
        const ringMat = this.stormMesh.material as THREE.MeshBasicMaterial;
        ringMat.opacity = 0.85 * pulse;

        // Pulse the wall too, slightly out of phase
        const wallMat = this.stormWallMesh.material as THREE.MeshBasicMaterial;
        wallMat.opacity = 0.18 * (0.7 + Math.sin(this.stormPulseTime * 2.0 + 1.0) * 0.3);

        // Pulse the inner glow
        const glow = this.stormMesh.getObjectByName('stormGlow') as THREE.Mesh | null;
        if (glow) {
          (glow.material as THREE.MeshBasicMaterial).opacity = 0.3 * pulse;
        }
      }

      // Animate flame particles
      this.updateStormFlames(dt);

      // Damage casters outside the storm
      casters.forEach((c) => {
        if (c.isDead) return;
        const dist = Math.sqrt(c.x * c.x + c.y * c.y);
        if (dist > this.safeRadius) {
          // 12 damage per second, increasing as the ring shrinks
          const shrinkFactor = 1 + (1 - this.safeRadius / this.maxSafeRadius) * 0.5;
          c.takeDamage(12 * shrinkFactor * dt);
          if (c.isDead) {
            this.handleCasterDeath(scene, c, null, casters);
            this.onCasterDied?.(null, c);
          }
        }
      });

      // Victory check: last caster alive
      const aliveCasters = casters.filter((c) => !c.isDead);
      if (!this.announcedFinalDuel && aliveCasters.length === 2) {
        this.announcedFinalDuel = true;
        this.onAnnounce?.('FINAL DUEL!', '#ff5555');
      }
      if (aliveCasters.length <= 1) {
        this.endGame(casters);
      }
    }

    // 3. Handle Gold Rush Coins & Bank
    if (this.type === GameModeType.GOLD_RUSH) {
      this.updateBank(dt, casters);

      this.coinSpawnTimer += dt;
      if (this.coinSpawnTimer >= 3.0 && this.coins.length < 25) {
        this.coinSpawnTimer = 0;
        this.spawnRandomCoin(scene);
      }

      // Update and animate coins
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const coin = this.coins[i];
        coin.hoverTime += dt * 3.0;

        // Rotation & Hover animations
        coin.mesh.rotation.y += dt * 2.0;
        coin.mesh.rotation.x = Math.PI / 2 + Math.sin(coin.hoverTime) * 0.1;

        if (coin.isSpilled) {
          coin.spillTimer -= dt;
          
          // Apply velocity and drag
          coin.x += coin.vx * dt;
          coin.y += coin.vy * dt;
          coin.vx *= Math.max(0, 1 - 4 * dt);
          coin.vy *= Math.max(0, 1 - 4 * dt);
          coin.mesh.position.set(coin.x, 0.4 + Math.sin(coin.hoverTime) * 0.08, coin.y);

          if (coin.spillTimer <= 0) {
            coin.isSpilled = false;
          }
        } else {
          // Idle floating
          coin.mesh.position.y = 0.4 + Math.sin(coin.hoverTime) * 0.08;
        }

        // Check collection collisions
        for (const caster of casters) {
          if (caster.isDead) continue;
          
          // Prevent instant pickup of newly spilled coins
          if (coin.isSpilled && coin.spillTimer > 0.4) continue;

          const dx = caster.x - coin.x;
          const dy = caster.y - coin.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < caster.radius + 0.3) {
            // Collected!
            caster.coins++;
            scene.remove(coin.mesh);
            coin.mesh.geometry.dispose();
            this.coins.splice(i, 1);
            sfx.playBounce(); // Simple ding sound
            break;
          }
        }
      }
    }
  }

  handleCasterDeath(scene: THREE.Scene, deceased: Caster, killer: Caster | null, allCasters: Caster[]) {
    // 1. Team Deathmatch: Killer team gets +1 score
    if (this.type === GameModeType.TEAM_BATTLE) {
      if (killer && killer.id !== deceased.id) {
        if (killer.team === 'RED') this.redScore++;
        else this.blueScore++;
      } else {
        // Suicide: opponent gets score
        if (deceased.team === 'RED') this.blueScore++;
        else this.redScore++;
      }

      this.respawnTimers.set(deceased.id, 3.0);
      scene.remove(deceased.mesh);

      // Score threshold win condition (first to 10 eliminations)
      if (this.redScore >= 10 || this.blueScore >= 10) {
        this.endGame(allCasters);
      }
    }

    // 2. Gold Rush: spill carried coins, then queue a respawn
    if (this.type === GameModeType.GOLD_RUSH) {
      const dropCount = deceased.coins;
      deceased.coins = 0;

      // Spill coins in radial directions
      for (let i = 0; i < dropCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const force = 2.0 + Math.random() * 4.0;
        this.spawnSpilledCoin(scene, deceased.x, deceased.y, Math.cos(angle) * force, Math.sin(angle) * force);
      }

      this.respawnTimers.set(deceased.id, 3.0);
      scene.remove(deceased.mesh);
    }
  }

  handleCasterHit(scene: THREE.Scene, caster: Caster) {
    // In Gold Rush, take damage = drop 1-2 coins
    if (this.type === GameModeType.GOLD_RUSH && caster.coins > 0) {
      const dropCount = Math.min(caster.coins, Math.random() < 0.4 ? 2 : 1);
      caster.coins -= dropCount;

      for (let i = 0; i < dropCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const force = 1.5 + Math.random() * 3.0;
        this.spawnSpilledCoin(scene, caster.x, caster.y, Math.cos(angle) * force, Math.sin(angle) * force);
      }
    }
  }

  private spawnRandomCoin(scene: THREE.Scene) {
    // Spawn within 13 radius
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 13;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    this.spawnSpilledCoin(scene, x, y, 0, 0, false);
  }

  private spawnSpilledCoin(scene: THREE.Scene, x: number, y: number, vx: number, vy: number, isSpilled: boolean = true) {
    const mesh = new THREE.Mesh(this.coinGeometry, this.coinMaterial);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, 0.4, y);
    mesh.castShadow = true;
    scene.add(mesh);

    const coin: Coin = {
      x,
      y,
      vx,
      vy,
      mesh,
      hoverTime: Math.random() * 10,
      isSpilled,
      spillTimer: isSpilled ? 0.75 : 0
    };

    this.coins.push(coin);
  }

  private createBank(scene: THREE.Scene, spot: { x: number; y: number }) {
    const group = new THREE.Group();
    const radius = 2.4;

    // Ground capture ring
    const ringGeo = new THREE.RingGeometry(radius - 0.25, radius, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23d, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    // Soft column of light marking the zone
    const colGeo = new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 3, 32, 1, true);
    const colMat = new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.y = 1.5;
    group.add(col);

    // Central golden pedestal
    const baseGeo = new THREE.CylinderGeometry(0.55, 0.75, 0.4, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.4, metalness: 0.85, roughness: 0.3 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    group.position.set(spot.x, 0, spot.y);
    scene.add(group);

    this.bank = {
      x: spot.x,
      y: spot.y,
      radius,
      mesh: group,
      controllingTeam: null,
      depositTimer: 0,
      relocateTimer: 20
    };
  }

  private updateBank(dt: number, casters: Caster[]) {
    if (!this.bank) return;
    const bank = this.bank;

    // Periodically relocate the bank to keep fights moving
    bank.relocateTimer -= dt;
    if (bank.relocateTimer <= 0 && this.bankSpots.length > 1) {
      this.relocateBank();
    }

    // Count living occupants per team
    let red = 0;
    let blue = 0;
    const inside: Caster[] = [];
    casters.forEach((c) => {
      if (c.isDead) return;
      const dx = c.x - bank.x;
      const dy = c.y - bank.y;
      if (dx * dx + dy * dy < bank.radius * bank.radius) {
        inside.push(c);
        if (c.team === 'RED') red++;
        else if (c.team === 'BLUE') blue++;
      }
    });

    let control: 'RED' | 'BLUE' | null = null;
    if (red > 0 && blue === 0) control = 'RED';
    else if (blue > 0 && red === 0) control = 'BLUE';
    bank.controllingTeam = control;

    if (control && control !== this.prevBankControl) {
      this.onAnnounce?.(`${control} CONTROLS THE BANK`, control === 'RED' ? '#ff5a6e' : '#4aa8ff');
    }
    this.prevBankControl = control;

    // Deposit carried coins for the controlling (uncontested) team
    if (control) {
      bank.depositTimer += dt;
      if (bank.depositTimer >= 0.14) {
        bank.depositTimer = 0;
        let deposited = false;
        inside.forEach((c) => {
          if (c.team === control && c.coins > 0) {
            c.coins--;
            if (control === 'RED') this.redScore++;
            else this.blueScore++;
            deposited = true;
          }
        });
        if (deposited) sfx.playBounce();
        if (this.redScore >= this.goldTarget || this.blueScore >= this.goldTarget) {
          this.endGame(casters);
          return;
        }
      }
    } else {
      bank.depositTimer = 0;
    }

    this.updateBankVisual(dt);
  }

  private relocateBank() {
    if (!this.bank || this.bankSpots.length === 0) return;
    let spot = this.bankSpots[Math.floor(Math.random() * this.bankSpots.length)];
    for (let tries = 0; tries < 4 && Math.abs(spot.x - this.bank.x) < 0.1 && Math.abs(spot.y - this.bank.y) < 0.1; tries++) {
      spot = this.bankSpots[Math.floor(Math.random() * this.bankSpots.length)];
    }
    this.bank.x = spot.x;
    this.bank.y = spot.y;
    this.bank.mesh.position.set(spot.x, 0, spot.y);
    this.bank.relocateTimer = 20;
    this.prevBankControl = null;
    this.onAnnounce?.('THE BANK MOVED!', '#ffd23d');
  }

  private updateBankVisual(dt: number) {
    if (!this.bank) return;
    this.bankPulse += dt * 3;
    const color = this.bank.controllingTeam === 'RED' ? 0xff3344 : this.bank.controllingTeam === 'BLUE' ? 0x3399ff : 0xffd23d;
    const ring = this.bank.mesh.children[0] as THREE.Mesh;
    const col = this.bank.mesh.children[1] as THREE.Mesh;
    if (ring && ring.material instanceof THREE.MeshBasicMaterial) {
      ring.material.color.setHex(color);
      ring.material.opacity = 0.7 + Math.sin(this.bankPulse) * 0.2;
    }
    if (col && col.material instanceof THREE.MeshBasicMaterial) {
      col.material.color.setHex(color);
      col.material.opacity = (this.bank.controllingTeam ? 0.2 : 0.1) + Math.sin(this.bankPulse) * 0.03;
    }
    this.bank.mesh.rotation.y += dt * 0.5;
  }

  public endGame(casters: Caster[]) {
    this.isGameOver = true;

    if (this.type === GameModeType.BATTLE_ROYALE) {
      const survivor = casters.find((c) => !c.isDead);
      if (survivor) {
        this.winnerText = `${survivor.name} WINS Last Caster Standing!`;
        if (survivor.id === 'player') sfx.playStart();
        else sfx.playSadGameOver();
      } else {
        this.winnerText = 'NO SURVIVORS. Tie Game!';
        sfx.playSadGameOver();
      }

    } else if (this.type === GameModeType.TEAM_BATTLE) {
      if (this.redScore > this.blueScore) {
        this.winnerText = 'RED TEAM WINS!';
        sfx.playStart();
      } else if (this.blueScore > this.redScore) {
        this.winnerText = 'BLUE TEAM WINS!';
        sfx.playSadGameOver();
      } else {
        this.winnerText = 'TIE GAME!';
        sfx.playSadGameOver();
      }

    } else if (this.type === GameModeType.GOLD_RUSH) {
      // Highest banked team total wins
      if (this.redScore > this.blueScore) {
        this.winnerText = `RED TEAM WINS Gold Rush ${this.redScore} - ${this.blueScore}!`;
        sfx.playStart();
      } else if (this.blueScore > this.redScore) {
        this.winnerText = `BLUE TEAM WINS Gold Rush ${this.blueScore} - ${this.redScore}!`;
        sfx.playSadGameOver();
      } else {
        this.winnerText = 'TIE GAME!';
        sfx.playSadGameOver();
      }
    }
  }

  /** Create animated flame particles that orbit the storm ring. */
  private createStormFlames(scene: THREE.Scene) {
    const count = this.stormFlameCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const data = new Float32Array(count * 4); // angle, baseHeight, flickerSpeed, flickerPhase

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.1;
      const r = this.safeRadius;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = Math.random() * 2.0;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      // Flame colors: orange to yellow gradient
      const t = Math.random();
      colors[i * 3] = 1.0; // R
      colors[i * 3 + 1] = 0.2 + t * 0.5; // G
      colors[i * 3 + 2] = 0.0; // B

      data[i * 4] = angle;
      data[i * 4 + 1] = positions[i * 3 + 1];
      data[i * 4 + 2] = 2.0 + Math.random() * 3.0; // flicker speed
      data[i * 4 + 3] = Math.random() * Math.PI * 2; // phase
    }

    this.stormFlameData = data;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.stormFlames = new THREE.Points(geo, mat);
    this.stormFlames.name = 'stormFlames';
    scene.add(this.stormFlames);
  }

  /** Animate the flame particles: flicker height, orbit slowly, follow ring shrink. */
  private updateStormFlames(_dt: number) {
    if (!this.stormFlames || !this.stormFlameData) return;
    const posAttr = this.stormFlames.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.stormFlames.geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    const data = this.stormFlameData;
    const count = this.stormFlameCount;
    const r = this.safeRadius;
    const scale = r / this.maxSafeRadius;

    for (let i = 0; i < count; i++) {
      const angle = data[i * 4] + this.stormPulseTime * 0.15;
      const flicker = Math.sin(this.stormPulseTime * data[i * 4 + 2] + data[i * 4 + 3]);
      const height = data[i * 4 + 1] + flicker * 1.2 + 1.0;

      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      // Flicker color intensity
      const intensity = 0.7 + flicker * 0.3;
      colors[i * 3] = intensity;
      colors[i * 3 + 1] = (0.2 + (flicker * 0.5 + 0.5) * 0.5) * intensity;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Scale particle size down as the ring shrinks
    (this.stormFlames.material as THREE.PointsMaterial).size = 0.5 * Math.max(0.4, scale);
  }

  cleanup(scene: THREE.Scene) {
    if (this.stormMesh) {
      // Remove child glow mesh
      const glow = this.stormMesh.getObjectByName('stormGlow') as THREE.Mesh | null;
      if (glow) {
        this.stormMesh.remove(glow);
        glow.geometry.dispose();
        (glow.material as THREE.Material).dispose();
      }
      scene.remove(this.stormMesh);
      this.stormMesh.geometry.dispose();
      (this.stormMesh.material as THREE.Material).dispose();
      this.stormMesh = null;
    }

    if (this.stormWallMesh) {
      scene.remove(this.stormWallMesh);
      this.stormWallMesh.geometry.dispose();
      (this.stormWallMesh.material as THREE.Material).dispose();
      this.stormWallMesh = null;
    }

    if (this.stormFlames) {
      scene.remove(this.stormFlames);
      this.stormFlames.geometry.dispose();
      (this.stormFlames.material as THREE.Material).dispose();
      this.stormFlames = null;
    }
    this.stormFlameData = null;

    this.coins.forEach((c) => {
      scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    });
    this.coins = [];

    if (this.bank) {
      scene.remove(this.bank.mesh);
      this.bank.mesh.traverse((ch) => {
        if (ch instanceof THREE.Mesh) {
          ch.geometry.dispose();
          (ch.material as THREE.Material).dispose();
        }
      });
      this.bank = null;
    }
    this.prevBankControl = null;
  }
}
