// Rock bird animation: every Figma variant is the same body + two eyes with
// different geometry, so instead of swapping 36 SVGs we spring between the
// exact values in ./geometry. That gives smooth, continuous eye tracking
// (not just 9 snapped directions) plus blink / press / rebound.
import { CX, CY, EYE_GAP, LOOK_X, LOOK_Y, STATES, type Shape, type StateName } from './geometry';

export type BirdElements = {
  wrap: HTMLElement;          // positioned box used to locate the bird on screen
  group: SVGGElement;
  body: SVGEllipseElement;
  near: SVGRectElement;
  far: SVGRectElement;
};

type Anim = Shape & { lx: number; ly: number; bx: number; by: number; tilt: number };
type Vec = { x: number; y: number };

const LISTEN_SQUEEZE = 0.3;            // how far toward Pressed the body sits while recording
const BODY_SHIFT = 70;                 // max body travel toward the cursor (Figma px)
const MAX_TILT = 9;                    // degrees of lean at fast cursor speed
const IDLE_AFTER_MS = 700;             // cursor counts as "still" after this long without moving
const BLINK_GAP: [number, number] = [2200, 5400];      // ms between blinks while the cursor moves
const BLINK_GAP_IDLE: [number, number] = [1600, 3800]; // a little more often when the cursor rests

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const randomGap = ([a, b]: [number, number]) => a + Math.random() * (b - a);

export class BirdAnimator {
  private el: BirdElements;
  private cur: Anim = { ...STATES.open, lx: 0, ly: 0, bx: 0, by: 0, tilt: 0 };
  private vel: Anim = { rx: 0, ry: 0, dy: 0, ew: 0, eh: 0, spread: 0, lx: 0, ly: 0, bx: 0, by: 0, tilt: 0 };

  private shape: Exclude<StateName, 'closed'> = 'open';
  private blinking = false;
  private level = 0;          // voice level 0..1
  private prevLevel = 0;
  private listening = false;  // recording in progress
  private lookTarget: Vec = { x: 0, y: 0 };
  private bodyTarget: Vec = { x: 0, y: 0 };

  private lastMoveAt = -Infinity;
  private lastPointer: (Vec & { t: number }) | null = null;
  private cursorVel: Vec = { x: 0, y: 0 };   // px per second, smoothed

  private nextBlinkAt = 0;
  private last = 0;
  private raf = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private reboundTimer: ReturnType<typeof setTimeout> | null = null;
  private reduceMotion: MediaQueryList;

  constructor(el: BirdElements) {
    this.el = el;
    // users who ask for reduced motion get gentler travel, lean, stretch and hops
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  }

  start() {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', this.recentre);
    window.addEventListener('blur', this.recentre);
    this.last = performance.now();
    this.nextBlinkAt = this.last + this.blinkGap();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onPointerMove);
    document.documentElement.removeEventListener('mouseleave', this.recentre);
    window.removeEventListener('blur', this.recentre);
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  /* ---------- public controls ---------- */
  /** deep = this press is starting a recording -> squeeze harder */
  press({ deep = false } = {}) {
    if (this.reboundTimer) this.clear(this.reboundTimer);
    this.shape = deep ? 'pressedDeep' : 'pressed';
  }

  release() {
    if (this.shape !== 'pressed' && this.shape !== 'pressedDeep') return;
    this.shape = 'rebound';
    if (this.reboundTimer) this.clear(this.reboundTimer);
    this.reboundTimer = this.later(() => { this.shape = 'open'; }, 160);
  }

  setLevel(v: number) { this.level = v; }
  setListening(v: boolean) { this.listening = v; }

