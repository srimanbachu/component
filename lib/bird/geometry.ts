// Rock bird geometry from the Figma component set
// "Rock bird • hover + blink" (file A9wQuHAXs7PRHnQv7mSuoC, node 3:44).
// Units are Figma px inside the 623.079 × 623.079 "Bird" layer.

export const CX = 311.54;           // body centre x
export const CY = 309.847;          // body centre y
export const EYE_GAP = 86;          // eye centre distance from body centre (x)
export const LOOK_X = 100;          // eye offset in the Left/Right variants
export const LOOK_Y = 110;          // eye offset in the Up/Down variants

export type Shape = {
  rx: number;     // body radius x
  ry: number;     // body radius y
  dy: number;     // body vertical offset
  ew: number;     // eye width
  eh: number;     // eye height
  spread: number; // eye spacing multiplier
};

const SHAPE_KEYS = ['rx', 'ry', 'dy', 'ew', 'eh', 'spread'] as const;

const lerpShape = (a: Shape, b: Shape, t: number): Shape =>
  Object.fromEntries(SHAPE_KEYS.map(k => [k, a[k] + (b[k] - a[k]) * t])) as Shape;

const open: Shape    = { rx: 309,    ry: 309,    dy: 0,      ew: 68,    eh: 152,    spread: 1    }; // 3:2
const closed: Shape  = { rx: 309,    ry: 309,    dy: 0,      ew: 78,    eh: 10,     spread: 1    }; // 3:9
const pressed: Shape = { rx: 330.63, ry: 271.92, dy: 28,     ew: 83.46, eh: 8.8,    spread: 1.07 }; // 12:524
const rebound: Shape = { rx: 302.82, ry: 321.36, dy: -14.02, ew: 66.64, eh: 168.48, spread: 0.98 }; // 12:538

// Pressed pushed further from Open: used when a press starts recording.
// Eyes stay closed lines (never negative height).
const pressedDeep: Shape = { ...lerpShape(open, pressed, 1.6), eh: pressed.eh };

export const STATES = { open, closed, pressed, rebound, pressedDeep };
export type StateName = keyof typeof STATES;
