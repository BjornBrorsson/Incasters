import * as THREE from 'three';

// Fixed canvas resolution for every name tag so the sprite's world-space scale never
// jumps when the text/leader-state changes (only the drawn pixels change).
const CANVAS_W = 320;
const CANVAS_H = 84;

/** A floating billboard sprite showing a caster's name above their head, with a
 * gold crown/glow treatment that can be toggled on for whoever is currently leading
 * the match (Issue #17). */
export class NameTag {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private name: string;
  private color: string;
  private isLeader = false;

  constructor(name: string, color: string) {
    this.name = name;
    this.color = color;

    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(2.2, (2.2 * CANVAS_H) / CANVAS_W, 1);
    this.sprite.position.set(0, 2.5, 0);

    this.draw();
  }

  /** Redraws the tag only when the leader state actually changes, avoiding
   * per-frame canvas work. Returns true if a redraw happened. */
  setLeader(isLeader: boolean): boolean {
    if (this.isLeader === isLeader) return false;
    this.isLeader = isLeader;
    this.draw();
    return true;
  }

  setVisible(visible: boolean) {
    this.sprite.visible = visible;
  }

  /** Updates the text color (e.g. when a caster's team assignment changes). */
  setColor(color: string) {
    if (this.color === color) return;
    this.color = color;
    this.draw();
  }

  private draw() {
    const ctx = this.ctx;
    const w = CANVAS_W;
    const h = CANVAS_H;
    ctx.clearRect(0, 0, w, h);

    const label = this.isLeader ? `\u{1F451} ${this.name}` : this.name;

    // Size the pill to the measured text so short/long names both look tidy.
    ctx.font = '700 34px Outfit, sans-serif';
    const textWidth = Math.min(w - 20, Math.max(70, ctx.measureText(label).width + 36));
    const pillH = 46;
    const pillX = (w - textWidth) / 2;
    const pillY = h - pillH - 6;

    ctx.save();
    ctx.beginPath();
    const r = pillH / 2;
    ctx.moveTo(pillX + r, pillY);
    ctx.arcTo(pillX + textWidth, pillY, pillX + textWidth, pillY + pillH, r);
    ctx.arcTo(pillX + textWidth, pillY + pillH, pillX, pillY + pillH, r);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
    ctx.arcTo(pillX, pillY, pillX + textWidth, pillY, r);
    ctx.closePath();

    ctx.fillStyle = this.isLeader ? 'rgba(60, 42, 4, 0.82)' : 'rgba(6, 8, 18, 0.68)';
    ctx.fill();
    ctx.lineWidth = this.isLeader ? 3 : 1.5;
    ctx.strokeStyle = this.isLeader ? '#ffd700' : 'rgba(255, 255, 255, 0.35)';
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.isLeader ? '#ffd700' : this.color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(label, w / 2, pillY + pillH / 2 + 1);

    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}
