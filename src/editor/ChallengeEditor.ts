import * as THREE from 'three';
import {
  type CustomMapData,
  sanitizeCustomMap,
  createPerimeterWalls,
  MAP_TEMPLATES
} from '../game/CustomMap';
import { PowerUpType, POWERUP_COLORS } from '../entities/PowerUp';
import { type MapType } from '../world/Arena';
import { type AABB } from '../engine/Physics';
import { PALETTE, createSkyDome } from '../engine/Theme';

export type EditorTool =
  | 'SELECT'
  | 'SPAWN'
  | 'WALL_BLOCK'
  | 'WALL_PILLAR'
  | 'WALL_BOX'
  | 'PLAYER_SPAWN'
  | 'BOT_SPAWN'
  | 'TARGET_DUMMY'
  | 'PORTAL'
  | 'SPEED_RUNE'
  | 'POWERUP'
  | 'BOUNCE_PAD'
  | 'DOOR'
  | 'MOVING_WALL'
  | 'HAZARD'
  | 'PROP'
  | 'CAULDRON_ZONE'
  | 'ERASER';

export interface EditorCallbacks {
  onMapModified?: (map: CustomMapData) => void;
  onClearCheckRequested?: (map: CustomMapData) => void;
  onShareRequested?: (map: CustomMapData) => void;
  onSaved?: (map: CustomMapData) => void;
  onExit?: () => void;
  onSelectionChanged?: (element: { type: string; index: number; data: any } | null) => void;
}

export class ChallengeEditor {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private mapData: CustomMapData;
  private activeTool: EditorTool = 'SELECT';
  private snapGridSize: number = 1.0; // 1.0 or 0.5
  private callbacks: EditorCallbacks;

  // Three.js visual layers
  private gridHelper: THREE.GridHelper | null = null;
  private groundPlane: THREE.Mesh;
  private previewMesh: THREE.Group | null = null;
  private placedObjectsGroup: THREE.Group;
  private selectionVisual: THREE.Group | null = null;

  // Raycasting & Interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private isPointerDown = false;
  private pointerDownPos = { x: 0, y: 0 };
  public currentCursorWorld = { x: 0, y: 0 };
  public boxDragStart: { x: number; y: number } | null = null;
  private portalFirstClick: { x: number; y: number } | null = null;

  // Camera Pan & Zoom
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private baseViewSize = 22;

  // Selected Object
  public selectedElement: { type: string; index: number; data: any } | null = null;

  // History Stack (Undo/Redo)
  private history: string[] = [];
  private historyIndex: number = -1;
  private isDisposed = false;
  private animationFrameId: number | null = null;
  private onKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, initialMap?: CustomMapData, callbacks: EditorCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.mapData = initialMap ? sanitizeCustomMap(initialMap) : MAP_TEMPLATES.BLANK_COURTYARD();

