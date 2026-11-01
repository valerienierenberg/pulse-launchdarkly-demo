#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// npm run ld:setup
//
// Creates everything this demo needs in LaunchDarkly, using the REST API:
//   • project "pulse-demo" (with production + test environments)
//   • flags: release-ai-incident-summary, demo-inject-summary-errors,
//            landing-hero-redesign (with individual + rule-based targeting)
//   • a flag trigger (kill switch) that turns the release flag OFF
//   • metrics: trial-signup-clicked, incident-summary-error
//   • AI model configs + AI Configs: pulse-assistant, pulse-incident-summarizer
//   • an experiment on landing-hero-redesign (started)
// …and writes the client-side ID, SDK key and trigger URL into .env.
//
// Safe to re-run: anything that already exists is left alone.
// Needs LD_API_TOKEN in .env (Writer or Admin role).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import { FLAGS, AI_CONFIGS, EVENTS } from '../shared/flags.js';

const TOKEN = process.env.LD_API_TOKEN;
const PROJECT = process.env.LD_PROJECT_KEY || 'pulse-demo';
const ENV = process.env.LD_ENV_KEY || 'production';
const BASE = process.env.LD_BASE_URL || 'https://app.launchdarkly.com';
const EXPERIMENT_KEY = 'landing-hero-trial-signups';

