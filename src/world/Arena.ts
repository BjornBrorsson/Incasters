import * as THREE from 'three';
import type { AABB } from '../engine/Physics';
import { PALETTE } from '../engine/Theme';

export interface SpawnPoint {
  x: number;
  y: number;
}

export type MapType = 'ARENA' | 'COLOSSEUM' | 'CHAMBER';
export const MapType = {
  ARENA: 'ARENA' as MapType,
  COLOSSEUM: 'COLOSSEUM' as MapType,
  CHAMBER: 'CHAMBER' as MapType
};

export interface Door {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  isOpen: boolean;
  timer: number;
  openDuration: number;
  closeDuration: number;
  mesh: THREE.Mesh | null;
  wallIndex: number; // Index in the physical walls array
}

export interface JumpPad {
  x: number;
  y: number;
  radius: number;
  launchVx: number;
  launchVy: number;
  mesh: THREE.Mesh | null;
}

export interface Hazard {
  x: number;
  y: number;
  angle: number;
  rotateSpeed: number;
  fireTimer: number;
  fireInterval: number;
  fireRadius: number;
  baseWallIndex: number;
  mesh: THREE.Group | null;
}

export interface MovingWall {
  wallIndex: number;
  baseX: number;
  baseY: number;
  halfW: number;
  halfH: number;
  axis: 'x' | 'y';
  range: number;
  speed: number;
  phase: number;
  mesh: THREE.Mesh | null;
}

export class Arena {
  width: number = 36;
  height: number = 36;
  walls: AABB[] = [];
  spawnPoints: SpawnPoint[] = [];
  powerupSpawners: SpawnPoint[] = [];
  doors: Door[] = [];
  jumpPads: JumpPad[] = [];
  hazards: Hazard[] = [];
  movingWalls: MovingWall[] = [];
  mapType: MapType = 'ARENA';

  // Fired by rotating shooting statues; wired to Game's neutral projectile spawner
  onHazardFire: ((x: number, y: number, angle: number) => void) | null = null;
  
  // ThreeJS Mesh Groups
  private arenaGroup: THREE.Group;
  private wallMaterial: THREE.MeshStandardMaterial;
  private bouncePadMaterial: THREE.MeshStandardMaterial;
  private doorMaterial: THREE.MeshStandardMaterial;
  private hazardMaterial: THREE.MeshStandardMaterial;
  private hazardBarrelMaterial: THREE.MeshStandardMaterial;
  private movingWallMaterial: THREE.MeshStandardMaterial;
  private bouncePadsMeshes: THREE.Mesh[] = [];
  private pulseTime: number = 0;

