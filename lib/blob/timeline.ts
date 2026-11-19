// The 30-second intro, keyed to the reference clip (timestamps in seconds).
// Each keyframe sets the pose the springs head toward from that moment on;
// the springs themselves produce the in-between morphs.
import { POSES, type Pose, type PoseName } from './poses';

export type Keyframe = { t: number; pose: PoseName; with?: Partial<Pose> };

export const INTRO: Keyframe[] = [
  { t: 0.0,  pose: 'idle' },
  { t: 0.5,  pose: 'lookCenter' },
  { t: 1.2,  pose: 'thinking' },                              // three typing dots
  { t: 2.4,  pose: 'small' },
  { t: 3.3,  pose: 'squint' },
  { t: 4.2,  pose: 'happy' },
  { t: 4.9,  pose: 'curious' },                               // big eyes, looking down-left
  { t: 5.9,  pose: 'pen' },                                   // squeezes into a pen nib
  { t: 6.4,  pose: 'exclaimTilt' },                           // ...that becomes a leaning "!"
  { t: 7.2,  pose: 'exclaimTilt', with: { x: 0.35, y: 0.5, rot: 22 } },
  { t: 7.9,  pose: 'small', with: { gazeYaw: 0.6, gazePitch: 0.35 } },
  { t: 8.9,  pose: 'notify' },                                // blue badge pops in
  { t: 9.4,  pose: 'notifyBig' },
  { t: 9.9,  pose: 'notify', with: { sx: 0.8, sy: 0.8 } },
  { t: 10.3, pose: 'exclaim' },                               // upright "!"
  { t: 11.3, pose: 'stick' },                                 // stem pulls back into the body
  { t: 11.9, pose: 'idle' },
  { t: 12.8, pose: 'dot' },
  { t: 13.4, pose: 'dot', with: { y: 0.12 } },
  { t: 13.9, pose: 'peek' },                                  // peeks out with eyes at the edge
  { t: 14.4, pose: 'idle' },
  { t: 15.3, pose: 'egg' },
  { t: 16.3, pose: 'eggSquint' },
  { t: 16.9, pose: 'hexagon' },
  { t: 17.8, pose: 'triangle' },                              // rainbow ribbons start
  { t: 18.6, pose: 'triangle', with: { orbits: 0.7, gazeYaw: 0.05, gazePitch: -0.35, eyeW: 0.17, eyeH: 0.24 } },
  { t: 19.3, pose: 'triangleSpin' },
  { t: 20.0, pose: 'triangleSpin', with: { rot: 60 } },
  { t: 20.7, pose: 'triangleSpin', with: { rot: 150 } },
  { t: 21.3, pose: 'orbitSphere', with: { rot: 180 } },
  { t: 22.0, pose: 'lookLeft', with: { orbits: 0.25, rot: 180, eyeW: 0.16, eyeH: 0.4 } },
  { t: 22.6, pose: 'lookLeft' },
  { t: 23.0, pose: 'lookCenter' },
  { t: 23.5, pose: 'idle' },
  { t: 24.3, pose: 'dotSatellites' },
  { t: 25.3, pose: 'dot' },
  { t: 26.2, pose: 'happy' },
  { t: 26.9, pose: 'idle' },
  { t: 27.4, pose: 'dot', with: { sx: 0.3, sy: 0.3 } },
  { t: 27.9, pose: 'dotSwoosh' },
  { t: 28.6, pose: 'dotSwoosh', with: { orbitX: 0.3, orbitY: 0.05 } },
  { t: 29.3, pose: 'happy', with: { sx: 0.75, sy: 0.75, orbits: 0.3, orbitScale: 0.35, orbitX: 0.45, orbitY: 0.35 } },
  { t: 30.0, pose: 'idle' },
];

export const INTRO_LENGTH = 30.6;

/** Target pose at a moment of the intro. */
export function introPoseAt(seconds: number): Pose {
  let k = INTRO[0];
  for (const f of INTRO) {
    if (f.t > seconds) break;
    k = f;
  }
  return { ...POSES[k.pose], ...k.with };
}
