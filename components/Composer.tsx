'use client';

import { useState, type FormEvent } from 'react';

type Props = {
  listening: boolean;
  onType: () => void;            // every keystroke (the blob "thinks" while you type)
  onSend: (text: string) => void;
  onMicToggle: () => void;
};

export default function Composer({ listening, onType, onSend, onMicToggle }: Props) {
  const [text, setText] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        className="composer-input"
        value={text}
        onChange={e => { setText(e.target.value); onType(); }}
        placeholder={listening ? 'Listening… or type here' : 'Type a message…'}
        aria-label="Message"
        autoComplete="off"
      />
      <button
        type="button"
        className={`icon-btn mic${listening ? ' on' : ''}`}
        onClick={onMicToggle}
        aria-label={listening ? 'Stop voice input' : 'Start voice input'}
        aria-pressed={listening}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      <button type="submit" className="icon-btn send" aria-label="Send" disabled={!text.trim()}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
