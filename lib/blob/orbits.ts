// Rainbow ribbons that orbit the body. Each ribbon is a partial ellipse that
// is split into the half behind the body and the half in front, so it can be
// drawn around the character with correct overlap.

export type OrbitSpec = {
  colors: [string, string];
  rx: number; ry: number;   // ellipse radii (units of body radius)
  tilt: number;             // base rotation of the ellipse (rad)
  speed: number;            // rad/s along the ellipse
  arc: number;              // visible arc length at full intensity (rad)
  phase: number;
};

export const ORBITS: OrbitSpec[] = [
  { colors: ['#8f7cf2', '#c56fd6'], rx: 1.55, ry: 0.42, tilt: -0.35, speed: 2.1, arc: 3.6, phase: 0.0 },
  { colors: ['#e0708c', '#c9a65a'], rx: 1.45, ry: 0.30, tilt: 1.15,  speed: 1.7, arc: 3.0, phase: 1.9 },
  { colors: ['#79d3a6', '#5cb6e8'], rx: 1.60, ry: 0.36, tilt: 0.45,  speed: 2.5, arc: 3.3, phase: 3.4 },
  { colors: ['#d8c457', '#9cd56a'], rx: 1.40, ry: 0.50, tilt: -1.25, speed: 1.4, arc: 2.6, phase: 4.6 },
  { colors: ['#6e8ef2', '#b47be0'], rx: 1.50, ry: 0.26, tilt: 2.3,   speed: 1.9, arc: 2.9, phase: 5.5 },
];

const SAMPLES = 42;

/** Builds back/front path data for one ribbon (coordinates already in px). */
export function orbitPath(
  spec: OrbitSpec, clock: number, intensity: number,
  cx: number, cy: number, scale: number,
): { back: string; front: string } {
  if (intensity < 0.01) return { back: '', front: '' };
  const start = spec.phase + clock * spec.speed;
  const len = spec.arc * Math.min(1, intensity);
  // slow wobble of the orbit plane makes the rings feel three-dimensional
  const tilt = spec.tilt + 0.35 * Math.sin(clock * 0.4 + spec.phase);
  const ry = spec.ry * (0.65 + 0.35 * Math.sin(clock * 0.7 + spec.phase * 2));
  const ct = Math.cos(tilt), st = Math.sin(tilt);

  let back = '', front = '';
  let prevFront: boolean | null = null;
  for (let i = 0; i <= SAMPLES; i++) {
    const s = start + (i / SAMPLES) * len;
    const lx = Math.cos(s) * spec.rx * scale, ly = Math.sin(s) * ry * scale;
    const x = (cx + lx * ct - ly * st).toFixed(1);
    const y = (cy + lx * st + ly * ct).toFixed(1);
    const isFront = Math.sin(s) >= 0;       // lower half of the ellipse passes in front
    const cmd = prevFront === isFront ? 'L' : 'M';
    if (isFront) front += `${cmd}${x} ${y}`; else back += `${cmd}${x} ${y}`;
    prevFront = isFront;
  }
  return { back, front };
}
