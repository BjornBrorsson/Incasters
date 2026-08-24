import * as THREE from 'three';
import { Caster } from '../entities/Caster';
import type { CharacterConfig } from './CharacterConfig';

/**
 * A small, self-contained Three.js scene that renders a single rotating caster
 * for the customiser menu. Rebuilds the caster whenever the config changes.
 */
export class CharacterPreview {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private caster: Caster | null = null;
  private container: HTMLElement;
  private raf = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 220;
    const h = container.clientHeight || 150;

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    this.camera.position.set(0, 1.15, 3.3);
    this.camera.lookAt(0, 0.75, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(2, 4, 3);
    this.scene.add(dir);
    this.scene.add(new THREE.HemisphereLight(0xdaf0ff, 0x40455f, 0.5));

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      // Skip rendering while the menu (and thus this canvas) is hidden during gameplay
      if (this.container.offsetParent === null) return;
      if (this.caster) this.caster.mesh.rotation.y += 0.012;
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  setConfig(config: CharacterConfig) {
    if (this.caster) {
      this.scene.remove(this.caster.mesh);
      this.caster.destroy(this.scene);
      this.caster = null;
    }
    this.caster = new Caster('preview', 'Preview', 0, 0, 'GOLD', false, config.robeColor, config.spellColor, config);
    this.caster.mesh.position.set(0, 0, 0);
    this.scene.add(this.caster.mesh);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.caster) this.caster.destroy(this.scene);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
