import * as THREE from 'three';
import { Caster } from '../entities/Caster';
import { Bot } from '../entities/Bot';
import { Projectile } from '../entities/Projectile';
import type { ProjectileStats } from '../entities/Projectile';
import { PowerUp, PowerUpType, POWERUP_COLORS } from '../entities/PowerUp';
import { Arena, MapType } from '../world/Arena';
import { GameModeManager, GameModeType } from '../world/GameModes';
import { testCircleVsAABB, testCircleVsCircle, reflectVector, screenToWorldIso, screenAngleToWorldIso } from './Physics';
import { sfx } from './Audio';
import { InputManager } from './InputManager';
import { AimVisualizer } from './AimVisualizer';
import { PALETTE, createSkyDome } from './Theme';
import { Fx } from './Fx';
import { DEFAULT_CONFIG, randomCharacterConfig } from '../game/CharacterConfig';
import type { CharacterConfig } from '../game/CharacterConfig';
import type { MatchResult } from '../game/Progression';
import { DIFFICULTY_PRESETS } from '../game/Difficulty';
import type { DifficultyLevel, DifficultyConfig } from '../game/Difficulty';
import type { GameStateSnapshot, CasterNetState, ProjectileNetState, PlayerInputState } from '../net/LanClient';

export interface GameParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: number;
  size: number;
  opacity: number;
  lifetime: number;
  maxLifetime: number;
  mesh: THREE.Mesh;
}

export class Game {
  // Rendering
  scene!: THREE.Scene;
  camera!: THREE.OrthographicCamera;
  renderer!: THREE.WebGLRenderer;
  private container: HTMLDivElement;
  private camOffset = new THREE.Vector3(18, 25, 29);

  // Game-feel state
  private fx = new Fx();
  private shakeTrauma = 0;
  private hitStopTimer = 0;
  private playerCombo = 0;
  private playerComboTimer = 0;
  private firstBlood = false;

  // Game Entities
  arena!: THREE.Group;
  physicsArena!: Arena;
  casters: Caster[] = [];
  player!: Caster;
  projectiles: Projectile[] = [];
  powerups: PowerUp[] = [];
  particles: GameParticle[] = [];

  // Managers
  gameModeManager: GameModeManager;

  // Spawners timers
  private powerupSpawnCooldowns: number[] = [0, 0, 0, 0]; // matching arena spawners

  // Input states
  private input!: InputManager;
  private groundTarget = new THREE.Vector3(); // Mouse unprojected position
  private raycaster = new THREE.Raycaster();
  private planeY0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Active player projectile reference for guiding
  private playerGuidedProjectile: Projectile | null = null;
  
  // Game Configuration
  controlMode: 'TARGET' | 'MANUAL' = 'TARGET'; // TARGET tracks mouse, MANUAL uses Q/E
  private touchControlsActive: boolean = false;
  private touchJoysticks = {
    left: { active: false, id: -1, startX: 0, startY: 0, curX: 0, curY: 0, dirX: 0, dirY: 0 },
    right: { active: false, id: -1, startX: 0, startY: 0, curX: 0, curY: 0, dirX: 0, dirY: 0 }
  };
  /** Touch fire button state (decoupled from right stick). */
  private touchFireHeld = false;
  /** Touch dash button state. */
  private touchDashQueued = false;

  // Aiming visualizer & aim assist
  private aimVisualizer!: AimVisualizer;
  aimAssistEnabled: boolean = true;

  // State
  isPlaying: boolean = false;
  private clock = new THREE.Clock();

  // Custom Colors
  playerRobeColor: number = 0x6b2fa0; // Deep Violet default
  playerSpellColor: number = 0xe0a020; // Arcane Gold default
  playerConfig: CharacterConfig = { ...DEFAULT_CONFIG };

  // Match-end hook (wired to local progression by main.ts)
  onMatchEnd: ((result: MatchResult) => void) | null = null;
  private matchEndFired = false;

  // Match Customizer
  playerCount: number = 8;
  mapType: MapType = 'ARENA';
  difficulty: DifficultyLevel = 'NORMAL';
  private difficultyConfig: DifficultyConfig = DIFFICULTY_PRESETS.NORMAL;

  // ── LAN Multiplayer ──
  /** 'offline' = single-player vs bots, 'host' = hosting a LAN match, 'client' = connected to a host. */
  netMode: 'offline' | 'host' | 'client' = 'offline';
  /** Maps remote player IDs to their latest input state (host mode only). */
  private remoteInputs = new Map<string, PlayerInputState>();
  /** Maps remote player IDs to their Caster entity (host mode only). */
  private remoteCasters = new Map<string, Caster>();
  /** Callback fired after each tick with serialized state (host mode). */
  onNetBroadcast: ((state: GameStateSnapshot) => void) | null = null;
  private netBroadcastTimer = 0;
  private netBroadcastInterval = 0.05; // 20 Hz
  /** Callback fired when the host declares the match over (host mode). */
  onNetMatchEnd: ((result: any) => void) | null = null;
  /** Projectile net ID counter for state serialization. */
  private projectileNetId = 0;

  constructor(
    container: HTMLDivElement,
    modeType: GameModeType,
    playerRobeColor?: number,
    playerSpellColor?: number,
    mapType?: MapType,
    playerCount?: number,
    playerConfig?: CharacterConfig,
    difficulty?: DifficultyLevel
  ) {
    this.container = container;
    this.gameModeManager = new GameModeManager(modeType);
    if (playerConfig) {
      this.playerConfig = playerConfig;
    } else {
      this.playerConfig = {
        ...DEFAULT_CONFIG,
        robeColor: playerRobeColor ?? DEFAULT_CONFIG.robeColor,
        spellColor: playerSpellColor ?? DEFAULT_CONFIG.spellColor
      };
    }
    this.playerRobeColor = this.playerConfig.robeColor;
    this.playerSpellColor = this.playerConfig.spellColor;
    if (mapType !== undefined) this.mapType = mapType;
    if (playerCount !== undefined) this.playerCount = playerCount;
    if (difficulty !== undefined) {
      this.difficulty = difficulty;
      this.difficultyConfig = DIFFICULTY_PRESETS[difficulty];
    }
    this.initThree();
    this.setupInput();
    this.resetGame();
  }

