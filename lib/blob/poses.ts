// Named poses for the morphing blob, read off the reference clip.
// Lengths are in units of the base body radius R; angles in degrees unless noted.
import type { ShapeName } from './shapes';

export type Pose = {
  shape: ShapeName;
  sx: number; sy: number;        // body scale
  rot: number;                   // body rotation (deg)
  x: number; y: number;          // body offset
  eyeOpacity: number;
  eyeW: number; eyeH: number;    // eye size before 3D foreshortening
  eyeGap: number;                // angular distance between the eyes on the sphere (rad)
  eyeTilt: number;               // extra eye rotation on top of the surface tangent (deg)
  gazeYaw: number;               // where the eyes sit on the sphere (rad): + right
  gazePitch: number;             //                                       + up
  follow: number;                // 0..1 how much the cursor may steer the gaze
  barLen: number; barW: number;  // exclamation stem / pen stick
  barOpacity: number;
  dots: number;                  // 0..1 "thinking" dots
  badge: number;                 // notification badge size (0 = hidden)
  orbits: number;                // 0..1 rainbow orbit ribbons
  orbitScale: number;
  orbitX: number; orbitY: number;
  satellites: number;            // 0..1 tiny orbiting particles
};

export type ScalarKey = Exclude<keyof Pose, 'shape'>;

export const BASE: Pose = {
  shape: 'circle',
  sx: 1, sy: 1, rot: 0, x: 0, y: 0,
  eyeOpacity: 1,
  eyeW: 0.13, eyeH: 0.42, eyeGap: 0.45, eyeTilt: 0,
  // resting gaze: up and to the right, like the clip's first frame
  gazeYaw: 0.45, gazePitch: 0.55,
  follow: 1,
  barLen: 0, barW: 0.2, barOpacity: 1,
  dots: 0, badge: 0,
  orbits: 0, orbitScale: 1, orbitX: 0, orbitY: 0,
  satellites: 0,
};

export const SCALAR_KEYS = (Object.keys(BASE) as (keyof Pose)[]).filter((k): k is ScalarKey => k !== 'shape');

const pose = (p: Partial<Pose>): Pose => ({ ...BASE, ...p });

const hidden = { eyeOpacity: 0, follow: 0 } as const;

export const POSES = {
  idle:        pose({}),
  lookCenter:  pose({ gazeYaw: 0.12, gazePitch: 0.12 }),
  small:       pose({ sx: 0.92, sy: 0.92 }),
  thinking:    pose({ sx: 0.19, sy: 0.19, dots: 1, ...hidden }),
  squint:      pose({ eyeW: 0.17, eyeH: 0.05, gazeYaw: 0.1, gazePitch: 0.25, follow: 0.6 }),
  happy:       pose({ eyeW: 0.2, eyeH: 0.08, eyeTilt: 12, gazeYaw: 0, gazePitch: 0.08, follow: 0.6 }),
  curious:     pose({ eyeW: 0.22, eyeH: 0.52, eyeGap: 0.55, gazeYaw: -0.3, gazePitch: -0.3 }),
  pen:         pose({ shape: 'drop', sx: 0.36, sy: 0.36, rot: 35, barLen: 0.42, barW: 0.16, barOpacity: 0.72, ...hidden }),
  exclaimTilt: pose({ sx: 0.16, sy: 0.16, rot: 18, x: 0.55, y: 0.35, barLen: 1.0, barW: 0.2, ...hidden }),
  exclaim:     pose({ sx: 0.15, sy: 0.15, y: 0.4, barLen: 1.1, barW: 0.22, ...hidden }),
  stick:       pose({ sx: 0.42, sy: 0.42, y: 0.15, barLen: 0.38, barW: 0.16, barOpacity: 0.75, ...hidden }),
  notify:      pose({ sx: 0.9, sy: 0.9, eyeW: 0.2, eyeH: 0.12, gazeYaw: -0.2, gazePitch: 0.02, badge: 1 }),
  notifyBig:   pose({ eyeW: 0.26, eyeH: 0.3, gazeYaw: -0.45, gazePitch: -0.12, badge: 1.6 }),
  dot:         pose({ sx: 0.19, sy: 0.19, ...hidden }),
  peek:        pose({ sx: 0.85, sy: 0.85, eyeW: 0.12, eyeH: 0.2, gazeYaw: 1.15, gazePitch: 0, follow: 0 }),
  egg:         pose({ shape: 'egg', eyeW: 0.12, eyeH: 0.32, gazeYaw: 0.35, gazePitch: 0.45 }),
  eggSquint:   pose({ shape: 'egg', eyeW: 0.14, eyeH: 0.04, gazeYaw: 0.35, gazePitch: 0.45 }),
  hexagon:     pose({ shape: 'hexagon', gazeYaw: 0.4, gazePitch: 0.3 }),
  triangle:    pose({ shape: 'triangle', gazeYaw: 0.2, gazePitch: -0.05, orbits: 0.35 }),
  triangleSpin: pose({ shape: 'triangle', rot: -35, orbits: 1, eyeOpacity: 0.25, follow: 0 }),
  orbitSphere: pose({ orbits: 1, eyeW: 0.15, eyeH: 0.42, gazeYaw: -0.5, gazePitch: 0.2 }),
  lookLeft:    pose({ gazeYaw: -0.55, gazePitch: 0.15 }),
  dotSatellites: pose({ sx: 0.19, sy: 0.19, satellites: 1, ...hidden }),
  dotSwoosh:   pose({ sx: 0.17, sy: 0.17, orbits: 0.8, orbitScale: 0.3, orbitX: -0.35, orbitY: -0.2, ...hidden }),
  // interactive-only poses
  listening:   pose({ orbits: 0.55, orbitScale: 1.05, eyeW: 0.15, eyeH: 0.44 }),
} satisfies Record<string, Pose>;

export type PoseName = keyof typeof POSES;
