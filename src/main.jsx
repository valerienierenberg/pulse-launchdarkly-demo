// ─────────────────────────────────────────────────────────────────────────────
// App entry point: starts the LaunchDarkly React SDK before rendering.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { createRoot } from 'react-dom/client';
import { createLDReactProvider } from '@launchdarkly/react-sdk';
import Observability from '@launchdarkly/observability';
import SessionReplay from '@launchdarkly/session-replay';
import App from './App.jsx';
import SetupNotice from './components/SetupNotice.jsx';
import { loadPersonaId } from './ld/persona-store.js';
import { getPersona } from '../shared/personas.js';
import './styles.css';

// ⚠️ CLIENT-SIDE ID: set VITE_LD_CLIENT_SIDE_ID in .env (local) or in Vercel's
// environment variables. Find it in LaunchDarkly → Project settings →
// Environments → production → "Client-side ID". It is safe to expose; it only
// reads flags marked "available to client-side SDKs".
const clientSideId = import.meta.env.VITE_LD_CLIENT_SIDE_ID;

const root = createRoot(document.getElementById('root'));

if (!clientSideId) {
  root.render(<SetupNotice />);
} else {
  // The first context is the persona last picked in the persona switcher.
  const initialContext = getPersona(loadPersonaId()).context;

  const LDProvider = createLDReactProvider(clientSideId, initialContext, {
    ldOptions: {
      // Streaming keeps a live connection open, so flag changes arrive in
      // about a second and the variation hooks re-render: this is the
      // "listener" for instant release/rollback, with no page reload.
      streaming: true,
      // Extra credit (Observability): errors, logs, traces and session
      // replays go to LaunchDarkly and are linked to flag changes.
      plugins: [
        new Observability({
          serviceName: 'pulse-web',
          tracingOrigins: true, // link browser spans to our /api calls
          networkRecording: { enabled: true, recordHeadersAndBody: false },
        }),
        new SessionReplay({ privacySetting: 'default' }),
      ],
    },
  });

  root.render(
    <React.StrictMode>
      <LDProvider>
        <App />
      </LDProvider>
    </React.StrictMode>,
  );
}
