'use client';

import { useLayoutEffect, useRef } from 'react';

import type { IntentResult } from '@/lib/intent/intents';

export type Message = { id: number; text: string; via: 'typed' | 'voice'; intent?: IntentResult };

type Props = { messages: Message[]; interim: string };

/** Spoken messages, newest at the bottom; live voice preview in grey. */
export default function MessageList({ messages, interim }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, interim]);

  return (
    <div className="messages-wrap">
      <div ref={ref} className="messages" aria-live="polite">
        {messages.map(m => (
          <p key={m.id} className={`message ${m.via}`}>
            {m.text}
            {m.intent && <span className="intent" title={`${Math.round(m.intent.score * 100)}% confident`}>{m.intent.caption}</span>}
          </p>
        ))}
        {interim && <p className="message voice interim">{interim}</p>}
      </div>
      {/* progressive blur: text scrolling up melts into a blur instead of fading to white */}
      <div className="messages-blur" aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>
    </div>
  );
}
