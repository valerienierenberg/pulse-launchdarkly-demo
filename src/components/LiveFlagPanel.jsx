// "LaunchDarkly live feed": a small panel showing the current value of each
// demo flag for the current context, plus a feed of real-time changes.
// Handy during a demo: flip a flag in LaunchDarkly and watch it land here.
import { useState } from 'react';
import { useBoolVariation, useStringVariation, useLDClient } from '@launchdarkly/react-sdk';
import { FLAGS } from '../../shared/flags.js';
import { useLiveFlagEvents } from '../ld/useLiveFlagEvents.js';

function Row({ flagKey, value }) {
  const on = value === true || value === 'ai-powered';
  return (
    <li>
      <code>{flagKey}</code>
      <span className={`pill ${on ? 'on' : 'off'}`}>{String(value)}</span>
    </li>
  );
}

export default function LiveFlagPanel() {
  const [open, setOpen] = useState(true);
  const client = useLDClient();
  const release = useBoolVariation(FLAGS.RELEASE_AI_SUMMARY, false);
  const inject = useBoolVariation(FLAGS.INJECT_SUMMARY_ERRORS, false);
  const hero = useStringVariation(FLAGS.LANDING_HERO, 'classic');
  const events = useLiveFlagEvents();
  const ctx = client?.getContext?.();
  const userKey = ctx?.kind === 'multi' ? ctx.user?.key : ctx?.key;

  return (
    <aside className={`livepanel ${open ? '' : 'collapsed'}`} aria-label="LaunchDarkly live feed">
      <button className="livepanel-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="dot live" /> LaunchDarkly live feed {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="livepanel-body">
          <p className="muted small">Context: <code>{userKey ?? '…'}</code></p>
          <ul className="flaglist">
            <Row flagKey={FLAGS.RELEASE_AI_SUMMARY} value={release} />
            <Row flagKey={FLAGS.INJECT_SUMMARY_ERRORS} value={inject} />
            <Row flagKey={FLAGS.LANDING_HERO} value={hero} />
          </ul>
          <p className="muted small feed-title">Live changes (no reload)</p>
          <ul className="feed">
            {events.length === 0 && <li className="muted small">Change a flag in LaunchDarkly to see it here.</li>}
            {events.map((e) => (
              <li key={e.id}>
                <time>{e.at.toLocaleTimeString()}</time> <code>{e.key}</code> → <b>{String(e.value)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
