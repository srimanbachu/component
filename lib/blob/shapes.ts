// Body silhouettes for the morphing blob.
//
// Every shape is stored the same way: the distance from the centre to the
// outline at N evenly spaced angles. Because all shapes share that layout,
// morphing between any two is just interpolating N numbers.

export const N = 128;
const TAU = Math.PI * 2;
export const ANGLES = Float32Array.from({ length: N }, (_, i) => (i / N) * TAU);

type Pt = [number, number];

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** Cast a ray from the origin at each angle and record where it leaves the polygon. */
export function polarFromPoints(pts: Pt[]): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const dx = Math.cos(ANGLES[i]), dy = Math.sin(ANGLES[i]);
    let best = 0;
    for (let j = 0; j < pts.length; j++) {
      const [px, py] = pts[j];
      const [qx, qy] = pts[(j + 1) % pts.length];
      const ex = qx - px, ey = qy - py;
      const den = cross(dx, dy, ex, ey);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross(px, py, ex, ey) / den;
      const u = cross(px, py, dx, dy) / den;
      if (u >= 0 && u <= 1 && t > best) best = t;
    }
    out[i] = best;
  }
  return out;
}

/**
 * Regular polygon with circular corners: a smaller polygon "inflated" by the
 * corner radius (straight edges joined by arcs), so edges stay truly flat.
 */
function roundedPolygon(sides: number, circumradius: number, rotationDeg: number, cornerRadius: number): Float32Array {
  const inner = circumradius - cornerRadius / Math.cos(Math.PI / sides);
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (rotationDeg * Math.PI) / 180 + (i / sides) * TAU;
    const vx = Math.cos(a) * inner, vy = Math.sin(a) * inner;
    // arc spans between the two neighbouring edge normals
    for (let k = 0; k <= 12; k++) {
      const phi = a - Math.PI / sides + (k / 12) * (TAU / sides);
      pts.push([vx + Math.cos(phi) * cornerRadius, vy + Math.sin(phi) * cornerRadius]);
    }
  }
  return polarFromPoints(pts);
}

function sampled(fn: (t: number) => Pt, count = 360): Float32Array {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) pts.push(fn((i / count) * TAU));
  return polarFromPoints(pts);
}

const circle = new Float32Array(N).fill(1);

// Egg: a little narrower at the top than the bottom (y grows downward in SVG)
const egg = sampled(t => [0.84 * Math.cos(t) * (1 + 0.12 * Math.sin(t)), 1.04 * Math.sin(t) + 0.02]);

// Teardrop with its point at the bottom (rotated by the pose to make the pen nib)
// (t = 0 has zero width -> the tip, at y = +1.25; the round part sits on the centre)
const drop = sampled(t => [0.82 * Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 0.9), Math.cos(t) + 0.25]);

// Pointy-top hexagon and an upward triangle with soft corners
const hexagon = roundedPolygon(6, 1.08, -90, 0.28);
const triangle = roundedPolygon(3, 1.38, -90, 0.34);

export const SHAPES = { circle, egg, drop, hexagon, triangle };
export type ShapeName = keyof typeof SHAPES;
