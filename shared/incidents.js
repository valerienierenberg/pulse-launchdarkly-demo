// Fake incident data that the Pulse dashboard shows. The AI Incident Summary
// feature (Part 1) sends one of these to Claude for a plain-English summary.

export const INCIDENTS = [
  {
    id: 'INC-4821',
    title: 'Checkout latency spike, us-east-1',
    severity: 'critical',
    status: 'open',
    startedAt: '2026-10-31T14:02:00Z',
    affectedUsers: 18240,
    service: 'checkout-api',
    signals: [
      'p95 latency on POST /checkout rose from 420ms to 3.8s at 14:02 UTC',
      'Error rate on checkout-api went from 0.2% to 6.9%',
      'Deploy checkout-api v2.31.0 finished at 13:58 UTC',
      'Database connection pool saturation at 100% on orders-db-primary',
      'Rage clicks on the "Place order" button up 9x (session replay)',
    ],
  },
  {
    id: 'INC-4817',
    title: 'Image CDN 404s on product pages',
    severity: 'major',
    status: 'mitigated',
    startedAt: '2026-10-31T09:41:00Z',
    affectedUsers: 5310,
    service: 'media-cdn',
    signals: [
      '404 responses on /img/products/* up from 12/min to 2,900/min',
      'CDN config change "purge-and-rewrite-v3" applied at 09:39 UTC',
      'Largest Contentful Paint on product pages worsened by 1.7s',
      'Conversion rate on product pages down 11% versus last week',
    ],
  },
  {
    id: 'INC-4809',
    title: 'Login errors for SSO customers',
    severity: 'minor',
    status: 'resolved',
    startedAt: '2026-10-30T22:15:00Z',
    affectedUsers: 640,
    service: 'auth-gateway',
    signals: [
      'SAML assertion validation failures for 3 enterprise tenants',
      'Identity provider certificate rotated at 22:10 UTC',
      'Support tickets mentioning "can\'t log in" up from 2 to 47',
    ],
  },
];

export function getIncident(id) {
  return INCIDENTS.find((i) => i.id === id);
}
