/* =========================================================
   Rock bird: cursor-following character from the Figma file
   "Rock bird • hover + blink" (A9wQuHAXs7PRHnQv7mSuoC, node 3:44).

   Every Figma variant is the same body + two eyes with different
   geometry, so instead of swapping 36 SVGs we spring between the
   exact values below. That gives smooth, continuous eye tracking
   (not just 9 snapped directions) plus blink / press / rebound.
   ========================================================= */
(() => {
  // Units are Figma px inside the 623.079 × 623.079 "Bird" layer.
  const CX = 311.54, CY = 309.847;   // body centre
  const EYE_GAP = 86;                // eye centre distance from body centre (x)
  const LOOK_X = 100, LOOK_Y = 110;  // eye offset in the Left/Right & Up/Down variants

  // Variant geometry, taken from the component set
  const STATES = {
    open:    { rx: 309,    ry: 309,    dy: 0,      ew: 68,    eh: 152,    spread: 1    },  // 3:2
    closed:  { rx: 309,    ry: 309,    dy: 0,      ew: 78,    eh: 10,     spread: 1    },  // 3:9
    pressed: { rx: 330.63, ry: 271.92, dy: 28,     ew: 83.46, eh: 8.8,    spread: 1.07 },  // 12:524
    rebound: { rx: 302.82, ry: 321.36, dy: -14.02, ew: 66.64, eh: 168.48, spread: 0.98 },  // 12:538
  };
  const KEYS = Object.keys(STATES.open);

  const wrap = document.getElementById('orbWrap');
  const group = document.getElementById('birdGroup');
  const body = document.getElementById('birdBody');
  const near = document.getElementById('birdNearEye');
  const far = document.getElementById('birdFarEye');

  // spring state for every animated value
  const cur = { ...STATES.open, lx: 0, ly: 0, bx: 0, by: 0 };
  const vel = Object.fromEntries(Object.keys(cur).map(k => [k, 0]));

  let shape = 'open';        // open | pressed | rebound
  let blinking = false;
  let level = 0;             // voice level 0..1, set from script.js
  let lookTarget = { x: 0, y: 0 };
  const BODY_SHIFT = 70;     // max body travel toward the cursor (Figma px)
  let bodyTarget = { x: 0, y: 0 };
  let reboundTimer = null;

  /* ---------- cursor tracking ---------- */
  const IDLE_AFTER_MS = 700;   // cursor counts as "still" after this long without moving
  let lastMoveAt = -Infinity;
  let lastPointer = null;      // { x, y, t } of the previous pointermove
  const cursorVel = { x: 0, y: 0 };   // px per second, smoothed

  const cursorIdle = () => performance.now() - lastMoveAt > IDLE_AFTER_MS;

  function onPointer(x, y) {
    const now = performance.now();
    if (lastPointer) {
      const dt = Math.max(0.008, (now - lastPointer.t) / 1000);
      cursorVel.x += ((x - lastPointer.x) / dt - cursorVel.x) * 0.35;
      cursorVel.y += ((y - lastPointer.y) / dt - cursorVel.y) * 0.35;
    }
    lastPointer = { x, y, t: now };
    lastMoveAt = now;

    const r = wrap.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    // Figma's centre hover zone is ±190 px around a 623 px bird; scale that
    // to the on-screen size so eyes reach full offset just outside the body.
    const reach = r.width * 0.9;
    const clamp = v => Math.max(-1, Math.min(1, v));
    lookTarget = { x: clamp(dx / reach) * LOOK_X, y: clamp(dy / reach) * LOOK_Y };
    // the whole bird drifts toward the cursor; only updated on movement,
    // so when the cursor rests the bird holds its pose
    bodyTarget = { x: clamp(dx / (reach * 2)) * BODY_SHIFT, y: clamp(dy / (reach * 2)) * BODY_SHIFT };
  }
  window.addEventListener('pointermove', e => onPointer(e.clientX, e.clientY), { passive: true });
  document.addEventListener('pointerleave', () => { lookTarget = { x: 0, y: 0 }; });
  window.addEventListener('blur', () => { lookTarget = { x: 0, y: 0 }; });

  /* ---------- blink (Eyes=Closed) ---------- */
  function scheduleBlink() {
    setTimeout(() => {
      if (shape === 'open') {
        blinking = true;
        setTimeout(() => { blinking = false; }, 120);
        // occasional double blink
        if (Math.random() < 0.2) setTimeout(() => {
          blinking = true;
          setTimeout(() => { blinking = false; }, 110);
        }, 260);
      }
      scheduleBlink();
    }, 2200 + Math.random() * 3200);
  }
  scheduleBlink();

  /* ---------- press → rebound → open (Eyes=Pressed / Rebound) ---------- */
  function press() {
    clearTimeout(reboundTimer);
    shape = 'pressed';
  }
  function release() {
    if (shape !== 'pressed') return;
    shape = 'rebound';
    clearTimeout(reboundTimer);
    reboundTimer = setTimeout(() => { shape = 'open'; }, 160);
  }

  /* ---------- render loop ---------- */
  function target() {
    const base = { ...STATES[shape === 'open' && blinking ? 'closed' : shape] };
    if (shape === 'open' && !blinking) {
      // listening: the bird "breathes" with your voice, borrowing the rebound stretch
      base.ry += level * 18;
      base.rx -= level * 7;
      base.dy -= level * 9;
      base.eh += level * 22;
    }
    return { ...base, lx: lookTarget.x, ly: lookTarget.y, bx: bodyTarget.x, by: bodyTarget.y };
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const t = target();

    for (const k in cur) {
      // eyes snap faster for blinks; body has a softer bouncy spring
      const isEye = k === 'ew' || k === 'eh';
      const isLook = k === 'lx' || k === 'ly' || k === 'bx' || k === 'by';
      const stiffness = isEye ? 900 : isLook ? 160 : 520;
      const damping = isEye ? 48 : isLook ? 22 : 24;
      const a = stiffness * (t[k] - cur[k]) - damping * vel[k];
      vel[k] += a * dt;
      cur[k] += vel[k] * dt;
    }

    group.setAttribute('transform', `translate(${cur.bx.toFixed(2)} ${cur.by.toFixed(2)})`);

    const bodyCy = CY + cur.dy;
    body.setAttribute('rx', cur.rx.toFixed(2));
    body.setAttribute('ry', cur.ry.toFixed(2));
    body.setAttribute('cy', bodyCy.toFixed(2));

    const eyeCy = bodyCy + cur.ly;
    const r = Math.min(cur.ew, cur.eh) / 2;
    for (const [el, side] of [[near, -1], [far, 1]]) {
      const ex = CX + side * EYE_GAP * cur.spread + cur.lx;
      el.setAttribute('x', (ex - cur.ew / 2).toFixed(2));
      el.setAttribute('y', (eyeCy - cur.eh / 2).toFixed(2));
      el.setAttribute('width', cur.ew.toFixed(2));
      el.setAttribute('height', Math.max(0.1, cur.eh).toFixed(2));
      el.setAttribute('rx', r.toFixed(2));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.Bird = {
    press,
    release,
    setLevel(v) { level = v; },
  };
})();
