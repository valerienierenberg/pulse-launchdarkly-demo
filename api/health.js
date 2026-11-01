// GET /api/health: shows which integrations are configured (no secrets).
export default function handler(req, res) {
  res.json({
    ok: true,
    launchDarklyServerSdk: Boolean(process.env.LD_SDK_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    killSwitchTrigger: Boolean(process.env.LD_KILL_SWITCH_TRIGGER_URL),
  });
}
