import * as THREE from 'three';

export class Entity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isDead: boolean = false;
  mesh: THREE.Object3D;

  constructor(x: number, y: number, radius: number, mesh: THREE.Object3D) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.mesh = mesh;
    this.syncMeshPosition();
  }

  syncMeshPosition() {
    this.mesh.position.x = this.x;
    // Map 2D Y to 3D Z (ground plane in isometric is XZ)
    this.mesh.position.z = this.y;
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.syncMeshPosition();
  }

  destroy(scene: THREE.Scene) {
    scene.remove(this.mesh);
    // Recursively dispose geometries and materials to avoid memory leaks
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
