'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import MorphBlob, { type MorphBlobHandle } from './MorphBlob';
import MessageList, { type Message } from './MessageList';
import Composer from './Composer';
import { VoiceEngine, type Status } from '@/lib/voice/VoiceEngine';

const HOLD_MS = 350; // pressing the blob longer than this = push-to-talk

export default function BlobAssistant() {
  const blob = useRef<MorphBlobHandle>(null);
  const engine = useRef<VoiceEngine | null>(null);
  const nextId = useRef(1);

  const [status, setStatus] = useState<Status>({ text: 'Loading speech model…', on: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(true);
  const [copied, setCopied] = useState(false);

  const addMessage = useCallback((text: string, via: Message['via']) => {
    setMessages(m => [...m, { id: nextId.current++, text, via }]);
  }, []);

  /* ---------- voice engine ---------- */
  useEffect(() => {
    const e = new VoiceEngine({
      onStatus: setStatus,
      onTranscript: t => setInterim(t.interim),
      onListening: setListening,
      onPhrase: text => {
        addMessage(text, 'voice');
        blob.current?.react('heard');
      },
    }, { idleMessage: 'Tap the character or the mic to speak' });
    engine.current = e;
    e.load();
    return () => { e.dispose(); engine.current = null; };
  }, [addMessage]);

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

  /* ---------- composer ---------- */
  const send = (text: string) => {
    addMessage(text, 'typed');
    blob.current?.react(text.endsWith('?') ? 'question' : 'sent');
  };

  const toggleMic = () => {
    const e = engine.current;
    if (!e) return;
    if (e.wantListening) e.stopListening();
    else e.startListening();
  };

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
      <MorphBlob ref={blob} listening={listening} onIntroEnd={() => setIntroPlaying(false)}>
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
      </MorphBlob>

      <p className={`status${status.on ? ' on' : ''}`}>{status.text}</p>

      <MessageList messages={messages} interim={interim} />

      <div className="controls">
        {introPlaying
          ? <button className="chip" type="button" onClick={() => blob.current?.skipIntro()}>Skip intro</button>
          : <button className="chip" type="button" onClick={() => { blob.current?.playIntro(); setIntroPlaying(true); }}>Replay intro</button>}
        <button className="chip" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button className="chip" type="button" onClick={() => { setMessages([]); engine.current?.clear(); }}>Clear</button>
      </div>

      <Composer
        listening={listening}
        onType={() => blob.current?.noteTyping()}
        onSend={send}
        onMicToggle={toggleMic}
      />
    </main>
  );
}
