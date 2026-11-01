#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// npm run ld:traffic -- [--visitors=2000] [--mode=experiment|errors]
//
// Sends synthetic visitors through LaunchDarkly with the Node server SDK so the
// experiment (and guarded rollout) have enough data to make a decision.
//
// mode=experiment (default)
//   Each visitor is evaluated for `landing-hero-redesign`; a share of them then
//   "click Start free trial" (custom event trial-signup-clicked).
//   The simulated conversion rates are set below: AI-powered converts better,
//   so the experiment should show a clear winner once enough visitors arrive.
//
// mode=errors
//   Each visitor is evaluated for `release-ai-incident-summary`; visitors who
//   got the new feature send `incident-summary-error` at ERROR_RATE. Use this
//   while a guarded rollout is running to watch LaunchDarkly detect the
//   regression and roll back by itself.
//
// ⚠️ This is SIMULATED traffic for demo purposes. The numbers are made up.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from 'node:crypto';
import { init } from '@launchdarkly/node-server-sdk';
import { FLAGS, EVENTS } from '../shared/flags.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const VISITORS = Number(args.visitors ?? 2000);
const MODE = args.mode ?? 'experiment';

// Simulated "true" conversion rates per hero variation.
const CONVERSION = { classic: 0.05, 'ai-powered': 0.072 };
const ERROR_RATE = Number(args.errorRate ?? 0.3); // share of new-feature users who hit the bug

if (!process.env.LD_SDK_KEY) {
  console.error('✗ LD_SDK_KEY is not set. Run `npm run ld:setup` first.');
  process.exit(1);
}

// Random visitors who do NOT match the targeting rules (so they fall through
// to the experiment's 50/50 split).
const PLANS = ['free', 'pro'];
const INDUSTRIES = ['software', 'media', 'healthcare', 'education', 'travel'];
const REGIONS = ['NA', 'EU', 'APAC', 'LATAM'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function randomVisitor() {
  const id = randomUUID().slice(0, 8);
  return {
    kind: 'multi',
    user: { key: `sim-user-${id}`, name: `Simulated visitor ${id}`, email: `visitor-${id}@example.com`, simulated: true },
    organization: { key: `sim-org-${id.slice(0, 5)}`, plan: pick(PLANS), industry: pick(INDUSTRIES), region: pick(REGIONS) },
  };
}

const client = init(process.env.LD_SDK_KEY, { flushInterval: 2, capacity: 50000 });
await client.waitForInitialization({ timeout: 10 });
console.log(`Connected. Sending ${VISITORS} simulated visitors (mode: ${MODE})…`);

const tally = {};
for (let i = 0; i < VISITORS; i++) {
  const ctx = randomVisitor();
  if (MODE === 'errors') {
    const on = await client.variation(FLAGS.RELEASE_AI_SUMMARY, ctx, false);
    const key = on ? 'new feature' : 'old experience';
    tally[key] ??= { visitors: 0, errors: 0 };
    tally[key].visitors++;
    if (on && Math.random() < ERROR_RATE) {
      client.track(EVENTS.SUMMARY_ERROR, ctx);
      tally[key].errors++;
    }
  } else {
    const hero = await client.variation(FLAGS.LANDING_HERO, ctx, 'classic');
    tally[hero] ??= { visitors: 0, conversions: 0 };
    tally[hero].visitors++;
    if (Math.random() < (CONVERSION[hero] ?? 0.05)) {
      client.track(EVENTS.TRIAL_SIGNUP, ctx);
      tally[hero].conversions++;
    }
  }
  if ((i + 1) % 500 === 0) {
    await client.flush();
    process.stdout.write(`  ${i + 1}/${VISITORS}\n`);
  }
}

await client.flush();
client.close();
console.table(tally);
console.log('Done. Results appear in LaunchDarkly within a few minutes.');
