// The AI SDK's tracker "resumption token" lets a later request (thumbs up /
// down) attach feedback to the original AI run. The SDK docs warn that it
// reveals the variation key and version, so we encrypt it before it goes to
// the browser. The key is derived from the server-side SDK key.
import crypto from 'node:crypto';

function key() {
  const secret = process.env.LD_SDK_KEY || 'local-dev-only-secret';
  return crypto.createHash('sha256').update(`pulse-feedback:${secret}`).digest();
}

export function seal(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

export function unseal(token) {
  const buf = Buffer.from(String(token), 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
