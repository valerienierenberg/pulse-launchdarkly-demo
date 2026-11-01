// ─────────────────────────────────────────────────────────────────────────────
// LaunchDarkly server-side SDK (Node) + AI SDK, created once per process.
// Used by the /api functions (chatbot, incident summaries, server-side flag
// checks) and by scripts/simulate-traffic.js.
// ─────────────────────────────────────────────────────────────────────────────
import { init } from '@launchdarkly/node-server-sdk';
import { initAi } from '@launchdarkly/server-sdk-ai';

let clientPromise;

export function getLdClient() {
  if (!clientPromise) {
    // ⚠️ SDK KEY: set LD_SDK_KEY in .env (local) or in Vercel's project
    // environment variables (deployed). This is the *server-side* SDK key for
    // your environment and must never be sent to the browser.
    const sdkKey = process.env.LD_SDK_KEY;
    if (!sdkKey) {
      clientPromise = Promise.resolve(null);
      console.warn('[ld] LD_SDK_KEY is not set: server-side flags fall back to defaults.');
      return clientPromise;
    }
    const client = init(sdkKey, {
      // Serverless functions are short-lived, so send events quickly.
      flushInterval: 2,
    });
    clientPromise = client
      .waitForInitialization({ timeout: 5 })
      .then(() => client)
      .catch((err) => {
        console.error('[ld] SDK failed to initialize, using defaults:', err.message);
        return client; // still usable; it returns default values
      });
  }
  return clientPromise;
}

let aiClientPromise;
export function getAiClient() {
  if (!aiClientPromise) {
    aiClientPromise = getLdClient().then((ld) => (ld ? initAi(ld) : null));
  }
  return aiClientPromise;
}

// Evaluate a flag server-side. Returns the fallback when LD isn't configured.
export async function variation(flagKey, context, fallback) {
  const ld = await getLdClient();
  if (!ld) return fallback;
  return ld.variation(flagKey, context, fallback);
}

// Serverless functions can freeze right after responding, so we flush
// analytics events (evaluations, AI metrics, custom events) before returning.
export async function flush() {
  const ld = await getLdClient();
  if (ld) await ld.flush().catch(() => {});
}