  /* ---------- helpers ---------- */
  private motion() { return this.reduceMotion.matches ? 0.3 : 1; }
  private cursorIdle() { return performance.now() - this.lastMoveAt > IDLE_AFTER_MS; }
  private blinkGap() { return randomGap(this.cursorIdle() ? BLINK_GAP_IDLE : BLINK_GAP); }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
    return id;
  }
  private clear(id: ReturnType<typeof setTimeout>) {
    clearTimeout(id);
    this.timers.delete(id);
  }

  /* ---------- cursor tracking ---------- */
  private onPointerMove = (e: PointerEvent) => {
    const { clientX: x, clientY: y } = e;
    const now = performance.now();
    if (this.lastPointer) {
      const dt = Math.max(0.008, (now - this.lastPointer.t) / 1000);
      this.cursorVel.x += ((x - this.lastPointer.x) / dt - this.cursorVel.x) * 0.35;
      this.cursorVel.y += ((y - this.lastPointer.y) / dt - this.cursorVel.y) * 0.35;
    }
    this.lastPointer = { x, y, t: now };
    this.lastMoveAt = now;

    const r = this.el.wrap.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    // Figma's centre hover zone is ±190 px around a 623 px bird; scaled to
    // the on-screen size so eyes reach full offset near the body's edge.
    const reach = r.width * 0.6;
    this.lookTarget = { x: clamp1(dx / reach) * LOOK_X, y: clamp1(dy / reach) * LOOK_Y };
    // the whole bird drifts toward the cursor; only updated on movement,
    // so when the cursor rests the bird holds its pose
    const travel = BODY_SHIFT * this.motion();
    this.bodyTarget = { x: clamp1(dx / (reach * 3)) * travel, y: clamp1(dy / (reach * 3)) * travel };
  };

  // cursor left the page: settle back to centre (eyes and body)
  private recentre = () => {
    this.lookTarget = { x: 0, y: 0 };
    this.bodyTarget = { x: 0, y: 0 };
    this.lastPointer = null;
  };

  /* ---------- blink (Eyes=Closed) ---------- */
  private blink(ms = 120) {
    this.blinking = true;
    this.later(() => { this.blinking = false; }, ms);
  }

  private updateBlink(now: number) {
    if (now < this.nextBlinkAt) {
      // cursor just came to rest: pull a far-off blink in to the idle cadence
      if (this.cursorIdle() && this.nextBlinkAt - now > BLINK_GAP_IDLE[1]) this.nextBlinkAt = now + this.blinkGap();
      return;
    }
    if (this.shape === 'open') {
      this.blink(120);
      if (Math.random() < 0.2) this.later(() => this.blink(110), 260);  // occasional double blink
    }
    this.nextBlinkAt = now + this.blinkGap();
  }

  /* ---------- render loop ---------- */
  private target(): Anim {
    const base: Shape = { ...STATES[this.shape === 'open' && this.blinking ? 'closed' : this.shape] };
    if (this.shape === 'open' && this.listening) {
      // stay a little squeezed while recording (body only; eyes keep their state)
      for (const k of ['rx', 'ry', 'dy', 'spread'] as const) {
        base[k] += (STATES.pressed[k] - STATES.open[k]) * LISTEN_SQUEEZE;
      }
    }
    if (this.shape === 'open' && !this.blinking) {
      // speaking: the bird stretches up with your voice (rebound-style), eyes widen
      base.ry += this.level * 42;
      base.rx -= this.level * 16;
      base.dy -= this.level * 24;
      base.eh += this.level * 46;
      base.ew += this.level * 6;
    }
    // squash & stretch along the cursor's motion (cartoon follow-through)
    const sx = Math.min(1, Math.abs(this.cursorVel.x) / 1800);
    const sy = Math.min(1, Math.abs(this.cursorVel.y) / 1800);
    base.rx += (sx - sy) * 16 * this.motion();
    base.ry += (sy - sx) * 16 * this.motion();

    // lean into the cursor's motion; fades to upright once the cursor stops
    const tilt = clamp1(this.cursorVel.x / 1400) * MAX_TILT * this.motion();
    return { ...base, lx: this.lookTarget.x, ly: this.lookTarget.y, bx: this.bodyTarget.x, by: this.bodyTarget.y, tilt };
  }

  private tick = (now: number) => {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    this.updateBlink(now);

    // no pointer events arrive while the cursor rests, so bleed velocity off here
    const decay = Math.exp(-dt * 9);
    this.cursorVel.x *= decay;
    this.cursorVel.y *= decay;
    const t = this.target();

    // speech onset (level jumps) kicks the bird into a little hop
    if (this.level - this.prevLevel > 0.12 && this.shape === 'open') this.vel.by -= (260 + this.level * 380) * this.motion();
    this.prevLevel = this.level;
    // and it floats a touch higher while you keep talking
    t.by -= this.level * 26;

    const { cur, vel } = this;
    for (const k of Object.keys(cur) as (keyof Anim)[]) {
      // eyes snap faster for blinks; body has a softer bouncy spring
      const isEye = k === 'ew' || k === 'eh';
      const isLook = k === 'lx' || k === 'ly' || k === 'bx' || k === 'by' || k === 'tilt';
      const stiffness = isEye ? 900 : isLook ? 160 : 520;
      const damping = isEye ? 48 : isLook ? 22 : 24;
      const a = stiffness * (t[k] - cur[k]) - damping * vel[k];
      vel[k] += a * dt;
      cur[k] += vel[k] * dt;
    }
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw() {
    const { cur, el } = this;
    el.group.setAttribute('transform',
      `translate(${cur.bx.toFixed(2)} ${cur.by.toFixed(2)}) rotate(${cur.tilt.toFixed(2)} ${CX} ${CY})`);

    const bodyCy = CY + cur.dy;
    el.body.setAttribute('rx', cur.rx.toFixed(2));
    el.body.setAttribute('ry', cur.ry.toFixed(2));
    el.body.setAttribute('cy', bodyCy.toFixed(2));

    const eyeCy = bodyCy + cur.ly;
    const r = Math.min(cur.ew, cur.eh) / 2;
    for (const [eye, side] of [[el.near, -1], [el.far, 1]] as const) {
      const ex = CX + side * EYE_GAP * cur.spread + cur.lx;
      eye.setAttribute('x', (ex - cur.ew / 2).toFixed(2));
      eye.setAttribute('y', (eyeCy - cur.eh / 2).toFixed(2));
      eye.setAttribute('width', cur.ew.toFixed(2));
      eye.setAttribute('height', Math.max(0.1, cur.eh).toFixed(2));
      eye.setAttribute('rx', r.toFixed(2));
    }
  }
}
