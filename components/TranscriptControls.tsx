'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { text: string; onClear: () => void };

export default function TranscriptControls({ text, onClear }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked: nothing to do */ }
  }

  return (
    <div className="controls">
      <button className="chip" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      <button className="chip" type="button" onClick={onClear}>Clear</button>
    </div>
  );
}
