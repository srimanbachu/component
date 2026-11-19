// Morphing blob character. Builds its own SVG content and animates it with
// springs every frame (no React renders): the body outline morphs point by
// point between shapes, and every pose value eases with a little overshoot.
import { ANGLES, N, SHAPES } from './shapes';
import { BASE, SCALAR_KEYS, type Pose, type ScalarKey } from './poses';
import { projectEye } from './eyes';
import { ORBITS, orbitPath } from './orbits';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const VIEW = 600;            // viewBox size
const C = VIEW / 2;                 // centre
export const R = 150;               // base body radius (px in viewBox units)
const INK = '#0a0a0a';

type Scalars = Record<ScalarKey, number>;

// spring tuning per value group: [stiffness, damping]
const SPRING: Partial<Record<ScalarKey, [number, number]>> = {
  eyeW: [520, 34], eyeH: [520, 34], eyeOpacity: [900, 60],   // eyes vanish fast on tiny shapes
  gazeYaw: [140, 20], gazePitch: [140, 20],
  badge: [260, 16], dots: [220, 24],
};
const DEFAULT_SPRING: [number, number] = [150, 17];
const SHAPE_SPRING: [number, number] = [130, 15];
const MAX_SUBSTEP = 1 / 240;          // seconds per integration step

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}, parent?: Element) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

const pick = (p: Pose): Scalars => Object.fromEntries(SCALAR_KEYS.map(k => [k, p[k]])) as Scalars;

export class BlobAnimator {
  protected svg: SVGSVGElement;
  protected cur: Scalars = pick(BASE);
  protected vel: Scalars = Object.fromEntries(SCALAR_KEYS.map(k => [k, 0])) as Scalars;
  protected radii = Float32Array.from(SHAPES.circle);
  protected radiiVel = new Float32Array(N);

  // parts
  private root!: SVGGElement;
  private body!: SVGPathElement;
  private eyes!: [SVGRectElement, SVGRectElement];
  private bar!: SVGPathElement;
  private sideDots!: [SVGCircleElement, SVGCircleElement];
  private badge!: SVGCircleElement;
  private orbitBack: SVGPathElement[] = [];
  private orbitFront: SVGPathElement[] = [];
  private satellites: SVGCircleElement[] = [];

