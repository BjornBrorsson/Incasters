import * as THREE from 'three';
import { Caster, getActiveFusions } from '../entities/Caster';
import { Bot } from '../entities/Bot';
import { Projectile } from '../entities/Projectile';
import type { ProjectileStats } from '../entities/Projectile';
import { PowerUp, PowerUpType, POWERUP_COLORS, POWERUP_SYMBOLS } from '../entities/PowerUp';
import { Arena, MapType } from '../world/Arena';
import { GameModeManager, GameModeType } from '../world/GameModes';
import { testCircleVsAABB, testCircleVsCircle, reflectVector, screenToWorldIso, screenAngleToWorldIso } from './Physics';
import { music, sfx } from './Audio';
import { InputManager } from './InputManager';
import { AimVisualizer } from './AimVisualizer';
import { PALETTE, createSkyDome } from './Theme';
import { Fx } from './Fx';
import { DEFAULT_CONFIG, randomCharacterConfig, generateDistinctBotConfigs, BOT_ARCHETYPES } from '../game/CharacterConfig';
import type { CharacterConfig } from '../game/CharacterConfig';
import { progression, type MatchResult } from '../game/Progression';
import { DIFFICULTY_PRESETS } from '../game/Difficulty';
import type { DifficultyLevel, DifficultyConfig } from '../game/Difficulty';
import { loadGraphicsQuality, getGraphicsConfig } from '../game/GraphicsSettings';
import type { GraphicsQuality, GraphicsConfig } from '../game/GraphicsSettings';
import type { GameStateSnapshot, CasterNetState, ProjectileNetState, PlayerInputState, GameEvent } from '../net/LanClient';
import { TRIAL_STAGES, type TrialStage, type TargetDummy, buildDummyMesh } from '../game/Trials';

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

// Static shared particle geometries and material cache to avoid GC/WebGL buffer disposal thrashing
const SHARED_SPHERE_GEO = new THREE.SphereGeometry(0.08, 4, 4);
const SHARED_BOX_GEO = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const PARTICLE_MAT_CACHE = new Map<number, THREE.MeshBasicMaterial>();

function getCachedParticleMaterial(color: number): THREE.MeshBasicMaterial {
  let mat = PARTICLE_MAT_CACHE.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    PARTICLE_MAT_CACHE.set(color, mat);
  }
  return mat;
}

export class Game {
  // Rendering
  scene!: THREE.Scene;
  camera!: THREE.OrthographicCamera;
  renderer!: THREE.WebGLRenderer;
  private dirLight!: THREE.DirectionalLight;
  private container: HTMLDivElement;
  private camOffset = new THREE.Vector3(18, 25, 29);
  private cameraLookTarget = new THREE.Vector3();
  private baseCameraZoom = 1;
  private animationFrameId = 0;
  private destroyed = false;
  private eventAbortController = new AbortController();

  // Graphics Quality Preset
  graphicsQuality: GraphicsQuality = 'BALANCED';
  graphicsConfig: GraphicsConfig = getGraphicsConfig('BALANCED');

  // Cached DOM elements to avoid expensive getElementById on 60fps tick
  private hudEl = {
    hpProgress: null as HTMLElement | null,
    hpText: null as HTMLElement | null,
    ammoSlots: null as HTMLElement | null,
    fireBtn: null as HTMLElement | null,
    coinCounter: null as HTMLElement | null,
    coinText: null as HTMLElement | null,
    dashOverlay: null as HTMLElement | null,
    dashBtn: null as HTMLElement | null,
    gpIndicator: null as HTMLElement | null,
    matchTimer: null as HTMLElement | null,
    leaderboardList: null as HTMLElement | null,
    gameoverOverlay: null as HTMLElement | null,
    gameoverWinner: null as HTMLElement | null,
    hudContainer: null as HTMLElement | null,
    puSlots: [] as { slot: HTMLElement | null; text: HTMLElement | null }[]
  };

  // Dirty checking cache for HUD elements
  private lastRenderedHp = -1;
  private lastRenderedAmmo = -1;
  private lastRenderedCoins = -1;
  private lastRenderedTimerStr = '';
  private lastRenderedDashPercent = -1;
  private lastLeaderboardUpdate = 0;
  private lastPuStateKey = '';

  // Game-feel state
  private fx = new Fx();
  private shakeTrauma = 0;
  private hitStopTimer = 0;
  private playerCombo = 0;
  private playerComboTimer = 0;
  private firstBlood = false;
  private heartbeatTimer = 0;

  // Game Entities
  arena!: THREE.Group;
  physicsArena!: Arena;
  casters: Caster[] = [];
  player!: Caster;
  projectiles: Projectile[] = [];
  powerups: PowerUp[] = [];
  particles: GameParticle[] = [];
  private particlePool: GameParticle[] = [];

  // Managers
  gameModeManager: GameModeManager;

  // Spawners timers
  private powerupSpawnCooldowns: number[] = [0, 0, 0, 0]; // matching arena spawners