  constructor(mapType: MapType = 'ARENA') {
    this.mapType = mapType;
    this.arenaGroup = new THREE.Group();
    
    // Core Neon Themes
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.wall,
      roughness: 0.65,
      metalness: 0.05
    });

    this.bouncePadMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.bouncePad,
      emissive: PALETTE.bouncePad,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });

    this.doorMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.door,
      emissive: PALETTE.door,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.8,
      roughness: 0.25
    });

    this.hazardMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3550,
      roughness: 0.5,
      metalness: 0.4
    });
    this.hazardBarrelMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5522,
      emissive: 0xff3300,
      emissiveIntensity: 0.6,
      roughness: 0.4
    });
    this.movingWallMaterial = new THREE.MeshStandardMaterial({
      color: 0xb45cff,
      emissive: 0x6a2caa,
      emissiveIntensity: 0.35,
      roughness: 0.4
    });

    this.setupLayout();
  }

  private setupLayout() {
    this.walls = [];
    this.spawnPoints = [];
    this.powerupSpawners = [];
    this.doors = [];
    this.jumpPads = [];
    this.hazards = [];
    this.movingWalls = [];

    if (this.mapType === 'COLOSSEUM') {
      this.width = 48;
      this.height = 48;
    } else if (this.mapType === 'CHAMBER') {
      this.width = 24;
      this.height = 24;
    } else {
      this.width = 36;
      this.height = 36;
    }

    const halfW = this.width / 2;
    const halfH = this.height / 2;

    // 1. Boundary outer walls
    this.walls.push({ minX: -halfW - 1, minY: -halfH - 1, maxX: -halfW, maxY: halfH + 1 });
    this.walls.push({ minX: halfW, minY: -halfH - 1, maxX: halfW + 1, maxY: halfH + 1 });
    this.walls.push({ minX: -halfW - 1, minY: -halfH - 1, maxX: halfW + 1, maxY: -halfH });
    this.walls.push({ minX: -halfW - 1, minY: halfH, maxX: halfW + 1, maxY: halfH + 1 });

    if (this.mapType === 'COLOSSEUM') {
      // Spacius Colosseum with an open center surrounded by pillars
      // Concentric inner pillars
      this.walls.push({ minX: -8, minY: -10, maxX: -4, maxY: -8 });
      this.walls.push({ minX: 4, minY: -10, maxX: 8, maxY: -8 });
      this.walls.push({ minX: -8, minY: 8, maxX: -4, maxY: 10 });
      this.walls.push({ minX: 4, minY: 8, maxX: 8, maxY: 10 });

      // Outer pillars
      this.walls.push({ minX: -16, minY: -16, maxX: -13, maxY: -13 });
      this.walls.push({ minX: 13, minY: -16, maxX: 16, maxY: -13 });
      this.walls.push({ minX: -16, minY: 13, maxX: -13, maxY: 16 });
      this.walls.push({ minX: 13, minY: 13, maxX: 16, maxY: 16 });

      // Bounce pads (centered on outer quadrants)
      this.walls.push({ minX: -11, minY: -2, maxX: -9, maxY: 2, isBouncePad: true });
      this.walls.push({ minX: 9, minY: -2, maxX: 11, maxY: 2, isBouncePad: true });
      this.walls.push({ minX: -2, minY: -11, maxX: 2, maxY: -9, isBouncePad: true });
      this.walls.push({ minX: -2, minY: 9, maxX: 2, maxY: 11, isBouncePad: true });

      // 4 sliding security gates blocking inner paths
      this.addDoor('door_n', -1.5, -16.5, 1.5, -14.5, 6, 6);
      this.addDoor('door_s', -1.5, 14.5, 1.5, 16.5, 6, 6);
      this.addDoor('door_w', -16.5, -1.5, -14.5, 1.5, 6, 6);
      this.addDoor('door_e', 14.5, -1.5, 16.5, 1.5, 6, 6);

      // Spawns
      const radius = 18;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        this.spawnPoints.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      }

      // 6 Power-up Spawners
      this.powerupSpawners.push({ x: -14, y: -8 });
      this.powerupSpawners.push({ x: 14, y: -8 });
      this.powerupSpawners.push({ x: -14, y: 8 });
      this.powerupSpawners.push({ x: 14, y: 8 });
      this.powerupSpawners.push({ x: 0, y: -5 });
      this.powerupSpawners.push({ x: 0, y: 5 });

      // 4 Corner Jump pads launching casters inwards
      const jl = 15.0;
      this.jumpPads.push({ x: -20, y: -20, radius: 1.2, launchVx: jl, launchVy: jl, mesh: null });
      this.jumpPads.push({ x: 20, y: -20, radius: 1.2, launchVx: -jl, launchVy: jl, mesh: null });
      this.jumpPads.push({ x: -20, y: 20, radius: 1.2, launchVx: jl, launchVy: -jl, mesh: null });
      this.jumpPads.push({ x: 20, y: 20, radius: 1.2, launchVx: -jl, launchVy: -jl, mesh: null });

      // Hazards: central rotating shooting statue + two sliding walls
      this.addHazard(0, 0, 1.1, 1.3, 1.7);
      this.addMovingWall(0, -14, 3, 1.5, 'x', 6, 0.35);
      this.addMovingWall(0, 14, 3, 1.5, 'x', 6, 0.35);

    } else if (this.mapType === 'CHAMBER') {
      // Small labyrinth-like maze
      // Central cross wall
      this.walls.push({ minX: -1.5, minY: -1.5, maxX: 1.5, maxY: 1.5 });
      this.walls.push({ minX: -1.5, minY: -8, maxX: 1.5, maxY: -4 });
      this.walls.push({ minX: -1.5, minY: 4, maxX: 1.5, maxY: 8 });

      // Sliding doors in side partitions
      this.walls.push({ minX: -8, minY: -1.5, maxX: -6, maxY: 1.5 });
      this.addDoor('door_l', -6, -1.5, -4, 1.5, 5, 5);
      this.walls.push({ minX: 6, minY: -1.5, maxX: 8, maxY: 1.5 });
      this.addDoor('door_r', 4, -1.5, 6, 1.5, 5, 5);

      // Bounce pads
      this.walls.push({ minX: -7, minY: -7, maxX: -5, maxY: -5, isBouncePad: true });
      this.walls.push({ minX: 5, minY: 5, maxX: 7, maxY: 7, isBouncePad: true });

      // Spawns
      const radius = 9;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        this.spawnPoints.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      }

      // 2 Power-up Spawners
      this.powerupSpawners.push({ x: 0, y: -7 });
      this.powerupSpawners.push({ x: 0, y: 7 });

      // Hazard: a single slow sliding wall in the lower lane
      this.addMovingWall(0, -10.5, 2, 1, 'x', 3.5, 0.4);

    } else {
      // Standard ARENA
      // Central Block
      this.walls.push({ minX: -2, minY: -2, maxX: 2, maxY: 2 });

      // 4 Corner pillars
      this.walls.push({ minX: -10, minY: -10, maxX: -7, maxY: -7 });
      this.walls.push({ minX: 7, minY: -10, maxX: 10, maxY: -7 });
      this.walls.push({ minX: -10, minY: 7, maxX: -7, maxY: 10 });
      this.walls.push({ minX: 7, minY: 7, maxX: 10, maxY: 10 });

      // L-barriers
      this.walls.push({ minX: -12, minY: -2, maxX: -9, maxY: 2 });
      this.walls.push({ minX: 9, minY: -2, maxX: 12, maxY: 2 });
      this.walls.push({ minX: -2, minY: -12, maxX: 2, maxY: -9 });
      this.walls.push({ minX: -2, minY: 9, maxX: 2, maxY: 12 });

      // Bounce pads
      this.walls.push({ minX: -6, minY: -6, maxX: -4, maxY: -4, isBouncePad: true });
      this.walls.push({ minX: 4, minY: -6, maxX: 6, maxY: -4, isBouncePad: true });
      this.walls.push({ minX: -6, minY: 4, maxX: -4, maxY: 6, isBouncePad: true });
      this.walls.push({ minX: 4, minY: 4, maxX: 6, maxY: 6, isBouncePad: true });

      // 8 Spawn points
      const radius = 13;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        this.spawnPoints.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      }

      // 4 Power-up Spawners
      this.powerupSpawners.push({ x: -8.5, y: 0 });
      this.powerupSpawners.push({ x: 8.5, y: 0 });
      this.powerupSpawners.push({ x: 0, y: -8.5 });
      this.powerupSpawners.push({ x: 0, y: 8.5 });

      // 2 Jump pads diagonally launching inwards
      const jl = 13.0;
      this.jumpPads.push({ x: -14, y: -14, radius: 1.2, launchVx: jl, launchVy: jl, mesh: null });
      this.jumpPads.push({ x: 14, y: 14, radius: 1.2, launchVx: -jl, launchVy: -jl, mesh: null });

      // Hazards: two rotating shooting statues + a sliding wall
      this.addHazard(13, 7.5, 1.0, 1.5, 1.5);
      this.addHazard(-13, -7.5, 1.0, 1.5, 1.5);
      this.addMovingWall(0, -15, 3, 1.5, 'x', 5, 0.4);
    }
  }

  private addHazard(x: number, y: number, fireInterval: number, rotateSpeed: number, fireRadius: number) {
    // The base is a solid obstacle
    const baseWallIndex = this.walls.length;
    this.walls.push({ minX: x - 0.6, minY: y - 0.6, maxX: x + 0.6, maxY: y + 0.6 });
    this.hazards.push({
      x,
      y,
      angle: Math.random() * Math.PI * 2,
      rotateSpeed,
      fireTimer: Math.random() * fireInterval,
      fireInterval,
      fireRadius,
      baseWallIndex,
      mesh: null
    });
  }

  private addMovingWall(baseX: number, baseY: number, w: number, h: number, axis: 'x' | 'y', range: number, speed: number) {
    const wallIndex = this.walls.length;
    this.walls.push({ minX: baseX - w / 2, minY: baseY - h / 2, maxX: baseX + w / 2, maxY: baseY + h / 2 });
    this.movingWalls.push({
      wallIndex,
      baseX,
      baseY,
      halfW: w / 2,
      halfH: h / 2,
      axis,
      range,
      speed,
      phase: Math.random() * Math.PI * 2,
      mesh: null
    });
  }

  private addDoor(id: string, minX: number, minY: number, maxX: number, maxY: number, openDur: number, closeDur: number) {
    const wallIndex = this.walls.length;
    this.walls.push({ minX, minY, maxX, maxY, isOpen: false });

    this.doors.push({
      id,
      minX,
      minY,
      maxX,
      maxY,
      isOpen: false,
      timer: 0,
      openDuration: openDur,
      closeDuration: closeDur,
      mesh: null,
      wallIndex
    });
  }

  buildArena(scene: THREE.Scene) {
    scene.add(this.arenaGroup);

    // 1. Digital Grid Floor
    const floorGeo = new THREE.PlaneGeometry(this.width, this.height);
    const floorMat = new THREE.MeshStandardMaterial({
      color: PALETTE.floor,
      roughness: 0.85,
      metalness: 0.05
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Add glowing grid overlay
    const grid = new THREE.GridHelper(this.width, this.width, PALETTE.floorGridMajor, PALETTE.floorGridMinor);
    grid.position.y = 0.01;
    if (Array.isArray(grid.material)) {
      grid.material.forEach((m) => { m.transparent = true; m.opacity = 0.28; });
    } else {
      grid.material.transparent = true;
      grid.material.opacity = 0.28;
    }
    this.arenaGroup.add(grid);

    // 2. Instantiate all physical walls as 3D meshes
    this.walls.forEach((wall, idx) => {
      // Doors, moving walls and hazard bases are rendered separately below
      const isDoor = this.doors.some(d => d.wallIndex === idx);
      const isMoving = this.movingWalls.some(m => m.wallIndex === idx);
      const isHazardBase = this.hazards.some(h => h.baseWallIndex === idx);
      if (isDoor || isMoving || isHazardBase) return;

      const w = wall.maxX - wall.minX;
      const h = wall.maxY - wall.minY;
      const cx = (wall.minX + wall.maxX) / 2;
      const cy = (wall.minY + wall.maxY) / 2;

      let wallMesh: THREE.Mesh;

      if (wall.isBouncePad) {
        // Bounce pads are rendered as glowing cylinders
        const geom = new THREE.CylinderGeometry(w / 2, w / 2, 1.2, 16);
        wallMesh = new THREE.Mesh(geom, this.bouncePadMaterial);
        wallMesh.position.set(cx, 0.6, cy);
        
        // Add a neon ring on top
        const ringGeo = new THREE.RingGeometry((w / 2) * 0.8, w / 2, 16);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.61;
        wallMesh.add(ring);

        this.bouncePadsMeshes.push(wallMesh);
      } else {
        // Standard walls are boxes
        const geom = new THREE.BoxGeometry(w, 1.5, h);
        wallMesh = new THREE.Mesh(geom, this.wallMaterial);
        wallMesh.position.set(cx, 0.75, cy);
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;

        // Add a neon wireframe cap
        const edgeGeo = new THREE.EdgesGeometry(geom);
        const edgeMat = new THREE.LineBasicMaterial({ color: PALETTE.wallEdge, linewidth: 2 });
        const wireframe = new THREE.LineSegments(edgeGeo, edgeMat);
        wallMesh.add(wireframe);
      }

      this.arenaGroup.add(wallMesh);
    });

    // 3. Render sliding doors
    this.doors.forEach((door) => {
      const w = door.maxX - door.minX;
      const h = door.maxY - door.minY;
      const cx = (door.minX + door.maxX) / 2;
      const cy = (door.minY + door.maxY) / 2;

      const geom = new THREE.BoxGeometry(w, 1.5, h);
      const mesh = new THREE.Mesh(geom, this.doorMaterial);
      mesh.position.set(cx, 0.75, cy);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Orange glowing wireframe edges
      const edgeGeo = new THREE.EdgesGeometry(geom);
      const edgeMat = new THREE.LineBasicMaterial({ color: PALETTE.door, linewidth: 2 });
      const wireframe = new THREE.LineSegments(edgeGeo, edgeMat);
      mesh.add(wireframe);

      this.arenaGroup.add(mesh);
      door.mesh = mesh;
    });

    // 4. Render jump pads
    this.jumpPads.forEach((pad) => {
      const padGeo = new THREE.RingGeometry(pad.radius * 0.7, pad.radius, 32);
      const padMat = new THREE.MeshBasicMaterial({
        color: PALETTE.jumpPad,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.position.set(pad.x, 0.021, pad.y);

      // Add central arrow pointing in launch direction
      const arrowGeo = new THREE.ConeGeometry(0.12, 0.35, 4);
      const arrowMat = new THREE.MeshBasicMaterial({ color: PALETTE.jumpPad });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      const angle = Math.atan2(pad.launchVy, pad.launchVx);
      arrow.rotation.z = angle - Math.PI / 2;
      padMesh.add(arrow);

      this.arenaGroup.add(padMesh);
      pad.mesh = padMesh;
    });

    // 4b. Render rotating shooting statues
    this.hazards.forEach((hz) => {
      const group = new THREE.Group();

      const baseGeo = new THREE.BoxGeometry(1.2, 1.7, 1.2);
      const base = new THREE.Mesh(baseGeo, this.hazardMaterial);
      base.position.y = 0.85;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(baseGeo), new THREE.LineBasicMaterial({ color: PALETTE.wallEdge }));
      edge.position.y = 0.85;
      group.add(edge);

      // Glowing barrel points along local +x; group.rotation.y aims it
      const barrelGeo = new THREE.ConeGeometry(0.26, 1.0, 10);
      const barrel = new THREE.Mesh(barrelGeo, this.hazardBarrelMaterial);
      barrel.rotation.z = -Math.PI / 2;
      barrel.position.set(0.55, 1.55, 0);
      group.add(barrel);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffdd33 }));
      eye.position.y = 1.55;
      group.add(eye);

      const hzLight = new THREE.PointLight(0xff5522, 1.2, 5);
      hzLight.position.y = 1.6;
      group.add(hzLight);

      group.position.set(hz.x, 0, hz.y);
      this.arenaGroup.add(group);
      hz.mesh = group;
    });

    // 4c. Render moving walls
    this.movingWalls.forEach((mw) => {
      const geom = new THREE.BoxGeometry(mw.halfW * 2, 1.5, mw.halfH * 2);
      const mesh = new THREE.Mesh(geom, this.movingWallMaterial);
      mesh.position.set(mw.baseX, 0.75, mw.baseY);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: 0xe0b3ff }));
      mesh.add(edge);

      this.arenaGroup.add(mesh);
      mw.mesh = mesh;
    });

    // 5. Decorative border rings
    const borderGeo = new THREE.RingGeometry(this.width / 2, this.width / 2 + 0.5, 64);
    const borderMat = new THREE.MeshBasicMaterial({ color: PALETTE.border, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.rotation.x = Math.PI / 2;
    border.position.y = 0.02;
    this.arenaGroup.add(border);

    // Decorative background starfield
    const particlesGeo = new THREE.BufferGeometry();
    const count = this.mapType === 'COLOSSEUM' ? 500 : this.mapType === 'CHAMBER' ? 150 : 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * (this.width + 40);
      positions[i + 1] = -3 - Math.random() * 20; // underneath
      positions[i + 2] = (Math.random() - 0.5) * (this.height + 40);
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMat = new THREE.PointsMaterial({ size: 0.15, color: PALETTE.star, transparent: true, opacity: 0.5 });
    const starfield = new THREE.Points(particlesGeo, particlesMat);
    this.arenaGroup.add(starfield);
  }

  update(dt: number) {
    this.pulseTime += dt * 3.5;
    
    // Animate bounce pads
    this.bouncePadsMeshes.forEach((mesh) => {
      const scale = 1.0 + Math.sin(this.pulseTime) * 0.05;
      mesh.scale.set(scale, 1.0, scale);
      
      const light = mesh.children[1] as THREE.PointLight;
      if (light) {
        light.intensity = 1.2 + Math.sin(this.pulseTime * 1.5) * 0.6;
      }
    });

    // Update doors timers and mesh height slides
    this.doors.forEach((door) => {
      door.timer += dt;

      if (door.isOpen) {
        if (door.timer >= door.openDuration) {
          door.isOpen = false;
          door.timer = 0;
          this.walls[door.wallIndex].isOpen = false;
        }
        // Slide down to y = -0.8
        if (door.mesh) {
          door.mesh.position.y += (-0.8 - door.mesh.position.y) * 8 * dt;
        }
      } else {
        if (door.timer >= door.closeDuration) {
          door.isOpen = true;
          door.timer = 0;
          this.walls[door.wallIndex].isOpen = true;
        }
        // Slide up to y = 0.75
        if (door.mesh) {
          door.mesh.position.y += (0.75 - door.mesh.position.y) * 8 * dt;
        }
      }
    });

    // Rotate jump pads
    this.jumpPads.forEach((pad) => {
      if (pad.mesh) {
        pad.mesh.rotation.z += dt * 1.2;
      }
    });

    // Rotate shooting statues and fire on interval
    this.hazards.forEach((hz) => {
      hz.angle += hz.rotateSpeed * dt;
      if (hz.mesh) hz.mesh.rotation.y = -hz.angle;
      hz.fireTimer -= dt;
      if (hz.fireTimer <= 0) {
        hz.fireTimer = hz.fireInterval;
        const sx = hz.x + Math.cos(hz.angle) * hz.fireRadius;
        const sy = hz.y + Math.sin(hz.angle) * hz.fireRadius;
        this.onHazardFire?.(sx, sy, hz.angle);
      }
    });

    // Slide moving walls and update their physics AABB live
    this.movingWalls.forEach((mw) => {
      const offset = Math.sin(this.pulseTime * mw.speed + mw.phase) * mw.range;
      const cx = mw.baseX + (mw.axis === 'x' ? offset : 0);
      const cy = mw.baseY + (mw.axis === 'y' ? offset : 0);
      const wall = this.walls[mw.wallIndex];
      wall.minX = cx - mw.halfW;
      wall.maxX = cx + mw.halfW;
      wall.minY = cy - mw.halfH;
      wall.maxY = cy + mw.halfH;
      if (mw.mesh) mw.mesh.position.set(cx, 0.75, cy);
    });
  }

  destroy(scene: THREE.Scene) {
    scene.remove(this.arenaGroup);
    this.arenaGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.bouncePadsMeshes = [];
    this.doors = [];
    this.jumpPads = [];
    this.hazards = [];
    this.movingWalls = [];
  }
}
