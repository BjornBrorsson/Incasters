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

  disconnect() {
    if (this.ws) {
      this.send({ type: 'leave' });
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

/**
 * Lightweight client-side renderer for LAN multiplayer client mode.
 * Does NOT run any game simulation — just renders state snapshots from the host.
 */
export class ClientGameRenderer {
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLDivElement;
  private casterMeshes = new Map<string, THREE.Group>();
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private rafId = 0;

  // Camera offset matching the host's isometric view
  private camOffset = new THREE.Vector3(18, 25, 29);

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    const aspect = container.clientWidth / container.clientHeight;
    const viewSize = 22;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect, viewSize * aspect,
      viewSize, -viewSize, 0.1, 200
    );
    this.camera.position.copy(this.camOffset);
    this.camera.lookAt(0, 0, 0);

    // Simple ambient lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(10, 20, 10);
    this.scene.add(dir);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    this.animate();
  }

  private animate = () => {
    this.rafId = requestAnimationFrame(this.animate);
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
        this.casterMeshes.set(cs.id, group);
        this.scene.add(group);
      }

      group.position.set(cs.x, 0, cs.y);
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
    if (localPlayer && !localPlayer.isDead) {
      const targetX = localPlayer.x + this.camOffset.x;
      const targetZ = localPlayer.y + this.camOffset.z;
      this.camera.position.x += (targetX - this.camera.position.x) * 0.1;
      this.camera.position.z += (targetZ - this.camera.position.z) * 0.1;
      this.camera.lookAt(localPlayer.x, 0, localPlayer.y);
    }
  }

  private localPlayerId: string = '';

  setLocalPlayerId(id: string) {
    this.localPlayerId = id;
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
    this.casterMeshes.forEach((g) => this.scene.remove(g));
    this.projectileMeshes.forEach((m) => {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.casterMeshes.clear();
    this.projectileMeshes.clear();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
