// ─────────────────────────────────────────────────────────────────────────────
// Every LaunchDarkly key this app uses, in one place.
// If you create flags by hand instead of running `npm run ld:setup`, create
// them with exactly these keys (see README → "Creating the flags manually").
// ─────────────────────────────────────────────────────────────────────────────

export const FLAGS = {
  // Part 1 (Release & Remediate): boolean flag that wraps the new
  // "AI Incident Summary" panel on the dashboard.
  // ON = released, OFF = rolled back. The kill-switch trigger turns this OFF.
  RELEASE_AI_SUMMARY: 'release-ai-incident-summary',

  // Part 1 helper: boolean "chaos" flag. When ON, the AI Incident Summary
  // panel throws errors, which simulates a bad release that needs remediating.
  INJECT_SUMMARY_ERRORS: 'demo-inject-summary-errors',

  // Part 2 (Target) + Experimentation: string flag around the landing-page
  // hero component. Variations: "classic" | "ai-powered".
  LANDING_HERO: 'landing-hero-redesign',
};

// AI Configs (extra credit). Each one holds the model and prompt.
export const AI_CONFIGS = {
  ASSISTANT: 'pulse-assistant', // chatbot ("ABC Assistant")
  INCIDENT_SUMMARIZER: 'pulse-incident-summarizer', // used by the Part 1 feature
};

// Custom events sent with ldClient.track(). Metrics are built on these.
export const EVENTS = {
  TRIAL_SIGNUP: 'trial-signup-clicked', // primary experiment metric
  SUMMARY_ERROR: 'incident-summary-error', // guarded-rollout / error metric
  SUMMARY_VIEWED: 'incident-summary-viewed',
};
