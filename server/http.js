// Small helpers shared by the /api handlers (work on Vercel and in Express).

export function allowMethods(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: `Use ${methods.join(' or ')}` });
    return false;
  }
  return true;
}

// Rough per-IP rate limit to protect the Anthropic bill on a public demo.
// In-memory, so each serverless instance keeps its own count. Good enough
// for a demo; use a shared store (e.g. Redis) in production.
const hits = new Map();
export function rateLimit(req, res, { limit = 20, windowMs = 60_000 } = {}) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  const entry = hits.get(ip) ?? { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  hits.set(ip, entry);
  if (entry.count > limit) {
    res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
    return false;
  }
  return true;
}

// Basic check that the browser sent a LaunchDarkly context we can use.
export function readContext(body) {
  const ctx = body?.context;
  if (!ctx || typeof ctx !== 'object' || !ctx.kind) return null;
  return ctx;
}
