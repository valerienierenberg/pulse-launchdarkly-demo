// ─────────────────────────────────────────────────────────────────────────────
// Runs a prompt through Claude, using the model + prompt that a LaunchDarkly
// AI Config says to use for this context.
//
//   1. aiClient.completionConfig(key, context, fallback, variables)
//        → LaunchDarkly picks the variation (model, system prompt, params)
//          based on the AI Config's targeting rules.
//   2. We call Anthropic with exactly that model and those messages.
//   3. tracker.trackMetricsOf(...) records duration, tokens and success/error
//      against that variation, so they show up on the AI Config's Monitoring
//      tab and can be used as experiment metrics.
//
// If ANTHROPIC_API_KEY is missing, we return a canned "mock" answer so the
// demo still runs (the LaunchDarkly side still works and is still tracked).
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import { getAiClient } from './ld.js';
import { seal } from './token.js';

let anthropic;
function getAnthropic() {
  // ⚠️ API KEY: set ANTHROPIC_API_KEY in .env (local) or in Vercel's
  // environment variables (deployed). Never commit it.
  if (!process.env.ANTHROPIC_API_KEY) return null;
  anthropic ??= new Anthropic();
  return anthropic;
}

// Turn the Anthropic response into the metrics shape the LD AI SDK expects.
function toLdMetrics(response) {
  return {
    success: response?.stop_reason !== 'refusal',
    usage: {
      input: response?.usage?.input_tokens ?? 0,
      output: response?.usage?.output_tokens ?? 0,
      total: (response?.usage?.input_tokens ?? 0) + (response?.usage?.output_tokens ?? 0),
    },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.configKey        AI Config key in LaunchDarkly
 * @param {object} opts.context          LaunchDarkly context
 * @param {object} opts.fallback         Used if LaunchDarkly can't be reached
 * @param {object} opts.variables        Values for {{placeholders}} in the prompt
 * @param {Array}  opts.messages         Conversation turns ({role, content})
 * @param {string} opts.mockReply        Returned when there's no Anthropic key
 */
export async function runAiConfig({ configKey, context, fallback, variables, messages, mockReply }) {
  const aiClient = await getAiClient();

  // Ask LaunchDarkly which model + prompt to use for this context.
  const config = aiClient
    ? await aiClient.completionConfig(configKey, context, fallback, variables)
    : { ...fallback, enabled: fallback.enabled, createTracker: () => null };

  if (!config.enabled) {
    // The AI Config is switched off (or targeted "disabled") for this context.
    // That makes it a kill switch for the AI feature too.
    return { enabled: false };
  }

  const tracker = config.createTracker?.() ?? null;
  const trackData = tracker?.getTrackData?.() ?? {};
  const modelName = config.model?.name ?? fallback.model.name;
  const params = { ...(fallback.model?.parameters ?? {}), ...(config.model?.parameters ?? {}) };

  // Prompt messages from the AI Config: "system" ones become the system
  // prompt; anything else is added before the live conversation.
  const configMessages = config.messages ?? [];
  const system = configMessages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const preamble = configMessages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const client = getAnthropic();
  let text;
  let usage = null;
  let mock = false;

  if (!client) {
    mock = true;
    text = mockReply;
    tracker?.trackSuccess();
  } else {
    const request = {
      model: modelName,
      // Model parameters can be edited in the LaunchDarkly UI per variation.
      // Note: current Claude models reject temperature/top_p/top_k, so we
      // only pass max_tokens and effort.
      max_tokens: Number(params.maxTokens ?? params.max_tokens ?? 2048),
      system: system || undefined,
      messages: [...preamble, ...messages],
      output_config: { effort: params.effort ?? 'low' },
    };
    const call = () => client.messages.create(request);
    const response = tracker ? await tracker.trackMetricsOf(toLdMetrics, call) : await call();

    if (response.stop_reason === 'refusal') {
      text = "Sorry, I can't help with that one. Try asking about Pulse monitoring, alerts or incidents.";
    } else {
      text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    }
    usage = response.usage;
  }

  return {
    enabled: true,
    text,
    mock,
    model: modelName,
    variationKey: trackData.variationKey ?? 'fallback',
    configVersion: trackData.version ?? null,
    usage: usage && { input: usage.input_tokens, output: usage.output_tokens },
    // Opaque token the browser sends back with thumbs up/down feedback.
    feedbackToken: tracker?.resumptionToken ? seal(tracker.resumptionToken) : null,
  };
}
