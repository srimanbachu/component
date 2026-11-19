'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Bird, { type BirdHandle } from './Bird';
import Transcript from './Transcript';
import TranscriptControls from './TranscriptControls';
import { VoiceEngine, type Status, type Transcript as TranscriptState } from '@/lib/voice/VoiceEngine';

const HOLD_MS = 350; // press longer than this = push-to-talk

export default function VoiceBird() {
  const bird = useRef<BirdHandle>(null);
  const engine = useRef<VoiceEngine | null>(null);
  const [status, setStatus] = useState<Status>({ text: 'Loading speech model…', on: false });
  const [transcript, setTranscript] = useState<TranscriptState>({ final: '', interim: '' });
  const [listening, setListening] = useState(false);

  /* ---------- engine lifecycle ---------- */
  useEffect(() => {
    const e = new VoiceEngine({ onStatus: setStatus, onTranscript: setTranscript, onListening: setListening });
    engine.current = e;
    e.load();
    return () => { e.dispose(); engine.current = null; };
  }, []);

  /* ---------- voice level -> bird, every frame (no React renders) ---------- */
  useEffect(() => {
    let level = 0;
    let raf = 0;
    const frame = () => {
      const e = engine.current;
      const target = e?.wantListening ? e.rawLevel : 0;
      level += (target - level) * (target > level ? 0.25 : 0.06);
      bird.current?.setLevel(level);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------- input: tap to toggle, or hold to talk ---------- */
  const press = useRef({ at: 0, startedByPress: false, pressing: false });

  const pressDown = useCallback(() => {
    const p = press.current, e = engine.current;
    if (p.pressing || !e) return;
    p.pressing = true;
    p.at = performance.now();
    p.startedByPress = !e.wantListening;
    // a press that actually starts recording squeezes the bird harder
    bird.current?.press({ deep: p.startedByPress && e.modelReady });
    if (p.startedByPress) e.startListening();
  }, []);

  const pressUp = useCallback(() => {
    const p = press.current, e = engine.current;
    if (!p.pressing || !e) return;
    p.pressing = false;
    bird.current?.release();
    const held = performance.now() - p.at >= HOLD_MS;
    if (p.startedByPress ? held : true) e.stopListening();
  }, []);

  // Space works anywhere except text fields and the transcript buttons
  useEffect(() => {
    const ignore = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('input, textarea, .chip');
    const down = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space' || ev.repeat || ignore(ev.target)) return;
      ev.preventDefault();
      pressDown();
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space' || ignore(ev.target)) return;
      ev.preventDefault();
      pressUp();
    };
    const blur = () => { if (press.current.pressing) pressUp(); };
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [pressDown, pressUp]);

  return (
    <main className="stage">
      <Bird ref={bird} listening={listening}>
        <button
          className="orb-hit"
          aria-label={listening ? 'Stop listening' : 'Start listening'}
          onPointerDown={ev => {
            if (ev.button !== 0) return;
            ev.currentTarget.setPointerCapture(ev.pointerId);
            pressDown();
          }}
          onPointerUp={pressUp}
          onPointerCancel={pressUp}
          onContextMenu={ev => ev.preventDefault()}
          onClick={ev => ev.preventDefault()}
        />
      </Bird>

      <p className={`status${status.on ? ' on' : ''}`}>{status.text}</p>

      <Transcript final={transcript.final} interim={transcript.interim} />
      <TranscriptControls text={transcript.final} onClear={() => engine.current?.clear()} />
    </main>
  );
}
