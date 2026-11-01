// ─────────────────────────────────────────────────────────────────────────────
// Pulse dashboard: Part 1 (Release & Remediate) + Observability.
//
//  • `release-ai-incident-summary` wraps the new AI Incident Summary panel.
//    useBoolVariation() subscribes to live flag updates, so toggling the flag
//    in LaunchDarkly shows or hides the panel instantly, with no page reload.
//  • `demo-inject-summary-errors` simulates a bad release: the panel throws.
//    Errors are sent to LaunchDarkly Observability (LDObserve.recordError) and
//    as a custom event (incident-summary-error) for guarded rollouts.
//  • Remediate: the "Kill switch" button and the auto-remediation rule call
//    /api/kill-switch, which POSTs to the flag's trigger URL → flag OFF.
// ─────────────────────────────────────────────────────────────────────────────
import { Component, useEffect, useRef, useState } from 'react';
import { useBoolVariation, useLDClient } from '@launchdarkly/react-sdk';
import { LDObserve } from '@launchdarkly/observability';
import { FLAGS, EVENTS } from '../../shared/flags.js';
import { INCIDENTS } from '../../shared/incidents.js';
import AiSummaryPanel from '../components/AiSummaryPanel.jsx';
import IncidentDetails from '../components/IncidentDetails.jsx';

const ERROR_THRESHOLD = 3; // errors…
const ERROR_WINDOW_MS = 30_000; // …within 30 seconds → auto-remediate

