// The *current* incident details view: what every Pulse user sees today.
// While `release-ai-incident-summary` is off (or after a rollback), users get
// this familiar view instead of a placeholder, which is how a dark launch
// should behave: no notice, no gap, just the existing experience.
import { getIncident } from '../../shared/incidents.js';

export default function IncidentDetails({ incidentId }) {
  const incident = getIncident(incidentId);
  if (!incident) return null;
  const started = new Date(incident.startedAt).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  return (
    <div className="panel incident-details">
      <div className="ai-panel-head">
        <h3>Incident details</h3>
        <span className="muted small">{incident.id}</span>
      </div>
      <dl className="facts">
        <div><dt>Status</dt><dd>{incident.status}</dd></div>
        <div><dt>Severity</dt><dd><span className={`sev ${incident.severity}`}>{incident.severity}</span></dd></div>
        <div><dt>Service</dt><dd><code>{incident.service}</code></dd></div>
        <div><dt>Started</dt><dd>{started} UTC</dd></div>
        <div><dt>Users affected</dt><dd>{incident.affectedUsers.toLocaleString()}</dd></div>
      </dl>
      <h4 className="small muted signals-title">Signals</h4>
      <ul className="signal-list">
        {incident.signals.map((s) => (
          <li key={s} className="small">{s}</li>
        ))}
      </ul>
    </div>
  );
}
