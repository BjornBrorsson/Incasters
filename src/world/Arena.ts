import * as THREE from 'three';
import type { AABB } from '../engine/Physics';

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

export class Arena {
  width: number = 36;
  height: number = 36;
  walls: AABB[] = [];
  spawnPoints: SpawnPoint[] = [];
  powerupSpawners: SpawnPoint[] = [];
  doors: Door[] = [];
  jumpPads: JumpPad[] = [];
  mapType: MapType = 'ARENA';
  
  // ThreeJS Mesh Groups
  private arenaGroup: THREE.Group;
  private wallMaterial: THREE.MeshStandardMaterial;
  private bouncePadMaterial: THREE.MeshStandardMaterial;
  private doorMaterial: THREE.MeshStandardMaterial;
  private bouncePadsMeshes: THREE.Mesh[] = [];
  private pulseTime: number = 0;

  constructor(mapType: MapType = 'ARENA') {
    this.mapType = mapType;
    this.arenaGroup = new THREE.Group();
    
    // Core Neon Themes
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x111625, // Deep navy
      roughness: 0.2,
      metalness: 0.8,
      bumpScale: 0.05
    });

    this.bouncePadMaterial = new THREE.MeshStandardMaterial({
      color: 0xff007f, // Glowing magenta
      emissive: 0xff007f,
      emissiveIntensity: 0.6,
      roughness: 0.1
    });

    this.doorMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5500, // Glowing orange/red gate
      emissive: 0xff5500,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.75,
      roughness: 0.1
    });

    this.setupLayout();
  }

  private setupLayout() {
    this.walls = [];
    this.spawnPoints = [];
    this.powerupSpawners = [];
    this.doors = [];
    this.jumpPads = [];

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
    }
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
      color: 0x070b19, // Very dark blue
      roughness: 0.9,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Add glowing grid overlay
    const grid = new THREE.GridHelper(this.width, this.width, 0x00f0ff, 0x12243d);
    grid.position.y = 0.01;
    if (Array.isArray(grid.material)) {
      grid.material.forEach((m) => { m.transparent = true; m.opacity = 0.15; });
    } else {
      grid.material.transparent = true;
      grid.material.opacity = 0.15;
    }
    this.arenaGroup.add(grid);

    // 2. Instantiate all physical walls as 3D meshes
    this.walls.forEach((wall, idx) => {
      // Check if this wall corresponds to a door
      const isDoor = this.doors.some(d => d.wallIndex === idx);
      if (isDoor) return; // Doors are rendered separately below

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

        // Add local spot light
        const padLight = new THREE.PointLight(0xff007f, 1.5, 4);
        padLight.position.y = 1.0;
        wallMesh.add(padLight);

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
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
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
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xff5500, linewidth: 2 });
      const wireframe = new THREE.LineSegments(edgeGeo, edgeMat);
      mesh.add(wireframe);

      this.arenaGroup.add(mesh);
      door.mesh = mesh;
    });

    // 4. Render jump pads
    this.jumpPads.forEach((pad) => {
      const padGeo = new THREE.RingGeometry(pad.radius * 0.7, pad.radius, 32);
      const padMat = new THREE.MeshBasicMaterial({
        color: 0x39ff14,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.rotation.x = -Math.PI / 2;
      padMesh.position.set(pad.x, 0.021, pad.y);

      // Add central arrow pointing in launch direction
      const arrowGeo = new THREE.ConeGeometry(0.12, 0.35, 4);
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.rotation.x = -Math.PI / 2;
      const angle = Math.atan2(pad.launchVy, pad.launchVx);
      arrow.rotation.z = angle - Math.PI / 2;
      padMesh.add(arrow);

      this.arenaGroup.add(padMesh);
      pad.mesh = padMesh;
    });

    // 5. Decorative border rings
    const borderGeo = new THREE.RingGeometry(this.width / 2, this.width / 2 + 0.5, 64);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
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
    const particlesMat = new THREE.PointsMaterial({ size: 0.15, color: 0x00ffff, transparent: true, opacity: 0.4 });
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
  }
}
