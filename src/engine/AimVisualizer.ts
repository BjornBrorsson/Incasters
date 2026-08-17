import * as THREE from 'three';
import { Caster } from '../entities/Caster';
import { Projectile } from '../entities/Projectile';
import { type AABB, testCircleVsAABB } from './Physics';

const NUM_DOTS = 16;
const MAX_AIM_DISTANCE = 13.0;

/**
 * 3D Trajectory Aim Guide & Target Reticle.
 * Projects a glowing neon dashed trajectory from the wizard's weapon tip in real time,
 * displaying range, wall collisions, and active curve guidance.
 */
export class AimVisualizer {
  group: THREE.Group;
  private dots: THREE.Mesh[] = [];
  private reticle: THREE.Mesh;
  private reticleInner: THREE.Mesh;
  private curveGuideLine: THREE.Line;
  private curveGuideGeo: THREE.BufferGeometry;
  private dotMaterial: THREE.MeshBasicMaterial;
  private reticleMaterial: THREE.MeshBasicMaterial;
  private curveGuideMaterial: THREE.LineBasicMaterial;
  private pulseTimer: number = 0;
  private currentColor: number = 0x00f0ff;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();

    // 1. Dotted trajectory spheres along the aim vector
    const dotGeo = new THREE.SphereGeometry(0.09, 6, 6);
    this.dotMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8
    });

    for (let i = 0; i < NUM_DOTS; i++) {
      const dot = new THREE.Mesh(dotGeo, this.dotMaterial);
      dot.position.set(0, 0.28, 0);
      dot.visible = false;
      this.group.add(dot);
      this.dots.push(dot);
    }

    // 2. Neon ground targeting reticle
    const reticleGeo = new THREE.RingGeometry(0.35, 0.45, 24);
    this.reticleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.reticle = new THREE.Mesh(reticleGeo, this.reticleMaterial);
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.position.set(0, 0.04, 0);
    this.reticle.visible = false;
    this.group.add(this.reticle);

    // Inner reticle dot
    const innerGeo = new THREE.CircleGeometry(0.1, 16);
    this.reticleInner = new THREE.Mesh(innerGeo, this.reticleMaterial);
    this.reticleInner.rotation.x = -Math.PI / 2;
    this.reticleInner.position.set(0, 0.045, 0);
    this.reticleInner.visible = false;
    this.group.add(this.reticleInner);

    // 3. Glowing guidance line for active curving projectile
    this.curveGuideGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.4, 0),
      new THREE.Vector3(0, 0.4, 0)
    ]);
    this.curveGuideMaterial = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.75,
      linewidth: 2
    });
    this.curveGuideLine = new THREE.Line(this.curveGuideGeo, this.curveGuideMaterial);
    this.curveGuideLine.visible = false;
    this.group.add(this.curveGuideLine);

    scene.add(this.group);
  }

  setColor(hex: number) {
    if (this.currentColor === hex) return;
    this.currentColor = hex;
    this.dotMaterial.color.setHex(hex);
    this.reticleMaterial.color.setHex(hex);
    this.curveGuideMaterial.color.setHex(hex);
  }

  update(
    caster: Caster,
    isAiming: boolean,
    guidedProj: Projectile | null,
    walls: AABB[],
    dt: number
  ) {
    this.pulseTimer += dt * 5;

    // Synchronize spell color
    this.setColor(caster.spellColor || 0x00f0ff);

    if (caster.isDead) {
      this.hideAll();
      return;
    }

    // ── 1. Aiming trajectory line & reticle ────────────────────────
    if (isAiming) {
      const startX = caster.x + Math.cos(caster.aimAngle) * 0.5;
      const startY = caster.y + Math.sin(caster.aimAngle) * 0.5;
      const cosA = Math.cos(caster.aimAngle);
      const sinA = Math.sin(caster.aimAngle);

      // Raycast against arena walls to truncate trajectory at obstacles
      let maxDist = MAX_AIM_DISTANCE;
      const step = 0.4;
      const testPoint = { x: startX, y: startY, radius: 0.15 };

      for (let d = 0.5; d <= MAX_AIM_DISTANCE; d += step) {
        testPoint.x = startX + cosA * d;
        testPoint.y = startY + sinA * d;

        let hit = false;
        for (const w of walls) {
          if (w.isOpen) continue;
          const res = testCircleVsAABB(testPoint, w);
          if (res.collided) {
            maxDist = Math.max(0.6, d - 0.2);
            hit = true;
            break;
          }
        }
        if (hit) break;
      }

      // Position dots along the trajectory ray
      const dotSpacing = maxDist / (NUM_DOTS - 1);
      for (let i = 0; i < NUM_DOTS; i++) {
        const d = i * dotSpacing;
        const dot = this.dots[i];
        dot.position.set(startX + cosA * d, 0.28, startY + sinA * d);
        // Fade out slightly towards the tip
        const alpha = (1 - (i / NUM_DOTS) * 0.4) * (0.6 + Math.sin(this.pulseTimer + i * 0.3) * 0.25);
        (dot.material as THREE.MeshBasicMaterial).opacity = Math.max(0.2, alpha);
        const scale = 0.8 + (1 - i / NUM_DOTS) * 0.4;
        dot.scale.set(scale, scale, scale);
        dot.visible = true;
      }

      // Position target reticle at endpoint
      const endX = startX + cosA * maxDist;
      const endY = startY + sinA * maxDist;
      this.reticle.position.set(endX, 0.04, endY);
      this.reticleInner.position.set(endX, 0.045, endY);

      // Pulse reticle
      const reticleScale = 1.0 + Math.sin(this.pulseTimer * 1.4) * 0.12;
      this.reticle.scale.set(reticleScale, reticleScale, 1.0);
      this.reticle.visible = true;
      this.reticleInner.visible = true;
    } else {
      for (const dot of this.dots) dot.visible = false;
      this.reticle.visible = false;
      this.reticleInner.visible = false;
    }

    // ── 2. Active curving projectile guidance beam ───────────────
    if (guidedProj && !guidedProj.isDead && guidedProj.targetPoint) {
      const positions = new Float32Array([
        guidedProj.x, 0.45, guidedProj.y,
        guidedProj.targetPoint.x, 0.45, guidedProj.targetPoint.y
      ]);
      this.curveGuideGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.curveGuideGeo.attributes.position.needsUpdate = true;
      this.curveGuideMaterial.opacity = 0.6 + Math.sin(this.pulseTimer * 2) * 0.3;
      this.curveGuideLine.visible = true;
    } else {
      this.curveGuideLine.visible = false;
    }
  }

  private hideAll() {
    for (const dot of this.dots) dot.visible = false;
    this.reticle.visible = false;
    this.reticleInner.visible = false;
    this.curveGuideLine.visible = false;
  }

  destroy(scene: THREE.Scene) {
    scene.remove(this.group);
    this.dotMaterial.dispose();
    this.reticleMaterial.dispose();
    this.curveGuideMaterial.dispose();
    this.curveGuideGeo.dispose();
    for (const dot of this.dots) dot.geometry.dispose();
    this.reticle.geometry.dispose();
    this.reticleInner.geometry.dispose();
    this.dots = [];
  }
}
