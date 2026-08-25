/**
 * Networking types and serialization for LAN multiplayer.
 *
 * HOST mode: Game runs normally. After each tick, host serializes state and
 * broadcasts. Remote player inputs are applied to their caster entities.
 *
 * CLIENT mode: A lightweight renderer receives state snapshots and renders
 * them. No local simulation runs. Client sends input every frame.
 */

import * as THREE from 'three';
import { Arena, type MapType } from '../world/Arena';
import { InputManager } from '../engine/InputManager';
import { AimVisualizer } from '../engine/AimVisualizer';
import { screenToWorldIso, screenAngleToWorldIso } from '../engine/Physics';
import { GameModeType } from '../world/GameModes';
import { PALETTE, createSkyDome } from '../engine/Theme';

export interface PlayerInputState {
  moveX: number;
  moveY: number;
  aimAngle: number;
  firing: boolean;
  dashing: boolean;
}

export interface NetPlayerInfo {
  id: string;
  name: string;
  ready: boolean;
}

export interface RoomInfo {
  players: NetPlayerInfo[];
  hostId: string | null;
}

export interface MatchConfig {
  mode: string;
  map: string;
  playerCount: number;
  difficulty: string;
}

export interface CasterNetState {
  id: string;
  name: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  isDead: boolean;
  team: string;
  score: number;
  coins: number;
  ammo: number;
  aimAngle: number;
  isDashing: boolean;
  robeColor: number;
  spellColor: number;
  shieldActive: boolean;
}

export interface ProjectileNetState {
  id: number;
  x: number;
  y: number;
  ownerId: string;
  trailColor: number;
  isDead: boolean;
}

export interface PowerUpNetState {
  id: number;
  x: number;
  y: number;
  type: string;
  isCollected: boolean;
}

export interface GameStateSnapshot {
  casters: CasterNetState[];
  projectiles: ProjectileNetState[];
  powerups: PowerUpNetState[];
  matchTimer: number;
  redScore: number;
  blueScore: number;
  safeRadius: number;
  isGameOver: boolean;
  winnerText: string;
}

export interface GameEvent {
  kind: 'kill' | 'hit' | 'pickup' | 'dash' | 'fire';
  data: any;
}

type EventHandler = (data: any) => void;

/** WebSocket client for LAN multiplayer. */
export class LanClient {
  private ws: WebSocket | null = null;
  private url: string;
  public playerId: string = '';
  public isHost: boolean = false;
  public roomInfo: RoomInfo | null = null;
  public connected: boolean = false;

  private handlers: Map<string, EventHandler[]> = new Map();

  constructor(url: string) {
    this.url = url;
  }

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  private emit(event: string, data: any) {
    const handlers = this.handlers.get(event);
    if (handlers) handlers.forEach((h) => h(data));
  }

