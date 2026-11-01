// ─────────────────────────────────────────────────────────────────────────────
// Demo personas. Each one becomes a LaunchDarkly *multi-context* made of:
//   • user:         the person (key, name, email, role, betaTester)
//   • organization: the company they belong to (plan, industry, region, size)
// The targeting rules in LaunchDarkly read these attributes.
//
// Who should see the new landing hero (flag: landing-hero-redesign)?
//   Sam    → YES  individual target (named one by one, though his org wouldn't qualify)
//   Dana   → YES  rule 1: email ends with @abc-company.com (internal staff)
//   Priya  → YES  rule 2: organization plan = enterprise AND industry in [retail, finance]
//   Marco  → no   (finance, but on the "pro" plan, so rule 2 doesn't match)
//   Guest  → no   (anonymous visitor gets the default, or the experiment split)
// ─────────────────────────────────────────────────────────────────────────────

export const PERSONAS = [
  {
    id: 'priya',
    label: 'Priya Shah · VP Eng @ GlobalMart',
    blurb: 'Enterprise · Retail · North America',
    context: {
      kind: 'multi',
      user: {
        key: 'user-priya-shah',
        name: 'Priya Shah',
        email: 'priya.shah@globalmart.com',
        role: 'VP Engineering',
        betaTester: false,
      },
      organization: {
        key: 'org-globalmart',
        name: 'GlobalMart',
        plan: 'enterprise',
        industry: 'retail',
        region: 'NA',
        employees: 12000,
      },
    },
  },
  {
    id: 'sam',
    label: 'Sam Okafor · Developer @ TinyStack',
    blurb: 'Free plan · Software · Europe · individually targeted',
    context: {
      kind: 'multi',
      user: {
        key: 'user-sam-okafor',
        name: 'Sam Okafor',
        email: 'sam@tinystack.io',
        role: 'Developer',
        betaTester: true,
      },
      organization: {
        key: 'org-tinystack',
        name: 'TinyStack',
        plan: 'free',
        industry: 'software',
        region: 'EU',
        employees: 8,
      },
    },
  },
  {
    id: 'dana',
    label: 'Dana Lee · QA @ ABC Company',
    blurb: 'Internal employee (dogfooding)',
    context: {
      kind: 'multi',
      user: {
        key: 'user-dana-lee',
        name: 'Dana Lee',
        email: 'dana.lee@abc-company.com',
        role: 'QA Engineer',
        betaTester: true,
      },
      organization: {
        key: 'org-abc-company',
        name: 'ABC Company',
        plan: 'enterprise',
        industry: 'software',
        region: 'NA',
        employees: 900,
      },
    },
  },
  {
    id: 'marco',
    label: 'Marco Rossi · SRE @ EuroBank',
    blurb: 'Pro plan · Finance · Europe',
    context: {
      kind: 'multi',
      user: {
        key: 'user-marco-rossi',
        name: 'Marco Rossi',
        email: 'marco.rossi@eurobank.eu',
        role: 'SRE Lead',
        betaTester: false,
      },
      organization: {
        key: 'org-eurobank',
        name: 'EuroBank',
        plan: 'pro',
        industry: 'finance',
        region: 'EU',
        employees: 4000,
      },
    },
  },
  {
    id: 'guest',
    label: 'Anonymous visitor',
    blurb: 'Not logged in',
    // Anonymous contexts get a random key from the SDK and are not stored
    // on LaunchDarkly's Contexts list.
    context: { kind: 'user', anonymous: true },
  },
];

export const DEFAULT_PERSONA_ID = 'priya';

export function getPersona(id) {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

// Readable name/plan/company for a context, used for prompt variables.
export function describeContext(ctx) {
  const user = ctx?.kind === 'multi' ? ctx.user : ctx;
  const org = ctx?.kind === 'multi' ? ctx.organization : undefined;
  return {
    userName: user?.name ?? 'there',
    role: user?.role ?? 'visitor',
    company: org?.name ?? 'your company',
    plan: org?.plan ?? 'trial',
    industry: org?.industry ?? 'unknown',
  };
}