  // Input states
  public input!: InputManager;
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
    right: { active: false, id: -1, startX: 0, startY: 0, curX: 0, curY: 0, dirX: 0, dirY: 0, hasFiredThisPress: false }
  };
  /** Touch fire button state (decoupled from right stick). */
  private touchFireHeld = false;
  /** Touch dash button state. */
  private touchDashQueued = false;
  /** Double-tap and flick gesture tracking for mobile dash. */
  private lastLeftTapTime: number = 0;
  private lastLeftTapX: number = 0;
  private lastLeftTapY: number = 0;
  private leftStickTouchStartTime: number = 0;
  private leftStickHasFlickDashed: boolean = false;

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

  // Solo elimination & Spectator callbacks
  onPlayerEliminated: ((data: { rank: number; totalPlayers: number; kills: number }) => void) | null = null;
  onSpectateChange: ((data: { name: string; aliveCount: number }) => void) | null = null;
  isSpectating: boolean = false;
  private spectateTargetIndex: number = 0;
  private playerEliminationHandled: boolean = false;

  // Match Customizer
  playerCount: number = 8;
  mapType: MapType = 'ARENA';
  difficulty: DifficultyLevel = 'NORMAL';
  private difficultyConfig: DifficultyConfig = DIFFICULTY_PRESETS.NORMAL;
  private casterPortalCooldowns: Map<string, number> = new Map();

  // ── Trickshot Trials Mode ──
  trialStage: TrialStage | null = null;
  trialDummies: TargetDummy[] = [];
  trialElapsed: number = 0;
  trialShotsFired: number = 0;
  onTrialCompleted: ((result: { stageId: number; stars: number; time: number; shots: number; tokens: number }) => void) | null = null;

  // ── LAN Multiplayer ──
  /** 'offline' = single-player vs bots, 'host' = hosting a LAN match, 'client' = connected to a host. */
  netMode: 'offline' | 'host' | 'client' = 'offline';
  /** Maps remote player IDs to their latest input state (host mode only). */
  private remoteInputs = new Map<string, PlayerInputState>();
  /** Maps remote player IDs to their Caster entity (host mode only). */
  private remoteCasters = new Map<string, Caster>();
  /** Callback fired after each tick with serialized state (host mode). */
  onNetBroadcast: ((state: GameStateSnapshot) => void) | null = null;
  onNetEvent: ((event: GameEvent) => void) | null = null;
  private netBroadcastTimer = 0;
  private netBroadcastInterval = 0.05; // 20 Hz
  /** Callback fired when the host declares the match over (host mode). */
  onNetMatchEnd: ((result: any) => void) | null = null;
  /** Projectile net ID counter for state serialization. */
  private projectileNetId = 0;
  private contextLost = false;

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
    this.initHUD();
    this.resetGame();
  }

  private initHUD() {
    this.hudEl.hpProgress = document.getElementById('hp-progress');
    this.hudEl.hpText = document.getElementById('hp-text');
    this.hudEl.ammoSlots = document.getElementById('ammo-slots');
    this.hudEl.fireBtn = document.getElementById('fire-btn');
    this.hudEl.coinCounter = document.getElementById('coin-counter');
    this.hudEl.coinText = document.getElementById('coin-val');
    this.hudEl.dashOverlay = document.getElementById('dash-cooldown-overlay');
    this.hudEl.dashBtn = document.getElementById('dash-btn');
    this.hudEl.gpIndicator = document.getElementById('gamepad-indicator');
    this.hudEl.matchTimer = document.getElementById('match-timer');
    this.hudEl.leaderboardList = document.getElementById('leaderboard-list');
    this.hudEl.gameoverOverlay = document.getElementById('gameover-overlay');
    this.hudEl.gameoverWinner = document.getElementById('gameover-winner');
    this.hudEl.hudContainer = document.getElementById('hud-container');
    this.hudEl.puSlots = [0, 1, 2].map((i) => ({
      slot: document.getElementById(`pu-slot-${i}`),
      text: document.getElementById(`pu-slot-${i}-text`)
    }));
  }

  setGraphicsQuality(quality: GraphicsQuality) {
    this.graphicsQuality = quality;
    this.graphicsConfig = getGraphicsConfig(quality);
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.graphicsConfig.pixelRatioCap));
      this.renderer.shadowMap.enabled = this.graphicsConfig.shadowsEnabled;
      this.renderer.shadowMap.type = this.graphicsConfig.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (this.dirLight) {
      this.dirLight.castShadow = this.graphicsConfig.shadowsEnabled;
      this.dirLight.shadow.mapSize.width = this.graphicsConfig.shadowMapSize;
      this.dirLight.shadow.mapSize.height = this.graphicsConfig.shadowMapSize;
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        (this.dirLight.shadow as any).map = null;
      }
    }
  }

  private initThree() {
    this.graphicsQuality = loadGraphicsQuality();
    this.graphicsConfig = getGraphicsConfig(this.graphicsQuality);

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
    this.baseCameraZoom = this.getBaseCameraZoom();
    this.camera.zoom = this.baseCameraZoom;
    this.camera.updateProjectionMatrix();

    // WebGL Renderer with ACESFilmicToneMapping for rich, vibrant, warm cartoon lighting
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.graphicsConfig.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = this.graphicsConfig.shadowsEnabled;
    this.renderer.shadowMap.type = this.graphicsConfig.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting — Hogwarts / Discworld warm torchlight & twilight atmosphere
    const ambientLight = new THREE.AmbientLight(PALETTE.ambient, 0.55);
    this.scene.add(ambientLight);

    // Hemisphere light delivers twilight violet sky / warm sandstone ground tones
    const hemiLight = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.65);
    hemiLight.position.set(0, 40, 0);
    this.scene.add(hemiLight);

    // Directional Shadow Casting Light — warm golden castle sun
    this.dirLight = new THREE.DirectionalLight(PALETTE.sunLight, 1.05);
    this.dirLight.position.set(-18, 32, 18);
    this.dirLight.castShadow = this.graphicsConfig.shadowsEnabled;
    this.dirLight.shadow.mapSize.width = this.graphicsConfig.shadowMapSize;
    this.dirLight.shadow.mapSize.height = this.graphicsConfig.shadowMapSize;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 85;
    // Stretch shadow bounds to fit orthographic arena
    const sd = 26;
    this.dirLight.shadow.camera.left = -sd;
    this.dirLight.shadow.camera.right = sd;
    this.dirLight.shadow.camera.top = sd;
    this.dirLight.shadow.camera.bottom = -sd;
    this.dirLight.shadow.bias = -0.0004;
    this.scene.add(this.dirLight);

    // Warm torchlight fill light for environment depth
    const envLight = new THREE.DirectionalLight(0xffa840, 0.25);
    envLight.position.set(16, 20, -16);
    // WebGL Context Lost and Restored recovery handling
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn('Incasters: WebGL Context Lost. Pausing animation frame...');
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    }, { signal: this.eventAbortController.signal });

    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.info('Incasters: WebGL Context Restored. Rebuilding scene & resuming renderer...');
      this.contextLost = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.graphicsConfig.pixelRatioCap));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (this.isPlaying) {
        this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
      }
    }, { signal: this.eventAbortController.signal });

    // Listen to resize
    window.addEventListener('resize', this.onResize.bind(this), { signal: this.eventAbortController.signal });

    this.initHudElements();
  }

  private initHudElements() {
    this.hudEl.hpProgress = document.getElementById('hp-progress');
    this.hudEl.hpText = document.getElementById('hp-text');
    this.hudEl.ammoSlots = document.getElementById('ammo-slots');
    this.hudEl.fireBtn = document.getElementById('fire-btn');
    this.hudEl.coinCounter = document.getElementById('coin-counter');
    this.hudEl.coinText = document.getElementById('coin-val');
    this.hudEl.dashOverlay = document.getElementById('dash-cooldown-overlay');
    this.hudEl.dashBtn = document.getElementById('dash-btn');
    this.hudEl.gpIndicator = document.getElementById('gp-indicator');
    this.hudEl.matchTimer = document.getElementById('match-timer');
    this.hudEl.leaderboardList = document.getElementById('leaderboard-list');
    this.hudEl.gameoverOverlay = document.getElementById('gameover-overlay');
    this.hudEl.gameoverWinner = document.getElementById('gameover-winner');
    this.hudEl.hudContainer = document.getElementById('hud-container');
    this.hudEl.puSlots = [
      { slot: document.getElementById('pu-slot-0'), text: document.getElementById('pu-text-0') },
      { slot: document.getElementById('pu-slot-1'), text: document.getElementById('pu-text-1') },
      { slot: document.getElementById('pu-slot-2'), text: document.getElementById('pu-text-2') }
    ];
  }

  resetGame() {
    this.isPlaying = false;
    this.initHudElements();
    this.resetTouchControls();

    // 1. Clean up old game state
    this.casters.forEach((c) => c.destroy(this.scene));
    this.projectiles.forEach((p) => p.destroy(this.scene));
    this.powerups.forEach((pu) => pu.destroy(this.scene));
    this.particles.forEach((p) => {
      p.mesh.visible = false;
      this.particlePool.push(p);
    });
    
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

    // Generate curated distinct archetypes for all bots (unique silhouettes & cosmetics)
    const botConfigs = generateDistinctBotConfigs(this.playerCount - 1, this.playerConfig);

    // Bots
    for (let i = 1; i < this.playerCount; i++) {
      const botSp = sp[i % sp.length];
      const botCfg = botConfigs[i - 1] || randomCharacterConfig(0x2e7d32, 0xd4a020);
      const name = BOT_ARCHETYPES[(i - 1) % BOT_ARCHETYPES.length]?.name || botNames[(i - 1) % botNames.length];
      
      const bot = new Bot(
        `bot_${i}`,
        name,
        botSp.x + (Math.random() - 0.5) * 0.5,
        botSp.y + (Math.random() - 0.5) * 0.5,
        'GOLD',
        botCfg.robeColor,
        botCfg.spellColor,
        botCfg
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
    this.gameModeManager.onCasterDied = (killer, victim) => this.onCasterKilled(killer, victim);
    this.gameModeManager.initMode(this.scene, this.casters, this.physicsArena.powerupSpawners, (this.physicsArena.width / 2) - 1.5);

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
    this.isSpectating = false;
    this.spectateTargetIndex = 0;
    this.playerEliminationHandled = false;
    this.fx.clear();
    this.cameraLookTarget.set(this.player.x, 0, this.player.y);
    this.camera.position.set(
      this.player.x + this.camOffset.x,
      this.camOffset.y,
      this.player.y + this.camOffset.z
    );
    this.camera.lookAt(this.cameraLookTarget);
    this.baseCameraZoom = this.getBaseCameraZoom();
    this.camera.zoom = this.baseCameraZoom;
    this.camera.updateProjectionMatrix();

    // Reset clocks
    this.clock.getDelta();
  }

  startGame() {
    if (this.destroyed) return;
    this.resetTouchControls();
    this.isPlaying = true;
    this.clock.getDelta();

    // Show touch fire/dash buttons on touch devices
    if (
      window.matchMedia('(pointer: coarse)').matches ||
      (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches) ||
      window.innerWidth <= 1024
    ) {
      this.ensureTouchButtonsVisible();
    }
  }

  loadTrial(stageId: number) {
    const stage = TRIAL_STAGES.find((s) => s.id === stageId) || TRIAL_STAGES[0];
    this.trialStage = stage;
    this.trialElapsed = 0;
    this.trialShotsFired = 0;
    this.isPlaying = true;

    // Trials have no storm/scoring — tear down the Battle Royale mode's shrinking storm
    // ring/wall/particles that were created by the initial gameModeManager.initMode() call.
    this.gameModeManager.cleanup(this.scene);

    // Clear all existing non-player casters
    for (let i = this.casters.length - 1; i >= 0; i--) {
      const c = this.casters[i];
      if (c.id !== 'player') {
        c.destroy(this.scene);
        this.casters.splice(i, 1);
      }
    }

    this.projectiles.forEach((p) => p.destroy(this.scene));
    this.projectiles = [];
    this.powerups.forEach((pu) => pu.destroy(this.scene));
    this.powerups = [];

    // Clear existing trial dummies
    this.trialDummies.forEach((d) => {
      this.scene.remove(d.mesh);
      d.mesh.traverse((ch) => {
        if (ch instanceof THREE.Mesh) {
          ch.geometry.dispose();
          if (Array.isArray(ch.material)) ch.material.forEach((m) => m.dispose());
          else (ch.material as THREE.Material).dispose();
        }
      });
    });
    this.trialDummies = [];

    // Reposition player
    this.player.x = stage.playerSpawn.x;
    this.player.y = stage.playerSpawn.y;
    this.player.reset();
    this.player.syncMeshPosition();

    // Tear down the parent map's obstacles (pillars, doors, hazards, moving walls, etc.)
    // and install the stage's bespoke wall layout. This also clears any leftover
    // wall-indexed dynamic entries that would otherwise crash the physics update loop
    // and blank the render (see Arena.resetForCustomLayout).
    this.physicsArena.resetForCustomLayout(stage.walls);

    // Setup stage portals & speed runes
    if (stage.portals) {
      stage.portals.forEach((p) => {
        this.physicsArena.addPortalPair(p.id1, p.x1, p.y1, p.id2, p.x2, p.y2);
      });
    }
    if (stage.speedRunes) {
      stage.speedRunes.forEach((r) => {
        this.physicsArena.addSpeedRune(r.id, r.x, r.y);
      });
    }

    // Spawn powerups
    if (stage.powerups) {
      stage.powerups.forEach((p) => {
        const pu = new PowerUp(p.x, p.y, p.type);
        this.scene.add(pu.mesh);
        this.powerups.push(pu);
      });
    }

    // Build stage target dummies
    stage.dummies.forEach((dummyDef) => {
      const mesh = buildDummyMesh(dummyDef.radius);
      mesh.position.set(dummyDef.x, 0, dummyDef.y);
      this.scene.add(mesh);

      this.trialDummies.push({
        id: dummyDef.id,
        x: dummyDef.x,
        y: dummyDef.y,
        radius: dummyDef.radius,
        health: dummyDef.health,
        maxHealth: dummyDef.health,
        isDead: false,
        mesh,
        isMoving: dummyDef.isMoving,
        baseX: dummyDef.x,
        baseY: dummyDef.y,
        moveAxis: dummyDef.moveAxis,
        moveRange: dummyDef.moveRange,
        moveSpeed: dummyDef.moveSpeed,
        movePhase: Math.random() * Math.PI * 2
      });
    });

    // Reset camera to player
    this.cameraLookTarget.set(this.player.x, 0, this.player.y);
    this.camera.position.set(
      this.player.x + this.camOffset.x,
      this.camOffset.y,
      this.player.y + this.camOffset.z
    );
    this.camera.lookAt(this.cameraLookTarget);

    // Show stage announcement
    this.fx.announce(stage.title, '#ffd700');
  }

  private completeTrial() {
    if (!this.trialStage) return;
    this.isPlaying = false;
    const stage = this.trialStage;
    const time = this.trialElapsed;
    const shots = this.trialShotsFired;

    let stars = 1;
    if (time <= stage.parTime && shots <= stage.maxShots) {
      stars = 3;
    } else if (time <= stage.star2Time) {
      stars = 2;
    }

    const { tokensEarned } = progression.recordTrialClear(stage.id, stars, time);
    sfx.playStart();

    this.onTrialCompleted?.({
      stageId: stage.id,
      stars,
      time,
      shots,
      tokens: tokensEarned
    });
  }

  private ensureTouchButtonsVisible() {
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) fireBtn.style.display = 'block';
    const dashBtn = document.getElementById('dash-btn');
    if (dashBtn) dashBtn.style.display = 'flex';
  }

  private setupInput() {
    // Unified keyboard + mouse + gamepad input
    this.input = new InputManager();

    // Show touch controls immediately if on touch device or small screen
    if (
      window.matchMedia('(pointer: coarse)').matches ||
      (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches) ||
      window.innerWidth <= 1024
    ) {
      this.ensureTouchButtonsVisible();
    }

    // Touch screen / Mobile joy sticks setup
    const signal = this.eventAbortController.signal;
    window.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false, signal });
    window.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false, signal });
    window.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false, signal });
    window.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false, signal });

    // Dash Circle & Dash Panel mobile click listeners
    const dashCircle = document.getElementById('dash-cooldown-circle');
    const dashPanel = document.querySelector('.dash-panel');
    const handleMobileDash = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.triggerPlayerDash();
    };

    if (dashCircle) {
      dashCircle.addEventListener('touchstart', handleMobileDash, { passive: false, signal });
      dashCircle.addEventListener('click', handleMobileDash, { signal });
    }
    if (dashPanel) {
      dashPanel.addEventListener('touchstart', handleMobileDash, { passive: false, signal });
      dashPanel.addEventListener('click', handleMobileDash, { signal });
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
      fireBtn.addEventListener('touchstart', onFireStart, { passive: false, signal });
      fireBtn.addEventListener('touchend', onFireEnd, { passive: false, signal });
      fireBtn.addEventListener('touchcancel', onFireEnd, { passive: false, signal });
      fireBtn.addEventListener('mousedown', onFireStart, { signal });
      fireBtn.addEventListener('mouseup', onFireEnd, { signal });
      fireBtn.addEventListener('mouseleave', onFireEnd, { signal });
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
      dashBtn.addEventListener('touchstart', onDash, { passive: false, signal });
      dashBtn.addEventListener('mousedown', onDash, { signal });
      dashBtn.addEventListener('click', onDash, { signal });
    }
  }

  private updateGroundTarget() {
    this.raycaster.setFromCamera(this.input.mouseNDC, this.camera);
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.planeY0, intersectPoint);
    this.groundTarget.copy(intersectPoint);
  }

  private getBaseCameraZoom() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect >= 1) return 1;
    const portraitAmount = THREE.MathUtils.clamp((0.85 - aspect) / 0.4, 0, 1);
    return 1 + portraitAmount * 0.24;
  }

  private onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const d = 11;
    this.camera.left = -d * aspect;
    this.camera.right = d * aspect;
    this.camera.top = d;
    this.camera.bottom = -d;
    this.baseCameraZoom = this.getBaseCameraZoom();
    if (!this.playerGuidedProjectile) this.camera.zoom = this.baseCameraZoom;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.graphicsConfig.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Mobile virtual dual sticks logic
  private onTouchStart(e: TouchEvent) {
    if (!this.isPlaying || this.gameModeManager.isGameOver || this.playerEliminationHandled) return;

    const target = e.target as HTMLElement | null;
    if (target && (target.closest('.gameover-overlay') || target.closest('#menu-screen') || target.closest('#spectator-hud'))) {
      return;
    }

    this.touchControlsActive = true;
    this.ensureTouchButtonsVisible();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      // Ignore touches that land on the fire/dash buttons (they have their own handlers)
      if (target && (target.id === 'fire-btn' || target.id === 'dash-btn' ||
                     target.closest('#fire-btn') || target.closest('#dash-btn') ||
                     target.id === 'dash-cooldown-circle' || target.closest('.dash-panel'))) {
        continue;
      }

      const screenWidthHalf = window.innerWidth / 2;

      // Left half = movement stick + double-tap detection
      if (touch.clientX < screenWidthHalf && !this.touchJoysticks.left.active) {
        e.preventDefault();
        const now = performance.now();
        const timeSinceLastTap = now - this.lastLeftTapTime;
        const distFromLastTap = Math.hypot(touch.clientX - this.lastLeftTapX, touch.clientY - this.lastLeftTapY);

        if (timeSinceLastTap < 340 && distFromLastTap < 85) {
          // Double tap to dash!
          this.touchDashQueued = true;
          this.lastLeftTapTime = 0;
        } else {
          this.lastLeftTapTime = now;
          this.lastLeftTapX = touch.clientX;
          this.lastLeftTapY = touch.clientY;
        }

        this.leftStickTouchStartTime = now;
        this.leftStickHasFlickDashed = false;
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
        this.touchJoysticks.right.hasFiredThisPress = false;
        this.showJoystickUI('right', touch.clientX, touch.clientY);
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

        // Rapid flick gesture to dash on movement stick
        const elapsed = performance.now() - this.leftStickTouchStartTime;
        if (!this.leftStickHasFlickDashed && elapsed > 40 && elapsed < 220 && dist >= maxDist * 0.8) {
          this.leftStickHasFlickDashed = true;
          this.touchDashQueued = true;
        }
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

          const screenAngle = Math.atan2(this.touchJoysticks.right.dirY, this.touchJoysticks.right.dirX);
          const worldAngle = screenAngleToWorldIso(screenAngle);
          const finalAimAngle = this.applyAimAssist(worldAngle);
          this.player.aimAngle = finalAimAngle;

          // Fire ONE shot upon initial stick drag engagement of this press
          if (!this.touchJoysticks.right.hasFiredThisPress && !this.player.isDead) {
            this.touchJoysticks.right.hasFiredThisPress = true;
            if (this.player.shootTimer <= 0 && this.player.ammo > 0) {
              const proj = this.spawnProjectile(this.player, finalAimAngle, null);
              this.playerGuidedProjectile = proj;
              this.player.shootTimer = this.player.getFireRateCooldown();
            }
          }

          // Continuous curve guidance for the active projectile
          if (this.playerGuidedProjectile && !this.playerGuidedProjectile.isDead) {
            this.playerGuidedProjectile.steerDirection = 0;
            this.playerGuidedProjectile.targetPoint = {
              x: this.playerGuidedProjectile.x + Math.cos(finalAimAngle) * 10,
              y: this.playerGuidedProjectile.y + Math.sin(finalAimAngle) * 10
            };
          }
        } else {
          this.touchJoysticks.right.dirX = 0;
          this.touchJoysticks.right.dirY = 0;
        }

        this.updateJoystickUI('right', (dx / dist) * limit, (dy / dist) * limit);
      }
    }
  }

  private onTouchEnd(e: TouchEvent) {
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
        this.touchJoysticks.right.hasFiredThisPress = false;
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
    const knob = document.getElementById(`joy-${side}-knob`);
    if (knob) knob.style.transform = `translate(0px, 0px)`;
    const el = document.getElementById(`joy-${side}`);
    if (el) el.style.display = 'none';
  }

  public resetTouchControls() {
    this.touchControlsActive = false;
    this.touchFireHeld = false;
    this.touchDashQueued = false;
    this.touchJoysticks.left.active = false;
    this.touchJoysticks.left.id = -1;
    this.touchJoysticks.left.dirX = 0;
    this.touchJoysticks.left.dirY = 0;
    this.touchJoysticks.right.active = false;
    this.touchJoysticks.right.id = -1;
    this.touchJoysticks.right.dirX = 0;
    this.touchJoysticks.right.dirY = 0;
    this.touchJoysticks.right.hasFiredThisPress = false;
    this.hideJoystickUI('left');
    this.hideJoystickUI('right');
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) {
      fireBtn.style.display = 'none';
      fireBtn.classList.remove('pressed', 'empty');
    }
    const dashBtn = document.getElementById('dash-btn');
    if (dashBtn) {
      dashBtn.style.display = 'none';
      dashBtn.classList.remove('pressed');
    }
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
    sfx.playShoot(owner.id === 'player' ? 1 : 0.28);
    if (this.netMode === 'host') this.onNetEvent?.({ kind: 'fire', data: { ownerId: owner.id } });
    
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
    sfx.playShoot(0.22);
    if (this.netMode === 'host') this.onNetEvent?.({ kind: 'fire', data: { ownerId: 'hazard' } });
    this.spawnBlastParticles(x, y, stats.color, 5, 0.7);
  }

  // Spark/trail particle system with custom burst style cosmetics
  spawnBlastParticles(x: number, y: number, color: number, count: number = 8, scaleMultiplier = 1) {
    const burstStyle = this.playerConfig?.burst || 'SPARKLE';
    let burstCount = count;
    let burstSpeedMultiplier = 1.0;
    let burstColor = color;

    if (burstStyle === 'SUPERNOVA') {
      burstCount = Math.round(count * 1.5);
      burstSpeedMultiplier = 1.4;
    } else if (burstStyle === 'PLASMA') {
      burstSpeedMultiplier = 1.6;
    } else if (burstStyle === 'FROST_BLAST') {
      burstColor = 0x66eeff;
    } else if (burstStyle === 'ARCANE_FLAME') {
      burstColor = 0xff6622;
    }

    const mat = getCachedParticleMaterial(burstColor);

    for (let i = 0; i < burstCount; i++) {
      let p: GameParticle;
      if (this.particlePool.length > 0) {
        p = this.particlePool.pop()!;
        p.mesh.material = mat;
        p.mesh.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier);
        p.mesh.visible = true;
      } else {
        const mesh = new THREE.Mesh(SHARED_SPHERE_GEO, mat);
        p = {
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          color: burstColor,
          size: 1.0,
          opacity: 0.85,
          lifetime: 0,
          maxLifetime: 0.35,
          mesh
        };
        this.scene.add(mesh);
      }

      p.position.set(x, 0.4, y);
      p.mesh.position.copy(p.position);
      const angle = (Math.PI * 2 * i) / burstCount + (Math.random() - 0.5) * 0.4;
      const speed = (2.0 + Math.random() * 4.0) * burstSpeedMultiplier;
      const vy = burstStyle === 'ARCANE_FLAME' ? 1.5 + Math.random() * 2.5 : 0.2 + Math.random() * 2.0;
      p.velocity.set(Math.cos(angle) * speed, vy, Math.sin(angle) * speed);
      p.color = burstColor;
      p.opacity = 0.85;
      p.lifetime = 0;
      p.maxLifetime = 0.25 + Math.random() * 0.2;

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
      
      // Reduced stats for splits with synergy fusions
      const splitStats: ProjectileStats = {
        ...proj.stats,
        damage: Math.round(proj.stats.damage * 0.6),
        speed: proj.stats.speed * 0.85,
        maxBounces: Math.max(0, proj.stats.maxBounces - 1),
        maxPierces: proj.stats.isPiercingShards ? 1 : 0, // Piercing Shards synergy
        splitLevel: proj.splitLevel - 1, // Reduce split counter
        freezeLevel: proj.stats.isFrostShards ? 1 : proj.stats.freezeLevel,
        color: proj.stats.isFrostShards ? 0x50f0ff : proj.stats.color
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

  /** Enter spectator mode following surviving bots (solo battle royale). */
  startSpectating() {
    this.isSpectating = true;
    this.cycleSpectator(0);
  }

  /** Cycle spectator camera to next or previous living bot. */
  cycleSpectator(direction: number = 1) {
    const livingBots = this.casters.filter((c) => !c.isDead && c.id !== 'player');
    if (livingBots.length === 0) {
      this.isSpectating = false;
      this.gameModeManager.endGame(this.casters);
      return;
    }
    this.spectateTargetIndex = (this.spectateTargetIndex + direction + livingBots.length) % livingBots.length;
    const target = livingBots[this.spectateTargetIndex];
    if (target) {
      this.onSpectateChange?.({ name: target.name, aliveCount: livingBots.length });
    }
  }

  /** Get currently spectated caster entity. */
  getSpectateTarget(): Caster | null {
    const livingBots = this.casters.filter((c) => !c.isDead && c.id !== 'player');
    if (livingBots.length === 0) return null;
    if (this.spectateTargetIndex >= livingBots.length) {
      this.spectateTargetIndex = 0;
    }
    return livingBots[this.spectateTargetIndex] || null;
  }

  /** End the solo battle immediately while spectating. */
  endBattleImmediately() {
    this.isSpectating = false;
    this.gameModeManager.endGame(this.casters);
    this.updateHUD();
  }

  /** Apply all remote player inputs to their caster entities with host-side anti-cheat validation. */
  private applyRemoteInputs() {
    this.remoteInputs.forEach((input, playerId) => {
      const caster = this.remoteCasters.get(playerId);
      if (!caster || caster.isDead) return;

      const speed = caster.getSpeed();
      // Host-side velocity validation: clamp input magnitude to 1.0 to prevent speed hacks
      const inputMag = Math.hypot(input.moveX, input.moveY);
      const safeMoveX = inputMag > 1 ? input.moveX / inputMag : input.moveX;
      const safeMoveY = inputMag > 1 ? input.moveY / inputMag : input.moveY;

      caster.vx = safeMoveX * speed;
      caster.vy = safeMoveY * speed;
      caster.aimAngle = input.aimAngle;

      if (input.firing && caster.shootTimer <= 0 && caster.ammo > 0) {
        this.spawnProjectile(caster, input.aimAngle, null);
        caster.shootTimer = caster.getFireRateCooldown();
      }

      if (input.dashing && caster.dashCooldownTimer <= 0 && !caster.isDashing) {
        if (inputMag > 0.1) {
          caster.dash(safeMoveX, safeMoveY);
          this.onNetEvent?.({ kind: 'dash', data: { casterId: caster.id } });
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
    if (this.destroyed || this.contextLost) return;
    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));

    if (!this.isPlaying) {
      this.renderer.render(this.scene, this.camera);
      if (this.netMode === 'host' && this.onNetBroadcast) {
        this.netBroadcastTimer += 0.016;
        if (this.netBroadcastTimer >= this.netBroadcastInterval) {
          this.netBroadcastTimer = 0;
          this.onNetBroadcast(this.serializeNetState());
        }
      }
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
          this.gameModeManager.bank,
          this.gameModeManager.cauldron
        );
      }
    });

    // 4. Update Game Mode rules (shrinking storm, gold coin spawns)
    // Skipped during Trickshot Trials — practice stages have no storm/scoring and only
    // ever have one live caster, which would otherwise instantly trip the "last caster
    // standing" win condition.
    if (!this.trialStage) {
      this.gameModeManager.update(dt, this.scene, this.casters, this.physicsArena.spawnPoints);
    }

    // 5. Update Entity physics & animations
    this.casters.forEach((c) => c.update(dt));
    this.projectiles.forEach((p) => p.update(dt));
    this.powerups.forEach((pu) => pu.update(dt));
    this.physicsArena.update(dt);

    // 6. Physics Collision Checks
    this.handleCollisions();

    // 7. Interactive Arena Objects: Portals & Acceleration Runes
    this.updatePortalsAndRunes(dt);

    // 8. Spawning power-ups in arena spawners
    this.updatePowerUpSpawning(dt);

    // 5. Update Particle Systems
    this.updateParticles(dt);

    // 5b. Update Trial Mode state & moving target dummies
    if (this.trialStage) {
      this.trialElapsed += dt;

      this.trialDummies.forEach((d) => {
        if (d.isDead || !d.isMoving) return;
        d.movePhase = (d.movePhase || 0) + dt * (d.moveSpeed || 3.0);
        const offset = Math.sin(d.movePhase) * (d.moveRange || 4.0);
        if (d.moveAxis === 'y') {
          d.y = (d.baseY || 0) + offset;
        } else {
          d.x = (d.baseX || 0) + offset;
        }
        d.mesh.position.set(d.x, 0, d.y);
      });
    }

    let musicDanger = 0;
    this.projectiles.forEach((projectile) => {
      if (projectile.isDead || projectile.ownerId === this.player.id) return;
      const distance = Math.hypot(projectile.x - this.player.x, projectile.y - this.player.y);
      if (distance < 8) musicDanger += (1 - distance / 8) * 0.3;
    });
    music.updateGameplay(
      this.player.health / Math.max(1, this.player.maxHealth),
      this.player.isDead,
      musicDanger
    );

    // Low-health heartbeat warning
    if (!this.player.isDead && this.player.health / Math.max(1, this.player.maxHealth) <= 0.28) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.heartbeatTimer = 0.95; // 1 heartbeat per second
        sfx.playHeartbeat();
        this.input.vibrate(60, 0.3, 0.45);
      }
    } else {
      this.heartbeatTimer = 0;
    }

    // Camera follow player or spectated bot using the fixed offset angle (smooth lerp).
    const followTarget = !this.player.isDead ? this.player : this.isSpectating ? this.getSpectateTarget() : null;
    if (followTarget) {
      // Smooth tracking keeps movement responsive without changing camera orientation abruptly.
      const followAmount = 1 - Math.exp(-4 * dt);
      const targetCamX = followTarget.x + this.camOffset.x;
      const targetCamZ = followTarget.y + this.camOffset.z;

      this.camera.position.x += (targetCamX - this.camera.position.x) * followAmount;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * followAmount;
      this.camera.position.y += (this.camOffset.y - this.camera.position.y) * followAmount;
      this.cameraLookTarget.x += (followTarget.x - this.cameraLookTarget.x) * followAmount;
      this.cameraLookTarget.z += (followTarget.y - this.cameraLookTarget.z) * followAmount;

      const lookTarget = this.cameraLookTarget.clone();

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

      this.camera.updateMatrixWorld();
      let targetZoom = this.baseCameraZoom;
      if (!this.player.isDead && this.playerGuidedProjectile && !this.playerGuidedProjectile.isDead) {
        const projected = new THREE.Vector3(
          this.playerGuidedProjectile.x,
          0.5,
          this.playerGuidedProjectile.y
        ).project(this.camera);
        const zoomRatio = this.baseCameraZoom / Math.max(0.01, this.camera.zoom);
        const edgeAtBase = Math.max(
          Math.abs(projected.x) * zoomRatio / 0.68,
          Math.abs(projected.y) * zoomRatio / 0.72
        );
        if (edgeAtBase > 1) {
          targetZoom = Math.max(this.baseCameraZoom * 0.66, this.baseCameraZoom / edgeAtBase);
        }
      }
      const zoomRate = targetZoom < this.camera.zoom ? 4.5 : 1.6;
      this.camera.zoom += (targetZoom - this.camera.zoom) * (1 - Math.exp(-zoomRate * dt));
      this.camera.updateProjectionMatrix();

      // Keep spectator HUD info refreshed
      if (this.isSpectating) {
        const livingBots = this.casters.filter((c) => !c.isDead && c.id !== 'player');
        this.onSpectateChange?.({ name: followTarget.name, aliveCount: livingBots.length });
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

    // On mobile touch: dedicated fire button fires. (Right stick fires once upon initial drag).
    // On Controller & PC: dedicated fire input (mouse left click / gamepad trigger RT/LT/A) determines shooting!
    const fireHeld = this.touchControlsActive ? this.touchFireHeld : this.input.isFireHeld();

    if (!fireHeld) {
      return;
    }

    if (this.player.shootTimer <= 0 && this.player.ammo > 0) {
      const useMouseTarget = !this.touchControlsActive && !this.input.usingGamepad && this.controlMode === 'TARGET';
      if (useMouseTarget) this.updateGroundTarget();

      const proj = this.spawnProjectile(
        this.player,
        this.player.aimAngle,
        useMouseTarget ? this.groundTarget : null
      );
      this.playerGuidedProjectile = proj;
      this.player.shootTimer = this.player.getFireRateCooldown();
      if (this.trialStage) {
        this.trialShotsFired++;
      }
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

    let worldMoveX: number;
    let worldMoveY: number;

    const moveMag = Math.hypot(rawMoveX, rawMoveY);
    if (moveMag > 0.12) {
      const wm = screenToWorldIso(rawMoveX, rawMoveY);
      worldMoveX = wm.x;
      worldMoveY = wm.y;
    } else {
      // If stationary, dash toward player facing aim angle
      worldMoveX = Math.cos(this.player.aimAngle);
      worldMoveY = Math.sin(this.player.aimAngle);
    }

    const canDash = this.player.dashCooldownTimer <= 0 && !this.player.isDashing && !this.player.isDead;
    this.player.dash(worldMoveX, worldMoveY);
    if (canDash) {
      this.input.rumble(90, 0.25, 0.5);
      if (this.netMode === 'host') this.onNetEvent?.({ kind: 'dash', data: { casterId: this.player.id } });
    }
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
    if (this.playerCombo === 2) {
      this.fx.announce('DOUBLE KILL!', '#ff8a3d');
      sfx.playKillStreak(2);
    } else if (this.playerCombo === 3) {
      this.fx.announce('TRIPLE KILL!', '#ff5fa2');
      sfx.playKillStreak(3);
    } else if (this.playerCombo >= 4) {
      this.fx.announce('RAMPAGE!', '#ffd23d', true);
      sfx.playKillStreak(4);
    }
  }

  private onCasterKilled(killer: Caster | null, victim: Caster) {
    this.addShake(0.5);
    if (this.netMode === 'host') {
      this.onNetEvent?.({ kind: 'kill', data: { killerId: killer?.id ?? null, victimId: victim.id } });
    }

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
      if (!this.playerEliminationHandled && this.netMode === 'offline' && this.gameModeManager.type === GameModeType.BATTLE_ROYALE) {
        this.playerEliminationHandled = true;
        const aliveBots = this.casters.filter((c) => !c.isDead && c.id !== 'player');
        const rank = aliveBots.length + 1;
        this.onPlayerEliminated?.({
          rank,
          totalPlayers: this.playerCount,
          kills: this.player.score
        });
      }
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
            sfx.playWallHit(proj.ownerId === 'player' ? 0.85 : 0.3);
            if (this.netMode === 'host') this.onNetEvent?.({ kind: 'hit', data: { surface: 'wall', ownerId: proj.ownerId } });
            this.spawnBlastParticles(proj.x, proj.y, 0xff00ff, 5, 0.6);
          } else {
            const wasWallRunning = proj.isWallRunning;
            proj.handleWallCollision(result.normalX, result.normalY, result.overlapX, result.overlapY);
            if (!wasWallRunning && this.netMode === 'host') {
              this.onNetEvent?.({ kind: 'hit', data: { surface: 'wall', ownerId: proj.ownerId } });
            }
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
          p1.playFizzleOnDestroy = true;
          p2.playFizzleOnDestroy = true;

          // Play spell clash sound, dual-spark burst and haptic feedback
          sfx.playSpellClash();
          if (this.netMode === 'host') this.onNetEvent?.({ kind: 'hit', data: { surface: 'clash' } });
          const clashX = (p1.x + p2.x) / 2;
          const clashY = (p1.y + p2.y) / 2;
          this.spawnBlastParticles(clashX, clashY, 0xffea78, 16, 1.4);
          this.spawnBlastParticles(clashX, clashY, p1.trailColor, 8, 1.0);
          this.spawnBlastParticles(clashX, clashY, p2.trailColor, 8, 1.0);

          if (p1.ownerId === 'player' || p2.ownerId === 'player') {
            this.input.rumble(80, 0.45, 0.7);
            this.addShake(0.12);
          }
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
              const playerInvolved = caster.id === 'player' || proj.ownerId === 'player';
              sfx.playWizardHit(caster.id === 'player' ? 1 : playerInvolved ? 0.68 : 0.24);
              if (this.netMode === 'host') {
                this.onNetEvent?.({ kind: 'hit', data: { targetId: caster.id, ownerId: proj.ownerId } });
              }

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
              if (killer && killer.id === 'player') {
                this.input.rumble(220, 0.6, 0.9);
                if (proj.isWallRunning || proj.bouncesRemaining < proj.stats.maxBounces) {
                  progression.recordFeatProgress('wall_runner', 1);
                }
                if (proj.targetPoint !== null || proj.steerDirection !== 0) {
                  progression.recordFeatProgress('trickshot_master', 1);
                }
              }
              
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

    // 6. Projectile vs Destructible Props
    this.projectiles.forEach((proj) => {
      if (proj.isDead) return;

      this.physicsArena.destructibleProps.forEach((prop) => {
        if (prop.isDestroyed) return;

        const dx = proj.x - prop.x;
        const dy = proj.y - prop.y;
        const dist = Math.hypot(dx, dy);
        if (dist < proj.radius + prop.radius) {
          prop.health -= proj.stats.damage;
          proj.isDead = true;
          proj.playFizzleOnDestroy = true;

          const sparkColor = prop.type === 'MANA_CRYSTAL' ? 0x00ffff : prop.type === 'BARREL' ? 0x995522 : 0xb5653b;
          this.spawnBlastParticles(proj.x, proj.y, sparkColor, 8, 0.8);
          sfx.playWallHit(proj.ownerId === 'player' ? 0.9 : 0.3);

          if (prop.health <= 0) {
            prop.isDestroyed = true;
            prop.mesh.visible = false;
            // Disable blocking physical wall
            if (this.physicsArena.walls[prop.wallIndex]) {
              this.physicsArena.walls[prop.wallIndex].minX = -9999;
              this.physicsArena.walls[prop.wallIndex].maxX = -9999;
            }

            this.spawnBlastParticles(prop.x, prop.y, sparkColor, 20, 1.4);
            sfx.playBounce();

            // Spawn powerup / coins
            if (prop.dropsPowerup) {
              const types = [PowerUpType.BOUNCE, PowerUpType.SPLIT, PowerUpType.HASTE, PowerUpType.SHIELD, PowerUpType.FREEZE];
              const pType = types[Math.floor(Math.random() * types.length)];
              const pu = new PowerUp(prop.x, prop.y, pType);
              this.scene.add(pu.mesh);
              this.powerups.push(pu);
            }
          }
        }
      });
    });

    // 6b. Projectile vs Trial Target Dummies
    if (this.trialStage && this.trialDummies.length > 0) {
      this.projectiles.forEach((proj) => {
        if (proj.isDead) return;

        this.trialDummies.forEach((dummy) => {
          if (dummy.isDead) return;

          const dx = proj.x - dummy.x;
          const dy = proj.y - dummy.y;
          const dist = Math.hypot(dx, dy);
          if (dist < proj.radius + dummy.radius) {
            dummy.health -= proj.stats.damage;
            proj.isDead = true;
            proj.playFizzleOnDestroy = true;

            this.spawnBlastParticles(dummy.x, dummy.y, 0xff3355, 12, 1.0);
            sfx.playWallHit(1.0);
            this.input.rumble(150, 0.4, 0.7);

            if (dummy.health <= 0) {
              dummy.isDead = true;
              dummy.mesh.visible = false;
              this.spawnBlastParticles(dummy.x, dummy.y, 0xffd700, 24, 1.8);
              sfx.playStart();

              // Check if all dummies destroyed
              const allDead = this.trialDummies.every((d) => d.isDead);
              if (allDead) {
                this.completeTrial();
              }
            }
          }
        });
      });
    }

    // 7. Caster vs PowerUp collisions
    this.casters.forEach((caster) => {
      if (caster.isDead) return;

      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const pu = this.powerups[i];
        const result = testCircleVsCircle(caster, pu);
        if (result.collided) {
          caster.collectPowerUp(pu.type);
          if (this.netMode === 'host') {
            this.onNetEvent?.({ kind: 'pickup', data: { casterId: caster.id, powerup: pu.type } });
          }
          
          // Spawn burst particles around player
          this.spawnBlastParticles(pu.x, pu.y, POWERUP_COLORS[pu.type], 15, 1.0);

          pu.destroy(this.scene);
          this.powerups.splice(i, 1);
        }
      }
    });

    // 8. Clean up deceased Projectiles (and trigger split upgrades if necessary)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (proj.isDead) {
        // Trigger split stacking if the bullet exploded
        if (proj.splitLevel > 0) {
          this.triggerProjectileSplit(proj);
        }
        if (proj.playFizzleOnDestroy) {
          sfx.playFizzle(proj.ownerId === 'player' ? 0.72 : 0.22);
          if (this.netMode === 'host') {
            this.onNetEvent?.({ kind: 'hit', data: { surface: 'fizzle', ownerId: proj.ownerId } });
          }
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

  private updatePortalsAndRunes(dt: number) {
    // 1. Update teleport cooldowns
    for (const [id, cd] of this.casterPortalCooldowns.entries()) {
      if (cd > 0) {
        this.casterPortalCooldowns.set(id, cd - dt);
      } else {
        this.casterPortalCooldowns.delete(id);
      }
    }

    // 2. Process Arcane Portals
    this.physicsArena.portals.forEach((portal) => {
      this.casters.forEach((caster) => {
        if (caster.isDead || caster.isLeaping) return;
        const cd = this.casterPortalCooldowns.get(caster.id) || 0;
        if (cd > 0) return;

        const dx = caster.x - portal.x;
        const dy = caster.y - portal.y;
        if (Math.hypot(dx, dy) < portal.radius) {
          // Teleport caster to destination
          caster.x = portal.targetX;
          caster.y = portal.targetY;
          this.casterPortalCooldowns.set(caster.id, 1.8);
          this.spawnBlastParticles(portal.x, portal.y, 0x9933ff, 14, 1.2);
          this.spawnBlastParticles(portal.targetX, portal.targetY, 0xdd88ff, 14, 1.2);
          sfx.playPowerup();
        }
      });
    });

    // 3. Process Acceleration Runes
    this.physicsArena.speedRunes.forEach((rune) => {
      this.casters.forEach((caster) => {
        if (caster.isDead) return;
        const dx = caster.x - rune.x;
        const dy = caster.y - rune.y;
        if (Math.hypot(dx, dy) < rune.radius) {
          caster.vx *= 1.2;
          caster.vy *= 1.2;
        }
      });
    });
  }

  private bulletTrailTimer: number = 0;

  private updateParticles(dt: number) {
    this.bulletTrailTimer += dt;

    // 1. Spawning bullet trails (throttled to every 0.04s to avoid excessive particle clutter)
    if (this.bulletTrailTimer >= 0.04) {
      this.bulletTrailTimer = 0;
      const trailStyle = this.playerConfig?.trail || 'DEFAULT';

      this.projectiles.forEach((proj) => {
        let pColor = proj.trailColor;
        let pLifetime = 0.22;
        let pVx = (Math.random() - 0.5) * 0.4;
        let pVy = 0;
        let pVz = (Math.random() - 0.5) * 0.4;

        if (proj.ownerId === 'player') {
          if (trailStyle === 'CELESTIAL') {
            pColor = Math.random() > 0.5 ? 0xffe277 : 0xa0e0ff;
            pLifetime = 0.3;
          } else if (trailStyle === 'PHOENIX') {
            pColor = Math.random() > 0.5 ? 0xff4411 : 0xffaa00;
            pVy = 0.8 + Math.random() * 0.6;
          } else if (trailStyle === 'VOID') {
            pColor = 0x8822ff;
            pLifetime = 0.28;
          } else if (trailStyle === 'GLITCH') {
            pColor = Math.random() > 0.5 ? 0x00ffcc : 0xff0077;
            pVx = (Math.round(Math.random() * 2) - 1) * 0.8;
            pVz = (Math.round(Math.random() * 2) - 1) * 0.8;
          } else if (trailStyle === 'LIGHTNING') {
            pColor = 0x66ffff;
            pVx = (Math.random() - 0.5) * 1.5;
            pVz = (Math.random() - 0.5) * 1.5;
          }
        }

        const mat = getCachedParticleMaterial(pColor);
        let p: GameParticle;
        if (this.particlePool.length > 0) {
          p = this.particlePool.pop()!;
          p.mesh.material = mat;
          p.mesh.scale.set(1, 1, 1);
          p.mesh.visible = true;
        } else {
          const mesh = new THREE.Mesh(SHARED_BOX_GEO, mat);
          p = {
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            color: pColor,
            size: 1.0,
            opacity: 0.7,
            lifetime: 0,
            maxLifetime: pLifetime,
            mesh
          };
          this.scene.add(mesh);
        }

        p.position.set(proj.x, 0.4 + (Math.random() - 0.5) * 0.1, proj.y);
        p.mesh.position.copy(p.position);
        p.velocity.set(pVx, pVy, pVz);
        p.color = pColor;
        p.opacity = 0.7;
        p.lifetime = 0;
        p.maxLifetime = pLifetime;

        this.particles.push(p);
      });
    }

    // 2. Animate and update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.lifetime += dt;

      if (p.lifetime >= p.maxLifetime) {
        // Return to object pool instead of disposing/reallocating
        p.mesh.visible = false;
        this.particlePool.push(p);
        this.particles.splice(i, 1);
      } else {
        p.position.addScaledVector(p.velocity, dt);
        p.mesh.position.copy(p.position);

        if (p.velocity.y > 0.01) {
          p.velocity.y -= 9.81 * dt;
        }

        const ratio = 1 - (p.lifetime / p.maxLifetime);
        p.mesh.scale.set(ratio, ratio, ratio);
      }
    }
  }

  private updateHUD() {
    // 1. Health Bar
    const hpRounded = Math.round(this.player.health);
    if (hpRounded !== this.lastRenderedHp) {
      this.lastRenderedHp = hpRounded;
      if (this.hudEl.hpProgress) this.hudEl.hpProgress.style.width = `${this.player.health}%`;
      if (this.hudEl.hpText) this.hudEl.hpText.innerText = `${hpRounded} / 100`;
    }
    
    // Ammo slots update
    if (this.player.ammo !== this.lastRenderedAmmo) {
      this.lastRenderedAmmo = this.player.ammo;
      if (this.hudEl.ammoSlots) {
        const pips = this.hudEl.ammoSlots.children;
        for (let j = 0; j < pips.length; j++) {
          pips[j].className = j < this.player.ammo ? 'ammo-pip active' : 'ammo-pip';
        }
      }
      if (this.hudEl.fireBtn) {
        this.hudEl.fireBtn.classList.toggle('empty', this.player.ammo <= 0);
      }
    }

    // 2. Power-ups HUD
    const currentPuKey = this.player.powerupSlotsOrder.map(t => `${t}:${this.player.powerups.get(t) || 1}`).join('|');
    if (currentPuKey !== this.lastPuStateKey) {
      this.lastPuStateKey = currentPuKey;
      const colors: Record<PowerUpType, string> = {
        BOUNCE: '#ffaa00',
        PIERCE: '#aa00ff',
        SPLIT: '#00dfff',
        HASTE: '#39ff14',
        SHIELD: '#ffffff',
        FREEZE: '#4df0ff',
        WALLRUN: '#00e0b0'
      };

      const activeFusions = getActiveFusions(this.player.powerups);
      for (let i = 0; i < 3; i++) {
        const slotObj = this.hudEl.puSlots[i];
        if (slotObj && slotObj.slot && slotObj.text) {
          if (i < this.player.powerupSlotsOrder.length) {
            const type = this.player.powerupSlotsOrder[i];
            const stack = this.player.powerups.get(type) || 1;
            const fusionTag = activeFusions.length > 0 && i === 0 ? ` ✨ ${activeFusions[0].name}` : '';
            slotObj.text.innerText = `${POWERUP_SYMBOLS[type]} ${type} [Lv ${stack}]${fusionTag}`;
            slotObj.slot.className = 'pu-slot active';
            slotObj.slot.style.borderColor = colors[type];
            slotObj.slot.style.boxShadow = `0 0 10px ${colors[type]}`;
          } else {
            slotObj.text.innerText = 'Empty Slot';
            slotObj.slot.className = 'pu-slot';
            slotObj.slot.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            slotObj.slot.style.boxShadow = 'none';
          }
        }
      }
    }

    // 3. Score / Cooldowns / Coin counters
    if (this.player.coins !== this.lastRenderedCoins) {
      this.lastRenderedCoins = this.player.coins;
      if (this.hudEl.coinCounter && this.hudEl.coinText) {
        if (this.gameModeManager.type === GameModeType.GOLD_RUSH) {
          this.hudEl.coinCounter.style.display = 'flex';
          this.hudEl.coinText.innerText = `${this.player.coins}`;
        } else {
          this.hudEl.coinCounter.style.display = 'none';
        }
      }
    }

    // Dash Cooldown HUD & Mobile Dash Button state
    const isCooling = this.player.dashCooldownTimer > 0;
    const percent = Math.round(isCooling ? (this.player.dashCooldownTimer / this.player.dashCooldown) * 100 : 0);
    if (percent !== this.lastRenderedDashPercent) {
      this.lastRenderedDashPercent = percent;
      if (this.hudEl.dashOverlay) {
        this.hudEl.dashOverlay.style.height = `${percent}%`;
      }
      if (this.hudEl.dashBtn) {
        this.hudEl.dashBtn.classList.toggle('cooling', isCooling);
        this.hudEl.dashBtn.classList.toggle('ready', !isCooling);
        this.hudEl.dashBtn.style.setProperty('--dash-cd', `${percent}%`);
      }
    }

    // Gamepad connection indicator
    if (this.hudEl.gpIndicator) {
      this.hudEl.gpIndicator.classList.toggle('connected', this.input.gamepadConnected);
    }

    // 4. Timer & Game Mode Info
    if (this.hudEl.matchTimer) {
      const minutes = Math.floor(this.gameModeManager.matchTimer / 60);
      const seconds = Math.floor(this.gameModeManager.matchTimer % 60).toString().padStart(2, '0');
      const timerStr = `${minutes}:${seconds}`;
      if (timerStr !== this.lastRenderedTimerStr) {
        this.lastRenderedTimerStr = timerStr;
        this.hudEl.matchTimer.innerText = timerStr;
      }
    }

    // Mode-specific leaderboard updates (throttled to 4 Hz)
    const now = performance.now();
    if (now - this.lastLeaderboardUpdate > 250 || this.gameModeManager.isGameOver) {
      this.lastLeaderboardUpdate = now;
      this.updateLeaderboard();
    }

    // Cauldron Zone HUD (King of the Cauldron)
    const cauldronHud = document.getElementById('cauldron-hud');
    if (cauldronHud) {
      if (this.gameModeManager.type === GameModeType.KING_OF_THE_CAULDRON && this.gameModeManager.cauldron) {
        cauldronHud.style.display = 'flex';
        const c = this.gameModeManager.cauldron;
        const statusEl = document.getElementById('cauldron-status');
        const progressEl = document.getElementById('cauldron-progress');
        const scoreEl = document.getElementById('cauldron-score');

        // Find leader score
        let maxScore = 0;
        c.holdScores.forEach((score) => {
          if (score > maxScore) {
            maxScore = score;
          }
        });

        if (statusEl) {
          if (c.controllingName) {
            statusEl.innerText = `${c.controllingName.toUpperCase()} CONTROLS`;
            statusEl.style.color = '#ffd700';
          } else {
            statusEl.innerText = 'CAULDRON CONTESTED';
            statusEl.style.color = '#ffffff';
          }
        }

        const pct = Math.min(100, Math.round((maxScore / c.targetScore) * 100));
        if (progressEl) progressEl.style.width = `${pct}%`;
        if (scoreEl) scoreEl.innerText = `${Math.floor(maxScore)} / 100`;
      } else {
        cauldronHud.style.display = 'none';
      }
    }

    // Trial Mode HUD
    const trialHud = document.getElementById('trial-hud');
    if (trialHud) {
      if (this.trialStage) {
        trialHud.style.display = 'flex';
        const titleEl = document.getElementById('trial-hud-title');
        const targetsEl = document.getElementById('trial-hud-targets');
        const timeEl = document.getElementById('trial-hud-time');
        const parEl = document.getElementById('trial-hud-par');
        const shotsEl = document.getElementById('trial-hud-shots');
        const parShotsEl = document.getElementById('trial-hud-par-shots');

        const remainingDummies = this.trialDummies.filter((d) => !d.isDead).length;

        if (titleEl) titleEl.innerText = this.trialStage.title;
        if (targetsEl) targetsEl.innerText = `🎯 ${remainingDummies} Target${remainingDummies === 1 ? '' : 's'} Left`;
        if (timeEl) timeEl.innerText = `${this.trialElapsed.toFixed(1)}s`;
        if (parEl) parEl.innerText = `${this.trialStage.parTime.toFixed(1)}s`;
        if (shotsEl) shotsEl.innerText = `${this.trialShotsFired} Shot${this.trialShotsFired === 1 ? '' : 's'}`;
        if (parShotsEl) parShotsEl.innerText = `${this.trialStage.maxShots} max`;
      } else {
        trialHud.style.display = 'none';
      }
    }

    // 5. Game Over Screen check (not applicable to Trickshot Trials, which use their own
    // completeTrial()/onTrialCompleted flow instead of the standard match end screen)
    if (!this.trialStage && this.gameModeManager.isGameOver) {
      this.isPlaying = false;
      if (this.hudEl.gameoverOverlay && this.hudEl.gameoverWinner) {
        this.hudEl.gameoverWinner.innerText = this.gameModeManager.winnerText;
        this.hudEl.gameoverOverlay.style.display = 'flex';
      }
      // Hide touch fire/dash buttons
      this.resetTouchControls();
      if (this.hudEl.hudContainer) this.hudEl.hudContainer.style.display = 'none';
      if (!this.matchEndFired) {
        this.matchEndFired = true;
        const result = this.computeMatchResult();
        void music.playResult(result.won);
        if (this.onMatchEnd) this.onMatchEnd(result);
        if (this.netMode === 'host' && this.onNetMatchEnd) {
          const survivor = this.gameModeManager.type === GameModeType.BATTLE_ROYALE
            ? this.casters.find((caster) => !caster.isDead)
            : null;
          const winningTeam = this.gameModeManager.type === GameModeType.BATTLE_ROYALE
            ? null
            : this.gameModeManager.redScore === this.gameModeManager.blueScore
              ? null
              : this.gameModeManager.redScore > this.gameModeManager.blueScore ? 'RED' : 'BLUE';
          this.onNetMatchEnd({
            ...result,
            winnerText: this.gameModeManager.winnerText,
            winnerId: survivor?.id ?? null,
            winningTeam
          });
        }
      }
    }
  }

  private updateLeaderboard() {
    if (!this.hudEl.leaderboardList) return;
    const list = this.hudEl.leaderboardList;

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
    } else if (this.gameModeManager.type === GameModeType.KING_OF_THE_CAULDRON) {
      // Sort by cauldron hold scores. Unlike Team Battle/Gold Rush (FFA has no team
      // totals to show), so just clear any previous render before the per-player rows
      // are appended below — otherwise the list re-appends every ~250ms tick and grows
      // without bound (Issue #16).
      const c = this.gameModeManager.cauldron;
      sorted.sort((a, b) => (c?.holdScores.get(b.id) || 0) - (c?.holdScores.get(a.id) || 0));
      list.innerHTML = '';
    }

    // Crown whoever is currently leading (by the same metric used to sort above) with
    // a gold floating nametag, so it's clear at a glance who's ahead (Issue #17).
    const leader = sorted[0];
    let leaderProgress = 0;
    if (leader) {
      if (this.gameModeManager.type === GameModeType.GOLD_RUSH) leaderProgress = leader.coins;
      else if (this.gameModeManager.type === GameModeType.KING_OF_THE_CAULDRON) {
        leaderProgress = this.gameModeManager.cauldron?.holdScores.get(leader.id) || 0;
      } else leaderProgress = leader.score;
    }
    const leaderId = leader && !leader.isDead && leaderProgress > 0 ? leader.id : null;
    this.casters.forEach((c) => c.nameTag.setLeader(c.id === leaderId));

    // Render top 3 in landscape, top 5 in portrait/desktop
    const limit = window.innerHeight <= 500 ? 3 : 5;
    const topN = sorted.slice(0, limit);
    let itemsHtml = '';
    
    topN.forEach((caster, idx) => {
      let scoreStr = '';
      if (this.gameModeManager.type === GameModeType.GOLD_RUSH) {
        scoreStr = `${caster.coins} 🪙`;
      } else if (this.gameModeManager.type === GameModeType.KING_OF_THE_CAULDRON) {
        const pts = Math.floor(this.gameModeManager.cauldron?.holdScores.get(caster.id) || 0);
        scoreStr = `${pts} pts`;
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

    if (this.gameModeManager.type === GameModeType.TEAM_BATTLE || this.gameModeManager.type === GameModeType.GOLD_RUSH || this.gameModeManager.type === GameModeType.KING_OF_THE_CAULDRON) {
      list.innerHTML += itemsHtml;
    } else {
      list.innerHTML = itemsHtml;
    }
  }

  private computeMatchResult(): MatchResult {
    let won = false;
    if (this.gameModeManager.type === GameModeType.BATTLE_ROYALE) {
      won = !this.player.isDead;
    } else if (this.gameModeManager.type === GameModeType.KING_OF_THE_CAULDRON) {
      let bestId: string | null = null;
      let maxScore = -1;
      this.gameModeManager.cauldron?.holdScores.forEach((score, id) => {
        if (score > maxScore) {
          maxScore = score;
          bestId = id;
        }
      });
      won = bestId === 'player';
    } else {
      // Player is always on RED in team modes
      won = this.gameModeManager.redScore > this.gameModeManager.blueScore;
    }
    return { won, kills: this.player.score, mode: this.gameModeManager.type };
  }

  cleanup() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.isPlaying = false;
    cancelAnimationFrame(this.animationFrameId);
    this.eventAbortController.abort();
    this.resetTouchControls();
    if (this.input) this.input.dispose();
    this.physicsArena.destroy(this.scene);
    this.casters.forEach((c) => c.destroy(this.scene));
    this.projectiles.forEach((p) => p.destroy(this.scene));
    this.powerups.forEach((pu) => pu.destroy(this.scene));
    this.particles.forEach((p) => this.scene.remove(p.mesh));
    this.particlePool.forEach((p) => this.scene.remove(p.mesh));
    this.particles = [];
    this.particlePool = [];
    if (this.aimVisualizer) this.aimVisualizer.destroy(this.scene);
    this.gameModeManager.cleanup(this.scene);
    
    if (this.renderer) {
      if (this.renderer.domElement.parentElement === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
    }
  }
}
