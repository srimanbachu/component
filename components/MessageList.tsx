'use client';

import { useLayoutEffect, useRef } from 'react';

export type Message = { id: number; text: string; via: 'typed' | 'voice' };

type Props = { messages: Message[]; interim: string };

/** Your typed and spoken messages, newest at the bottom; live voice preview in grey. */
export default function MessageList({ messages, interim }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, interim]);

  const empty = messages.length === 0 && !interim;
  return (
    <div ref={ref} className="messages" aria-live="polite">
      {empty && <p className="placeholder">Type below or tap the mic. Your words appear here.</p>}
      {messages.map(m => (
        <p key={m.id} className={`message ${m.via}`}>
          <span className="via" aria-label={m.via === 'voice' ? 'spoken' : 'typed'}>{m.via === 'voice' ? '🎙' : '⌨'}</span>
          {m.text}
        </p>
      ))}
      {interim && <p className="message voice interim"><span className="via">🎙</span>{interim}</p>}
    </div>
  );
}
