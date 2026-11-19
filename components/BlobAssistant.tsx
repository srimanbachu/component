'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import MorphBlob, { type MorphBlobHandle } from './MorphBlob';
import MessageList, { type Message } from './MessageList';
import { VoiceEngine, type Status } from '@/lib/voice/VoiceEngine';
import { IntentClassifier } from '@/lib/intent/IntentClassifier';

const HOLD_MS = 350; // pressing the blob longer than this = push-to-talk

export default function BlobAssistant() {
  const blob = useRef<MorphBlobHandle>(null);
  const engine = useRef<VoiceEngine | null>(null);
  const nextId = useRef(1);

  const [status, setStatus] = useState<Status>({ text: 'Loading speech model…', on: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ---------- speech + word understanding ---------- */
  useEffect(() => {
    const intents = new IntentClassifier();

    // each phrase: show it, work out what it means, then let the blob react
    const onPhrase = async (text: string) => {
      const id = nextId.current++;
      setMessages(m => [...m, { id, text, via: 'voice' }]);
      const intent = await intents.classify(text);
      if (intent) setMessages(m => m.map(msg => (msg.id === id ? { ...msg, intent } : msg)));
      blob.current?.react(intent?.id ?? 'heard');
    };

    const e = new VoiceEngine({
      onStatus: setStatus,
      onTranscript: t => setInterim(t.interim),
      onListening: setListening,
      onPhrase,
      // fetch the word model only after Whisper, so the two downloads don't compete
      onReady: () => intents.load(),
    }, { idleMessage: 'Tap or hold the character to speak' });
    engine.current = e;
    e.load();
    return () => { e.dispose(); intents.dispose(); engine.current = null; };
  }, []);

  // smoothed voice level -> blob, every frame
  useEffect(() => {
    let level = 0, raf = 0;
    const frame = () => {
      const e = engine.current;
      const target = e?.wantListening ? e.rawLevel : 0;
      level += (target - level) * (target > level ? 0.25 : 0.06);
      blob.current?.setLevel(level);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------- tap / hold the blob to talk ---------- */
  const press = useRef({ at: 0, startedByPress: false, pressing: false });

  const pressDown = useCallback(() => {
    const p = press.current, e = engine.current;
    if (p.pressing || !e) return;
    p.pressing = true;
    p.at = performance.now();
    p.startedByPress = !e.wantListening;
    blob.current?.press(p.startedByPress && e.modelReady);
    if (p.startedByPress) e.startListening();
  }, []);

  const pressUp = useCallback(() => {
    const p = press.current, e = engine.current;
    if (!p.pressing || !e) return;
    p.pressing = false;
    blob.current?.release();
    const held = performance.now() - p.at >= HOLD_MS;
    if (p.startedByPress ? held : true) e.stopListening();
  }, []);

  // Space = tap/hold, except while typing in a field or focused on a button
  useEffect(() => {
    const ignore = (t: EventTarget | null) => !!(t as Element | null)?.closest?.('input, textarea, button');
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

  const allText = messages.map(m => m.text).join('\n');
  const copy = async () => {
    if (!allText) return;
    try {
      await navigator.clipboard.writeText(allText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked */ }
  };

  return (
    <main className="stage assistant">
      <MorphBlob ref={blob} listening={listening}>
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
        {/* status sits on top of the character instead of between it and the text */}
        <p className={`blob-status${listening ? ' on' : ''}`} role="status">{status.text}</p>
      </MorphBlob>

      <MessageList messages={messages} interim={interim} />

      <div className="controls">
        <button className="chip" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button className="chip" type="button" onClick={() => { setMessages([]); engine.current?.clear(); }}>Clear</button>
      </div>
    </main>
  );
}
