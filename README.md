# Pulse × LaunchDarkly: release safely, target precisely, measure everything

A sample app for a fictional SaaS company, **ABC Company**, whose product **Pulse** monitors websites and apps. It shows how LaunchDarkly lets ABC ship features faster without adding risk:

| Assignment requirement | Where it lives in this app |
|---|---|
| **Part 1: Feature flag** around a new feature | `release-ai-incident-summary` wraps the new **AI Incident Summary** panel on the Pulse dashboard (`/app`) |
| **Part 1: Instant release/rollback** (listener, no reload) | React SDK streaming + `useBoolVariation` → the panel appears/disappears within ~1s. The **LaunchDarkly live feed** panel shows each change event as it arrives |
| **Part 1: Remediate** with a trigger | A LaunchDarkly **flag trigger** (generic webhook) turns the flag OFF. Fire it with `curl`, `npm run ld:kill`, the dashboard's **Kill switch** button, or the built-in **auto-remediation** rule (error spike → trigger) |
| **Part 2: Feature flag** around a component | `landing-hero-redesign` chooses the landing-page hero: `classic` or `ai-powered` |
| **Part 2: Context attributes** | Multi-kind contexts: `user` (name, email, role, betaTester) + `organization` (plan, industry, region, employees) |
| **Part 2: Individual + rule-based targeting** | Sam is targeted individually; rules target `@abc-company.com` staff and enterprise orgs in retail/finance. A persona switcher (`identify()`) shows each result live |
| **Extra: Experimentation** | Metric `trial-signup-clicked` + experiment `landing-hero-trial-signups` (50/50 on the default rule). `npm run ld:traffic` sends simulated visitors so there's data to decide on |
| **Extra: AI Configs** | **ABC Assistant** chatbot (`pulse-assistant`) and the incident summarizer (`pulse-incident-summarizer`) read their model + prompt from LaunchDarkly. Enterprise users get Claude Sonnet 5.5; everyone else gets Claude Haiku 5.5. Tokens, latency, success and 👍/👎 feedback are tracked per variation |
| **Extra: Integrations** | LaunchDarkly **Observability** (errors, traces, session replay) via SDK plugins · **GitHub Code References** action · optional **Slack** and **Dynatrace** (see [Integrations](#integrations)) |

> **Live demo:** https://pulse-launchdarkly-demo.vercel.app

---

## Contents

1. [How it works](#how-it-works)
2. [Assumptions about your environment](#assumptions-about-your-environment)
3. [Quick start (about 10 minutes)](#quick-start-about-10-minutes)
4. [Walkthrough: Part 1, Release & Remediate](#part-1-release--remediate)
5. [Walkthrough: Part 2, Target](#part-2-target)
6. [Walkthrough: Experimentation](#experimentation)
7. [Walkthrough: AI Configs](#ai-configs)
8. [Integrations](#integrations)
9. [Deploying to Vercel](#deploying-to-vercel)
10. [Creating the LaunchDarkly resources manually](#creating-the-launchdarkly-resources-manually)
11. [Project structure](#project-structure)
12. [Troubleshooting](#troubleshooting)

---

## How it works

```
 Browser (React + Vite)                         LaunchDarkly
 ┌───────────────────────────────┐   stream    ┌──────────────────────────┐
 │ @launchdarkly/react-sdk       │◀──────────▶│ flags, targeting,        │
 │  • useBoolVariation / ...     │  events     │ experiments, AI Configs, │
 │  • identify() persona switch  │────────────▶│ metrics, observability   │
 │  • track() custom events      │             └────────────▲─────────────┘
 │  • Observability + Replay     │                          │
 └──────────────┬────────────────┘                          │ server SDK
                │ /api/*                                    │ + AI SDK
 ┌──────────────▼────────────────────────────────────────────┴─────────┐
 │ Node serverless functions (Vercel) · Express locally                 │
 │  /api/chat              AI Config → Claude → tracked metrics          │
 │  /api/incident-summary  server-side flag check + AI Config → Claude   │
 │  /api/feedback          👍/👎 → AI Config variation                   │
 │  /api/kill-switch       POST to the flag trigger URL (secret)         │
 └───────────────────────────────────────────────────────────────────┬──┘
                                                                     ▼
                                                         Anthropic Claude API
```

Design choices worth knowing:

- **Flags guard the backend too.** `/api/incident-summary` re-checks `release-ai-incident-summary` on the server. Turning the flag off really stops the feature (and its AI spend), not just the UI.
- **Secrets stay on the server.** The browser only gets the *client-side ID*. The SDK key, Anthropic key and trigger URL live in server env vars. The AI SDK's feedback token is encrypted before it goes to the browser.
- **It works with nothing configured.** Without LaunchDarkly keys the app uses safe defaults. Without an Anthropic key, AI answers are clearly labelled mock responses.

## Assumptions about your environment

- **macOS, Linux or Windows (WSL)** with a terminal.
- **Node.js 20 or newer** and npm (`node -v`). Built and tested on Node 26.
- **Git**, and a GitHub account if you want the code-references action.
- A **LaunchDarkly account** (a [free trial](https://launchdarkly.com/start-trial/) works) where you can create an **API access token** with the *Writer* or *Admin* role.
- Optional: an **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com)). The cheapest model (Haiku 5.5) costs fractions of a cent per answer. Set a monthly spend limit on the key.
- Optional: a **Vercel account** to deploy (the free Hobby plan is enough).
- Ports **5173** (web) and **3001** (API) are free on your machine.

## Quick start (about 10 minutes)

```bash
git clone https://github.com/valerienierenberg/pulse-launchdarkly-demo.git
cd pulse-launchdarkly-demo
npm install
cp .env.example .env
```

**1. Create a LaunchDarkly API access token.** In LaunchDarkly: **Organization settings → Authorization → Access tokens → Create token**, role **Writer**. Paste it into `.env` as `LD_API_TOKEN=...`.

**2. Create every flag, metric, trigger, AI Config and experiment with one command:**

```bash
npm run ld:setup
```

This creates a new project, `pulse-demo`, and writes `VITE_LD_CLIENT_SIDE_ID`, `LD_SDK_KEY` and `LD_KILL_SWITCH_TRIGGER_URL` into your `.env`. It is safe to re-run: anything that exists is skipped. (Prefer the UI? See [Creating the LaunchDarkly resources manually](#creating-the-launchdarkly-resources-manually).)

**3. (Optional) Add your Anthropic key** to `.env` as `ANTHROPIC_API_KEY=...`.

**4. Run it:**

```bash
npm run dev
```

Open **http://localhost:5173**. The landing page is at `/`; the Pulse app is at `/app`.

> In LaunchDarkly, select the **pulse-demo** project and the **Production** environment. That is where the app reads its flags.

## Part 1: Release & Remediate

*Scenario: ABC's engineering manager must ship faster without risking quality. Test in production, release instantly, and roll back in seconds if something breaks.*

1. Open **http://localhost:5173/app**. The incident details card says the AI Incident Summary isn't released.
2. In LaunchDarkly, open **release-ai-incident-summary** and switch it **On** (Production). Within about a second, the **AI Incident Summary** panel appears with no reload, and the live feed logs the change. That's the **release**.
3. Toggle it **Off**. The panel disappears instantly. That's the **rollback**.
4. **Simulate a bad release.** Turn the release flag back on, then turn on **demo-inject-summary-errors**. The panel starts crashing every few seconds. Each crash goes to LaunchDarkly Observability (`LDObserve.recordError`) and sends an `incident-summary-error` event.
5. **Remediate with a trigger**, using any one of these:
   - Command line: `curl -X POST "$LD_KILL_SWITCH_TRIGGER_URL"` (or `npm run ld:kill`)
   - Dashboard: click **🛑 Kill switch**
   - Automatically: leave **Auto-remediate** checked. After 3 errors in 30 seconds the dashboard fires the trigger itself, the way a monitoring alert (Dynatrace, Datadog, LaunchDarkly Observability) would.

   LaunchDarkly turns **release-ai-incident-summary** off, the broken panel disappears for every user, and the flag's **History** shows the trigger as the reason.
6. Turn **demo-inject-summary-errors** off again before the next run.

**How the listener works:** `src/main.jsx` starts the SDK with `streaming: true`. `useBoolVariation()` in `src/pages/Dashboard.jsx` subscribes to that flag, and React re-renders when its value changes. `src/ld/useLiveFlagEvents.js` uses `client.on('change', …)` to show each change in the live feed.

**Where the trigger comes from:** `npm run ld:setup` creates it (flag → **Settings → Triggers → Generic trigger**, action *Turn the flag off*). The URL is only shown once, so the script saves it to `.env`.

## Part 2: Target

*Scenario: ABC is redesigning its landing page (about 40,000 visitors a day). The team needs to show the new hero component to the right people first.*

Each persona in the **Viewing as** menu is a LaunchDarkly **multi-context**: a `user` and an `organization` (see `shared/personas.js`). Picking one calls `ldClient.identify()`, and the hero updates on the spot. The badge above the hero shows the variation and the **reason** LaunchDarkly gives for it.

| Persona | user / organization attributes | Hero | Why |
|---|---|---|---|
| Sam Okafor | free plan, software, EU | **AI-powered** | **Individual target** (`user-sam-okafor`) |
| Dana Lee | `dana.lee@abc-company.com` | **AI-powered** | **Rule 1**: `user.email` ends with `@abc-company.com` |
| Priya Shah | enterprise, retail | **AI-powered** | **Rule 2**: `organization.plan` is `enterprise` AND `organization.industry` is in `retail, finance` |
| Marco Rossi | **pro**, finance | Classic, or either hero while the experiment runs | No rule matches (pro plan) → default rule, which the experiment splits 50/50 |
| Anonymous visitor | anonymous user | Classic, or the 50/50 split while the experiment runs | Default rule |

Try changing targeting live: add Marco as an individual target, or change Rule 2 to include `pro`. His hero switches within a second.

## Experimentation

*Scenario: Product wants proof that the new hero helps the business before rolling it out to everyone.*

- **Metric** `trial-signup-clicked` (custom conversion). Every **Start free trial** button calls `ldClient.track('trial-signup-clicked')`.
- **Experiment** `landing-hero-trial-signups` splits visitors who reach the **default rule** 50/50 between `classic` and `ai-powered`. Targeted users (Sam, Dana, Priya) keep their assigned hero and are not counted.
- **Getting enough data:** a real landing page would collect data for days. To see results in minutes, send simulated visitors:

  ```bash
  npm run ld:traffic -- --visitors=3000
  ```

  The script (`scripts/simulate-traffic.js`) evaluates the flag for each visitor with the server SDK and "converts" 5.0% of classic visitors and 7.2% of AI-powered visitors. Open **Experiments → Landing hero** in LaunchDarkly after a few minutes. With about 3,000 visitors, the AI-powered hero should show a high probability to beat the baseline. **This traffic is simulated for the demo.**
- **The decision:** when the result is conclusive, choose **Ship it** on the AI-powered variation. LaunchDarkly then serves it to the default rule, so everyone gets it, and the experiment ends.

## AI Configs

*Scenario: ABC is rolling out a support chatbot and wants to change prompts and models without deploying code.*

- Click **✦ Ask AI** (bottom right) to open **ABC Assistant**. Each answer shows the **model** and **AI Config variation** used, with 👍/👎 buttons.
- `pulse-assistant` has three variations:
  - `concise-haiku`: Claude Haiku 5.5, short answers. This is the **default**.
  - `detailed-sonnet`: Claude Sonnet 5.5, a step-by-step troubleshooter. Served to **enterprise** orgs by a targeting rule.
  - `detailed-haiku`: the detailed prompt on the cheaper model, a candidate for an experiment.
- Prompts use variables: `{{userName}}`, `{{role}}`, `{{company}}`, `{{plan}}` and `{{industry}}` are filled in from the context (`server/llm.js`).
- **Change it live:** edit the system prompt or swap the model in LaunchDarkly, then send the next message. The new config is used right away, with no deploy. Switch to Priya (enterprise) or Sam (free) to see different variations.
- **Kill switch for AI:** turn the AI Config's targeting off and the chatbot replies that it's disabled. No model calls are made.
- **What gets measured:** `tracker.trackMetricsOf()` records duration, input/output tokens and success per call, and the 👍/👎 buttons record feedback (`/api/feedback`). See the AI Config's **Monitoring** tab.
- **(Optional) Experiment on prompts:** create an experiment on `pulse-assistant` comparing `concise-haiku` and `detailed-haiku`, with the built-in *Positive AI feedback* metric (or tokens/latency).

## Integrations

**LaunchDarkly Observability (built in).** `src/main.jsx` registers the `@launchdarkly/observability` and `@launchdarkly/session-replay` plugins. In LaunchDarkly, open **Observability** for errors (including the injected AI Summary errors), traces of `/api/*` calls, and session replays. Errors are linked to the flag changes around them.

**Guarded rollout (automatic rollback).** Instead of switching `release-ai-incident-summary` straight on, choose **Guarded rollout** on its default rule, attach the `incident-summary-error` metric (and/or the built-in error-rate metrics), and enable **automatic rollback**. Then run:

```bash
npm run ld:traffic -- --mode=errors --visitors=1500
```

LaunchDarkly sees the error rate climb for users on the new variation and rolls the release back by itself.

**GitHub Code References.** `.github/workflows/ld-code-refs.yml` runs `launchdarkly/find-code-references` on each push to `main`. Add a repository secret **`LD_ACCESS_TOKEN`** (Writer role). Each flag's page in LaunchDarkly then shows the files and lines that use it, which helps with flag cleanup.

**Slack (optional, no code).** In LaunchDarkly: **Integrations → Slack App → Install**, then subscribe a channel to the `pulse-demo` project. Every toggle, trigger firing and rollback is posted to the channel.

**Dynatrace (optional, no code).** **Integrations → Dynatrace** sends every flag change to Dynatrace as a deployment/configuration event, so releases line up with performance charts. To close the loop, have a Dynatrace workflow (or any monitoring tool) **POST to the flag trigger URL** when a problem opens. That's exactly what the dashboard's auto-remediation simulates.

## Deploying to Vercel

1. Push the repo to GitHub, then go to **vercel.com → Add New → Project**, import the repo and keep the defaults (`vercel.json` sets the Vite build and `/api` functions).
2. Add **Environment Variables** (Production): `VITE_LD_CLIENT_SIDE_ID`, `LD_SDK_KEY`, `LD_KILL_SWITCH_TRIGGER_URL`, and optionally `ANTHROPIC_API_KEY`. **Do not** add `LD_API_TOKEN`.
3. Deploy. `VITE_*` values are built into the front end, so redeploy after changing them.

Or with the CLI: `npx vercel link`, `npx vercel env add <NAME> production` for each variable, then `npx vercel --prod`.

**Cost guardrails on a public URL:** per-IP rate limits on every `/api` route, capped message length and history, and `max_tokens` limits from the AI Config. Also set a spend limit on the Anthropic key.

## Creating the LaunchDarkly resources manually

If you'd rather click through the UI than run `npm run ld:setup`, create these in one project's **Production** environment. **Keys must match exactly** (they're defined in `shared/flags.js`), and every flag must have **SDKs using Client-side ID** checked.

| Type | Key | Setup |
|---|---|---|
| Boolean flag | `release-ai-incident-summary` | Variations `true` (Released) / `false` (Rolled back). Leave **Off**. |
| Flag trigger | on `release-ai-incident-summary` | Settings → Triggers → **Generic trigger**, action **Turn the flag off**. Copy the URL into `LD_KILL_SWITCH_TRIGGER_URL`. |
| Boolean flag | `demo-inject-summary-errors` | Leave **Off**. |
| String flag | `landing-hero-redesign` | Variations `classic`, `ai-powered`. **On**. Individual target: user `user-sam-okafor` → `ai-powered`. Rule 1: `user` `email` *ends with* `@abc-company.com` → `ai-powered`. Rule 2: `organization` `plan` *is one of* `enterprise` **and** `organization` `industry` *is one of* `retail, finance` → `ai-powered`. Default rule → `classic`. |
| Metric | `trial-signup-clicked` | Custom, conversion, event key `trial-signup-clicked`, randomization unit `user`, higher is better. |
| Metric | `incident-summary-error` | Custom, conversion, event key `incident-summary-error`, lower is better. |
| Experiment | any name | Flag `landing-hero-redesign`, **default rule**, 50/50, primary metric `trial-signup-clicked`. Start it. |
| AI Config | `pulse-assistant` | Completion mode. Variations `concise-haiku` (model `claude-haiku-5-5`) and `detailed-sonnet` (model `claude-sonnet-5-5`), each with a system message (prompts are in `scripts/ld-setup.js`). Rule: `organization` `plan` is `enterprise` → `detailed-sonnet`. Default → `concise-haiku`. |
| AI Config | `pulse-incident-summarizer` | One variation, `four-line-haiku` (model `claude-haiku-5-5`). |

Then copy the environment's **Client-side ID** and **SDK key** (Project settings → Environments) into `.env`.

## Project structure

```
api/                    Serverless functions (Vercel) — also served locally by server/dev-server.js
  chat.js               ABC Assistant (AI Config → Claude)
  incident-summary.js   Part 1 feature backend (server-side flag check)
  feedback.js           👍/👎 → AI Config metrics
  kill-switch.js        Fires the flag trigger
server/                 Shared server code: LD SDK + AI SDK setup, Claude call, helpers
shared/                 Flag keys, personas (contexts), demo incident data — used by browser and server
src/                    React app
  main.jsx              SDK init: streaming, observability + session replay plugins
  pages/Landing.jsx     Part 2 + Experimentation
  pages/Dashboard.jsx   Part 1 + remediation
  components/           Assistant (chatbot), AI summary panel, persona switcher, live flag feed
scripts/
  ld-setup.js           Creates all LaunchDarkly resources through the REST API
  simulate-traffic.js   Simulated visitors for the experiment / guarded rollout
  fire-trigger.js       CLI kill switch
.github/workflows/      LaunchDarkly code references
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Almost there" page | `VITE_LD_CLIENT_SIDE_ID` is missing. Run `npm run ld:setup` or set it, then restart `npm run dev`. |
| Flags never change | Check you're editing the **pulse-demo** project, **Production** environment. Make sure the flag has *SDKs using Client-side ID* enabled. |
| Reason shows `error (FLAG_NOT_FOUND)` | The flag key doesn't exist in that environment. Compare with `shared/flags.js`. |
| AI answers say "mock" | `ANTHROPIC_API_KEY` isn't set for the API server (or in Vercel). |
| Chatbot says it's disabled | The `pulse-assistant` AI Config is off or serving its disabled variation. Turn targeting on. |
| Trigger returns HTTP 429 | LaunchDarkly rate-limits each trigger URL (about once a minute). Wait a minute and fire it again. |
| Kill switch says "not set" | `LD_KILL_SWITCH_TRIGGER_URL` is missing. Re-create a trigger and paste the URL (it's only shown once). |
| Experiment shows no data | It must be **running**, and only default-rule visitors count. Run `npm run ld:traffic` and wait a few minutes. |
| Ad blocker console errors | Some blockers block event/telemetry endpoints. Disable them for localhost. |

---

Built for the LaunchDarkly Senior Solutions Engineer technical exercise. Pulse and ABC Company are fictional.
