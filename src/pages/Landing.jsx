// ─────────────────────────────────────────────────────────────────────────────
// Public landing page: Part 2 (Target) + Extra credit (Experimentation).
//
// The hero component is wrapped in the `landing-hero-redesign` flag:
//   "classic"    → the current hero (control)
//   "ai-powered" → the redesigned hero (treatment)
// Who sees which is decided in LaunchDarkly by individual targets and rules
// on the context's attributes. The "Start free trial" clicks are sent with
// ldClient.track() and feed the experiment's primary metric.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useStringVariationDetail, useLDClient } from '@launchdarkly/react-sdk';
import { FLAGS, EVENTS } from '../../shared/flags.js';
import { describeContext, getPersona } from '../../shared/personas.js';
import { usePersonaId } from '../ld/persona-store.js';

function useTrialClick() {
  const client = useLDClient();
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const onClick = (source) => {
    // Custom event → "Trial signup" metric → experiment results.
    client?.track(EVENTS.TRIAL_SIGNUP, { source });
    client?.flush();
    setToast(`Thanks! Sent "${EVENTS.TRIAL_SIGNUP}" to LaunchDarkly.`);
  };
  return [toast, onClick];
}

function ClassicHero({ onTrial }) {
  return (
    <section className="hero classic">
      <div className="hero-copy">
        <span className="eyebrow">Digital experience monitoring</span>
        <h1>Monitor your websites and apps in one place.</h1>
        <p>Pulse collects performance, errors and user sessions so your team can find problems faster.</p>
        <div className="cta-row">
          <button className="btn primary" onClick={() => onTrial('hero-classic')}>Start free trial</button>
          <button className="btn ghost">Book a demo</button>
        </div>
      </div>
      <div className="hero-art classic-art" aria-hidden="true">
        <div className="fake-window">
          <div className="bars">
            {[40, 65, 50, 80, 55, 70, 45, 90, 60].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AiHero({ onTrial, who }) {
  const [score, setScore] = useState(97.2);
  useEffect(() => {
    const t = setInterval(() => setScore((s) => Math.max(94, Math.min(99.9, s + (Math.random() - 0.5) * 0.8))), 1400);
    return () => clearInterval(t);
  }, []);
  const industryLogos = {
    retail: ['ShopNow', 'CartCo', 'GlobalMart'],
    finance: ['EuroBank', 'PayLane', 'Ledgerly'],
    software: ['TinyStack', 'Deployly', 'Kodex'],
  }[who.industry] ?? ['Acme', 'Globex', 'Initech'];

  return (
    <section className="hero ai">
      <div className="hero-copy">
        <span className="eyebrow glow">New · Pulse AI</span>
        <h1>
          Know <em>why</em> it broke before your customers notice.
        </h1>
        <p>
          Pulse AI connects every slow page, error and rage click to the release that caused it, then tells you
          what to do in plain English.
        </p>
        <div className="cta-row">
          <button className="btn primary big" onClick={() => onTrial('hero-ai')}>Start free trial: AI included</button>
          <button className="btn ghost">See it on your site</button>
        </div>
        <p className="logos">
          Trusted in {who.industry === 'unknown' ? 'every industry' : who.industry} by{' '}
          {industryLogos.map((l) => <b key={l}>{l}</b>)}
        </p>
      </div>
      <div className="hero-art ai-art" aria-hidden="true">
        <div className="score-card">
          <span className="muted small">Live experience score</span>
          <strong>{score.toFixed(1)}</strong>
          <span className="trend">▲ 2.4 since last release</span>
          <div className="ai-note">
            <span className="spark">✦</span> “Checkout p95 is up 3.1s since deploy v2.31.0. Roll back or flag it off.”
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Landing({ onOpenApp }) {
  // The "Detail" hook also returns *why* this variation was served
  // (target match, rule match, fallthrough, experiment), which we show below.
  const hero = useStringVariationDetail(FLAGS.LANDING_HERO, 'classic');
  const who = describeContext(getPersona(usePersonaId()).context);
  const [toast, onTrial] = useTrialClick();

  return (
    <div className="landing">
      <div className="flag-callout">
        <code>{FLAGS.LANDING_HERO}</code> = <b>{hero.value}</b>
        <span className="muted"> · reason: {formatReason(hero.reason)}</span>
      </div>

      {hero.value === 'ai-powered' ? <AiHero onTrial={onTrial} who={who} /> : <ClassicHero onTrial={onTrial} />}

      <section className="features">
        {[
          ['Real user monitoring', 'Core Web Vitals and page timings from every real visit.'],
          ['Session replay', 'Watch exactly what a user saw when something went wrong.'],
          ['Release tracking', 'Every deploy and feature flag change on the same timeline as your metrics.'],
          ['Smart alerts', 'Alerts that open an incident and can roll back a release on their own.'],
        ].map(([t, d]) => (
          <article key={t} className="card">
            <h3>{t}</h3>
            <p>{d}</p>
          </article>
        ))}
      </section>

      <section className="pricing">
        {[
          ['Free', '$0', '1 site · 7-day retention'],
          ['Pro', '$49', '10 sites · 30-day retention · alerts'],
          ['Enterprise', 'Custom', 'Unlimited · SSO · Pulse AI · 13-month retention'],
        ].map(([n, p, d]) => (
          <article key={n} className={`card price ${n === 'Pro' ? 'featured' : ''}`}>
            <h3>{n}</h3>
            <strong>{p}</strong>
            <p>{d}</p>
            <button className="btn primary" onClick={() => onTrial(`pricing-${n.toLowerCase()}`)}>Start free trial</button>
          </article>
        ))}
      </section>

      <section className="cta-band">
        <p>Already a customer?</p>
        <button className="btn ghost" onClick={onOpenApp}>Open the Pulse app →</button>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function formatReason(reason) {
  if (!reason) return 'loading…';
  switch (reason.kind) {
    case 'TARGET_MATCH':
      return 'individual target';
    case 'RULE_MATCH':
      return `targeting rule #${(reason.ruleIndex ?? 0) + 1}${reason.inExperiment ? ' (in experiment)' : ''}`;
    case 'FALLTHROUGH':
      return reason.inExperiment ? 'default rule · in experiment' : 'default rule';
    case 'OFF':
      return 'flag is off';
    case 'ERROR':
      return `error (${reason.errorKind}). Is the flag created?`;
    default:
      return reason.kind;
  }
}