// Catches errors from the new feature so one bad component can't take down
// the whole dashboard, and reports them.
class FeatureErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    this.props.onError?.(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="panel error-panel">
          <h3>⚠️ AI Incident Summary crashed</h3>
          <p className="muted">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function Sparkline({ points, color }) {
  const max = Math.max(...points);
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 100},${30 - (p / max) * 28}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="spark">
      <polyline points={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Dashboard() {
  const client = useLDClient();
  const released = useBoolVariation(FLAGS.RELEASE_AI_SUMMARY, false);
  const injectErrors = useBoolVariation(FLAGS.INJECT_SUMMARY_ERRORS, false);

  const [selected, setSelected] = useState(INCIDENTS[0].id);
  const [autoRemediate, setAutoRemediate] = useState(true);
  const [errorTimes, setErrorTimes] = useState([]);
  const [remediation, setRemediation] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const firing = useRef(false);

  // While the bug is "live", the panel re-mounts every 4s (like users
  // refreshing it), so errors keep coming until someone remediates.
  useEffect(() => {
    if (!released || !injectErrors) return undefined;
    const t = setInterval(() => setResetKey((k) => k + 1), 4000);
    return () => clearInterval(t);
  }, [released, injectErrors]);

  // Clear the error counter once the feature is rolled back or fixed.
  useEffect(() => {
    if (!released || !injectErrors) setErrorTimes([]);
    if (released) firing.current = false;
  }, [released, injectErrors]);

  function reportError(error) {
    LDObserve.recordError(error, 'AI Incident Summary failed', { feature: FLAGS.RELEASE_AI_SUMMARY });
    client?.track(EVENTS.SUMMARY_ERROR, { message: error.message });
    setErrorTimes((prev) => [...prev.filter((t) => Date.now() - t < ERROR_WINDOW_MS), Date.now()]);
  }

  async function killSwitch(reason) {
    if (firing.current) return;
    firing.current = true;
    setRemediation({ state: 'firing', reason, at: new Date() });
    try {
      const r = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const body = await r.json().catch(() => ({}));
      setRemediation({ state: r.ok ? 'fired' : 'failed', reason, at: new Date(), detail: body.error });
      if (!r.ok) firing.current = false;
    } catch (e) {
      setRemediation({ state: 'failed', reason, at: new Date(), detail: e.message });
      firing.current = false;
    }
  }

  // Auto-remediation: the kind of rule you'd set up in a monitoring tool.
  // Too many errors in the window → fire the LaunchDarkly trigger.
  const recentErrors = errorTimes.filter((t) => Date.now() - t < ERROR_WINDOW_MS).length;
  useEffect(() => {
    if (autoRemediate && released && recentErrors >= ERROR_THRESHOLD) {
      killSwitch(`auto: ${recentErrors} errors in ${ERROR_WINDOW_MS / 1000}s`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentErrors, autoRemediate, released]);

  return (
    <div className="dashboard">
      <section className="kpis">
        {[
          ['Experience score', '96.8', [90, 92, 95, 94, 96, 97, 96, 97], 'var(--good)'],
          ['p95 page load', '1.9s', [2.4, 2.2, 2.6, 2.1, 1.9, 2.0, 1.8, 1.9], 'var(--accent-2)'],
          ['JS error rate', recentErrors ? `${(0.4 + recentErrors * 1.7).toFixed(1)}%` : '0.4%', [1, 0.6, 0.8, 0.5, 0.4, 0.5, 0.4, recentErrors ? 6 : 0.4], recentErrors ? 'var(--bad)' : 'var(--accent)'],
          ['Sessions (24h)', '412k', [300, 320, 380, 360, 400, 410, 405, 412], 'var(--accent)'],
        ].map(([label, value, pts, color]) => (
          <article key={label} className="card kpi">
            <span className="muted small">{label}</span>
            <strong>{value}</strong>
            <Sparkline points={pts} color={color} />
          </article>
        ))}
      </section>

      <div className="dash-grid">
        <section className="panel">
          <h2>Incidents</h2>
          <ul className="incidents">
            {INCIDENTS.map((inc) => (
              <li key={inc.id}>
                <button className={selected === inc.id ? 'active' : ''} onClick={() => setSelected(inc.id)}>
                  <span className={`sev ${inc.severity}`}>{inc.severity}</span>
                  <span className="inc-title">{inc.title}</span>
                  <span className="muted small">{inc.id} · {inc.status} · {inc.affectedUsers.toLocaleString()} users</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="feature-slot">
          {/* Demo annotation (not product UI): shows which experience the flag is serving. */}
          <div className="flag-callout demo-tag">
            <code>{FLAGS.RELEASE_AI_SUMMARY}</code> = <b>{String(released)}</b>
            <span className="muted"> · showing {released ? 'the new AI Incident Summary' : 'the current experience'}</span>
          </div>
          {released ? (
            <FeatureErrorBoundary key={`${resetKey}-${injectErrors}`} onError={reportError}>
              <AiSummaryPanel incidentId={selected} injectErrors={injectErrors} />
            </FeatureErrorBoundary>
          ) : (
            <IncidentDetails incidentId={selected} />
          )}

          <div className="panel remediation">
            <h3>Release safety</h3>
            <p className="muted small">
              Errors from the new feature (last 30s): <b className={recentErrors ? 'bad' : ''}>{recentErrors}</b> /{' '}
              {ERROR_THRESHOLD} limit
            </p>
            <label className="check">
              <input type="checkbox" checked={autoRemediate} onChange={(e) => setAutoRemediate(e.target.checked)} />
              Auto-remediate: fire the LaunchDarkly trigger when errors pass the limit
            </label>
            <button className="btn danger" disabled={!released} onClick={() => killSwitch('manual kill switch')}>
              🛑 Kill switch: turn the feature off
            </button>
            {remediation && (
              <p className={`small status ${remediation.state}`}>
                {remediation.state === 'firing' && 'Firing LaunchDarkly trigger…'}
                {remediation.state === 'fired' &&
                  `Trigger fired at ${remediation.at.toLocaleTimeString()} (${remediation.reason}). LaunchDarkly turned the flag off.`}
                {remediation.state === 'failed' && `Trigger failed: ${remediation.detail ?? 'unknown error'}`}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
