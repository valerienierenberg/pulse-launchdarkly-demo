// "ABC Assistant" chatbot (extra credit: AI Configs).
// The server picks the model and prompt from the `pulse-assistant` AI Config
// for the current context. Each answer shows which model/variation was used,
// and thumbs up/down are recorded against that variation in LaunchDarkly.
import { useEffect, useRef, useState } from 'react';
import { useLDClient } from '@launchdarkly/react-sdk';
import Markdownish from './Markdownish.jsx';

const SUGGESTIONS = ['Why is my checkout slow?', 'How do I set up an alert?', 'What does Pulse AI do?'];

export default function Assistant() {
  const client = useLDClient();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: client?.getContext?.(),
          messages: next.map(({ role, content: c }) => ({ role, content: c })),
        }),
      });
      const body = await r.json().catch(() => ({}));
      setMessages((m) => [
        ...m,
        r.ok
          ? { role: 'assistant', content: body.text, meta: body }
          : { role: 'assistant', content: body.error ?? 'Something went wrong.', meta: { error: true } },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: e.message, meta: { error: true } }]);
    } finally {
      setBusy(false);
    }
  }

  async function rate(index, positive) {
    const msg = messages[index];
    if (!msg?.meta?.feedbackToken || msg.rated) return;
    setMessages((m) => m.map((x, i) => (i === index ? { ...x, rated: positive ? 'up' : 'down' } : x)));
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: client?.getContext?.(), feedbackToken: msg.meta.feedbackToken, positive }),
    }).catch(() => {});
  }

  return (
    <div className={`assistant ${open ? 'open' : ''}`}>
      {open && (
        <div className="chat" role="dialog" aria-label="ABC Assistant">
          <header>
            <div>
              <b>ABC Assistant</b>
              <span className="muted small"> · model and prompt managed by a LaunchDarkly AI Config</span>
            </div>
            <button className="icon" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </header>
          <div className="chat-body">
            {messages.length === 0 && (
              <div className="empty">
                <p className="muted">Ask anything about Pulse.</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg from-${m.role} ${m.meta?.error ? 'err' : ''}`}>
                {m.role === 'assistant' ? <Markdownish text={m.content} /> : <p>{m.content}</p>}
                {m.meta?.model && (
                  <div className="msg-meta">
                    <code>{m.meta.model}</code> · <code>{m.meta.variationKey}</code>
                    {m.meta.mock && ' · mock'}
                    {m.meta.feedbackToken && (
                      <span className="rate">
                        <button className={m.rated === 'up' ? 'on' : ''} onClick={() => rate(i, true)} aria-label="Helpful">👍</button>
                        <button className={m.rated === 'down' ? 'on' : ''} onClick={() => rate(i, false)} aria-label="Not helpful">👎</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="msg from-assistant"><p className="muted shimmer">Thinking…</p></div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask ABC Assistant…" maxLength={2000} />
            <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      )}
      <button className="fab" onClick={() => setOpen(!open)} aria-label="Open ABC Assistant">
        {open ? '✕' : '✦ Ask AI'}
      </button>
    </div>
  );
}
