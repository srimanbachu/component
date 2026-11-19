// Eyes are glossy pills painted on the surface of a sphere. Projecting them
// from 3D gives the clip's look for free: they tilt toward the poles,
// foreshorten near the rim, and slide out of sight when looking far away.

export type ProjectedEye = {
  x: number; y: number;  // position on the body's disc, in units of the radius
  angle: number;         // rotation of the pill's long axis (deg, clockwise)
  wScale: number;        // foreshortening across / along the pill
  hScale: number;
  visible: number;       // 0..1, fades as the eye turns away from the viewer
};

/** yaw: + right, pitch: + up (radians). */
export function projectEye(yaw: number, pitch: number): ProjectedEye {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const z = cy * cp;                       // toward the viewer
  // tangent along the meridian (direction the pill's long axis points)
  const tx = -sy * sp, ty = -cp;
  const tLen = Math.hypot(tx, ty) || 1;
  return {
    x: sy * cp,
    y: -sp,
    angle: (Math.atan2(tx, -ty) * 180) / Math.PI,
    wScale: Math.max(0.12, Math.abs(cy)),
    hScale: Math.max(0.12, tLen),
    visible: Math.max(0, Math.min(1, z / 0.25)),
  };
}