    // Scene & Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.skyBottom);
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, PALETTE.fogDensity * 0.7);
    this.scene.add(createSkyDome());

    this.placedObjectsGroup = new THREE.Group();
    this.scene.add(this.placedObjectsGroup);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Isometric Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      -this.baseViewSize * aspect,
      this.baseViewSize * aspect,
      this.baseViewSize,
      -this.baseViewSize,
      0.1,
      300
    );
    this.camera.position.set(24, 30, 24);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(PALETTE.ambient, 0.7);
    this.scene.add(ambientLight);
    const hemiLight = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.6);
    hemiLight.position.set(0, 40, 0);
    this.scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.1);
    dirLight.position.set(-20, 35, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    this.scene.add(dirLight);

    // Ground Plane for Raycasting
    const groundGeo = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e36,
      roughness: 0.8,
      metalness: 0.1
    });
    this.groundPlane = new THREE.Mesh(groundGeo, groundMat);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);

    this.rebuildGrid();
    this.rebuildPlacedObjects();
    this.pushHistory();

    this.bindEvents();
    this.animate();
  }

  setTool(tool: EditorTool) {
    this.activeTool = tool;
    this.portalFirstClick = null;
    this.boxDragStart = null;
    this.updatePreviewMesh();
  }

  getTool(): EditorTool {
    return this.activeTool;
  }

  setGridSnap(size: number) {
    this.snapGridSize = size;
  }

  getMapData(): CustomMapData {
    return sanitizeCustomMap(this.mapData);
  }

  setMapData(map: CustomMapData) {
    this.mapData = sanitizeCustomMap(map);
    this.rebuildGrid();
    this.rebuildPlacedObjects();
    this.pushHistory();
    this.callbacks.onMapModified?.(this.mapData);
  }

  setTheme(theme: MapType) {
    this.mapData.theme = theme;
    this.callbacks.onMapModified?.(this.mapData);
  }

  setMapDimensions(width: number, height: number) {
    this.mapData.size = {
      width: Math.max(20, Math.min(60, width)),
      height: Math.max(20, Math.min(60, height))
    };
    this.mapData.walls = [
      ...createPerimeterWalls(this.mapData.size.width, this.mapData.size.height),
      ...this.mapData.walls.filter((w) => !this.isPerimeterWall(w))
    ];
    this.rebuildGrid();
    this.rebuildPlacedObjects();
    this.pushHistory();
    this.callbacks.onMapModified?.(this.mapData);
  }

  private isPerimeterWall(w: AABB): boolean {
    const halfW = (this.mapData.size?.width || 36) / 2;
    const halfH = (this.mapData.size?.height || 36) / 2;
    return (
      Math.abs(w.minX - -halfW) < 0.1 ||
      Math.abs(w.maxX - halfW) < 0.1 ||
      Math.abs(w.minY - -halfH) < 0.1 ||
      Math.abs(w.maxY - halfH) < 0.1
    );
  }

  private snap(val: number): number {
    return Math.round(val / this.snapGridSize) * this.snapGridSize;
  }

  private rebuildGrid() {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
    }
    const width = this.mapData.size?.width || 36;
    const height = this.mapData.size?.height || 36;
    const size = Math.max(width, height);
    this.gridHelper = new THREE.GridHelper(size, size, 0xffd23d, 0x3d4a75);
    this.gridHelper.position.y = 0.02;
    this.scene.add(this.gridHelper);
  }

  private rebuildPlacedObjects() {
    while (this.placedObjectsGroup.children.length > 0) {
      const child = this.placedObjectsGroup.children[0];
      this.placedObjectsGroup.remove(child);
      child.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }

    // 1. Render Unified Spawns
    const spawns: { x: number; y: number; team?: 'RED' | 'BLUE' }[] = this.mapData.spawns && this.mapData.spawns.length > 0
      ? this.mapData.spawns
      : [this.mapData.playerSpawn, ...(this.mapData.botSpawns || [])];

    spawns.forEach((s, idx) => {
      const sGroup = new THREE.Group();
      sGroup.position.set(s.x, 0, s.y);
      const isPlayer = idx === 0;
      const spawnColor = isPlayer
        ? 0x8a4bfa
        : (s.team === 'RED' ? 0xff3366 : (s.team === 'BLUE' ? 0x3388ff : 0xd4a020));
      const emissiveColor = isPlayer
        ? 0x5821c9
        : (s.team === 'RED' ? 0xaa1133 : (s.team === 'BLUE' ? 0x1144aa : 0x664400));

      const sCircle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 0.1, 16),
        new THREE.MeshStandardMaterial({ color: spawnColor, emissive: emissiveColor, emissiveIntensity: 0.6 })
      );
      sCircle.position.y = 0.05;
      sGroup.add(sCircle);

      const icon = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: isPlayer ? 0xffd23d : 0x00f5a0, roughness: 0.3 })
      );
      icon.position.y = 0.55;
      sGroup.add(icon);

      sGroup.userData = { type: 'SPAWN', index: idx };
      this.placedObjectsGroup.add(sGroup);
    });

    // 3. Render Walls
    (this.mapData.walls || []).forEach((w, idx) => {
      const isPerimeter = this.isPerimeterWall(w);
      const width = w.maxX - w.minX;
      const height = w.maxY - w.minY;
      const cx = (w.minX + w.maxX) / 2;
      const cy = (w.minY + w.maxY) / 2;

      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, 1.4, height),
        new THREE.MeshStandardMaterial({
          color: isPerimeter ? 0x50463e : 0x8a7c6e,
          roughness: 0.8
        })
      );
      wallMesh.position.set(cx, 0.7, cy);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      wallMesh.userData = { type: 'WALL', index: idx, isPerimeter };
      this.placedObjectsGroup.add(wallMesh);
    });

    // 4. Render Target Dummies
    (this.mapData.dummies || []).forEach((d, idx) => {
      const dummyGroup = new THREE.Group();
      dummyGroup.position.set(d.x, 0, d.y);

      // Wooden target post
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
      );
      post.position.y = 0.6;
      dummyGroup.add(post);

      // Target head / shield
      const targetMat = new THREE.MeshStandardMaterial({
        color: d.isMoving ? 0x00d4ff : 0xff3366,
        emissive: d.isMoving ? 0x0088cc : 0x880022,
        emissiveIntensity: 0.4
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(d.radius || 0.75, 12, 12), targetMat);
      head.position.y = 1.3;
      dummyGroup.add(head);

      // Moving path preview
      if (d.isMoving && d.moveRange) {
        const pathGeo = new THREE.BufferGeometry();
        const r = d.moveRange;
        const pts = d.moveAxis === 'y'
          ? [new THREE.Vector3(0, 0.05, -r), new THREE.Vector3(0, 0.05, r)]
          : [new THREE.Vector3(-r, 0.05, 0), new THREE.Vector3(r, 0.05, 0)];
        pathGeo.setFromPoints(pts);
        const pathLine = new THREE.Line(pathGeo, new THREE.LineDashedMaterial({ color: 0x00d4ff, dashSize: 0.5, gapSize: 0.3 }));
        dummyGroup.add(pathLine);
      }

      dummyGroup.userData = { type: 'TARGET_DUMMY', index: idx };
      this.placedObjectsGroup.add(dummyGroup);
    });

    // 5. Render Portals
    (this.mapData.portals || []).forEach((p, idx) => {
      [
        { x: p.x1, y: p.y1, label: 'A' },
        { x: p.x2, y: p.y2, label: 'B' }
      ].forEach((entry) => {
        const portalGroup = new THREE.Group();
        portalGroup.position.set(entry.x, 0.05, entry.y);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.0, 0.12, 8, 20),
          new THREE.MeshStandardMaterial({ color: 0x9933ff, emissive: 0x9933ff, emissiveIntensity: 0.8 })
        );
        ring.rotation.x = Math.PI / 2;
        portalGroup.add(ring);
        portalGroup.userData = { type: 'PORTAL', index: idx };
        this.placedObjectsGroup.add(portalGroup);
      });
    });

    // 6. Render Speed Runes
    (this.mapData.speedRunes || []).forEach((r, idx) => {
      const runeMesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.08, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0x00f5a0, emissive: 0x00f5a0, emissiveIntensity: 0.8 })
      );
      runeMesh.position.set(r.x, 0.05, r.y);
      runeMesh.rotation.x = Math.PI / 2;
      runeMesh.userData = { type: 'SPEED_RUNE', index: idx };
      this.placedObjectsGroup.add(runeMesh);
    });

    // 7. Render Powerups
    (this.mapData.powerups || []).forEach((pu, idx) => {
      const puGroup = new THREE.Group();
      puGroup.position.set(pu.x, 0.4, pu.y);
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.4, 0),
        new THREE.MeshStandardMaterial({
          color: (POWERUP_COLORS as any)[pu.type] || 0xffd23d,
          emissive: (POWERUP_COLORS as any)[pu.type] || 0xffd23d,
          emissiveIntensity: 0.6
        })
      );
      puGroup.add(orb);
      puGroup.userData = { type: 'POWERUP', index: idx };
      this.placedObjectsGroup.add(puGroup);
    });

    // 8. Render Hazards (Gargoyle Turrets)
    (this.mapData.hazards || []).forEach((hz, idx) => {
      const hzGroup = new THREE.Group();
      hzGroup.position.set(hz.x, 0.6, hz.y);
      const turret = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0xd4a020, metalness: 0.6, roughness: 0.3 })
      );
      hzGroup.add(turret);
      hzGroup.userData = { type: 'HAZARD', index: idx };
      this.placedObjectsGroup.add(hzGroup);
    });

    // 9. Render Moving Walls
    (this.mapData.movingWalls || []).forEach((mw, idx) => {
      const mwMesh = new THREE.Mesh(
        new THREE.BoxGeometry(mw.halfW * 2, 1.4, mw.halfH * 2),
        new THREE.MeshStandardMaterial({ color: 0x5a3468, emissive: 0x3d1c48, emissiveIntensity: 0.4 })
      );
      mwMesh.position.set(mw.baseX, 0.7, mw.baseY);
      mwMesh.userData = { type: 'MOVING_WALL', index: idx };
      this.placedObjectsGroup.add(mwMesh);
    });

    // 10. Render Sliding Doors
    (this.mapData.doors || []).forEach((d, idx) => {
      const w = d.maxX - d.minX;
      const h = d.maxY - d.minY;
      const doorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.3, h),
        new THREE.MeshStandardMaterial({ color: 0xd4a020, transparent: true, opacity: 0.75 })
      );
      doorMesh.position.set((d.minX + d.maxX) / 2, 0.65, (d.minY + d.maxY) / 2);
      doorMesh.userData = { type: 'DOOR', index: idx };
      this.placedObjectsGroup.add(doorMesh);
    });

    // 11. Render Destructible Props
    (this.mapData.destructibleProps || []).forEach((dp, idx) => {
      const propMesh = new THREE.Mesh(
        dp.type === 'MANA_CRYSTAL' ? new THREE.OctahedronGeometry(0.5, 0) : new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: dp.type === 'MANA_CRYSTAL' ? 0x00ffff : 0xb5653b })
      );
      propMesh.position.set(dp.x, 0.4, dp.y);
      propMesh.userData = { type: 'PROP', index: idx };
      this.placedObjectsGroup.add(propMesh);
    });
  }

  private updatePreviewMesh() {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.previewMesh = null;
    }

    if (this.activeTool === 'SELECT' || this.activeTool === 'ERASER') return;

    this.previewMesh = new THREE.Group();
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x00f5a0,
      transparent: true,
      opacity: 0.45,
      wireframe: true
    });

    switch (this.activeTool) {
      case 'WALL_BLOCK':
        this.previewMesh.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 2), ghostMat));
        break;
      case 'WALL_PILLAR':
        this.previewMesh.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 4), ghostMat));
        break;
      case 'SPAWN':
      case 'PLAYER_SPAWN':
      case 'BOT_SPAWN':
        this.previewMesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.2, 16), ghostMat));
        break;
      case 'TARGET_DUMMY':
        this.previewMesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 12), ghostMat));
        break;
      case 'PORTAL':
        this.previewMesh.add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 8, 16), ghostMat));
        break;
      case 'SPEED_RUNE':
        this.previewMesh.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 8, 16), ghostMat));
        break;
      case 'POWERUP':
        this.previewMesh.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), ghostMat));
        break;
      case 'HAZARD':
        this.previewMesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8), ghostMat));
        break;
      case 'MOVING_WALL':
        this.previewMesh.add(new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 1.5), ghostMat));
        break;
      case 'DOOR':
        this.previewMesh.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1.3, 1), ghostMat));
        break;
      case 'PROP':
        this.previewMesh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8), ghostMat));
        break;
    }

    this.scene.add(this.previewMesh);
  }

  private handlePlacement(worldX: number, worldY: number) {
    const x = this.snap(worldX);
    const y = this.snap(worldY);

    switch (this.activeTool) {
      case 'SELECT':
        this.selectAt(worldX, worldY);
        return;

      case 'SPAWN':
      case 'PLAYER_SPAWN':
      case 'BOT_SPAWN': {
        const spawns = this.mapData.spawns && this.mapData.spawns.length > 0
          ? [...this.mapData.spawns]
          : [{ x: this.mapData.playerSpawn?.x ?? 0, y: this.mapData.playerSpawn?.y ?? -10 }];
        const existingIdx = spawns.findIndex((s) => Math.hypot(s.x - x, s.y - y) < 1.2);
        if (existingIdx >= 0) {
          spawns[existingIdx] = { ...spawns[existingIdx], x, y };
        } else if (spawns.length < 8) {
          spawns.push({ x, y });
        } else {
          spawns[spawns.length - 1] = { x, y };
        }
        this.mapData.spawns = spawns;
        this.mapData.playerSpawn = { x: spawns[0].x, y: spawns[0].y };
        this.mapData.botSpawns = spawns.slice(1);
        break;
      }

      case 'WALL_BLOCK':
        this.mapData.walls.push({ minX: x - 1, minY: y - 1, maxX: x + 1, maxY: y + 1 });
        break;

      case 'WALL_PILLAR':
        this.mapData.walls.push({ minX: x - 2, minY: y - 2, maxX: x + 2, maxY: y + 2 });
        break;

      case 'TARGET_DUMMY':
        this.mapData.dummies = this.mapData.dummies || [];
        this.mapData.dummies.push({
          id: `dummy_${Date.now()}_${this.mapData.dummies.length}`,
          x,
          y,
          health: 30,
          radius: 0.75,
          isMoving: false
        });
        break;

      case 'PORTAL':
        if (!this.portalFirstClick) {
          this.portalFirstClick = { x, y };
        } else {
          this.mapData.portals = this.mapData.portals || [];
          const idx = this.mapData.portals.length;
          this.mapData.portals.push({
            id1: `portal_${idx}a`,
            x1: this.portalFirstClick.x,
            y1: this.portalFirstClick.y,
            id2: `portal_${idx}b`,
            x2: x,
            y2: y
          });
          this.portalFirstClick = null;
        }
        break;

      case 'SPEED_RUNE':
        this.mapData.speedRunes = this.mapData.speedRunes || [];
        this.mapData.speedRunes.push({
          id: `rune_${Date.now()}_${this.mapData.speedRunes.length}`,
          x,
          y
        });
        break;

      case 'POWERUP':
        this.mapData.powerups = this.mapData.powerups || [];
        this.mapData.powerups.push({
          x,
          y,
          type: PowerUpType.HASTE
        });
        break;

      case 'HAZARD':
        this.mapData.hazards = this.mapData.hazards || [];
        this.mapData.hazards.push({
          x,
          y,
          angle: 0,
          rotateSpeed: 1.2,
          fireInterval: 3.0
        });
        break;

      case 'MOVING_WALL':
        this.mapData.movingWalls = this.mapData.movingWalls || [];
        this.mapData.movingWalls.push({
          baseX: x,
          baseY: y,
          halfW: 1.5,
          halfH: 0.75,
          axis: 'x',
          range: 4,
          speed: 1.5
        });
        break;

      case 'DOOR':
        this.mapData.doors = this.mapData.doors || [];
        this.mapData.doors.push({
          minX: x - 2,
          minY: y - 0.5,
          maxX: x + 2,
          maxY: y + 0.5,
          openDuration: 4.0,
          closeDuration: 4.0
        });
        break;

      case 'PROP':
        this.mapData.destructibleProps = this.mapData.destructibleProps || [];
        this.mapData.destructibleProps.push({
          type: 'URN',
          x,
          y
        });
        break;

      case 'ERASER':
        this.eraseAt(worldX, worldY);
        return;
    }

    this.rebuildPlacedObjects();
    this.pushHistory();
    this.callbacks.onMapModified?.(this.mapData);
  }

  private eraseAt(worldX: number, worldY: number) {
    const r = 1.5;

    // Walls (excluding perimeter)
    const wallIdx = (this.mapData.walls || []).findIndex(
      (w) => !this.isPerimeterWall(w) && worldX >= w.minX - 0.2 && worldX <= w.maxX + 0.2 && worldY >= w.minY - 0.2 && worldY <= w.maxY + 0.2
    );
    if (wallIdx >= 0) {
      this.mapData.walls.splice(wallIdx, 1);
      this.rebuildPlacedObjects();
      this.pushHistory();
      return;
    }

    // Dummies
    const dummyIdx = (this.mapData.dummies || []).findIndex((d) => Math.hypot(d.x - worldX, d.y - worldY) <= r);
    if (dummyIdx >= 0) {
      this.mapData.dummies!.splice(dummyIdx, 1);
      this.rebuildPlacedObjects();
      this.pushHistory();
      return;
    }

    // Powerups
    const puIdx = (this.mapData.powerups || []).findIndex((p) => Math.hypot(p.x - worldX, p.y - worldY) <= r);
    if (puIdx >= 0) {
      this.mapData.powerups!.splice(puIdx, 1);
      this.rebuildPlacedObjects();
      this.pushHistory();
      return;
    }

    // Portals
    const portalIdx = (this.mapData.portals || []).findIndex(
      (p) => Math.hypot(p.x1 - worldX, p.y1 - worldY) <= r || Math.hypot(p.x2 - worldX, p.y2 - worldY) <= r
    );
    if (portalIdx >= 0) {
      this.mapData.portals!.splice(portalIdx, 1);
      this.rebuildPlacedObjects();
      this.pushHistory();
      return;
    }

    // Hazards
    const hzIdx = (this.mapData.hazards || []).findIndex((h) => Math.hypot(h.x - worldX, h.y - worldY) <= r);
    if (hzIdx >= 0) {
      this.mapData.hazards!.splice(hzIdx, 1);
      this.rebuildPlacedObjects();
      this.pushHistory();
      return;
    }

    // Moving walls
    const mwIdx = (this.mapData.movingWalls || []).findIndex((m) => Math.hypot(m.baseX - worldX, m.baseY - worldY) <= r);
    if (mwIdx >= 0) {
      this.mapData.movingWalls!.splice(mwIdx, 1);
      this.rebuildPlacedObjects();
      this.pushHistory();
      return;
    }

    // Doors
    const doorIdx = (this.mapData.doors || []).findIndex(
      (d) => worldX >= d.minX - 0.5 && worldX <= d.maxX + 0.5 && worldY >= d.minY - 0.5 && worldY <= d.maxY + 0.5
    );
    if (doorIdx >= 0) {
      this.mapData.doors!.splice(doorIdx, 1);
      this.rebuildPlacedObjects();
      this.pushHistory();
      return;
    }

    // Spawns
    const spawns = this.mapData.spawns || [];
    const spawnIdx = spawns.findIndex((s) => Math.hypot(s.x - worldX, s.y - worldY) <= r);
    if (spawnIdx > 0) {
      this.mapData.spawns!.splice(spawnIdx, 1);
      this.mapData.playerSpawn = { x: this.mapData.spawns![0].x, y: this.mapData.spawns![0].y };
      this.mapData.botSpawns = this.mapData.spawns!.slice(1);
      this.rebuildPlacedObjects();
      this.pushHistory();
      return;
    }
  }

  // ── Selection & Object Manipulation System ──
  private selectAt(worldX: number, worldY: number) {
    // 1. Raycast against placed meshes
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.placedObjectsGroup.children, true);

    let hitUserData: { type: string; index: number; [key: string]: any } | null = null;

    for (const hit of intersects) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur && cur !== this.placedObjectsGroup) {
        if (cur.userData && cur.userData.type) {
          if (cur.userData.type === 'WALL' && cur.userData.isPerimeter) {
            break; // Do not select perimeter boundary walls
          }
          hitUserData = cur.userData as any;
          break;
        }
        cur = cur.parent;
      }
      if (hitUserData) break;
    }

    // 2. Fallback distance check if raycast missed thin geometry
    if (!hitUserData) {
      const r = 1.8;
      const wallIdx = (this.mapData.walls || []).findIndex(
        (w) => !this.isPerimeterWall(w) && worldX >= w.minX - 0.3 && worldX <= w.maxX + 0.3 && worldY >= w.minY - 0.3 && worldY <= w.maxY + 0.3
      );
      if (wallIdx >= 0) {
        hitUserData = { type: 'WALL', index: wallIdx };
      }

      if (!hitUserData) {
        const spawns = this.mapData.spawns || [this.mapData.playerSpawn];
        const sIdx = spawns.findIndex((s) => Math.hypot(s.x - worldX, s.y - worldY) <= r);
        if (sIdx >= 0) hitUserData = { type: 'SPAWN', index: sIdx };
      }

      if (!hitUserData) {
        const dIdx = (this.mapData.dummies || []).findIndex((d) => Math.hypot(d.x - worldX, d.y - worldY) <= r);
        if (dIdx >= 0) hitUserData = { type: 'TARGET_DUMMY', index: dIdx };
      }

      if (!hitUserData) {
        const hIdx = (this.mapData.hazards || []).findIndex((h) => Math.hypot(h.x - worldX, h.y - worldY) <= r);
        if (hIdx >= 0) hitUserData = { type: 'HAZARD', index: hIdx };
      }

      if (!hitUserData) {
        const mIdx = (this.mapData.movingWalls || []).findIndex((m) => Math.hypot(m.baseX - worldX, m.baseY - worldY) <= r);
        if (mIdx >= 0) hitUserData = { type: 'MOVING_WALL', index: mIdx };
      }

      if (!hitUserData) {
        const drIdx = (this.mapData.doors || []).findIndex(
          (d) => worldX >= d.minX - 0.5 && worldX <= d.maxX + 0.5 && worldY >= d.minY - 0.5 && worldY <= d.maxY + 0.5
        );
        if (drIdx >= 0) hitUserData = { type: 'DOOR', index: drIdx };
      }

      if (!hitUserData) {
        const pIdx = (this.mapData.powerups || []).findIndex((p) => Math.hypot(p.x - worldX, p.y - worldY) <= r);
        if (pIdx >= 0) hitUserData = { type: 'POWERUP', index: pIdx };
      }

      if (!hitUserData) {
        const portIdx = (this.mapData.portals || []).findIndex(
          (p) => Math.hypot(p.x1 - worldX, p.y1 - worldY) <= r || Math.hypot(p.x2 - worldX, p.y2 - worldY) <= r
        );
        if (portIdx >= 0) hitUserData = { type: 'PORTAL', index: portIdx };
      }

      if (!hitUserData) {
        const srIdx = (this.mapData.speedRunes || []).findIndex((s) => Math.hypot(s.x - worldX, s.y - worldY) <= r);
        if (srIdx >= 0) hitUserData = { type: 'SPEED_RUNE', index: srIdx };
      }

      if (!hitUserData) {
        const propIdx = (this.mapData.destructibleProps || []).findIndex((p) => Math.hypot(p.x - worldX, p.y - worldY) <= r);
        if (propIdx >= 0) hitUserData = { type: 'PROP', index: propIdx };
      }
    }

    if (hitUserData) {
      this.selectedElement = {
        type: hitUserData.type,
        index: hitUserData.index,
        data: this.getElementData(hitUserData.type, hitUserData.index)
      };
    } else {
      this.selectedElement = null;
    }

    this.updateSelectionVisual();
    this.callbacks.onSelectionChanged?.(this.selectedElement);
  }

  private updateSelectionVisual() {
    if (this.selectionVisual) {
      this.scene.remove(this.selectionVisual);
      this.selectionVisual.traverse((ch) => {
        if (ch instanceof THREE.Mesh || ch instanceof THREE.LineSegments) {
          ch.geometry.dispose();
          if (Array.isArray(ch.material)) ch.material.forEach((m) => m.dispose());
          else ch.material.dispose();
        }
      });
      this.selectionVisual = null;
    }

    if (!this.selectedElement) return;

    let targetMesh: THREE.Object3D | null = null;
    for (const child of this.placedObjectsGroup.children) {
      if (child.userData?.type === this.selectedElement.type && child.userData?.index === this.selectedElement.index) {
        targetMesh = child;
        break;
      }
    }

    if (!targetMesh) return;

    const box = new THREE.Box3().setFromObject(targetMesh);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    this.selectionVisual = new THREE.Group();

    // Vibrant cyan wireframe box
    const boxGeo = new THREE.BoxGeometry(Math.max(1.2, size.x + 0.25), Math.max(1.2, size.y + 0.25), Math.max(1.2, size.z + 0.25));
    const edges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f5a0 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.position.copy(center);
    this.selectionVisual.add(wireframe);

    // Glowing floor ring
    const ringRadius = Math.max(size.x, size.z) * 0.65 + 0.3;
    const ringGeo = new THREE.RingGeometry(ringRadius - 0.08, ringRadius, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f5a0, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, 0.06, center.z);
    this.selectionVisual.add(ring);

    this.scene.add(this.selectionVisual);
  }

  /**
   * Rotates the currently selected object:
   * - Walls & Doors: Swaps width and length around center
   * - Moving Walls: Swaps axis and dimensions
   * - Hazards: Rotates fire angle by 45 degrees
   * - Target Dummies: Toggles movement axis
   * - Spawns: Cycles team alignment
   */
  rotateSelected() {
    if (!this.selectedElement) return;
    const { type, index } = this.selectedElement;

    if (type === 'WALL') {
      const wall = this.mapData.walls[index];
      if (wall && !this.isPerimeterWall(wall)) {
        const cx = (wall.minX + wall.maxX) / 2;
        const cy = (wall.minY + wall.maxY) / 2;
        const hw = (wall.maxX - wall.minX) / 2;
        const hh = (wall.maxY - wall.minY) / 2;
        wall.minX = cx - hh;
        wall.maxX = cx + hh;
        wall.minY = cy - hw;
        wall.maxY = cy + hw;
      }
    } else if (type === 'DOOR') {
      const door = this.mapData.doors?.[index];
      if (door) {
        const cx = (door.minX + door.maxX) / 2;
        const cy = (door.minY + door.maxY) / 2;
        const hw = (door.maxX - door.minX) / 2;
        const hh = (door.maxY - door.minY) / 2;
        door.minX = cx - hh;
        door.maxX = cx + hh;
        door.minY = cy - hw;
        door.maxY = cy + hw;
      }
    } else if (type === 'MOVING_WALL') {
      const mw = this.mapData.movingWalls?.[index];
      if (mw) {
        const oldHw = mw.halfW;
        mw.halfW = mw.halfH;
        mw.halfH = oldHw;
        mw.axis = mw.axis === 'x' ? 'y' : 'x';
      }
    } else if (type === 'HAZARD') {
      const hz = this.mapData.hazards?.[index];
      if (hz) {
        hz.angle = ((hz.angle || 0) + Math.PI / 4) % (Math.PI * 2);
      }
    } else if (type === 'TARGET_DUMMY') {
      const d = this.mapData.dummies?.[index];
      if (d) {
        d.moveAxis = d.moveAxis === 'y' ? 'x' : 'y';
      }
    } else if (type === 'SPAWN') {
      const spawns = this.mapData.spawns || [];
      if (spawns[index] && index > 0) {
        spawns[index].team = spawns[index].team === 'RED' ? 'BLUE' : (spawns[index].team === 'BLUE' ? undefined : 'RED');
        this.mapData.botSpawns = spawns.slice(1);
      }
    }

    this.rebuildPlacedObjects();
    this.updateSelectionVisual();
    this.pushHistory();
    this.callbacks.onMapModified?.(this.mapData);
  }

  /**
   * Deletes the currently selected object.
   */
  deleteSelected() {
    if (!this.selectedElement) return;
    const { type, index } = this.selectedElement;

    if (type === 'WALL') {
      const wall = this.mapData.walls[index];
      if (wall && !this.isPerimeterWall(wall)) {
        this.mapData.walls.splice(index, 1);
      }
    } else if (type === 'TARGET_DUMMY') {
      this.mapData.dummies?.splice(index, 1);
    } else if (type === 'POWERUP') {
      this.mapData.powerups?.splice(index, 1);
    } else if (type === 'PORTAL') {
      this.mapData.portals?.splice(index, 1);
    } else if (type === 'SPEED_RUNE') {
      this.mapData.speedRunes?.splice(index, 1);
    } else if (type === 'HAZARD') {
      this.mapData.hazards?.splice(index, 1);
    } else if (type === 'MOVING_WALL') {
      this.mapData.movingWalls?.splice(index, 1);
    } else if (type === 'DOOR') {
      this.mapData.doors?.splice(index, 1);
    } else if (type === 'PROP') {
      this.mapData.destructibleProps?.splice(index, 1);
    } else if (type === 'SPAWN') {
      if (index > 0 && this.mapData.spawns) {
        this.mapData.spawns.splice(index, 1);
        this.mapData.playerSpawn = { x: this.mapData.spawns[0].x, y: this.mapData.spawns[0].y };
        this.mapData.botSpawns = this.mapData.spawns.slice(1);
      }
    }

    this.selectedElement = null;
    this.updateSelectionVisual();
    this.rebuildPlacedObjects();
    this.pushHistory();
    this.callbacks.onSelectionChanged?.(null);
    this.callbacks.onMapModified?.(this.mapData);
  }

  private getElementData(type: string, index: number): any {
    switch (type) {
      case 'WALL': return this.mapData.walls[index];
      case 'TARGET_DUMMY': return this.mapData.dummies?.[index];
      case 'POWERUP': return this.mapData.powerups?.[index];
      case 'PORTAL': return this.mapData.portals?.[index];
      case 'SPEED_RUNE': return this.mapData.speedRunes?.[index];
      case 'HAZARD': return this.mapData.hazards?.[index];
      case 'MOVING_WALL': return this.mapData.movingWalls?.[index];
      case 'DOOR': return this.mapData.doors?.[index];
      case 'PROP': return this.mapData.destructibleProps?.[index];
      case 'SPAWN': return (this.mapData.spawns || [this.mapData.playerSpawn])[index];
      default: return null;
    }
  }

  clearSelection() {
    this.selectedElement = null;
    this.updateSelectionVisual();
    this.callbacks.onSelectionChanged?.(null);
  }

  // ── History Stack ──
  private pushHistory() {
    const json = JSON.stringify(this.mapData);
    if (this.historyIndex >= 0 && this.history[this.historyIndex] === json) return;

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(json);
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.mapData = JSON.parse(this.history[this.historyIndex]);
      this.rebuildGrid();
      this.rebuildPlacedObjects();
      this.callbacks.onMapModified?.(this.mapData);
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.mapData = JSON.parse(this.history[this.historyIndex]);
      this.rebuildGrid();
      this.rebuildPlacedObjects();
      this.callbacks.onMapModified?.(this.mapData);
    }
  }

  // ── Event Handlers ──
  private bindEvents() {
    const el = this.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };

      if (e.button === 2 || e.shiftKey) {
        // Right click or Shift+drag pans camera
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isPanning) {
        const dx = (e.clientX - this.panStart.x) * 0.05;
        const dy = (e.clientY - this.panStart.y) * 0.05;
        this.camera.position.x -= dx;
        this.camera.position.z -= dy;
        this.panStart = { x: e.clientX, y: e.clientY };
        return;
      }

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.groundPlane);
      if (intersects.length > 0) {
        const pt = intersects[0].point;
        this.currentCursorWorld = { x: pt.x, y: pt.z };

        if (this.previewMesh) {
          this.previewMesh.position.set(this.snap(pt.x), 0.05, this.snap(pt.z));
        }
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.isPointerDown = false;
        return;
      }

      if (this.isPointerDown) {
        const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
        if (dist < 8) {
          // It's a clean click
          this.raycaster.setFromCamera(this.mouse, this.camera);
          const intersects = this.raycaster.intersectObject(this.groundPlane);
          if (intersects.length > 0) {
            const pt = intersects[0].point;
            this.handlePlacement(pt.x, pt.z);
          }
        }
      }

      this.isPointerDown = false;
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      this.camera.zoom = Math.max(0.4, Math.min(3.0, this.camera.zoom / zoomFactor));
      this.camera.updateProjectionMatrix();
    });

    // Keyboard Shortcuts
    this.onKeyDownHandler = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        this.rotateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelected();
      } else if (e.key === 'Escape') {
        this.selectedElement = null;
        this.updateSelectionVisual();
        this.callbacks.onSelectionChanged?.(null);
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.redo();
      }
    };
    window.addEventListener('keydown', this.onKeyDownHandler);

    // Resize
    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    if (!this.container || this.isDisposed) return;
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.left = -this.baseViewSize * aspect;
    this.camera.right = this.baseViewSize * aspect;
    this.camera.top = this.baseViewSize;
    this.camera.bottom = -this.baseViewSize;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  private animate = () => {
    if (this.isDisposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    this.isDisposed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('resize', this.onResize);
    if (this.onKeyDownHandler) {
      window.removeEventListener('keydown', this.onKeyDownHandler);
      this.onKeyDownHandler = null;
    }

    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
