'use client';

import { useEffect, useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { InteractiveBlob, type Reaction } from '@/lib/blob/InteractiveBlob';

export type MorphBlobHandle = {
  playIntro: () => void;
  skipIntro: () => void;
  noteTyping: () => void;
  setListening: (v: boolean) => void;
  setLevel: (v: number) => void;
  react: (r: Reaction) => void;
  press: (deep?: boolean) => void;
  release: () => void;
};

type Props = {
  ref?: Ref<MorphBlobHandle>;
  listening: boolean;
  onIntroEnd?: () => void;
  children?: ReactNode;   // e.g. the invisible hit button over the body
};

/** The morphing character. The animator owns the SVG's children and draws every frame. */
export default function MorphBlob({ ref, listening, onIntroEnd, children }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const blob = useRef<InteractiveBlob | null>(null);
  const introEnd = useRef(onIntroEnd);
  introEnd.current = onIntroEnd;

  useEffect(() => {
    const b = new InteractiveBlob(svgRef.current!, { onIntroEnd: () => introEnd.current?.() });
    blob.current = b;
    b.start();
    // play the intro unless the user prefers reduced motion
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) b.playIntro();
    else introEnd.current?.();
    return () => { b.destroy(); blob.current = null; };
  }, []);

  useEffect(() => { blob.current?.setListening(listening); }, [listening]);

  useImperativeHandle(ref, () => ({
    playIntro: () => blob.current?.playIntro(),
    skipIntro: () => blob.current?.skipIntro(),
    noteTyping: () => blob.current?.noteTyping(),
    setListening: v => blob.current?.setListening(v),
    setLevel: v => blob.current?.setLevel(v),
    react: r => blob.current?.react(r),
    press: deep => blob.current?.press(deep),
    release: () => blob.current?.release(),
  }), []);

  return (
    <div className={`blob-wrap${listening ? ' listening' : ''}`}>
      <svg ref={svgRef} className="blob" aria-hidden="true" />
      {children}
    </div>
  );
}
