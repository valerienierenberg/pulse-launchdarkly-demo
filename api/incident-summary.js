// POST /api/incident-summary: the new feature behind the Part 1 release flag.
//
// The browser hides the panel when the flag is off, but we also check the
// flag here on the server. A flag should guard the backend too, so turning
// it off really stops the feature (and its AI spend), not just the UI.
import { FLAGS, AI_CONFIGS } from '../shared/flags.js';
import { getIncident } from '../shared/incidents.js';
import { describeContext } from '../shared/personas.js';
import { runAiConfig } from '../server/llm.js';
import { variation, flush } from '../server/ld.js';
import { allowMethods, rateLimit, readContext } from '../server/http.js';

const FALLBACK = {
  enabled: true,
  model: { name: 'claude-haiku-5-5', parameters: { maxTokens: 1024, effort: 'low' } },
  provider: { name: 'anthropic' },
  messages: [
    {
      role: 'system',
      content:
        'You summarize monitoring incidents for busy engineers. Reply with: What happened, Likely cause, Impact, Next steps. Max 120 words.',
    },
  ],
};

function mockSummary(incident) {
  return [
    `**What happened:** ${incident.title} on ${incident.service}.`,
    `**Likely cause:** ${incident.signals[2] ?? incident.signals[0]}.`,
    `**Impact:** about ${incident.affectedUsers.toLocaleString()} users affected.`,
    '**Next steps:** roll back the most recent change and watch error rate and latency.',
    '_(Mock summary: no ANTHROPIC_API_KEY set.)_',
  ].join('\n');
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!rateLimit(req, res, { limit: 20 })) return;

  const context = readContext(req.body);
  const incident = getIncident(req.body?.incidentId);
  if (!context || !incident) return res.status(400).json({ error: 'Missing context or unknown incident' });

  // Server-side check of the same release flag the UI uses.
  const released = await variation(FLAGS.RELEASE_AI_SUMMARY, context, false);
  if (!released) {
    await flush();
    return res.status(403).json({ error: 'AI Incident Summary is not released for this user.' });
  }

  try {
    const result = await runAiConfig({
      configKey: AI_CONFIGS.INCIDENT_SUMMARIZER,
      context,
      fallback: FALLBACK,
      variables: describeContext(context),
      messages: [
        {
          role: 'user',
          content: `Summarize this incident.\n\n${JSON.stringify(incident, null, 2)}`,
        },
      ],
      mockReply: mockSummary(incident),
    });
    await flush();
    if (!result.enabled) return res.status(503).json({ error: 'Summarizer AI Config is disabled.' });
    return res.json(result);
  } catch (err) {
    console.error('[incident-summary] error', err);
    await flush();
    return res.status(502).json({ error: 'The AI provider returned an error.' });
  }
}
