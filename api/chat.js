// POST /api/chat: "ABC Assistant" chatbot (extra credit: AI Configs).
// The model and system prompt come from the `pulse-assistant` AI Config, so
// you can switch models or prompts in LaunchDarkly without a deploy.
import { AI_CONFIGS } from '../shared/flags.js';
import { describeContext } from '../shared/personas.js';
import { runAiConfig } from '../server/llm.js';
import { flush } from '../server/ld.js';
import { allowMethods, rateLimit, readContext } from '../server/http.js';

// Used only if LaunchDarkly can't be reached. The setup script creates the
// real variations (see scripts/ld-setup.js).
const FALLBACK = {
  enabled: true,
  model: { name: 'claude-haiku-5-5', parameters: { maxTokens: 1024, effort: 'low' } },
  provider: { name: 'anthropic' },
  messages: [
    {
      role: 'system',
      content:
        'You are ABC Assistant, the support assistant for Pulse, a website and app monitoring product. Be brief and practical.',
    },
  ],
};

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!rateLimit(req, res, { limit: 15 })) return;

  const context = readContext(req.body);
  if (!context) return res.status(400).json({ error: 'Missing LaunchDarkly context' });

  // Keep the last few turns and cap message length (cost guard for a public demo).
  const history = Array.isArray(req.body.messages) ? req.body.messages.slice(-8) : [];
  const messages = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length || messages.at(-1).role !== 'user') {
    return res.status(400).json({ error: 'The last message must be from the user' });
  }

  try {
    const result = await runAiConfig({
      configKey: AI_CONFIGS.ASSISTANT,
      context,
      fallback: FALLBACK,
      // Fills {{userName}}, {{company}}, {{plan}}… in the AI Config's prompt.
      variables: describeContext(context),
      messages,
      mockReply:
        '(Mock reply: no `ANTHROPIC_API_KEY` is set.) In a real setup I would answer using the model and prompt from the pulse-assistant AI Config.',
    });
    await flush();
    if (!result.enabled) {
      return res.json({
        disabled: true,
        text: 'The assistant is switched off right now (AI Config disabled in LaunchDarkly).',
      });
    }
    return res.json(result);
  } catch (err) {
    console.error('[chat] error', err);
    await flush();
    return res.status(502).json({ error: 'The AI provider returned an error. Try again.' });
  }
}