if (!TOKEN) {
  console.error('✗ LD_API_TOKEN is not set. Add it to .env (see .env.example) and run again.');
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const ok = (m) => console.log(`  ✓ ${m}`);
const skip = (m) => console.log(`  ↷ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const step = (m) => console.log(`\n▸ ${m}`);

async function api(method, path, body, { semantic = false, beta = false, allow = [] } = {}) {
  const headers = {
    Authorization: TOKEN,
    'Content-Type': semantic ? 'application/json; domain-model=launchdarkly.semanticpatch' : 'application/json',
  };
  if (beta) headers['LD-API-Version'] = 'beta';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 2) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok && !allow.includes(res.status)) {
      const err = new Error(`${method} ${path} → ${res.status}: ${json?.message ?? text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return { status: res.status, data: json };
  }
  throw new Error(`${method} ${path} → rate limited too many times`);
}
function safeJson(t) {
  try {
    return JSON.parse(t);
  } catch {
    return { message: t };
  }
}

// Update (or add) KEY=value lines in .env without touching anything else.
function writeEnv(values) {
  const file = '.env';
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fs.readFileSync('.env.example', 'utf8');
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    const line = `${k}=${v}`;
    text = new RegExp(`^${k}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${k}=.*$`, 'm'), line) : `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(file, text);
}

// ── 1. Project + environment keys ────────────────────────────────────────────
async function ensureProject() {
  step(`Project "${PROJECT}"`);
  const existing = await api('GET', `/api/v2/projects/${PROJECT}`, null, { allow: [404] });
  if (existing.status === 404) {
    await api('POST', '/api/v2/projects', {
      key: PROJECT,
      name: 'Pulse by ABC Company (demo)',
      tags: ['se-demo'],
      // New flags in this project are readable by the browser SDK by default.
      defaultClientSideAvailability: { usingEnvironmentId: true, usingMobileKey: false },
    });
    ok('created project (with production and test environments)');
  } else {
    skip('project already exists');
  }
  const env = (await api('GET', `/api/v2/projects/${PROJECT}/environments/${ENV}`)).data;
  writeEnv({ VITE_LD_CLIENT_SIDE_ID: env._id, LD_SDK_KEY: env.apiKey, LD_PROJECT_KEY: PROJECT, LD_ENV_KEY: ENV });
  ok(`wrote client-side ID and SDK key for "${ENV}" to .env`);
}

// ── 2. Flags ─────────────────────────────────────────────────────────────────
async function getFlag(key) {
  const r = await api('GET', `/api/v2/flags/${PROJECT}/${key}?env=${ENV}`, null, { allow: [404] });
  return r.status === 404 ? null : r.data;
}

async function ensureFlag(def) {
  const existing = await getFlag(def.key);
  if (existing) {
    skip(`flag ${def.key} already exists`);
    return { flag: existing, created: false };
  }
  await api('POST', `/api/v2/flags/${PROJECT}`, {
    ...def,
    clientSideAvailability: { usingEnvironmentId: true, usingMobileKey: false },
  });
  ok(`created flag ${def.key}`);
  return { flag: await getFlag(def.key), created: true };
}

const variationId = (flag, value) => flag.variations.find((v) => v.value === value)?._id;

async function patchFlag(key, instructions, comment) {
  await api('PATCH', `/api/v2/flags/${PROJECT}/${key}`, { environmentKey: ENV, comment, instructions }, { semantic: true });
}

async function setupFlags() {
  step('Feature flags');

  // Part 1: release flag. Starts OFF; you "release" it in the demo.
  await ensureFlag({
    key: FLAGS.RELEASE_AI_SUMMARY,
    name: 'Release: AI Incident Summary',
    description: 'Part 1. Wraps the new AI Incident Summary panel on the Pulse dashboard. ON = released, OFF = rolled back. A flag trigger (kill switch) turns it off.',
    tags: ['part-1', 'release', 'ai'],
    temporary: true,
    variations: [
      { value: true, name: 'Released', description: 'Show the AI Incident Summary' },
      { value: false, name: 'Rolled back', description: 'Hide it (old experience)' },
    ],
    defaults: { onVariation: 0, offVariation: 1 },
  });

  // Part 1 helper: simulated bad release.
  await ensureFlag({
    key: FLAGS.INJECT_SUMMARY_ERRORS,
    name: 'Demo: inject errors into AI Incident Summary',
    description: 'Demo only. When ON, the AI Incident Summary panel throws errors, which simulates a bad release that needs remediating.',
    tags: ['part-1', 'demo-chaos'],
    temporary: true,
    variations: [
      { value: true, name: 'Inject errors' },
      { value: false, name: 'Healthy' },
    ],
    defaults: { onVariation: 0, offVariation: 1 },
  });

  // Part 2: landing hero, with individual + rule-based targeting.
  const { flag: hero, created } = await ensureFlag({
    key: FLAGS.LANDING_HERO,
    name: 'Landing page: hero redesign',
    description: 'Part 2 + Experimentation. Chooses which hero component the landing page shows: "classic" (control) or "ai-powered" (new).',
    tags: ['part-2', 'landing-page', 'experiment'],
    temporary: true,
    variations: [
      { value: 'classic', name: 'Classic hero', description: 'Current landing hero (control)' },
      { value: 'ai-powered', name: 'AI-powered hero', description: 'Redesigned hero (treatment)' },
    ],
    defaults: { onVariation: 0, offVariation: 0 },
  });

  if (created) {
    const AI = variationId(hero, 'ai-powered');
    await patchFlag(
      FLAGS.LANDING_HERO,
      [
        { kind: 'turnFlagOn' },
        // Individual targeting: Sam always gets the new hero.
        { kind: 'addTargets', contextKind: 'user', variationId: AI, values: ['user-sam-okafor'] },
        // Rule 1: internal ABC Company staff (dogfooding).
        {
          kind: 'addRule',
          description: 'Internal ABC Company staff',
          variationId: AI,
          clauses: [{ contextKind: 'user', attribute: 'email', op: 'endsWith', values: ['@abc-company.com'], negate: false }],
        },
        // Rule 2: enterprise orgs in retail or finance.
        {
          kind: 'addRule',
          description: 'Enterprise orgs in retail or finance',
          variationId: AI,
          clauses: [
            { contextKind: 'organization', attribute: 'plan', op: 'in', values: ['enterprise'], negate: false },
            { contextKind: 'organization', attribute: 'industry', op: 'in', values: ['retail', 'finance'], negate: false },
          ],
        },
      ],
      'Pulse demo setup: individual + rule-based targeting',
    );
    ok('landing-hero-redesign: ON · Sam targeted individually · 2 rules · everyone else → classic');
  }
}

// ── 3. Kill-switch trigger ───────────────────────────────────────────────────
async function setupTrigger() {
  step('Flag trigger (kill switch)');
  if (process.env.LD_KILL_SWITCH_TRIGGER_URL) {
    skip('LD_KILL_SWITCH_TRIGGER_URL already set in .env');
    return;
  }
  // The full trigger URL is only returned when the trigger is created.
  const { data } = await api('POST', `/api/v2/flags/${PROJECT}/${FLAGS.RELEASE_AI_SUMMARY}/triggers/${ENV}`, {
    integrationKey: 'generic-trigger',
    instructions: [{ kind: 'turnFlagOff' }],
    comment: 'Kill switch for the AI Incident Summary. Fired by the dashboard, curl, or a monitoring alert.',
  });
  writeEnv({ LD_KILL_SWITCH_TRIGGER_URL: data.triggerURL });
  ok('created "turn flag off" trigger; URL written to .env (keep it secret)');
}

// ── 4. Metrics ───────────────────────────────────────────────────────────────
async function ensureMetric(def) {
  const r = await api('GET', `/api/v2/metrics/${PROJECT}/${def.key}`, null, { allow: [404] });
  if (r.status !== 404) return skip(`metric ${def.key} already exists`);
  await api('POST', `/api/v2/metrics/${PROJECT}`, def);
  ok(`created metric ${def.key}`);
}

async function setupMetrics() {
  step('Metrics');
  await ensureMetric({
    key: EVENTS.TRIAL_SIGNUP,
    name: 'Trial signup clicked',
    description: 'Conversion: the visitor clicked a "Start free trial" button on the landing page.',
    kind: 'custom',
    eventKey: EVENTS.TRIAL_SIGNUP,
    isNumeric: false,
    successCriteria: 'HigherThanBaseline',
    randomizationUnits: ['user'],
    tags: ['experiment', 'landing-page'],
  });
  await ensureMetric({
    key: EVENTS.SUMMARY_ERROR,
    name: 'AI Incident Summary errors',
    description: 'Conversion (lower is better): the AI Incident Summary threw an error for this user. Use in a guarded rollout.',
    kind: 'custom',
    eventKey: EVENTS.SUMMARY_ERROR,
    isNumeric: false,
    successCriteria: 'LowerThanBaseline',
    randomizationUnits: ['user'],
    tags: ['guardrail', 'part-1'],
  });
}

// ── 5. AI Configs ────────────────────────────────────────────────────────────
const MODELS = [
  // Prices are USD per token, used by LaunchDarkly to estimate cost per variation.
  { key: 'anthropic-claude-haiku-5-5', id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', in: 0.0000001, out: 0.0000005 },
  { key: 'anthropic-claude-sonnet-5-5', id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', in: 0.000002, out: 0.00001 },
];

const ASSISTANT_PROMPT_CONCISE = `You are ABC Assistant, the in-product support assistant for Pulse, ABC Company's website and app monitoring product (real user monitoring, session replay, release tracking, smart alerts, and Pulse AI incident summaries).
You are talking to {{userName}} ({{role}}) at {{company}}, on the {{plan}} plan.
Answer in 3 sentences or fewer. Be practical. If you don't know something about their account, say so and suggest where to look in Pulse.`;

const ASSISTANT_PROMPT_DETAILED = `You are ABC Assistant, a senior reliability engineer who supports Pulse customers. Pulse is ABC Company's website and app monitoring product (real user monitoring, Core Web Vitals, session replay, release tracking, smart alerts, and Pulse AI incident summaries).
You are talking to {{userName}} ({{role}}) at {{company}}, an {{industry}} company on the {{plan}} plan. They get priority support.
Give a short diagnosis first, then numbered troubleshooting steps that reference Pulse features by name. Suggest a feature-flag rollback when a recent release is the likely cause. Keep it under 180 words.`;

const SUMMARIZER_PROMPT = `You summarize monitoring incidents for busy engineers.
Reply in exactly four short labelled lines: **What happened**, **Likely cause**, **Impact**, **Next steps**.
Use only the signals provided; do not invent numbers. Max 110 words.`;

async function ensureModelConfig(m) {
  const r = await api('GET', `/api/v2/projects/${PROJECT}/ai-configs/model-configs/${m.key}`, null, { allow: [404] });
  if (r.status !== 404) return skip(`model config ${m.key} already exists`);
  await api('POST', `/api/v2/projects/${PROJECT}/ai-configs/model-configs`, {
    key: m.key,
    id: m.id,
    name: m.name,
    provider: 'Anthropic',
    params: { maxTokens: 1024 },
    costPerInputToken: m.in,
    costPerOutputToken: m.out,
  });
  ok(`created model config ${m.name}`);
}

async function getAiConfig(key) {
  const r = await api('GET', `/api/v2/projects/${PROJECT}/ai-configs/${key}`, null, { allow: [404] });
  return r.status === 404 ? null : r.data;
}

async function ensureAiConfig({ key, name, description, variations }) {
  let cfg = await getAiConfig(key);
  if (!cfg) {
    await api('POST', `/api/v2/projects/${PROJECT}/ai-configs`, { key, name, description, mode: 'completion', tags: ['ai-configs'] });
    ok(`created AI Config ${key}`);
    cfg = await getAiConfig(key);
  } else {
    skip(`AI Config ${key} already exists`);
  }
  const have = new Set((cfg.variations ?? []).map((v) => v.key));
  for (const v of variations) {
    if (have.has(v.key)) continue;
    await api('POST', `/api/v2/projects/${PROJECT}/ai-configs/${key}/variations`, v);
    ok(`  added variation ${v.key}`);
  }
  return getAiConfig(key);
}

const aiVariationId = (cfg, vKey) => cfg.variations.find((v) => v.key === vKey)?._id;

async function setupAiConfigs() {
  step('AI Configs');
  for (const m of MODELS) await ensureModelConfig(m);

  const assistant = await ensureAiConfig({
    key: AI_CONFIGS.ASSISTANT,
    name: 'ABC Assistant (chatbot)',
    description: 'Model and prompt for the Pulse support chatbot. Free/pro users get the concise Haiku variation; enterprise users get the detailed Sonnet variation.',
    variations: [
      {
        key: 'concise-haiku',
        name: 'Concise · Haiku 5.5',
        modelConfigKey: 'anthropic-claude-haiku-5-5',
        model: { name: 'claude-haiku-5-5', parameters: { maxTokens: 1024, effort: 'low' } },
        messages: [{ role: 'system', content: ASSISTANT_PROMPT_CONCISE }],
      },
      {
        key: 'detailed-sonnet',
        name: 'Detailed troubleshooter · Sonnet 5.5',
        modelConfigKey: 'anthropic-claude-sonnet-5-5',
        model: { name: 'claude-sonnet-5-5', parameters: { maxTokens: 2048, effort: 'low' } },
        messages: [{ role: 'system', content: ASSISTANT_PROMPT_DETAILED }],
      },
      {
        key: 'detailed-haiku',
        name: 'Detailed troubleshooter · Haiku 5.5',
        modelConfigKey: 'anthropic-claude-haiku-5-5',
        model: { name: 'claude-haiku-5-5', parameters: { maxTokens: 2048, effort: 'low' } },
        messages: [{ role: 'system', content: ASSISTANT_PROMPT_DETAILED }],
      },
    ],
  });

  const summarizer = await ensureAiConfig({
    key: AI_CONFIGS.INCIDENT_SUMMARIZER,
    name: 'Incident summarizer',
    description: 'Prompt and model for the AI Incident Summary feature (Part 1).',
    variations: [
      {
        key: 'four-line-haiku',
        name: 'Four-line summary · Haiku 5.5',
        modelConfigKey: 'anthropic-claude-haiku-5-5',
        model: { name: 'claude-haiku-5-5', parameters: { maxTokens: 1024, effort: 'low' } },
        messages: [{ role: 'system', content: SUMMARIZER_PROMPT }],
      },
    ],
  });

  // Targeting: enterprise → detailed Sonnet; everyone else → concise Haiku.
  try {
    await api(
      'PATCH',
      `/api/v2/projects/${PROJECT}/ai-configs/${AI_CONFIGS.ASSISTANT}/targeting`,
      {
        environmentKey: ENV,
        comment: 'Pulse demo setup',
        instructions: [
          {
            kind: 'replaceRules',
            rules: [
              {
                description: 'Enterprise customers get the detailed troubleshooter',
                variationId: aiVariationId(assistant, 'detailed-sonnet'),
                clauses: [{ contextKind: 'organization', attribute: 'plan', op: 'in', values: ['enterprise'], negate: false }],
              },
            ],
          },
          { kind: 'updateFallthroughVariationOrRollout', variationId: aiVariationId(assistant, 'concise-haiku') },
        ],
      },
      { semantic: true },
    );
    ok('pulse-assistant targeting: enterprise → detailed-sonnet, default → concise-haiku');

    await api(
      'PATCH',
      `/api/v2/projects/${PROJECT}/ai-configs/${AI_CONFIGS.INCIDENT_SUMMARIZER}/targeting`,
      {
        environmentKey: ENV,
        comment: 'Pulse demo setup',
        instructions: [{ kind: 'updateFallthroughVariationOrRollout', variationId: aiVariationId(summarizer, 'four-line-haiku') }],
      },
      { semantic: true },
    );
    ok('pulse-incident-summarizer targeting: default → four-line-haiku');
  } catch (e) {
    warn(`AI Config targeting not applied (${e.message}). Set it in the UI: README → "AI Configs".`);
  }
  await turnOnAiConfigFlags();
}

// AI Configs are evaluated like flags. Make sure their targeting is ON in this
// environment, otherwise every context gets the "disabled" off variation.
async function turnOnAiConfigFlags() {
  for (const key of Object.values(AI_CONFIGS)) {
    const flag = await getFlag(key);
    const on = flag?.environments?.[ENV]?.on;
    if (on === true) {
      skip(`${key} targeting already ON`);
      continue;
    }
    try {
      await api('PATCH', `/api/v2/projects/${PROJECT}/ai-configs/${key}/targeting`, { environmentKey: ENV, instructions: [{ kind: 'turnTargetingOn' }] }, { semantic: true, allow: [400] });
    } catch {
      /* fall through to the flag API */
    }
    try {
      await patchFlag(key, [{ kind: 'turnFlagOn' }], 'Pulse demo setup: enable AI Config');
      ok(`${key} targeting turned ON`);
    } catch (e) {
      warn(`could not turn on ${key} (${e.message}). Turn targeting on in the AI Config's Targeting tab.`);
    }
  }
}

// ── 6. Experiment ────────────────────────────────────────────────────────────
async function setupExperiment() {
  step('Experiment');
  const base = `/api/v2/projects/${PROJECT}/environments/${ENV}/experiments`;
  const existing = await api('GET', `${base}/${EXPERIMENT_KEY}`, null, { allow: [404] });
  if (existing.status !== 404) return skip(`experiment ${EXPERIMENT_KEY} already exists`);

  const hero = await getFlag(FLAGS.LANDING_HERO);
  const classic = variationId(hero, 'classic');
  const ai = variationId(hero, 'ai-powered');
  await api('POST', base, {
    key: EXPERIMENT_KEY,
    name: 'Landing hero: does the AI-powered hero lift trial signups?',
    description: 'Visitors who match no targeting rule are split 50/50 between the classic and AI-powered hero.',
    methodology: 'bayesian',
    tags: ['landing-page'],
    iteration: {
      hypothesis: 'The AI-powered hero, which explains Pulse AI in plain language, increases trial signups compared with the classic hero.',
      canReshuffleTraffic: true,
      randomizationUnit: 'user',
      metrics: [{ key: EVENTS.TRIAL_SIGNUP }],
      primarySingleMetricKey: EVENTS.TRIAL_SIGNUP,
      treatments: [
        { name: 'Classic hero', baseline: true, allocationPercent: '50', parameters: [{ flagKey: FLAGS.LANDING_HERO, variationId: classic }] },
        { name: 'AI-powered hero', baseline: false, allocationPercent: '50', parameters: [{ flagKey: FLAGS.LANDING_HERO, variationId: ai }] },
      ],
      flags: { [FLAGS.LANDING_HERO]: { ruleId: 'fallthrough', flagConfigVersion: hero.environments[ENV].version } },
    },
  });
  ok(`created experiment ${EXPERIMENT_KEY}`);
  try {
    await api('PATCH', `${base}/${EXPERIMENT_KEY}`, { instructions: [{ kind: 'startIteration', changeJustification: 'Pulse demo setup' }] }, { semantic: true });
    ok('experiment started. Run `npm run ld:traffic` to send it visitors.');
  } catch (e) {
    warn(`experiment created but not started (${e.message}). Start it from the Experiments page.`);
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const steps = [ensureProject, setupFlags, setupTrigger, setupMetrics, setupAiConfigs, setupExperiment];
let failed = 0;
for (const fn of steps) {
  try {
    await fn();
  } catch (e) {
    failed++;
    console.error(`  ✗ ${e.message}`);
    if (fn === ensureProject) process.exit(1); // nothing else works without it
  }
}
console.log(
  failed
    ? `\nFinished with ${failed} step(s) failing. Fix the error above and re-run; finished steps are skipped.`
    : `\nDone. Open https://app.launchdarkly.com/projects/${PROJECT}/flags and run \`npm run dev\`.`,
);