  connect(name: string, config: any): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(new Error('Failed to create WebSocket connection'));
        return;
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
          this.ws?.close();
        }
      }, 5000);

      this.ws.onopen = () => {
        this.send({ type: 'join', name, config });
      };

      this.ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }

        switch (msg.type) {
          case 'welcome':
            this.playerId = msg.playerId;
            this.isHost = msg.isHost;
            this.roomInfo = msg.roomInfo;
            this.connected = true;
            clearTimeout(timeout);
            this.emit('welcome', msg);
            resolve();
            break;
          case 'join':
            this.emit('playerJoin', msg);
            break;
          case 'leave':
            this.roomInfo = msg.roomInfo;
            this.emit('playerLeave', msg);
            break;
          case 'ready':
            this.emit('playerReady', msg);
            break;
          case 'start':
            this.emit('matchStart', msg);
            break;
          case 'state':
            this.emit('state', msg.state);
            break;
          case 'event':
            this.emit('event', msg.event);
            break;
          case 'end':
            this.emit('matchEnd', msg.result);
            break;
          case 'host':
            this.isHost = msg.isHost;
            this.emit('hostChange', msg);
            break;
          case 'clientInput':
            this.emit('clientInput', msg);
            break;
          case 'ping':
            this.send({ type: 'pong', t: msg.t });
            break;
          case 'pong': {
            const pingMs = Math.max(1, Math.round(performance.now() - msg.t));
            this.updatePingUI(pingMs);
            this.emit('ping', pingMs);
            break;
          }
        }
      };

      this.ws.onerror = () => {
        if (!this.connected) {
          clearTimeout(timeout);
          reject(new Error('WebSocket connection error'));
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.emit('disconnect', {});
      };
    });
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendInput(input: PlayerInputState) {
    this.send({ type: 'input', input });
  }

  setReady(ready: boolean) {
    this.send({ type: 'ready', ready });
  }

  startMatch(config: MatchConfig) {
    this.send({ type: 'start', config });
  }

  broadcastState(state: GameStateSnapshot) {
    this.send({ type: 'state', state });
  }

  broadcastEvent(event: GameEvent) {
    this.send({ type: 'event', event });
  }

  broadcastEnd(result: any) {
    this.send({ type: 'end', result });
  }

  private pingInterval: any = null;

  startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = setInterval(() => {
      if (this.connected) {
        this.send({ type: 'ping', t: performance.now() });
      }
    }, 2000);
  }

  stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  updatePingUI(pingMs: number) {
    const pingContainer = document.getElementById('net-ping');
    const pingVal = document.getElementById('net-ping-val');
    const pingDot = document.getElementById('net-ping-dot');
    if (pingContainer) pingContainer.style.display = 'flex';
    if (pingVal) pingVal.textContent = `${pingMs}ms`;
    if (pingDot) {
      pingDot.className = pingMs < 60 ? 'ping-dot' : pingMs < 150 ? 'ping-dot medium' : 'ping-dot poor';
    }
  }

  disconnect() {
    this.stopPingLoop();
    const pingContainer = document.getElementById('net-ping');
    if (pingContainer) pingContainer.style.display = 'none';
    if (this.ws) {
      this.send({ type: 'leave' });
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

/**
 * Lightweight client-side renderer for LAN / Online P2P multiplayer client mode.
 * Renders the full 3D arena and state snapshots from the host, captures client inputs,
 * and streams PlayerInputState to the host.
 */
export class ClientGameRenderer {
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLDivElement;
  private arena: Arena;
  private input: InputManager;
  private aimVisualizer: AimVisualizer;
  private casterMeshes = new Map<string, THREE.Group>();
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private powerupMeshes = new Map<number, THREE.Mesh>();
  private rafId = 0;
  private baseCameraZoom = 1;
  private eventAbortController = new AbortController();
  private localPlayerId: string = '';
  public readonly mapType: MapType;
  public readonly modeType: GameModeType;

  // Camera offset matching the host's isometric view
  private camOffset = new THREE.Vector3(18, 25, 29);

  // Local client input & aiming state
  public onSendInput: ((input: PlayerInputState) => void) | null = null;
  private touchControlsActive = false;
  private touchFireHeld = false;
  private touchDashQueued = false;
  private touchJoysticks = {
    left: { active: false, id: -1, startX: 0, startY: 0, curX: 0, curY: 0, dirX: 0, dirY: 0 },
    right: { active: false, id: -1, startX: 0, startY: 0, curX: 0, curY: 0, dirX: 0, dirY: 0 }
  };
  private lastLeftTapTime = 0;
  private lastLeftTapX = 0;
  private lastLeftTapY = 0;
  private localAimAngle: number = 0;
  private lastLocalPlayerState: CasterNetState | null = null;
  private casterTargets = new Map<string, { x: number; y: number }>();
  private contextLost = false;

  // Cached HUD DOM elements
  private hud = {
    hpProgress: document.getElementById('hp-progress'),
    hpText: document.getElementById('hp-text'),
    ammoSlots: document.getElementById('ammo-slots'),
    matchTimer: document.getElementById('match-timer'),
    matchTimerLabel: document.getElementById('match-timer-label'),
    coinCounter: document.getElementById('coin-counter'),
    coinVal: document.getElementById('coin-val'),
    leaderboardList: document.getElementById('leaderboard-list'),
    dashOverlay: document.getElementById('dash-cooldown-overlay'),
    dashBtn: document.getElementById('dash-btn'),
    fireBtn: document.getElementById('fire-btn')
  };

  constructor(
    container: HTMLDivElement,
    mapType: MapType = 'ARENA',
    modeType: GameModeType = GameModeType.BATTLE_ROYALE
  ) {
    this.container = container;
    this.mapType = mapType;
    this.modeType = modeType;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    const aspect = container.clientWidth / container.clientHeight;
    const viewSize = 11;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect, viewSize * aspect,
      viewSize, -viewSize, 0.1, 200
    );
    this.camera.position.copy(this.camOffset);
    this.camera.lookAt(0, 0, 0);
    this.baseCameraZoom = this.getBaseCameraZoom();
    this.camera.zoom = this.baseCameraZoom;
    this.camera.updateProjectionMatrix();

    const signal = this.eventAbortController.signal;
    window.addEventListener('resize', this.onResize, { signal });

    // WebGL Context Lost & Restored recovery
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn('ClientGameRenderer: WebGL context lost.');
      if (this.rafId) cancelAnimationFrame(this.rafId);
    }, { signal });

    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.info('ClientGameRenderer: WebGL context restored. Resuming rendering...');
      this.contextLost = false;
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.animate();
    }, { signal });

    // Scene Environment: background, fog, and celestial sky dome
    this.scene.background = new THREE.Color(PALETTE.skyBottom);
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, PALETTE.fogDensity);
    this.scene.add(createSkyDome());

    // Lighting — Hogwarts / Discworld warm torchlight & twilight atmosphere
    const ambientLight = new THREE.AmbientLight(PALETTE.ambient, 0.55);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.65);
    hemiLight.position.set(0, 40, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(PALETTE.sunLight, 1.05);
    dirLight.position.set(-18, 32, 18);
    this.scene.add(dirLight);

    const envLight = new THREE.DirectionalLight(0xffa840, 0.25);
    envLight.position.set(16, 20, -16);
    this.scene.add(envLight);

    // 1. Build Arena
    this.arena = new Arena(mapType);
    this.arena.buildArena(this.scene);

    // 2. Setup Input Manager
    this.input = new InputManager();

    // 3. Setup Aim Visualizer
    this.aimVisualizer = new AimVisualizer(this.scene);

    // 4. Setup Touch Controls
    this.setupTouchControls(signal);

    this.animate();
  }

  setLocalPlayerId(id: string) {
    this.localPlayerId = id;
  }

  private setupTouchControls(signal: AbortSignal) {
    const isTouchDevice =
      window.matchMedia('(pointer: coarse)').matches ||
      (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches) ||
      window.innerWidth <= 1024;

    if (isTouchDevice) {
      this.ensureTouchButtonsVisible();
    }

    window.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false, signal });
    window.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false, signal });
    window.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false, signal });
    window.addEventListener('touchcancel', this.onTouchEnd.bind(this), { passive: false, signal });

    // Dash button click listener
    const dashBtn = document.getElementById('dash-btn');
    if (dashBtn) {
      const onDash = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchDashQueued = true;
      };
      dashBtn.addEventListener('touchstart', onDash, { passive: false, signal });
      dashBtn.addEventListener('click', onDash, { signal });
    }

    // Fire button click listener
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
  }

  private ensureTouchButtonsVisible() {
    const fireBtn = document.getElementById('fire-btn');
    if (fireBtn) fireBtn.style.display = 'block';
    const dashBtn = document.getElementById('dash-btn');
    if (dashBtn) dashBtn.style.display = 'flex';
  }

  private onTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (target.closest('.gameover-overlay') || target.closest('#menu-screen') || target.closest('#spectator-hud'))) {
      return;
    }
    if (target && (target.id === 'fire-btn' || target.id === 'dash-btn' || target.closest('#fire-btn') || target.closest('#dash-btn') || target.closest('.dash-panel'))) {
      return;
    }

    this.touchControlsActive = true;
    this.ensureTouchButtonsVisible();

    const screenWidthHalf = window.innerWidth / 2;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < screenWidthHalf && !this.touchJoysticks.left.active) {
        e.preventDefault();
        const now = performance.now();
        if (now - this.lastLeftTapTime < 340 && Math.hypot(touch.clientX - this.lastLeftTapX, touch.clientY - this.lastLeftTapY) < 85) {
          this.touchDashQueued = true;
          this.lastLeftTapTime = 0;
        } else {
          this.lastLeftTapTime = now;
          this.lastLeftTapX = touch.clientX;
          this.lastLeftTapY = touch.clientY;
        }
        this.touchJoysticks.left.active = true;
        this.touchJoysticks.left.id = touch.identifier;
        this.touchJoysticks.left.startX = touch.clientX;
        this.touchJoysticks.left.startY = touch.clientY;
        this.showJoystickUI('left', touch.clientX, touch.clientY);
      } else if (touch.clientX >= screenWidthHalf && !this.touchJoysticks.right.active) {
        e.preventDefault();
        this.touchJoysticks.right.active = true;
        this.touchJoysticks.right.id = touch.identifier;
        this.touchJoysticks.right.startX = touch.clientX;
        this.touchJoysticks.right.startY = touch.clientY;
        this.showJoystickUI('right', touch.clientX, touch.clientY);
      }
    }
  }

  private onTouchMove(e: TouchEvent) {
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (this.touchJoysticks.left.active && touch.identifier === this.touchJoysticks.left.id) {
        e.preventDefault();
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
        const dx = touch.clientX - this.touchJoysticks.right.startX;
        const dy = touch.clientY - this.touchJoysticks.right.startY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const maxDist = 50;
        const limit = Math.min(dist, maxDist);
        if (dist > 6) {
          this.touchJoysticks.right.dirX = dx / dist;
          this.touchJoysticks.right.dirY = dy / dist;
          const screenAngle = Math.atan2(this.touchJoysticks.right.dirY, this.touchJoysticks.right.dirX);
          this.localAimAngle = screenAngleToWorldIso(screenAngle);
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
        this.hideJoystickUI('right');
      }
    }
  }

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
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private hideJoystickUI(side: 'left' | 'right') {
    const knob = document.getElementById(`joy-${side}-knob`);
    if (knob) knob.style.transform = `translate(0px, 0px)`;
    const el = document.getElementById(`joy-${side}`);
    if (el) el.style.display = 'none';
  }

  private resetTouchControls() {
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

  private getBaseCameraZoom() {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    if (aspect >= 1) return 1;
    const portraitAmount = THREE.MathUtils.clamp((0.85 - aspect) / 0.4, 0, 1);
    return 1 + portraitAmount * 0.24;
  }

  private onResize = () => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / Math.max(1, height);
    const viewSize = 11;
    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.baseCameraZoom = this.getBaseCameraZoom();
    this.camera.zoom = this.baseCameraZoom;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private pollLocalInput(): PlayerInputState {
    this.input.pollGamepad();

    let rawMoveX = 0;
    let rawMoveY = 0;

    // Movement: Touch joystick > Gamepad > Keyboard
    if (this.touchJoysticks.left.active) {
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

    let worldMoveX = 0;
    let worldMoveY = 0;
    const moveMag = Math.hypot(rawMoveX, rawMoveY);
    if (moveMag > 0.12) {
      const wm = screenToWorldIso(rawMoveX, rawMoveY);
      worldMoveX = wm.x;
      worldMoveY = wm.y;
    }

    // Aiming: Touch stick > Gamepad > Mouse
    if (this.touchJoysticks.right.active && (this.touchJoysticks.right.dirX !== 0 || this.touchJoysticks.right.dirY !== 0)) {
      const screenAngle = Math.atan2(this.touchJoysticks.right.dirY, this.touchJoysticks.right.dirX);
      this.localAimAngle = screenAngleToWorldIso(screenAngle);
    } else if (this.input.usingGamepad) {
      const ga = this.input.gamepadAim();
      if (ga.active) {
        const screenAngle = Math.atan2(ga.y, ga.x);
        this.localAimAngle = screenAngleToWorldIso(screenAngle);
      }
    } else if (!this.touchControlsActive) {
      if (Math.hypot(this.input.mouseNDC.x, this.input.mouseNDC.y) > 0.08) {
        const screenAngle = Math.atan2(-this.input.mouseNDC.y, this.input.mouseNDC.x);
        this.localAimAngle = screenAngleToWorldIso(screenAngle);
      }
    }

    // Firing & Dashing
    const firing = this.input.isFireHeld() || this.touchFireHeld;
    const dashing = this.input.consumeDash() || this.touchDashQueued;
    if (dashing) this.touchDashQueued = false;

    return {
      moveX: worldMoveX,
      moveY: worldMoveY,
      aimAngle: this.localAimAngle,
      firing,
      dashing
    };
  }

  private animate = () => {
    if (this.contextLost) return;
    this.rafId = requestAnimationFrame(this.animate);

    // 1. Smoothly interpolate casters toward their target positions
    this.casterMeshes.forEach((group, id) => {
      const target = this.casterTargets.get(id);
      if (target) {
        group.position.x += (target.x - group.position.x) * 0.4;
        group.position.z += (target.y - group.position.z) * 0.4;
      }
    });

    // 2. Poll inputs and stream to host
    const inputState = this.pollLocalInput();
    this.onSendInput?.(inputState);

    // 3. Update Aim Visualizer for local player
    if (this.lastLocalPlayerState && !this.lastLocalPlayerState.isDead) {
      const dummyPlayer = {
        x: this.lastLocalPlayerState.x,
        y: this.lastLocalPlayerState.y,
        radius: 0.55,
        aimAngle: this.localAimAngle,
        clothingColor: this.lastLocalPlayerState.robeColor,
        spellColor: this.lastLocalPlayerState.spellColor,
        isDead: false
      };
      this.aimVisualizer.update(dummyPlayer as any, true, null, this.arena.walls, 0.016);
    }

    // 4. Render Three.js Scene
    this.renderer.render(this.scene, this.camera);
  };

  /** Apply a state snapshot received from the host. */
  applyState(state: GameStateSnapshot) {
    // Update casters
    const seenIds = new Set<string>();
    state.casters.forEach((cs) => {
      seenIds.add(cs.id);
      let group = this.casterMeshes.get(cs.id);
      if (!group) {
        group = this.createCasterMesh(cs.robeColor, cs.spellColor);
        group.position.set(cs.x, 0, cs.y);
        this.casterMeshes.set(cs.id, group);
        this.casterTargets.set(cs.id, { x: cs.x, y: cs.y });
        this.scene.add(group);
      } else {
        const target = this.casterTargets.get(cs.id);
        if (target) {
          target.x = cs.x;
          target.y = cs.y;
        } else {
          this.casterTargets.set(cs.id, { x: cs.x, y: cs.y });
        }
      }

      group.visible = !cs.isDead;

      // Update color if changed
      const robe = group.getObjectByName('robe') as THREE.Mesh | null;
      if (robe) (robe.material as THREE.MeshStandardMaterial).color.setHex(cs.robeColor);

      // Aim indicator
      const aim = group.getObjectByName('aim') as THREE.Mesh | null;
      if (aim) {
        aim.position.set(Math.cos(cs.aimAngle) * 1.2, 1.0, Math.sin(cs.aimAngle) * 1.2);
      }

      // Shield
      const shield = group.getObjectByName('shield') as THREE.Mesh | null;
      if (shield) shield.visible = cs.shieldActive;
    });

    // Remove casters no longer in state
    this.casterMeshes.forEach((group, id) => {
      if (!seenIds.has(id)) {
        this.scene.remove(group);
        this.disposeCasterMesh(group);
        this.casterMeshes.delete(id);
      }
    });

    // Update projectiles
    const seenProj = new Set<number>();
    state.projectiles.forEach((p) => {
      if (p.isDead) return;
      seenProj.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        const geo = new THREE.SphereGeometry(0.18, 6, 6);
        const mat = new THREE.MeshBasicMaterial({ color: p.trailColor });
        mesh = new THREE.Mesh(geo, mat);
        this.projectileMeshes.set(p.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(p.x, 0.5, p.y);
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(p.trailColor);
    });

    // Remove dead projectiles
    this.projectileMeshes.forEach((mesh, id) => {
      if (!seenProj.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.projectileMeshes.delete(id);
      }
    });

    // Camera follows the local player
    const localPlayer = state.casters.find((c) => c.id === this.localPlayerId);
    if (localPlayer) {
      this.lastLocalPlayerState = localPlayer;
      if (!localPlayer.isDead) {
        const targetX = localPlayer.x + this.camOffset.x;
        const targetZ = localPlayer.y + this.camOffset.z;
        this.camera.position.x += (targetX - this.camera.position.x) * 0.14;
        this.camera.position.z += (targetZ - this.camera.position.z) * 0.14;
        this.camera.lookAt(localPlayer.x, 0, localPlayer.y);
        this.camera.updateMatrixWorld();
        this.camera.zoom = this.baseCameraZoom;
        this.camera.updateProjectionMatrix();
      }

      // Update HUD elements
      if (this.hud.hpProgress) {
        this.hud.hpProgress.style.width = `${Math.max(0, Math.min(100, (localPlayer.health / Math.max(1, localPlayer.maxHealth)) * 100))}%`;
      }
      if (this.hud.hpText) {
        this.hud.hpText.innerText = `${Math.max(0, Math.round(localPlayer.health))} / ${localPlayer.maxHealth}`;
      }
      if (this.hud.ammoSlots) {
        const pips = this.hud.ammoSlots.children;
        for (let j = 0; j < pips.length; j++) {
          pips[j].className = j < localPlayer.ammo ? 'ammo-pip active' : 'ammo-pip';
        }
      }
      if (this.hud.fireBtn) {
        this.hud.fireBtn.classList.toggle('empty', localPlayer.ammo <= 0);
      }
      if (this.hud.coinCounter && this.hud.coinVal) {
        if (this.modeType === GameModeType.GOLD_RUSH) {
          this.hud.coinCounter.style.display = 'flex';
          this.hud.coinVal.innerText = `${localPlayer.coins}`;
        } else {
          this.hud.coinCounter.style.display = 'none';
        }
      }
    }

    // Match Timer
    if (this.hud.matchTimer) {
      const t = Math.max(0, Math.floor(state.matchTimer));
      const mins = Math.floor(t / 60);
      const secs = t % 60;
      this.hud.matchTimer.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Leaderboard
    if (this.hud.leaderboardList) {
      const sorted = [...state.casters].sort((a, b) => b.score - a.score);
      const limit = window.innerHeight <= 500 ? 3 : 5;
      const topN = sorted.slice(0, limit);
      this.hud.leaderboardList.innerHTML = topN
        .map((c, idx) => {
          const isLocal = c.id === this.localPlayerId;
          const isDeadStyle = c.isDead ? 'opacity: 0.4; text-decoration: line-through;' : '';
          const activeStyle = isLocal ? 'background: rgba(255,255,255,0.06); font-weight: bold; border-left: 3px solid #ffd700; padding-left: 4px;' : '';
          const teamStyle = c.team === 'RED' ? 'color: #ff5a6e;' : c.team === 'BLUE' ? 'color: #3388ff;' : 'color: #ffd700;';
          const scoreStr = this.modeType === GameModeType.GOLD_RUSH ? `${c.coins} 🪙` : `${c.score} Kills`;
          return `
            <div class="leaderboard-item" style="${isDeadStyle} ${activeStyle}">
              <span style="${teamStyle}">#${idx + 1} ${c.name}</span>
              <span>${scoreStr}</span>
            </div>
          `;
        })
        .join('');
    }
  }

  private disposeCasterMesh(group: THREE.Group) {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    });
  }

  private createCasterMesh(robeColor: number, spellColor: number): THREE.Group {
    const group = new THREE.Group();

    // Robe (cone)
    const robeGeo = new THREE.ConeGeometry(0.6, 1.4, 8);
    const robeMat = new THREE.MeshStandardMaterial({ color: robeColor });
    const robe = new THREE.Mesh(robeGeo, robeMat);
    robe.name = 'robe';
    robe.position.y = 0.7;
    group.add(robe);

    // Head (sphere)
    const headGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf0d0a0 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.6;
    group.add(head);

    // Hat (cone)
    const hatGeo = new THREE.ConeGeometry(0.35, 0.5, 8);
    const hatMat = new THREE.MeshStandardMaterial({ color: spellColor });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 2.0;
    group.add(hat);

    // Aim indicator (small sphere)
    const aimGeo = new THREE.SphereGeometry(0.1, 4, 4);
    const aimMat = new THREE.MeshBasicMaterial({ color: spellColor });
    const aim = new THREE.Mesh(aimGeo, aimMat);
    aim.name = 'aim';
    aim.position.set(1.2, 1.0, 0);
    group.add(aim);

    // Shield bubble
    const shieldGeo = new THREE.SphereGeometry(1.0, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.2, side: THREE.BackSide
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.name = 'shield';
    shield.visible = false;
    group.add(shield);

    return group;
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.eventAbortController.abort();
    this.resetTouchControls();
    if (this.input) this.input.dispose();
    if (this.arena) this.arena.destroy(this.scene);
    if (this.aimVisualizer) this.aimVisualizer.destroy(this.scene);

    this.casterMeshes.forEach((group) => {
      this.scene.remove(group);
      this.disposeCasterMesh(group);
    });
    this.projectileMeshes.forEach((m) => {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.powerupMeshes.forEach((m) => {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.casterMeshes.clear();
    this.projectileMeshes.clear();
    this.powerupMeshes.clear();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
