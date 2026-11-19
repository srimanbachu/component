'use client';

import { useLayoutEffect, useRef } from 'react';

type Props = { final: string; interim: string };

/** Final text in full colour, the live preview in grey; keeps scrolled to the latest words. */
export default function Transcript({ final, interim }: Props) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [final, interim]);

  const empty = !final && !interim;
  return (
    <section ref={ref} className="transcript" aria-live="polite">
      <p className="placeholder" hidden={!empty}>Your words will appear here.</p>
      <p className="text">
        <span>{final}</span>
        <span className="interim">{interim ? (final ? ' ' : '') + interim : ''}</span>
      </p>
    </section>
  );
}
