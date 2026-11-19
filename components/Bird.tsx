'use client';

import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { BirdAnimator } from '@/lib/bird/BirdAnimator';
import { CX, CY, EYE_GAP, STATES } from '@/lib/bird/geometry';

export type BirdHandle = {
  press: (opts?: { deep?: boolean }) => void;
  release: () => void;
  setLevel: (v: number) => void;
  setListening: (v: boolean) => void;
};

type Props = {
  ref?: Ref<BirdHandle>;
  listening: boolean;
  children?: ReactNode;   // e.g. the invisible hit button laid over the bird
};

const { open } = STATES;

/**
 * Rock bird (Figma node 3:2). The SVG starts in the Open variant and
 * BirdAnimator drives its attributes directly every frame, so animation
 * never causes React re-renders.
 */
export default function Bird({ ref, listening, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGEllipseElement>(null);
  const nearRef = useRef<SVGRectElement>(null);
  const farRef = useRef<SVGRectElement>(null);
  const animator = useRef<BirdAnimator | null>(null);

  useEffect(() => {
    const a = new BirdAnimator({
      wrap: wrapRef.current!,
      group: groupRef.current!,
      body: bodyRef.current!,
      near: nearRef.current!,
      far: farRef.current!,
    });
    animator.current = a;
    a.start();
    return () => { a.destroy(); animator.current = null; };
  }, []);

  useEffect(() => { animator.current?.setListening(listening); }, [listening]);

  useImperativeHandle(ref, () => ({
    press: opts => animator.current?.press(opts),
    release: () => animator.current?.release(),
    setLevel: v => animator.current?.setLevel(v),
    setListening: v => animator.current?.setListening(v),
  }), []);

  const eyeY = CY - open.eh / 2;
  return (
    <div ref={wrapRef} className={`orb-wrap${listening ? ' listening' : ''}`}>
      {/* viewBox padded so press/rebound squash never clips */}
      <svg className="bird" viewBox="-40 -40 703.079 703.079" aria-hidden="true">
        <g ref={groupRef}>
          <ellipse ref={bodyRef} cx={CX} cy={CY} rx={open.rx} ry={open.ry} fill="#0A0A0A" />
          <rect ref={nearRef} x={CX - EYE_GAP - open.ew / 2} y={eyeY} width={open.ew} height={open.eh} rx={open.ew / 2} fill="#FFFFFF" />
          <rect ref={farRef} x={CX + EYE_GAP - open.ew / 2} y={eyeY} width={open.ew} height={open.eh} rx={open.ew / 2} fill="#FFFFFF" />
        </g>
      </svg>
      {children}
    </div>
  );
}
