// POST /api/feedback: thumbs up/down on a chatbot answer.
// Rebuilds the AI SDK tracker from the sealed resumption token and records
// feedback against the exact AI Config variation that produced the answer.
import { LDFeedbackKind } from '@launchdarkly/server-sdk-ai';
import { getAiClient, flush } from '../server/ld.js';
import { unseal } from '../server/token.js';
import { allowMethods, rateLimit, readContext } from '../server/http.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!rateLimit(req, res, { limit: 30 })) return;

  const context = readContext(req.body);
  const { feedbackToken, positive } = req.body ?? {};
  if (!context || !feedbackToken) return res.status(400).json({ error: 'Missing context or token' });

  try {
    const aiClient = await getAiClient();
    if (!aiClient) return res.json({ ok: false, reason: 'LaunchDarkly not configured' });
    const tracker = aiClient.createTracker(unseal(feedbackToken), context);
    tracker.trackFeedback({ kind: positive ? LDFeedbackKind.Positive : LDFeedbackKind.Negative });
    await flush();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[feedback] error', err);
    return res.status(400).json({ error: 'Invalid feedback token' });
  }
}
