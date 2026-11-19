// Interactive layer on top of BlobAnimator: cursor-following gaze, body
// drift/lean, blinking. Like the Rock bird, it only moves while the cursor
// moves; when the cursor rests it holds still and blinks a little more.
import { BlobAnimator, VIEW } from './BlobAnimator';
import type { Pose } from './poses';

const IDLE_AFTER_MS = 700;
const BLINK_GAP: [number, number] = [2200, 5400];       // ms, cursor moving
const BLINK_GAP_IDLE: [number, number] = [1600, 3800];  // ms, cursor resting
const DRIFT = 26;        // max body travel toward the cursor (viewBox px)
const MAX_TILT = 8;      // deg of lean at fast cursor speed

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const randomGap = ([a, b]: [number, number]) => a + Math.random() * (b - a);

export class InteractiveBlob extends BlobAnimator {
  // cursor
  private hasCursor = false;
  private lastMoveAt = -Infinity;
  private lastPointer: { x: number; y: number; t: number } | null = null;
  private cursorVel = { x: 0, y: 0 };
  private cursorGaze = { yaw: 0, pitch: 0 };
  private driftTarget = { x: 0, y: 0 };
  private drift = { x: 0, y: 0, vx: 0, vy: 0 };
  private tilt = 0;
  protected hovering = false;

  // blink
  private nextBlinkAt = 0;
  private blinkUntil = 0;
  private blink = 0;

  private reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  override start() {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', this.recentre);
    window.addEventListener('blur', this.recentre);
    this.nextBlinkAt = performance.now() + this.blinkGap();
    super.start();
  }

  override destroy() {
    window.removeEventListener('pointermove', this.onPointerMove);
    document.documentElement.removeEventListener('mouseleave', this.recentre);
    window.removeEventListener('blur', this.recentre);
    super.destroy();
  }

  protected motion() { return this.reduceMotion.matches ? 0.3 : 1; }
  protected cursorIdle() { return performance.now() - this.lastMoveAt > IDLE_AFTER_MS; }
  private blinkGap() { return randomGap(this.cursorIdle() ? BLINK_GAP_IDLE : BLINK_GAP); }

  /* ---------- cursor ---------- */
  private onPointerMove = (e: PointerEvent) => {
    const now = performance.now();
    const { clientX: x, clientY: y } = e;
    if (this.lastPointer) {
      const dt = Math.max(0.008, (now - this.lastPointer.t) / 1000);
      this.cursorVel.x += ((x - this.lastPointer.x) / dt - this.cursorVel.x) * 0.35;
      this.cursorVel.y += ((y - this.lastPointer.y) / dt - this.cursorVel.y) * 0.35;
    }
    this.lastPointer = { x, y, t: now };
    this.lastMoveAt = now;
    this.hasCursor = true;

    const r = this.svg.getBoundingClientRect();
    const px = r.width / VIEW;                       // screen px per viewBox unit
    const cx = r.left + r.width / 2 + this.cur.x * 118 * px;
    const cy = r.top + r.height / 2 + this.cur.y * 118 * px;
    const dx = x - cx, dy = y - cy;
    const reach = r.width * 0.45;
    // gaze and drift only change on movement, so a resting cursor = a still blob
    this.cursorGaze = { yaw: clamp1(dx / reach) * 1.0, pitch: clamp1(-dy / reach) * 0.85 };
    const travel = DRIFT * this.motion();
    this.driftTarget = { x: clamp1(dx / (reach * 3)) * travel, y: clamp1(dy / (reach * 3)) * travel };
    this.hovering = Math.hypot(dx, dy) < 118 * px * 1.1 * Math.max(this.cur.sx, 0.3);
  };

  private recentre = () => {
    this.hasCursor = false;
    this.driftTarget = { x: 0, y: 0 };
    this.lastPointer = null;
    this.hovering = false;
  };

  /* ---------- per-frame ---------- */
  protected override adjust(target: Pose, dt: number): Pose {
    const now = performance.now();

    // blink scheduling (only when eyes are showing)
    if (now >= this.nextBlinkAt) {
      if (target.eyeOpacity > 0.5) {
        this.blinkUntil = now + 120;
        if (Math.random() < 0.2) this.nextBlinkAt = now + 260;  // occasional double blink
        else this.nextBlinkAt = now + this.blinkGap();
      } else {
        this.nextBlinkAt = now + this.blinkGap();
      }
    } else if (this.cursorIdle() && this.nextBlinkAt - now > BLINK_GAP_IDLE[1]) {
      this.nextBlinkAt = now + this.blinkGap();     // cursor came to rest: blink sooner
    }
    const blinkGoal = now < this.blinkUntil ? 1 : 0;
    this.blink += (blinkGoal - this.blink) * Math.min(1, dt * 40);

    // cursor velocity fades when no events arrive
    const decay = Math.exp(-dt * 9);
    this.cursorVel.x *= decay;
    this.cursorVel.y *= decay;

    // drift spring + lean
    const d = this.drift;
    d.vx += (160 * (this.driftTarget.x - d.x) - 20 * d.vx) * dt;
    d.vy += (160 * (this.driftTarget.y - d.y) - 20 * d.vy) * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const tiltGoal = clamp1(this.cursorVel.x / 1400) * MAX_TILT * this.motion();
    this.tilt += (tiltGoal - this.tilt) * Math.min(1, dt * 10);

    // gaze: blend the pose's gaze with the cursor (less during the intro)
    if (this.hasCursor && target.follow > 0) {
      const w = target.follow * (this.introPlaying ? 0.5 : 1);
      target.gazeYaw += (this.cursorGaze.yaw - target.gazeYaw) * w;
      target.gazePitch += (this.cursorGaze.pitch - target.gazePitch) * w;
    }

    // squash & stretch along fast cursor movement
    const sx = Math.min(1, Math.abs(this.cursorVel.x) / 1800);
    const sy = Math.min(1, Math.abs(this.cursorVel.y) / 1800);
    target.sx *= 1 + (sx - sy) * 0.06 * this.motion();
    target.sy *= 1 + (sy - sx) * 0.06 * this.motion();
    return target;
  }

  protected override blinkAmount() { return this.blink; }

  protected override rootTransform() {
    const c = VIEW / 2;
    return `translate(${this.drift.x.toFixed(2)} ${this.drift.y.toFixed(2)}) rotate(${this.tilt.toFixed(2)} ${c} ${c})`;
  }
}