  private initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.skyBottom);
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, PALETTE.fogDensity);

    // Bright gradient sky dome (code-only, no textures)
    this.scene.add(createSkyDome());

    // Setup Orthographic Isometric Camera
    const aspect = window.innerWidth / window.innerHeight;
    const d = 11; // frustum size
    this.camera = new THREE.OrthographicCamera(
      -d * aspect, d * aspect,
      d, -d,
      1, 1000
    );
    // Offset, slightly-odd isometric angle for a more dynamic, Outcasters-like view
    this.camera.position.copy(this.camOffset);
    this.camera.lookAt(0, 0, 0);

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting — warm fantasy daytime shading
    const ambientLight = new THREE.AmbientLight(PALETTE.ambient, 0.45);
    this.scene.add(ambientLight);

    // Hemisphere light delivers warm sky / earthy ground tones
    const hemiLight = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.6);
    hemiLight.position.set(0, 40, 0);
    this.scene.add(hemiLight);

    // Directional Shadow Casting Light — warm golden sun
    const dirLight = new THREE.DirectionalLight(0xffe8b0, 0.9);
    dirLight.position.set(-15, 30, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 80;
    // Stretch shadow bounds to fit orthographic arena
    const sd = 25;
    dirLight.shadow.camera.left = -sd;
    dirLight.shadow.camera.right = sd;
    dirLight.shadow.camera.top = sd;
    dirLight.shadow.camera.bottom = -sd;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Subtle warm fill light for environment depth
    const envLight = new THREE.DirectionalLight(0xffa040, 0.15);
    envLight.position.set(15, 20, -15);
    this.scene.add(envLight);

    // Listen to resize
    window.addEventListener('resize', this.onResize.bind(this));
  }

  resetGame() {
    // 1. Clean up old game state
    this.casters.forEach((c) => c.destroy(this.scene));
    this.projectiles.forEach((p) => p.destroy(this.scene));
    this.powerups.forEach((pu) => pu.destroy(this.scene));
    this.particles.forEach((p) => this.scene.remove(p.mesh));
    
    this.casters = [];
    this.projectiles = [];
    this.powerups = [];
    this.particles = [];
    this.playerGuidedProjectile = null;

    if (this.physicsArena) {
      this.physicsArena.destroy(this.scene);
    }

    // 2. Build Level Arena
    this.physicsArena = new Arena(this.mapType);
    this.physicsArena.buildArena(this.scene);
    this.physicsArena.onHazardFire = (x, y, angle) => this.spawnHazardProjectile(x, y, angle);

    // 3. Spawn Casters (Player + Bots)
    const sp = this.physicsArena.spawnPoints;
    const botNames = ['Glitch', 'Spike', 'Glimmer', 'Vortex', 'Echo', 'Frost', 'Blaze'];

    // Keep player colours in sync with the active config (handles restart edits)
    this.playerRobeColor = this.playerConfig.robeColor;
    this.playerSpellColor = this.playerConfig.spellColor;

    // Player (Index 0)
    const playerSp = sp[0];
    this.player = new Caster('player', 'You (Player)', playerSp.x, playerSp.y, 'GOLD', false, this.playerRobeColor, this.playerSpellColor, this.playerConfig);
    this.scene.add(this.player.mesh);
    this.casters.push(this.player);

    // Pre-defined color pairs (robe, spell) for bots in FFA
    const botColorPairs = [
      { robe: 0x2e7d32, spell: 0xd4a020 }, // Forest Green + Gold
      { robe: 0x8b2500, spell: 0x6b2fa0 }, // Crimson + Violet
      { robe: 0x4a3080, spell: 0x58c040 }, // Deep Purple + Sage
      { robe: 0xb07820, spell: 0xc84030 }, // Ochre + Scarlet
      { robe: 0x1a5c8a, spell: 0xe0a020 }, // Slate Blue + Amber
      { robe: 0x6b2fa0, spell: 0x2e7d32 }, // Violet + Forest
      { robe: 0xc84030, spell: 0x1a5c8a }, // Scarlet + Slate
      { robe: 0x4a7020, spell: 0x8b2500 }  // Olive + Crimson
    ];

    // Filter out pairs that match player's colors to avoid duplication
    const filteredPairs = botColorPairs.filter(
      p => p.robe !== this.playerRobeColor && p.spell !== this.playerSpellColor
    );
    const availablePairs = filteredPairs.length >= 7 ? filteredPairs : botColorPairs;

    // Bots
    for (let i = 1; i < this.playerCount; i++) {
      const botSp = sp[i % sp.length];
      const colorPair = availablePairs[(i - 1) % availablePairs.length];
      const bot = new Bot(
        `bot_${i}`,
        botNames[i - 1],
        botSp.x + (Math.random() - 0.5) * 0.5,
        botSp.y + (Math.random() - 0.5) * 0.5,
        'GOLD',
        colorPair.robe,
        colorPair.spell,
        randomCharacterConfig(colorPair.robe, colorPair.spell)
      );
      
      // Hook bot shoot capability into game loop spawner
      bot.onAiShoot = (angle, target) => {
        this.spawnProjectile(bot, angle, target);
      };

      // Apply difficulty settings to this bot
      bot.setDifficulty(this.difficultyConfig);

      this.scene.add(bot.mesh);
      this.casters.push(bot);
    }

    // 4. Initialize active Game Mode
    this.gameModeManager.onAnnounce = (text, color) => this.fx.announce(text, color);
    this.gameModeManager.initMode(this.scene, this.casters, this.physicsArena.powerupSpawners);

    // 5. Reset power-up spawners timers
    this.powerupSpawnCooldowns = this.physicsArena.powerupSpawners.map(() => 0);

    // 6. Setup 3D Aim Trajectory Visualizer
    if (this.aimVisualizer) {
      this.aimVisualizer.destroy(this.scene);
    }
    this.aimVisualizer = new AimVisualizer(this.scene);

    // Reset game-feel state
    this.shakeTrauma = 0;
    this.hitStopTimer = 0;
    this.playerCombo = 0;
    this.playerComboTimer = 0;
    this.firstBlood = false;
    this.matchEndFired = false;
    this.fx.clear();

    // Reset clocks
    this.clock.getDelta();
  }

  startGame() {
    this.isPlaying = true;
    this.clock.getDelta();
    sfx.playStart();

    // Show touch fire/dash buttons on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      const fireBtn = document.getElementById('fire-btn');
      if (fireBtn) fireBtn.style.display = 'block';
      const dashBtn = document.getElementById('dash-btn');
      if (dashBtn) dashBtn.style.display = 'flex';
    }
  }

  private setupInput() {
    // Unified keyboard + mouse + gamepad input
    this.input = new InputManager();

    // Touch screen / Mobile joy sticks setup
    window.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    window.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    window.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
    window.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false });

    // Dash Circle mobile click listener
    const dashCircle = document.getElementById('dash-cooldown-circle');
    if (dashCircle) {
      const handleMobileDash = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.triggerPlayerDash();
      };
      dashCircle.addEventListener('touchstart', handleMobileDash, { passive: false });
      dashCircle.addEventListener('click', handleMobileDash);
    }

    // Dedicated Fire button (touch)
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) {
      const onFireStart = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchFireHeld = true;
        fireBtn.classList.add('pressed');
      };
      const onFireEnd = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchFireHeld = false;
        fireBtn.classList.remove('pressed');
      };
      fireBtn.addEventListener('touchstart', onFireStart, { passive: false });
      fireBtn.addEventListener('touchend', onFireEnd, { passive: false });
      fireBtn.addEventListener('touchcancel', onFireEnd, { passive: false });
      fireBtn.addEventListener('mousedown', onFireStart);
      fireBtn.addEventListener('mouseup', onFireEnd);
      fireBtn.addEventListener('mouseleave', onFireEnd);
    }

    // Dedicated Dash button (touch)
    const dashBtn = document.getElementById('dash-btn');
    if (dashBtn) {
      const onDash = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchDashQueued = true;
        dashBtn.classList.add('pressed');
        setTimeout(() => dashBtn.classList.remove('pressed'), 120);
      };
      dashBtn.addEventListener('touchstart', onDash, { passive: false });
      dashBtn.addEventListener('mousedown', onDash);
    }
  }

  private updateGroundTarget() {
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera);
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.planeY0, intersectPoint);
    this.groundTarget.copy(intersectPoint);
  }

  private onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const d = 11;
    this.camera.left = -d * aspect;
    this.camera.right = d * aspect;
    this.camera.top = d;
    this.camera.bottom = -d;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Mobile virtual dual sticks logic
  private onTouchStart(e: TouchEvent) {
    if (!this.isPlaying) return;
    this.touchControlsActive = true;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      // Ignore touches that land on the fire/dash buttons (they have their own handlers)
      const target = touch.target as HTMLElement | null;
      if (target && (target.id === 'fire-btn' || target.id === 'dash-btn' ||
                     target.closest('#fire-btn') || target.closest('#dash-btn'))) {
        continue;
      }

      const screenWidthHalf = window.innerWidth / 2;

      // Left half = movement stick
      if (touch.clientX < screenWidthHalf && !this.touchJoysticks.left.active) {
        e.preventDefault();
        this.touchJoysticks.left.active = true;
        this.touchJoysticks.left.id = touch.identifier;
        this.touchJoysticks.left.startX = touch.clientX;
        this.touchJoysticks.left.startY = touch.clientY;
        this.touchJoysticks.left.curX = touch.clientX;
        this.touchJoysticks.left.curY = touch.clientY;
        this.touchJoysticks.left.dirX = 0;
        this.touchJoysticks.left.dirY = 0;
        this.showJoystickUI('left', touch.clientX, touch.clientY);
      }
      
      // Right half = aim/shoot stick
      if (touch.clientX >= screenWidthHalf && !this.touchJoysticks.right.active) {
        e.preventDefault();
        this.touchJoysticks.right.active = true;
        this.touchJoysticks.right.id = touch.identifier;
        this.touchJoysticks.right.startX = touch.clientX;
        this.touchJoysticks.right.startY = touch.clientY;
        this.touchJoysticks.right.curX = touch.clientX;
        this.touchJoysticks.right.curY = touch.clientY;
        this.touchJoysticks.right.dirX = 0;
        this.touchJoysticks.right.dirY = 0;
        this.showJoystickUI('right', touch.clientX, touch.clientY);

        // Firing is handled by handlePlayerFiring() each tick once aim direction is set
      }
    }
  }

  private onTouchMove(e: TouchEvent) {
    if (!this.isPlaying) return;
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      
      if (this.touchJoysticks.left.active && touch.identifier === this.touchJoysticks.left.id) {
        e.preventDefault();
        this.touchJoysticks.left.curX = touch.clientX;
        this.touchJoysticks.left.curY = touch.clientY;
        
        const dx = touch.clientX - this.touchJoysticks.left.startX;
        const dy = touch.clientY - this.touchJoysticks.left.startY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const maxDist = 50;
        const limit = Math.min(dist, maxDist);
        
        if (dist > 6) {
          this.touchJoysticks.left.dirX = (dx / dist) * (limit / maxDist);
          this.touchJoysticks.left.dirY = (dy / dist) * (limit / maxDist);
        } else {
          this.touchJoysticks.left.dirX = 0;
          this.touchJoysticks.left.dirY = 0;
        }
        
        this.updateJoystickUI('left', (dx / dist) * limit, (dy / dist) * limit);
      }

      if (this.touchJoysticks.right.active && touch.identifier === this.touchJoysticks.right.id) {
        e.preventDefault();
        this.touchJoysticks.right.curX = touch.clientX;
        this.touchJoysticks.right.curY = touch.clientY;

        const dx = touch.clientX - this.touchJoysticks.right.startX;
        const dy = touch.clientY - this.touchJoysticks.right.startY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const maxDist = 50;
        const limit = Math.min(dist, maxDist);

        if (dist > 6) {
          this.touchJoysticks.right.dirX = dx / dist;
          this.touchJoysticks.right.dirY = dy / dist;
        } else {
          this.touchJoysticks.right.dirX = 0;
          this.touchJoysticks.right.dirY = 0;
        }

        this.updateJoystickUI('right', (dx / dist) * limit, (dy / dist) * limit);

        // Continuous guide bullet direction on right stick slide (isometric converted)
        if (this.playerGuidedProjectile && dist > 6) {
          const screenAngle = Math.atan2(this.touchJoysticks.right.dirY, this.touchJoysticks.right.dirX);
          const worldAngle = screenAngleToWorldIso(screenAngle);
          this.playerGuidedProjectile.steerDirection = 0;
          this.playerGuidedProjectile.targetPoint = {
            x: this.playerGuidedProjectile.x + Math.cos(worldAngle) * 10,
            y: this.playerGuidedProjectile.y + Math.sin(worldAngle) * 10
          };
        }
      }
    }
  }

  private onTouchEnd(e: TouchEvent) {
    if (!this.isPlaying) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      
      if (this.touchJoysticks.left.active && touch.identifier === this.touchJoysticks.left.id) {
        this.touchJoysticks.left.active = false;
        this.touchJoysticks.left.id = -1;
        this.touchJoysticks.left.dirX = 0;
        this.touchJoysticks.left.dirY = 0;
        this.hideJoystickUI('left');
      }
      
      if (this.touchJoysticks.right.active && touch.identifier === this.touchJoysticks.right.id) {
        this.touchJoysticks.right.active = false;
        this.touchJoysticks.right.id = -1;
        this.touchJoysticks.right.dirX = 0;
        this.touchJoysticks.right.dirY = 0;
        // Do NOT clear playerGuidedProjectile here — the fire button controls guiding.
        // The right stick only steers; releasing it just stops steering.
        this.hideJoystickUI('right');
      }
    }
  }

  // HTML Joysticks HUD Helpers
  private showJoystickUI(side: 'left' | 'right', x: number, y: number) {
    const el = document.getElementById(`joy-${side}`);
    if (el) {
      el.style.left = `${x - 40}px`;
      el.style.top = `${y - 40}px`;
      el.style.display = 'block';
    }
  }
  private updateJoystickUI(side: 'left' | 'right', dx: number, dy: number) {
    const knob = document.getElementById(`joy-${side}-knob`);
    if (knob) {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }
  private hideJoystickUI(side: 'left' | 'right') {
    const el = document.getElementById(`joy-${side}`);
    if (el) el.style.display = 'none';
    const knob = document.getElementById(`joy-${side}-knob`);
    if (knob) knob.style.transform = `translate(0px, 0px)`;
  }

  // Spawners projectiles helper
  private spawnProjectile(
    owner: Caster,
    angle: number,
    targetLoc: THREE.Vector3 | { x: number; y: number } | null
  ): Projectile | null {
    if (owner.ammo <= 0) return null;
    owner.ammo--;
    owner.timeSinceLastShot = 0;

    const stats = owner.getProjectileStats();
    
    // Spawn projectile just ahead of the wizard body to prevent clipping
    const ox = owner.x + Math.cos(angle) * (owner.radius + 0.35);
    const oy = owner.y + Math.sin(angle) * (owner.radius + 0.35);

    const proj = new Projectile(ox, oy, angle, owner.id, stats);
    (proj as any)._netId = ++this.projectileNetId;
    
    if (targetLoc) {
      proj.targetPoint = { x: targetLoc.x, y: (targetLoc as any).z ?? (targetLoc as any).y };
    }

    this.scene.add(proj.mesh);
    this.projectiles.push(proj);

    // Audio SFX
    sfx.playShoot();
    
    // Spawn flash particles
    this.spawnBlastParticles(ox, oy, stats.color, 8);

    return proj;
  }

  // Neutral projectile fired by arena hazards (shooting statues) — damages everyone
  private spawnHazardProjectile(x: number, y: number, angle: number) {
    const stats: ProjectileStats = {
      damage: 18,
      speed: 7.5,
      maxBounces: 0,
      maxPierces: 0,
      splitLevel: 0,
      color: 0xff7733,
      freezeLevel: 0,
      wallRunLevel: 0
    };
    const proj = new Projectile(x, y, angle, 'hazard', stats);
    this.scene.add(proj.mesh);
    this.projectiles.push(proj);
    sfx.playShoot();
    this.spawnBlastParticles(x, y, stats.color, 5, 0.7);
  }

  // Spark/trail particle system
  spawnBlastParticles(x: number, y: number, color: number, count: number = 10, scaleMultiplier = 1) {
    const particleGeometry = new THREE.SphereGeometry(0.08 * scaleMultiplier, 4, 4);
    const particleMaterial = new THREE.MeshBasicMaterial({ color: color });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
      mesh.position.set(x, 0.4, y);
      this.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 4.0;
      const vel = new THREE.Vector3(Math.cos(angle) * speed, 0.2 + Math.random() * 2.0, Math.sin(angle) * speed);

      const p: GameParticle = {
        position: new THREE.Vector3(x, 0.4, y),
        velocity: vel,
        color,
        size: 1.0,
        opacity: 1.0,
        lifetime: 0,
        maxLifetime: 0.3 + Math.random() * 0.3,
        mesh
      };
      this.particles.push(p);
    }
  }

  // Projectiles splitting stacking logic
  private triggerProjectileSplit(proj: Projectile) {
    if (proj.splitLevel <= 0) return;
    
    const count = proj.splitLevel === 1 ? 2 : proj.splitLevel === 2 ? 3 : 4;
    const currentAngle = Math.atan2(proj.vy, proj.vx);
    const arc = Math.PI / 3; // 60 degrees spread
    const startAngle = currentAngle - arc / 2;
    const angleStep = arc / (count - 1 || 1);

    const parentOwner = this.casters.find((c) => c.id === proj.ownerId);
    if (!parentOwner) return;

    for (let i = 0; i < count; i++) {
      const angle = startAngle + i * angleStep;
      
      // Reduced stats for splits
      const splitStats: ProjectileStats = {
        ...proj.stats,
        damage: Math.round(proj.stats.damage * 0.6),
        speed: proj.stats.speed * 0.85,
        maxBounces: Math.max(0, proj.stats.maxBounces - 1),
        maxPierces: 0, // Splits don't pierce
        splitLevel: proj.splitLevel - 1 // Reduce split counter
      };

      // Spawn slightly offset in direction
      const sx = proj.x + Math.cos(angle) * 0.25;
      const sy = proj.y + Math.sin(angle) * 0.25;

      const splitProj = new Projectile(sx, sy, angle, proj.ownerId, splitStats);
      this.scene.add(splitProj.mesh);
      this.projectiles.push(splitProj);
    }

    sfx.playBounce();
  }

  // ─────────────────────────────────────────────────────────────
  // LAN MULTIPLAYER: Host-side remote player management
  // ─────────────────────────────────────────────────────────────

  /** Register a remote human player and assign them to a bot slot (host mode). */
  registerRemotePlayer(playerId: string, name: string) {
    if (this.netMode !== 'host') return;
    this.remoteInputs.set(playerId, { moveX: 0, moveY: 0, aimAngle: 0, firing: false, dashing: false });

    // Find a bot to replace
    for (let i = 1; i < this.casters.length; i++) {
      const c = this.casters[i];
      if (c instanceof Bot && !this.remoteCasters.has(c.id)) {
        c.id = playerId;
        c.name = name;
        this.remoteCasters.set(playerId, c);
        break;
      }
    }
  }

  /** Update a remote player's input state (host mode). */
  setRemoteInput(playerId: string, input: PlayerInputState) {
    if (this.netMode !== 'host') return;
    this.remoteInputs.set(playerId, input);
  }

  /** Remove a remote player and restore their slot to a bot (host mode). */
  removeRemotePlayer(playerId: string) {
    this.remoteInputs.delete(playerId);
    const caster = this.remoteCasters.get(playerId);
    if (caster) {
      // Restore as bot by marking it dead; it will respawn or be replaced
      caster.isDead = true;
    }
    this.remoteCasters.delete(playerId);
  }

  /** Apply all remote player inputs to their caster entities (host mode). */
  private applyRemoteInputs() {
    this.remoteInputs.forEach((input, playerId) => {
      const caster = this.remoteCasters.get(playerId);
      if (!caster || caster.isDead) return;

      const speed = caster.getSpeed();
      caster.vx = input.moveX * speed;
      caster.vy = input.moveY * speed;
      caster.aimAngle = input.aimAngle;

      if (input.firing && caster.shootTimer <= 0 && caster.ammo > 0) {
        this.spawnProjectile(caster, input.aimAngle, null);
      }

      if (input.dashing && caster.dashCooldownTimer <= 0) {
        const mag = Math.sqrt(input.moveX * input.moveX + input.moveY * input.moveY);
        if (mag > 0.1) {
          caster.dash((input.moveX / mag) * speed, (input.moveY / mag) * speed);
        }
      }
    });
  }

  /** Serialize current game state for network broadcast (host mode). */
  serializeNetState(): GameStateSnapshot {
    const casters: CasterNetState[] = this.casters.map((c) => ({
      id: c.id,
      name: c.name,
      x: c.x,
      y: c.y,
      health: c.health,
      maxHealth: c.maxHealth,
      isDead: c.isDead,
      team: c.team,
      score: c.score,
      coins: c.coins,
      ammo: c.ammo,
      aimAngle: c.aimAngle,
      isDashing: c.isDashing,
      robeColor: c.clothingColor,
      spellColor: c.spellColor,
      shieldActive: c.shieldMesh ? c.shieldMesh.visible : false
    }));

    const projectiles: ProjectileNetState[] = this.projectiles.map((p) => ({
      id: (p as any)._netId || 0,
      x: p.x,
      y: p.y,
      ownerId: p.ownerId,
      trailColor: p.trailColor,
      isDead: p.isDead
    }));

    return {
      casters,
      projectiles,
      powerups: [],
      matchTimer: this.gameModeManager.matchTimer,
      redScore: this.gameModeManager.redScore,
      blueScore: this.gameModeManager.blueScore,
      safeRadius: this.gameModeManager.safeRadius,
      isGameOver: this.gameModeManager.isGameOver,
      winnerText: this.gameModeManager.winnerText
    };
  }

  // Update loop
  tick() {
    requestAnimationFrame(this.tick.bind(this));

    if (!this.isPlaying) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Clamp dt to prevent massive jumps when switching tabs
    let dt = Math.min(this.clock.getDelta(), 0.1);

    // Hit-stop: briefly slow time for impact on kills
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      dt *= 0.12;
    }

    // Decay the player's multi-kill combo window
    if (this.playerComboTimer > 0) this.playerComboTimer -= dt;

    // 0. Refresh gamepad snapshot for this frame
    this.input.pollGamepad();

    // 1. Process player inputs and movement
    this.updatePlayerMovement();

    // Edge-triggered dash (spacebar / gamepad button / touch dash button)
    if (this.input.consumeDash() || this.touchDashQueued) {
      this.touchDashQueued = false;
      this.triggerPlayerDash();
    }

    // Continuous casting based on held fire input (mouse / trigger / touch)
    this.handlePlayerFiring();

    // 2. Process active projectile curving guides for player
    this.updateGuidedProjectile();

    // 2a. LAN host: apply remote player inputs to their caster entities
    if (this.netMode === 'host') {
      this.applyRemoteInputs();
    }

    // 3. Process AI Bot Updates (skip casters controlled by remote humans)
    this.casters.forEach((caster) => {
      if (caster instanceof Bot && !this.remoteCasters.has(caster.id)) {
        caster.aiUpdate(
          dt,
          this.casters,
          this.projectiles,
          this.powerups,
          this.physicsArena.walls,
          this.gameModeManager.coins,
          this.gameModeManager.type === GameModeType.BATTLE_ROYALE ? this.gameModeManager.safeRadius : 0,
          this.gameModeManager.bank
        );
      }
    });

    // 4. Update Game Mode rules (shrinking storm, gold coin spawns)
    this.gameModeManager.update(dt, this.scene, this.casters, this.physicsArena.spawnPoints);

    // 5. Update Entity physics & animations
    this.casters.forEach((c) => c.update(dt));
    this.projectiles.forEach((p) => p.update(dt));
    this.powerups.forEach((pu) => pu.update(dt));
    this.physicsArena.update(dt);

    // 6. Physics Collision Checks
    this.handleCollisions();

    // 7. Spawning power-ups in arena spawners
    this.updatePowerUpSpawning(dt);

    // 8. Update decorative particle trails & bursts
    this.updateParticles(dt);

    // Camera follow player using the fixed offset angle (smooth lerp).
    // The camera subtly leads toward the player's aim/facing direction to give
    // more visibility in the direction they're engaging — a hallmark of the
    // Outcasters isometric camera.
    if (!this.player.isDead) {
      // Aim-direction lead: nudge the look target a few units in the aim dir.
      const leadDist = 3.2;
      const leadX = this.player.x + Math.cos(this.player.aimAngle) * leadDist;
      const leadZ = this.player.y + Math.sin(this.player.aimAngle) * leadDist;

      const targetCamX = this.player.x + this.camOffset.x;
      const targetCamZ = this.player.y + this.camOffset.z;

      this.camera.position.x += (targetCamX - this.camera.position.x) * 4 * dt;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * 4 * dt;
      this.camera.position.y += (this.camOffset.y - this.camera.position.y) * 4 * dt;

      const lookTarget = new THREE.Vector3(leadX, 0, leadZ);

      // Screen shake (trauma-based): pan the view and add a slight roll
      if (this.shakeTrauma > 0) {
        const s = this.shakeTrauma * this.shakeTrauma;
        const ox = (Math.random() * 2 - 1) * s * 1.6;
        const oz = (Math.random() * 2 - 1) * s * 1.6;
        this.camera.position.x += ox;
        this.camera.position.z += oz;
        lookTarget.x += ox;
        lookTarget.z += oz;
        this.camera.lookAt(lookTarget);
        this.camera.rotation.z += (Math.random() * 2 - 1) * s * 0.04;
        this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 1.6);
      } else {
        this.camera.lookAt(lookTarget);
      }
    }

    // 9. Update Aim Trajectory Guide & Target Reticle
    if (this.aimVisualizer && !this.player.isDead) {
      const isAiming = (
        (this.touchControlsActive && this.touchJoysticks.right.active && (this.touchJoysticks.right.dirX !== 0 || this.touchJoysticks.right.dirY !== 0)) ||
        (this.input.usingGamepad && this.input.gamepadAim().active) ||
        (!this.touchControlsActive && !this.input.usingGamepad)
      );
      this.aimVisualizer.update(
        this.player,
        isAiming,
        this.playerGuidedProjectile,
        this.physicsArena.walls,
        dt
      );
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Update HTML HUD
    this.updateHUD();

    // LAN host: broadcast state to clients at regular intervals
    if (this.netMode === 'host' && this.onNetBroadcast) {
      this.netBroadcastTimer += dt;
      if (this.netBroadcastTimer >= this.netBroadcastInterval) {
        this.netBroadcastTimer = 0;
        this.onNetBroadcast(this.serializeNetState());
      }
    }
  }

  /**
   * Smart aim assist: gently nudges raw aiming angle towards nearby enemy casters.
   */
  private applyAimAssist(rawAngle: number): number {
    if (!this.aimAssistEnabled || !this.player || this.player.isDead) return rawAngle;
    
    let bestCaster: Caster | null = null;
    let minDiff = 0.38; // ~22° cone
    const maxRange = 14;

    for (const c of this.casters) {
      if (c.id === this.player.id || c.isDead) continue;
      if (this.gameModeManager.type === GameModeType.TEAM_BATTLE && c.team === this.player.team) continue;

      const dx = c.x - this.player.x;
      const dy = c.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxRange || dist < 0.5) continue;

      const angleToTarget = Math.atan2(dy, dx);
      let diff = angleToTarget - rawAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      if (Math.abs(diff) < minDiff) {
        minDiff = Math.abs(diff);
        bestCaster = c;
      }
    }

    if (bestCaster) {
      const dx = bestCaster.x - this.player.x;
      const dy = bestCaster.y - this.player.y;
      const targetAngle = Math.atan2(dy, dx);
      let diff = targetAngle - rawAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      return rawAngle + diff * 0.65;
    }

    return rawAngle;
  }

  private updatePlayerMovement() {
    if (this.player.isDead) return;

    let rawMoveX = 0;
    let rawMoveY = 0;

    if (this.touchControlsActive && this.touchJoysticks.left.active) {
      rawMoveX = this.touchJoysticks.left.dirX;
      rawMoveY = this.touchJoysticks.left.dirY;
    } else if (this.input.usingGamepad) {
      const gm = this.input.gamepadMove();
      rawMoveX = gm.x;
      rawMoveY = gm.y;
    } else {
      const km = this.input.keyboardMove();
      rawMoveX = km.x;
      rawMoveY = km.y;
    }

    // Convert 2D screen/stick vector to isometric simulation coordinates
    const worldMove = screenToWorldIso(rawMoveX, rawMoveY);
    const moveX = worldMove.x;
    const moveY = worldMove.y;

    const length = Math.sqrt(moveX * moveX + moveY * moveY);
    if (length > 0.05) {
      const speed = this.player.getSpeed();
      const rawMag = Math.min(Math.sqrt(rawMoveX * rawMoveX + rawMoveY * rawMoveY), 1);
      this.player.vx = (moveX / length) * speed * rawMag;
      this.player.vy = (moveY / length) * speed * rawMag;
    } else {
      this.player.vx = 0;
      this.player.vy = 0;
    }

    // Aiming source priority: touch right stick > gamepad right stick > mouse
    if (this.touchControlsActive && this.touchJoysticks.right.active && (this.touchJoysticks.right.dirX !== 0 || this.touchJoysticks.right.dirY !== 0)) {
      const screenAngle = Math.atan2(this.touchJoysticks.right.dirY, this.touchJoysticks.right.dirX);
      const worldAngle = screenAngleToWorldIso(screenAngle);
      this.player.aimAngle = this.applyAimAssist(worldAngle);
    } else if (this.input.usingGamepad) {
      const ga = this.input.gamepadAim();
      if (ga.active) {
        const screenAngle = Math.atan2(ga.y, ga.x);
        const worldAngle = screenAngleToWorldIso(screenAngle);
        this.player.aimAngle = this.applyAimAssist(worldAngle);
      }
    } else {
      this.updateGroundTarget();
      this.player.aimAngle = Math.atan2(this.groundTarget.z - this.player.y, this.groundTarget.x - this.player.x);
    }
  }

  private handlePlayerFiring() {
    if (this.player.isDead) {
      this.playerGuidedProjectile = null;
      return;
    }

    const rightStickAiming = this.touchControlsActive && this.touchJoysticks.right.active && (this.touchJoysticks.right.dirX !== 0 || this.touchJoysticks.right.dirY !== 0);
    const touchFiring = this.touchControlsActive && (this.touchFireHeld || rightStickAiming);
    const fireHeld = touchFiring || this.input.isFireHeld();

    if (!fireHeld) {
      this.playerGuidedProjectile = null;
      return;
    }

    if (this.player.shootTimer <= 0 && this.player.ammo > 0) {
      const useMouseTarget = !touchFiring && !this.input.usingGamepad && !this.touchControlsActive && this.controlMode === 'TARGET';
      if (useMouseTarget) this.updateGroundTarget();

      let aimAngle = this.player.aimAngle;
      if (rightStickAiming) {
        const screenAngle = Math.atan2(this.touchJoysticks.right.dirY, this.touchJoysticks.right.dirX);
        const worldAngle = screenAngleToWorldIso(screenAngle);
        aimAngle = this.applyAimAssist(worldAngle);
        this.player.aimAngle = aimAngle;
      }

      const proj = this.spawnProjectile(
        this.player,
        aimAngle,
        useMouseTarget ? this.groundTarget : null
      );
      this.playerGuidedProjectile = proj;
      this.player.shootTimer = this.player.getFireRateCooldown();
    }
  }

  private triggerPlayerDash() {
    if (this.player.isDead) return;

    let rawMoveX = 0;
    let rawMoveY = 0;

    if (this.touchControlsActive && this.touchJoysticks.left.active) {
      rawMoveX = this.touchJoysticks.left.dirX;
      rawMoveY = this.touchJoysticks.left.dirY;
    } else if (this.input.usingGamepad) {
      const gm = this.input.gamepadMove();
      rawMoveX = gm.x;
      rawMoveY = gm.y;
    } else {
      const km = this.input.keyboardMove();
      rawMoveX = km.x;
      rawMoveY = km.y;
    }

    const worldMove = screenToWorldIso(rawMoveX, rawMoveY);
    const canDash = this.player.dashCooldownTimer <= 0 && !this.player.isDashing && !this.player.isDead;
    this.player.dash(worldMove.x, worldMove.y);
    if (canDash) this.input.rumble(90, 0.25, 0.5);
  }

  private updateGuidedProjectile() {
    if (!this.playerGuidedProjectile || this.playerGuidedProjectile.isDead) {
      this.playerGuidedProjectile = null;
      return;
    }

    const proj = this.playerGuidedProjectile;

    // A committed wall-runner ignores further guidance and hugs the wall
    if (proj.isWallRunning) return;

    if (this.touchControlsActive && this.touchJoysticks.right.active && (this.touchJoysticks.right.dirX !== 0 || this.touchJoysticks.right.dirY !== 0)) {
      const screenAngle = Math.atan2(this.touchJoysticks.right.dirY, this.touchJoysticks.right.dirX);
      const worldAngle = screenAngleToWorldIso(screenAngle);
      proj.targetPoint = {
        x: proj.x + Math.cos(worldAngle) * 10,
        y: proj.y + Math.sin(worldAngle) * 10
      };
      proj.steerDirection = 0;
    } else if (this.input.usingGamepad) {
      const ga = this.input.gamepadAim();
      if (this.controlMode === 'MANUAL') {
        proj.steerDirection = Math.abs(ga.x) > 0.2 ? Math.sign(ga.x) : 0;
        proj.targetPoint = null;
      } else {
        if (ga.active) {
          const screenAngle = Math.atan2(ga.y, ga.x);
          const worldAngle = screenAngleToWorldIso(screenAngle);
          proj.targetPoint = {
            x: proj.x + Math.cos(worldAngle) * 10,
            y: proj.y + Math.sin(worldAngle) * 10
          };
          proj.steerDirection = 0;
        }
      }
    } else if (this.controlMode === 'TARGET') {
      this.updateGroundTarget();
      proj.targetPoint = { x: this.groundTarget.x, y: this.groundTarget.z };
      proj.steerDirection = 0;
    } else {
      let steer = 0;
      if (this.input.keys['q']) steer -= 1;
      if (this.input.keys['e']) steer += 1;
      proj.steerDirection = steer;
      proj.targetPoint = null;
    }
  }

  private addShake(amount: number) {
    this.shakeTrauma = Math.min(1, this.shakeTrauma + amount);
  }

  private worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight
    };
  }

  private teamCss(team?: 'RED' | 'BLUE' | 'GOLD'): string {
    if (team === 'RED') return '#ff5a6e';
    if (team === 'BLUE') return '#4aa8ff';
    return '#ffd23d';
  }

  private registerPlayerKill() {
    this.playerCombo = this.playerComboTimer > 0 ? this.playerCombo + 1 : 1;
    this.playerComboTimer = 3.0;
    if (this.playerCombo === 2) this.fx.announce('DOUBLE KILL!', '#ff8a3d');
    else if (this.playerCombo === 3) this.fx.announce('TRIPLE KILL!', '#ff5fa2');
    else if (this.playerCombo >= 4) this.fx.announce('RAMPAGE!', '#ffd23d', true);
  }

  private onCasterKilled(killer: Caster | null, victim: Caster) {
    this.addShake(0.5);

    const killerName = killer ? killer.name : 'The Arena';
    this.fx.killFeedItem(
      killerName,
      this.teamCss(killer ? killer.team : undefined),
      victim.name,
      this.teamCss(victim.team)
    );

    if (!this.firstBlood) {
      this.firstBlood = true;
      this.fx.announce('FIRST BLOOD!', '#ff5555');
    }

    const playerInvolved = (killer !== null && killer.id === 'player') || victim.id === 'player';
    if (playerInvolved) this.hitStopTimer = 0.07;

    if (killer && killer.id === 'player') {
      this.registerPlayerKill();
    } else if (victim.id === 'player') {
      this.fx.announce('YOU WERE ELIMINATED', '#ff5555');
    }
  }

  private handleCollisions() {
    const walls = this.physicsArena.walls;

    // 1. Caster vs Wall AABB collisions (resolves overlap)
    this.casters.forEach((caster) => {
      if (caster.isDead || caster.isLeaping) return;

      walls.forEach((wall) => {
        const result = testCircleVsAABB(caster, wall);
        if (result.collided) {
          if (wall.isBouncePad) {
            // Push Caster back violently
            caster.vx = result.normalX * caster.getSpeed() * 1.5;
            caster.vy = result.normalY * caster.getSpeed() * 1.5;
            caster.dash(result.normalX, result.normalY); // triggering a forced dash
          } else {
            // Standard wall pushback
            caster.x += result.overlapX;
            caster.y += result.overlapY;
            caster.syncMeshPosition();
          }
        }
      });
    });

    // 2. Caster vs Caster collisions (resolves overlap)
    for (let i = 0; i < this.casters.length; i++) {
      const c1 = this.casters[i];
      if (c1.isDead || c1.isLeaping) continue;

      for (let j = i + 1; j < this.casters.length; j++) {
        const c2 = this.casters[j];
        if (c2.isDead || c2.isLeaping) continue;

        const result = testCircleVsCircle(c1, c2);
        if (result.collided) {
          // Push both apart equally
          c1.x += result.overlapX * 0.5;
          c1.y += result.overlapY * 0.5;
          c2.x -= result.overlapX * 0.5;
          c2.y -= result.overlapY * 0.5;
          c1.syncMeshPosition();
          c2.syncMeshPosition();
        }
      }
    }

    // 2.5 Caster vs JumpPad collisions (launches them in a leap!)
    this.casters.forEach((caster) => {
      if (caster.isDead || caster.isLeaping) return;

      this.physicsArena.jumpPads.forEach((pad) => {
        const dx = caster.x - pad.x;
        const dy = caster.y - pad.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < caster.radius + pad.radius - 0.25) {
          // Trigger leap!
          caster.isLeaping = true;
          caster.leapTimer = caster.leapDuration;
          caster.leapVx = pad.launchVx;
          caster.leapVy = pad.launchVy;
          caster.isDashing = false; // Cancel active dash

          sfx.playDash(); // play launch sweep
          this.spawnBlastParticles(pad.x, pad.y, 0x39ff14, 15, 1.2);
        }
      });
    });

    // 3. Projectile vs Wall collision checking
    this.projectiles.forEach((proj) => {
      if (proj.isDead) return;

      walls.forEach((wall) => {
        const result = testCircleVsAABB(proj, wall);
        if (result.collided) {
          // If hits a bounce pad, reflect bullet. Otherwise trigger normal bounce powerup reflection
          if (wall.isBouncePad) {
            const reflected = reflectVector(proj.vx, proj.vy, result.normalX, result.normalY, 1.0);
            proj.vx = reflected.x;
            proj.vy = reflected.y;
            proj.targetPoint = null; // Clear tracking target on bounce to fly straight
            sfx.playBounce();
            this.spawnBlastParticles(proj.x, proj.y, 0xff00ff, 5, 0.6);
          } else {
            proj.handleWallCollision(result.normalX, result.normalY, result.overlapX, result.overlapY);
          }
        }
      });
    });

    // 4. Projectile vs Projectile collisions (cancellation)
    for (let i = 0; i < this.projectiles.length; i++) {
      const p1 = this.projectiles[i];
      if (p1.isDead) continue;

      for (let j = i + 1; j < this.projectiles.length; j++) {
        const p2 = this.projectiles[j];
        if (p2.isDead) continue;

        // Don't cancel bullets from the same owner
        if (p1.ownerId === p2.ownerId) continue;

        const result = testCircleVsCircle(p1, p2);
        if (result.collided) {
          p1.isDead = true;
          p2.isDead = true;

          // Play cancel sound and spark burst
          sfx.playHit();
          const mixColor = Math.random() < 0.5 ? p1.trailColor : p2.trailColor;
          this.spawnBlastParticles((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, mixColor, 12, 1.2);
        }
      }
    }

    // 5. Projectile vs Caster collisions
    this.projectiles.forEach((proj) => {
      if (proj.isDead) return;

      this.casters.forEach((caster) => {
        if (caster.isDead || caster.isLeaping) return;
        
        // Don't hit yourself!
        if (caster.id === proj.ownerId) return;

        // TDM: Don't hit teammates
        if (this.gameModeManager.type === GameModeType.TEAM_BATTLE) {
          const owner = this.casters.find(c => c.id === proj.ownerId);
          if (owner && owner.team === caster.team) return;
        }

        const result = testCircleVsCircle(proj, caster);
        if (result.collided) {
          const hitSuccess = proj.registerCasterHit(caster.id);
          if (hitSuccess) {
            const damageApplied = caster.takeDamage(proj.stats.damage);
            
            if (damageApplied) {
              // Apply freeze slow if projectile has freezeLevel
              if (proj.stats.freezeLevel && proj.stats.freezeLevel > 0) {
                caster.freezeTimer = 2.5;
                caster.freezeLevel = Math.max(caster.freezeLevel, proj.stats.freezeLevel);
              }
              
              // Mode-specific damage hooks (e.g. drop coins)
              this.gameModeManager.handleCasterHit(this.scene, caster);

              // Juice: damage numbers for player-involved hits + shake + rumble
              const ownerIsPlayer = proj.ownerId === 'player';
              if (caster.id === 'player' || ownerIsPlayer) {
                const sp = this.worldToScreen(caster.x, 1.6, caster.y);
                this.fx.damageNumber(sp.x, sp.y, Math.round(proj.stats.damage), caster.id === 'player' ? '#ff6b6b' : '#ffffff');
              }
              if (caster.id === 'player') {
                this.input.rumble(110, 0.4, 0.7);
                this.addShake(0.22);
              }
            }

            this.spawnBlastParticles(proj.x, proj.y, proj.trailColor, 10, 0.8);

            // Handle death logic
            if (caster.isDead) {
              const killer = this.casters.find((c) => c.id === proj.ownerId) || null;
              if (killer) killer.score++;
              if (killer && killer.id === 'player') this.input.rumble(220, 0.6, 0.9);
              
              this.gameModeManager.handleCasterDeath(this.scene, caster, killer, this.casters);

              // Spawn giant explosion of caster team color
              const casterColor = caster.team === 'RED' ? 0xff3355 : caster.team === 'BLUE' ? 0x3388ff : 0xffcc00;
              this.spawnBlastParticles(caster.x, caster.y, casterColor, 20, 1.6);

              // Juice: kill feed, announcer, shake, hit-stop
              this.onCasterKilled(killer, caster);
            }
          }
        }
      });
    });

    // 6. Caster vs PowerUp collisions
    this.casters.forEach((caster) => {
      if (caster.isDead) return;

      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const pu = this.powerups[i];
        const result = testCircleVsCircle(caster, pu);
        if (result.collided) {
          caster.collectPowerUp(pu.type);
          
          // Spawn burst particles around player
          this.spawnBlastParticles(pu.x, pu.y, POWERUP_COLORS[pu.type], 15, 1.0);

          pu.destroy(this.scene);
          this.powerups.splice(i, 1);
        }
      }
    });

    // 7. Clean up deceased Projectiles (and trigger split upgrades if necessary)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (proj.isDead) {
        // Trigger split stacking if the bullet exploded
        if (proj.splitLevel > 0) {
          this.triggerProjectileSplit(proj);
        }
        proj.destroy(this.scene);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updatePowerUpSpawning(dt: number) {
    const spawners = this.physicsArena.powerupSpawners;
    const types: PowerUpType[] = [
      PowerUpType.BOUNCE,
      PowerUpType.PIERCE,
      PowerUpType.SPLIT,
      PowerUpType.HASTE,
      PowerUpType.SHIELD,
      PowerUpType.FREEZE,
      PowerUpType.WALLRUN
    ];

    for (let i = 0; i < spawners.length; i++) {
      const spawn = spawners[i];
      
      // Check if a powerup is already floating at this spawner
      const occupied = this.powerups.some((pu) => {
        const dx = pu.x - spawn.x;
        const dy = pu.y - spawn.y;
        return (dx * dx + dy * dy) < 1.0;
      });

      if (!occupied) {
        this.powerupSpawnCooldowns[i] += dt;
        if (this.powerupSpawnCooldowns[i] >= 11.0) { // Spawns every 11 seconds
          this.powerupSpawnCooldowns[i] = 0;
          const randomType = types[Math.floor(Math.random() * types.length)];
          const pu = new PowerUp(spawn.x, spawn.y, randomType);
          this.scene.add(pu.mesh);
          this.powerups.push(pu);
        }
      } else {
        this.powerupSpawnCooldowns[i] = 0;
      }
    }
  }

  private updateParticles(dt: number) {
    // 1. Spawning bullet trails
    this.projectiles.forEach((proj) => {
      // Spawn trail particle
      const geom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({
        color: proj.trailColor,
        transparent: true,
        opacity: 0.7
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(proj.x, 0.4 + (Math.random() - 0.5) * 0.15, proj.y);
      this.scene.add(mesh);

      const p: GameParticle = {
        position: mesh.position.clone(),
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5),
        color: proj.trailColor,
        size: 1.0,
        opacity: 0.7,
        lifetime: 0,
        maxLifetime: 0.28,
        mesh
      };
      this.particles.push(p);
    });

    // 2. Animate and update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifetime += dt;

      if (p.lifetime >= p.maxLifetime) {
        // Dispose
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      } else {
        // Move particle
        p.position.addScaledVector(p.velocity, dt);
        p.mesh.position.copy(p.position);
        
        // Gravity for blast sparks
        if (p.velocity.y > 0.01) {
          p.velocity.y -= 9.81 * dt;
        }

        // Scale down and fade opacity
        const ratio = 1 - (p.lifetime / p.maxLifetime);
        p.mesh.scale.set(ratio, ratio, ratio);
        if (p.mesh.material instanceof THREE.MeshBasicMaterial) {
          p.mesh.material.opacity = p.opacity * ratio;
        }
      }
    }
  }

  private updateHUD() {
    // 1. Health Bar
    const hpProgress = document.getElementById('hp-progress');
    const hpText = document.getElementById('hp-text');
    if (hpProgress && hpText) {
      hpProgress.style.width = `${this.player.health}%`;
      hpText.innerText = `${Math.round(this.player.health)} / 100`;
    }
    
    // Ammo slots update
    const ammoSlots = document.getElementById('ammo-slots');
    if (ammoSlots) {
      const pips = ammoSlots.children;
      for (let j = 0; j < pips.length; j++) {
        if (j < this.player.ammo) {
          pips[j].className = 'ammo-pip active';
        } else {
          pips[j].className = 'ammo-pip';
        }
      }
    }

    // Touch fire button ammo indicator
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) {
      fireBtn.classList.toggle('empty', this.player.ammo <= 0);
    }

    // 2. Power-ups HUD
    for (let i = 0; i < 3; i++) {
      const slot = document.getElementById(`pu-slot-${i}`);
      const text = document.getElementById(`pu-slot-${i}-text`);
      if (slot && text) {
        if (i < this.player.powerupSlotsOrder.length) {
          const type = this.player.powerupSlotsOrder[i];
          const stack = this.player.powerups.get(type) || 1;
          
          text.innerText = `${type} [Lv ${stack}]`;
          slot.className = 'pu-slot active';
          
          const colors: Record<PowerUpType, string> = {
            BOUNCE: '#ffaa00',
            PIERCE: '#aa00ff',
            SPLIT: '#00dfff',
            HASTE: '#39ff14',
            SHIELD: '#ffffff',
            FREEZE: '#4df0ff',
            WALLRUN: '#00e0b0'
          };
          slot.style.borderColor = colors[type];
          slot.style.boxShadow = `0 0 10px ${colors[type]}`;
        } else {
          text.innerText = 'Empty Slot';
          slot.className = 'pu-slot';
          slot.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          slot.style.boxShadow = 'none';
        }
      }
    }

    // 3. Score / Cooldowns / Coin counters
    const coinCounter = document.getElementById('coin-counter');
    const coinText = document.getElementById('coin-val');
    if (coinCounter && coinText) {
      if (this.gameModeManager.type === GameModeType.GOLD_RUSH) {
        coinCounter.style.display = 'flex';
        coinText.innerText = `${this.player.coins}`;
      } else {
        coinCounter.style.display = 'none';
      }
    }

    // Dash Cooldown HUD
    const dashOverlay = document.getElementById('dash-cooldown-overlay');
    if (dashOverlay) {
      if (this.player.dashCooldownTimer > 0) {
        const percent = (this.player.dashCooldownTimer / this.player.dashCooldown) * 100;
        dashOverlay.style.height = `${percent}%`;
      } else {
        dashOverlay.style.height = '0%';
      }
    }

    // Gamepad connection indicator
    const gpIndicator = document.getElementById('gamepad-indicator');
    if (gpIndicator) {
      gpIndicator.classList.toggle('connected', this.input.gamepadConnected);
    }

    // 4. Timer & Game Mode Info
    const matchTimerEl = document.getElementById('match-timer');
    if (matchTimerEl) {
      const minutes = Math.floor(this.gameModeManager.matchTimer / 60);
      const seconds = Math.floor(this.gameModeManager.matchTimer % 60).toString().padStart(2, '0');
      matchTimerEl.innerText = `${minutes}:${seconds}`;
    }

    // Mode-specific leaderboard updates
    this.updateLeaderboard();

    // 5. Game Over Screen check
    if (this.gameModeManager.isGameOver) {
      this.isPlaying = false;
      const overlay = document.getElementById('gameover-overlay');
      const text = document.getElementById('gameover-winner');
      if (overlay && text) {
        text.innerText = this.gameModeManager.winnerText;
        overlay.style.display = 'flex';
      }
      // Hide touch fire/dash buttons
      const fireBtn = document.getElementById('fire-btn');
      if (fireBtn) fireBtn.style.display = 'none';
      const dashBtn = document.getElementById('dash-btn');
      if (dashBtn) dashBtn.style.display = 'none';
      if (!this.matchEndFired) {
        this.matchEndFired = true;
        if (this.onMatchEnd) this.onMatchEnd(this.computeMatchResult());
      }
    }
  }

  private updateLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    // Sort casters based on current game mode rules
    const sorted = [...this.casters];

    if (this.gameModeManager.type === GameModeType.BATTLE_ROYALE) {
      // Survival first (not dead), then score
      sorted.sort((a, b) => {
        if (a.isDead && !b.isDead) return 1;
        if (!a.isDead && b.isDead) return -1;
        return b.score - a.score;
      });
    } else if (this.gameModeManager.type === GameModeType.GOLD_RUSH) {
      // Team banked totals on top, then carriers below
      const redTotal = this.gameModeManager.redScore;
      const blueTotal = this.gameModeManager.blueScore;
      const target = this.gameModeManager.goldTarget;

      list.innerHTML = `
        <div class="leaderboard-item" style="color: #ff5a6e; font-weight: bold;">
          <span>RED BANKED</span>
          <span>${redTotal} / ${target}</span>
        </div>
        <div class="leaderboard-item" style="color: #4aa8ff; font-weight: bold;">
          <span>BLUE BANKED</span>
          <span>${blueTotal} / ${target}</span>
        </div>
        <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;" />
      `;

      sorted.sort((a, b) => b.coins - a.coins);
    } else if (this.gameModeManager.type === GameModeType.TEAM_BATTLE) {
      // Just list TDM scores on top
      const redTotal = this.gameModeManager.redScore;
      const blueTotal = this.gameModeManager.blueScore;
      
      list.innerHTML = `
        <div class="leaderboard-item" style="color: #ff3355; font-weight: bold;">
          <span>RED TEAM</span>
          <span>${redTotal} / 10</span>
        </div>
        <div class="leaderboard-item" style="color: #3388ff; font-weight: bold;">
          <span>BLUE TEAM</span>
          <span>${blueTotal} / 10</span>
        </div>
        <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;" />
      `;
      
      // Sort players by kills/score
      sorted.sort((a, b) => b.score - a.score);
    }

    // Render top 3 in landscape, top 5 in portrait/desktop
    const limit = window.innerHeight <= 500 ? 3 : 5;
    const topN = sorted.slice(0, limit);
    let itemsHtml = '';
    
    topN.forEach((caster, idx) => {
      let scoreStr = '';
      if (this.gameModeManager.type === GameModeType.GOLD_RUSH) {
        scoreStr = `${caster.coins} 🪙`;
      } else {
        scoreStr = `${caster.score} Kills`;
      }

      const teamStyle = caster.team === 'RED' ? 'color: #ff3355;' : caster.team === 'BLUE' ? 'color: #3388ff;' : 'color: #ffd700;';
      const isDeadStyle = caster.isDead ? 'opacity: 0.4; text-decoration: line-through;' : '';
      const activeUserStyle = caster.id === 'player' ? 'background: rgba(255,255,255,0.06); font-weight: bold; border-left: 3px solid #ffd700; padding-left: 4px;' : '';

      itemsHtml += `
        <div class="leaderboard-item" style="${isDeadStyle} ${activeUserStyle}">
          <span style="${teamStyle}">#${idx + 1} ${caster.name}</span>
          <span>${scoreStr}</span>
        </div>
      `;
    });

    if (this.gameModeManager.type === GameModeType.TEAM_BATTLE || this.gameModeManager.type === GameModeType.GOLD_RUSH) {
      list.innerHTML += itemsHtml;
    } else {
      list.innerHTML = itemsHtml;
    }
  }

  private computeMatchResult(): MatchResult {
    let won = false;
    if (this.gameModeManager.type === GameModeType.BATTLE_ROYALE) {
      won = !this.player.isDead;
    } else {
      // Player is always on RED in team modes
      won = this.gameModeManager.redScore > this.gameModeManager.blueScore;
    }
    return { won, kills: this.player.score, mode: this.gameModeManager.type };
  }

  cleanup() {
    this.isPlaying = false;
    if (this.input) this.input.dispose();
    this.physicsArena.destroy(this.scene);
    this.casters.forEach((c) => c.destroy(this.scene));
    this.projectiles.forEach((p) => p.destroy(this.scene));
    this.powerups.forEach((pu) => pu.destroy(this.scene));
    this.particles.forEach((p) => this.scene.remove(p.mesh));
    if (this.aimVisualizer) this.aimVisualizer.destroy(this.scene);
    this.gameModeManager.cleanup(this.scene);
    
    if (this.renderer) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}
