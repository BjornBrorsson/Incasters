import * as THREE from 'three';

const STICK_DEADZONE = 0.22;
const TRIGGER_THRESHOLD = 0.35;

/**
 * Unifies Keyboard, Mouse and Gamepad input into a single queryable state.
 * Touch input is handled inside Game.ts because it is tightly coupled to the
 * on-screen virtual joystick UI, but it merges into the same downstream paths.
 */
export class InputManager {
  // Keyboard
  keys: Record<string, boolean> = {};

  // Mouse
  mouseNDC = new THREE.Vector2();
  mouseLeftDown = false;

  // Device tracking: the last device the player actually used drives aim priority
  usingGamepad = false;
  gamepadConnected = false;

  // Polled gamepad snapshot
  private gpMoveX = 0;
  private gpMoveY = 0;
  private gpAimX = 0;
  private gpAimY = 0;
  private gpAimActive = false;
  private gpFire = false;
  private gpDashPrev = false;
  private dashQueued = false;

  // Bound handlers kept for clean disposal
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundGpConnect: (e: Event) => void;
  private boundGpDisconnect: (e: Event) => void;

  constructor() {
    this.boundKeyDown = (e) => {
      this.keys[e.key.toLowerCase()] = true;
      this.usingGamepad = false;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.dashQueued = true;
      }
    };
    this.boundKeyUp = (e) => {
      this.keys[e.key.toLowerCase()] = false;
    };
    this.boundMouseMove = (e) => {
      this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.usingGamepad = false;
    };
    this.boundMouseDown = (e) => {
      if (e.button === 0) {
        this.mouseLeftDown = true;
        this.usingGamepad = false;
      }
    };
    this.boundMouseUp = (e) => {
      if (e.button === 0) this.mouseLeftDown = false;
    };
    this.boundGpConnect = () => { this.gamepadConnected = true; };
    this.boundGpDisconnect = () => { this.gamepadConnected = false; };

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('gamepadconnected', this.boundGpConnect);
    window.addEventListener('gamepaddisconnected', this.boundGpDisconnect);
  }

  private getActiveGamepad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  /** Poll the gamepad once per frame to refresh the snapshot and edge events. */
  pollGamepad() {
    const gp = this.getActiveGamepad();
    if (!gp) {
      this.gpMoveX = this.gpMoveY = this.gpAimX = this.gpAimY = 0;
      this.gpAimActive = false;
      this.gpFire = false;
      this.gpDashPrev = false;
      this.gamepadConnected = false;
      return;
    }
    this.gamepadConnected = true;

    const dz = (v: number) => (Math.abs(v) < STICK_DEADZONE ? 0 : v);
    let lx = dz(gp.axes[0] || 0);
    let ly = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0);
    const ry = dz(gp.axes[3] || 0);

    // D-pad acts as digital movement fallback
    if (gp.buttons[12] && gp.buttons[12].pressed) ly = -1;
    if (gp.buttons[13] && gp.buttons[13].pressed) ly = 1;
    if (gp.buttons[14] && gp.buttons[14].pressed) lx = -1;
    if (gp.buttons[15] && gp.buttons[15].pressed) lx = 1;

    this.gpMoveX = lx;
    this.gpMoveY = ly;

    const aimMag = Math.sqrt(rx * rx + ry * ry);
    this.gpAimActive = aimMag > STICK_DEADZONE;
    this.gpAimX = rx;
    this.gpAimY = ry;

    const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
    const lt = gp.buttons[6] ? gp.buttons[6].value : 0;
    const aBtn = gp.buttons[0] ? gp.buttons[0].pressed : false;
    this.gpFire = rt > TRIGGER_THRESHOLD || lt > TRIGGER_THRESHOLD || aBtn;

    // Dash on B / bumpers (edge-triggered)
    const dashBtn =
      (gp.buttons[1] && gp.buttons[1].pressed) ||
      (gp.buttons[5] && gp.buttons[5].pressed) ||
      (gp.buttons[4] && gp.buttons[4].pressed) || false;
    if (dashBtn && !this.gpDashPrev) this.dashQueued = true;
    this.gpDashPrev = dashBtn;

    if (lx !== 0 || ly !== 0 || this.gpAimActive || this.gpFire || dashBtn) {
      this.usingGamepad = true;
    }
  }

  keyboardMove(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys['w'] || this.keys['arrowup']) y -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) y += 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    return { x, y };
  }

  gamepadMove(): { x: number; y: number } {
    return { x: this.gpMoveX, y: this.gpMoveY };
  }

  gamepadAim(): { x: number; y: number; active: boolean } {
    return { x: this.gpAimX, y: this.gpAimY, active: this.gpAimActive };
  }

  isFireHeld(): boolean {
    return this.mouseLeftDown || this.gpFire;
  }

  /** Returns true exactly once per dash press (space / gamepad button). */
  consumeDash(): boolean {
    if (this.dashQueued) {
      this.dashQueued = false;
      return true;
    }
    return false;
  }

  /** Best-effort haptics: gamepad rumble first, falling back to device vibrate. */
  rumble(duration = 140, weak = 0.4, strong = 0.6) {
    const gp = this.getActiveGamepad();
    const act = gp ? (gp as unknown as { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }).vibrationActuator : null;
    if (act && typeof act.playEffect === 'function') {
      act.playEffect('dual-rumble', { startDelay: 0, duration, weakMagnitude: weak, strongMagnitude: strong }).catch(() => {});
    } else if (typeof navigator.vibrate === 'function' && !this.gamepadConnected) {
      navigator.vibrate(Math.min(60, duration));
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('gamepadconnected', this.boundGpConnect);
    window.removeEventListener('gamepaddisconnected', this.boundGpDisconnect);
  }
}
