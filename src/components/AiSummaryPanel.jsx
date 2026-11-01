// The new feature that Part 1 releases: an AI-written summary of an incident.
// The prompt and model come from the `pulse-incident-summarizer` AI Config.
import { useEffect, useState } from 'react';
import { useLDClient } from '@launchdarkly/react-sdk';
import { EVENTS } from '../../shared/flags.js';
import { getIncident } from '../../shared/incidents.js';
import Markdownish from './Markdownish.jsx';

export default function AiSummaryPanel({ incidentId, injectErrors }) {
  const client = useLDClient();
  const [state, setState] = useState({ loading: true });
  const incident = getIncident(incidentId);

  useEffect(() => {
    if (injectErrors) return undefined;
    let cancelled = false;
    setState({ loading: true });
    fetch('/api/incident-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incidentId, context: client?.getContext?.() }),
    })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) return setState({ error: body.error ?? 'Request failed' });
        setState({ data: body });
        client?.track(EVENTS.SUMMARY_VIEWED, { incidentId });
      })
      .catch((e) => !cancelled && setState({ error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [incidentId, client, injectErrors]);

  // Simulated bug for the demo (flag: demo-inject-summary-errors).
  if (injectErrors) {
    throw new Error('TypeError: Cannot read properties of undefined (reading "rootCause") in summarizeIncident()');
  }

  return (
    <div className="panel ai-panel fade-in">
      <div className="ai-panel-head">
        <h3>
          <span className="spark">✦</span> AI Incident Summary <span className="badge new">NEW</span>
        </h3>
        <span className="muted small">{incident?.id}</span>
      </div>
      {state.loading && <p className="muted shimmer">Claude is reading the signals…</p>}
      {state.error && <p className="bad">{state.error}</p>}
      {state.data && (
        <>
          <Markdownish text={state.data.text} />
          <p className="meta small">
            Model <code>{state.data.model}</code> · AI Config variation <code>{state.data.variationKey}</code>
            {state.data.mock && ' · mock mode'}
          </p>
        </>
      )}
      <details className="signals">
        <summary className="small">Raw signals ({incident?.signals.length})</summary>
        <ul>{incident?.signals.map((s) => <li key={s} className="small">{s}</li>)}</ul>
      </details>
    </div>
  );
}
