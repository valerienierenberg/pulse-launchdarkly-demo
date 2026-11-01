#!/usr/bin/env node
// npm run ld:kill: fires the kill-switch trigger, which turns the
// release-ai-incident-summary flag OFF. Same as:
//   curl -X POST "$LD_KILL_SWITCH_TRIGGER_URL"
const url = process.env.LD_KILL_SWITCH_TRIGGER_URL;
if (!url) {
  console.error('✗ LD_KILL_SWITCH_TRIGGER_URL is not set. Run `npm run ld:setup` first.');
  process.exit(1);
}
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: 'cli', reason: 'manual remediation from the command line' }),
});
console.log(res.ok ? '✓ Trigger fired: the flag is now OFF.' : `✗ Trigger failed: HTTP ${res.status}`);
