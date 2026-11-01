// Local development only: serves the same /api handlers that Vercel runs as
// serverless functions, on http://localhost:3001. Vite (port 5173) proxies
// /api/* here. See vite.config.js.
import express from 'express';
import chat from '../api/chat.js';
import feedback from '../api/feedback.js';
import incidentSummary from '../api/incident-summary.js';
import killSwitch from '../api/kill-switch.js';
import health from '../api/health.js';

const app = express();
app.use(express.json({ limit: '100kb' }));
app.all('/api/chat', chat);
app.all('/api/feedback', feedback);
app.all('/api/incident-summary', incidentSummary);
app.all('/api/kill-switch', killSwitch);
app.all('/api/health', health);

const port = Number(process.env.API_PORT ?? 3001);
app.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));