  protected time = 0;               // seconds since start
  private orbitClock = 0;
  private last = 0;
  private raf = 0;

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    this.build();
  }

  /* ---------- lifecycle ---------- */
  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.svg.replaceChildren();
  }

  /* ---------- pose selection (extended by subclasses) ---------- */
  protected targetPose(): Pose {
    return { ...BASE };
  }

  /** Hook for per-frame adjustments after the pose is chosen. */
  protected adjust(target: Pose, _dt: number): Pose { return target; }
  /** Extra transform for the whole character (cursor drift / lean). */
  protected rootTransform(): string { return ''; }
  /** Multiplier on orbit speed (voice level speeds it up). */
  protected orbitSpeed(): number { return 1; }

  /* ---------- build the SVG ---------- */
  private build() {
    const svg = this.svg;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${VIEW} ${VIEW}`);

    const defs = el('defs', {}, svg);
    ORBITS.forEach((o, i) => {
      const g = el('linearGradient', { id: `orbit-grad-${i}`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
      el('stop', { offset: 0, 'stop-color': o.colors[0] }, g);
      el('stop', { offset: 1, 'stop-color': o.colors[1] }, g);
    });

    this.root = el('g', {}, svg);
    const ribbon = (i: number, parent: SVGGElement) =>
      el('path', { fill: 'none', stroke: `url(#orbit-grad-${i})`, 'stroke-width': R * 0.07, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parent);

    const back = el('g', {}, this.root);
    this.orbitBack = ORBITS.map((_, i) => ribbon(i, back));

    this.satellites = [0, 1, 2].map(i => el('circle', { r: 0, fill: ['#555', '#888', '#333'][i] }, this.root));
    this.sideDots = [el('circle', { r: 0, fill: INK }, this.root), el('circle', { r: 0, fill: INK }, this.root)];
    this.bar = el('path', { fill: INK }, this.root);
    this.body = el('path', { fill: INK }, this.root);
    this.eyes = [el('rect', { fill: '#fff' }, this.root), el('rect', { fill: '#fff' }, this.root)];
    this.badge = el('circle', { r: 0, fill: '#4a90e2', stroke: '#fff', 'stroke-width': R * 0.035 }, this.root);

    const front = el('g', {}, this.root);
    this.orbitFront = ORBITS.map((_, i) => ribbon(i, front));
  }

  /* ---------- frame loop ---------- */
  private tick = (now: number) => {
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.orbitClock += dt * this.orbitSpeed();

    const target = this.adjust(this.targetPose(), dt);
    this.step(target, dt);
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  private step(target: Pose, dt: number) {
    // Stiff springs blow up if integrated in one big step (a 33 ms frame with
    // stiffness 900 / damping 60 diverged and made the eyes flicker forever),
    // so always advance in small fixed sub-steps regardless of frame time.
    const steps = Math.max(1, Math.ceil(dt / MAX_SUBSTEP));
    const h = dt / steps;
    const goal = SHAPES[target.shape];
    for (let s = 0; s < steps; s++) {
      for (const k of SCALAR_KEYS) {
        const [stiff, damp] = SPRING[k] ?? DEFAULT_SPRING;
        const a = stiff * (target[k] - this.cur[k]) - damp * this.vel[k];
        this.vel[k] += a * h;
        this.cur[k] += this.vel[k] * h;
      }
      const [stiff, damp] = SHAPE_SPRING;
      for (let i = 0; i < N; i++) {
        const a = stiff * (goal[i] - this.radii[i]) - damp * this.radiiVel[i];
        this.radiiVel[i] += a * h;
        this.radii[i] += this.radiiVel[i] * h;
      }
    }
    // last line of defence: never let a bad value stick
    for (const k of SCALAR_KEYS) {
      if (!Number.isFinite(this.cur[k]) || Math.abs(this.cur[k]) > 1e4) { this.cur[k] = target[k]; this.vel[k] = 0; }
    }
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(this.radii[i])) { this.radii[i] = goal[i]; this.radiiVel[i] = 0; }
    }
  }

  /* ---------- drawing ---------- */
  private draw() {
    const c = this.cur;
    const bx = C + c.x * R, by = C + c.y * R;
    const rot = (c.rot * Math.PI) / 180;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    this.root.setAttribute('transform', this.rootTransform());

    // body outline: smooth curve through the morphing radii
    const pts: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const r = Math.max(0, this.radii[i]);
      const lx = Math.cos(ANGLES[i]) * r * c.sx * R, ly = Math.sin(ANGLES[i]) * r * c.sy * R;
      pts.push([bx + lx * cr - ly * sr, by + lx * sr + ly * cr]);
    }
    const mid = (a: [number, number], b: [number, number]) => `${((a[0] + b[0]) / 2).toFixed(1)} ${((a[1] + b[1]) / 2).toFixed(1)}`;
    let d = `M${mid(pts[N - 1], pts[0])}`;
    for (let i = 0; i < N; i++) d += `Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${mid(pts[i], pts[(i + 1) % N])}`;
    this.body.setAttribute('d', d + 'Z');

    // thinking dots: the body is the middle dot; brightness ripples across all three
    const dots = Math.max(0, Math.min(1, c.dots));
    const pulse = (i: number) => 0.5 + 0.5 * Math.sin(this.time * 5.5 - i * 2.1);
    const gray = (i: number) => Math.round(10 + 120 * dots * pulse(i));
    this.body.setAttribute('fill', `rgb(${gray(1)},${gray(1)},${gray(1)})`);
    this.sideDots.forEach((dot, j) => {
      const i = j === 0 ? 0 : 2;
      dot.setAttribute('cx', (bx + (i - 1) * 0.55 * R * Math.min(1, dots * 1.4)).toFixed(1));
      dot.setAttribute('cy', by.toFixed(1));
      dot.setAttribute('r', (0.19 * R * dots).toFixed(1));
      dot.setAttribute('fill', `rgb(${gray(i)},${gray(i)},${gray(i)})`);
    });

    this.drawEyes(bx, by);
    this.drawBar(bx, by, cr, sr);

    // notification badge on the upper-right rim
    const badgeR = Math.max(0, c.badge) * 0.11 * R;
    const rimX = bx + Math.cos(-Math.PI / 4) * R * c.sx * 0.98, rimY = by + Math.sin(-Math.PI / 4) * R * c.sy * 0.98;
    this.badge.setAttribute('cx', rimX.toFixed(1));
    this.badge.setAttribute('cy', rimY.toFixed(1));
    this.badge.setAttribute('r', badgeR.toFixed(1));
    this.badge.setAttribute('stroke-width', badgeR > 0.5 ? (R * 0.035).toFixed(1) : '0');

    // orbit ribbons
    const ox = bx + c.orbitX * R, oy = by + c.orbitY * R;
    const scale = R * Math.max(0.05, c.orbitScale);
    ORBITS.forEach((spec, i) => {
      const { back, front } = orbitPath(spec, this.orbitClock, c.orbits, ox, oy, scale);
      this.orbitBack[i].setAttribute('d', back);
      this.orbitFront[i].setAttribute('d', front);
      const w = (R * 0.07 * Math.max(0.35, c.orbitScale)).toFixed(1);
      this.orbitBack[i].setAttribute('stroke-width', w);
      this.orbitFront[i].setAttribute('stroke-width', w);
    });

    // tiny satellites circling the dot
    const sat = Math.max(0, Math.min(1, c.satellites));
    this.satellites.forEach((s, i) => {
      const a = this.time * (2.2 + i * 0.6) + i * 2.1;
      const dist = R * (0.38 + i * 0.12) * sat;
      s.setAttribute('cx', (bx + Math.cos(a) * dist).toFixed(1));
      s.setAttribute('cy', (by + Math.sin(a) * dist * 0.7).toFixed(1));
      s.setAttribute('r', (R * (0.045 - i * 0.008) * sat).toFixed(1));
    });
  }

  /** Blink amount 0..1 (1 = fully closed); overridden by the interactive layer. */
  protected blinkAmount(): number { return 0; }

  private drawEyes(bx: number, by: number) {
    const c = this.cur;
    const bodyScale = (c.sx + c.sy) / 2;
    const close = 1 - 0.88 * this.blinkAmount();
    [-1, 1].forEach((side, i) => {
      const eye = this.eyes[i];
      const p = projectEye(c.gazeYaw + (side * c.eyeGap) / 2, c.gazePitch);
      const ex = bx + p.x * R * c.sx * 0.95, ey = by + p.y * R * c.sy * 0.95;
      const w = Math.max(0.5, c.eyeW * R * p.wScale * bodyScale);
      const h = Math.max(0.5, c.eyeH * R * p.hScale * bodyScale * close);
      eye.setAttribute('x', (ex - w / 2).toFixed(1));
      eye.setAttribute('y', (ey - h / 2).toFixed(1));
      eye.setAttribute('width', w.toFixed(1));
      eye.setAttribute('height', h.toFixed(1));
      eye.setAttribute('rx', (Math.min(w, h) / 2).toFixed(1));
      eye.setAttribute('transform', `rotate(${(p.angle + c.eyeTilt).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)})`);
      // eyes never show on tiny shapes (dots, the "!" dot, the pen nib), even mid-morph
      const sizeGate = Math.max(0, Math.min(1, (bodyScale - 0.45) / 0.2));
      eye.setAttribute('opacity', Math.max(0, Math.min(1, c.eyeOpacity * p.visible * sizeGate)).toFixed(2));
    });
  }

  /** Exclamation stem / pen stick: a tapered capsule standing on top of the body. */
  private drawBar(bx: number, by: number, cr: number, sr: number) {
    const c = this.cur;
    const len = c.barLen * R;
    if (len < 2) { this.bar.setAttribute('d', ''); return; }
    const gap = c.barGap * R;          // negative = stick overlaps the body (pen)
    const up = (dist: number): [number, number] => [bx + sr * dist, by - cr * dist];  // "up" after rotation
    const [x0, y0] = up(c.sy * R + gap);
    const [x1, y1] = up(c.sy * R + gap + len);
    const nx = cr, ny = sr;                  // perpendicular to the stem
    const wb = (c.barW * R * 0.62) / 2, wt = (c.barW * R) / 2;
    const f = (v: number) => v.toFixed(1);
    this.bar.setAttribute('d',
      `M${f(x0 + nx * wb)} ${f(y0 + ny * wb)}` +
      `L${f(x1 + nx * wt)} ${f(y1 + ny * wt)}` +
      `A${f(wt)} ${f(wt)} 0 0 0 ${f(x1 - nx * wt)} ${f(y1 - ny * wt)}` +
      `L${f(x0 - nx * wb)} ${f(y0 - ny * wb)}` +
      `A${f(wb)} ${f(wb)} 0 0 0 ${f(x0 + nx * wb)} ${f(y0 + ny * wb)}Z`);
    this.bar.setAttribute('opacity', Math.max(0, Math.min(1, c.barOpacity)).toFixed(2));
  }
}
