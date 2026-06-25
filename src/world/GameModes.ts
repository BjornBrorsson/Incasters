import * as THREE from 'three';
import { Caster } from '../entities/Caster';
import { sfx } from '../engine/Audio';

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

export class GameModeManager {
  type: GameModeType;
  
  // Battle Royale variables
  safeRadius: number = 18;
  maxSafeRadius: number = 18;
  private stormMesh: THREE.Mesh | null = null;
  private stormWallMesh: THREE.Mesh | null = null;
  
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

  // General timers
  matchTimer: number = 120; // 2 minutes
  isGameOver: boolean = false;
  winnerText: string = '';

  constructor(type: GameModeType) {
    this.type = type;
  }

  initMode(scene: THREE.Scene, casters: Caster[]) {
    this.isGameOver = false;
    this.winnerText = '';
    this.matchTimer = this.type === GameModeType.BATTLE_ROYALE ? 150 : 120;

    // Reset scores
    this.redScore = 0;
    this.blueScore = 0;
    this.respawnTimers.clear();
    this.safeRadius = this.maxSafeRadius;

    // Remove any existing mode meshes
    this.cleanup(scene);

    if (this.type === GameModeType.BATTLE_ROYALE) {
      // Create Red fire ring border
      const ringGeo = new THREE.RingGeometry(this.safeRadius - 0.1, this.safeRadius + 0.2, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff1100,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      this.stormMesh = new THREE.Mesh(ringGeo, ringMat);
      this.stormMesh.rotation.x = Math.PI / 2;
      this.stormMesh.position.y = 0.03;
      scene.add(this.stormMesh);

      // Create transparent red cylinder wall
      const wallGeo = new THREE.CylinderGeometry(this.safeRadius, this.safeRadius, 10, 64, 1, true);
      const wallMat = new THREE.MeshBasicMaterial({
        color: 0xff1100,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
      });
      this.stormWallMesh = new THREE.Mesh(wallGeo, wallMat);
      this.stormWallMesh.position.y = 5;
      scene.add(this.stormWallMesh);

      // Distribute teams to FFA (Gold/Neutral)
      casters.forEach((c) => {
        c.team = 'GOLD';
      });

    } else if (this.type === GameModeType.TEAM_BATTLE) {
      // Divide teams 4v4: player is always Red, bots split
      casters.forEach((c, idx) => {
        c.team = idx % 2 === 0 ? 'RED' : 'BLUE';
        c.reset();
        
        // Force high-contrast team colors
        if (c.team === 'RED') {
          c.updateColors(0xff1122, 0xff1122); // Vibrant red clothes and red spells
        } else {
          c.updateColors(0x0044ff, 0x00d2ff); // Vibrant blue clothes and cyan spells
        }
      });

    } else if (this.type === GameModeType.GOLD_RUSH) {
      // Free for all
      casters.forEach((c) => {
        c.team = 'GOLD';
      });
      this.coinSpawnTimer = 0;
      // Spawn 10 initial coins
      for (let i = 0; i < 12; i++) {
        this.spawnRandomCoin(scene);
      }
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

    // 1. Handle Respawning for Team Battle
    if (this.type === GameModeType.TEAM_BATTLE) {
      casters.forEach((c) => {
        if (c.isDead) {
          let time = this.respawnTimers.get(c.id) || 3.0;
          time -= dt;
          if (time <= 0) {
            // Respawn
            const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
            c.reset();
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

      // Sync visual ring/cylinder scales
      if (this.stormMesh && this.stormWallMesh) {
        const scale = this.safeRadius / this.maxSafeRadius;
        this.stormMesh.scale.set(scale, scale, 1.0);
        this.stormWallMesh.scale.set(scale, 1.0, scale);
      }

      // Damage casters outside the storm
      casters.forEach((c) => {
        if (c.isDead) return;
        const dist = Math.sqrt(c.x * c.x + c.y * c.y);
        if (dist > this.safeRadius) {
          // 12 damage per second
          c.takeDamage(12 * dt);
        }
      });

      // Victory check: last caster alive
      const aliveCasters = casters.filter((c) => !c.isDead);
      if (aliveCasters.length <= 1) {
        this.endGame(casters);
      }
    }

    // 3. Handle Gold Rush Coins
    if (this.type === GameModeType.GOLD_RUSH) {
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

      // Score threshold win condition
      if (this.redScore >= 20 || this.blueScore >= 20) {
        this.endGame(allCasters);
      }
    }

    // 2. Gold Rush: Spill all coins!
    if (this.type === GameModeType.GOLD_RUSH) {
      const dropCount = deceased.coins;
      deceased.coins = 0;

      // Spill coins in radial directions
      for (let i = 0; i < dropCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const force = 2.0 + Math.random() * 4.0;
        this.spawnSpilledCoin(scene, deceased.x, deceased.y, Math.cos(angle) * force, Math.sin(angle) * force);
      }
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

  private endGame(casters: Caster[]) {
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
      // Find player/bot with most coins
      let best: Caster | null = null;
      let maxCoins = -1;

      casters.forEach((c) => {
        if (c.coins > maxCoins) {
          maxCoins = c.coins;
          best = c;
        }
      });

      if (best) {
        this.winnerText = `${(best as Caster).name} WINS Gold Rush with ${maxCoins} coins!`;
        if ((best as Caster).id === 'player') sfx.playStart();
        else sfx.playSadGameOver();
      } else {
        this.winnerText = 'No coins collected!';
        sfx.playSadGameOver();
      }
    }
  }

  cleanup(scene: THREE.Scene) {
    if (this.stormMesh) {
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

    this.coins.forEach((c) => {
      scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    });
    this.coins = [];
  }
}
