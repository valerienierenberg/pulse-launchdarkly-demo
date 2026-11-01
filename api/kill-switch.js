// POST /api/kill-switch: Part 1 "Remediate".
//
// Fires the LaunchDarkly *flag trigger* that turns OFF the release flag.
// A trigger is a secret URL; any POST to it runs its action (here: "turn
// flag off"). Monitoring tools such as Dynatrace, Datadog or LaunchDarkly's own
// observability can call it automatically when an alert fires. This endpoint lets the
// dashboard's "kill switch" button (and its auto-remediation rule) do the same,
// without exposing the secret URL to the browser.
//
// You can also fire the trigger yourself:
//   curl -X POST "$LD_KILL_SWITCH_TRIGGER_URL"      (or: npm run ld:kill)
import { allowMethods, rateLimit } from '../server/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!rateLimit(req, res, { limit: 5 })) return;

  // ⚠️ TRIGGER URL: created by `npm run ld:setup` (or by hand: flag →
  // Settings → Triggers → "Generic trigger", action "Turn the flag off").
  const url = process.env.LD_KILL_SWITCH_TRIGGER_URL;
  if (!url) return res.status(501).json({ error: 'LD_KILL_SWITCH_TRIGGER_URL is not set' });

  const reason = String(req.body?.reason ?? 'manual').slice(0, 120);
  try {
    // Optional JSON body: LaunchDarkly shows it in the flag's change history.
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'pulse-dashboard', reason }),
    });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, reason });
  } catch (err) {
    console.error('[kill-switch] error', err);
    return res.status(502).json({ error: 'Could not reach LaunchDarkly' });
  }
}
