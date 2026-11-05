import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, assert } from './errors.mjs';
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cache-Control': 'no-store'
};
export function secureEqual(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); }
export async function readBody(req, limit = 262144) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new HttpError(413, 'Request is too large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export function jsonBody(raw) { try { return JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); } }
export function sameOrigin(req, origin) {
  assert(req.headers.origin === origin, 403, 'Request origin is not allowed');
  assert((req.headers['content-type'] || '').startsWith('application/json'), 415, 'Use application/json');
}
export function rateLimiter({ limit = 60, windowMs = 60000, maxKeys = 10000, now = Date.now } = {}) {
  const entries = new Map();
  return key => {
    const time = now();
    for (const [k, value] of entries) if (value.until <= time) entries.delete(k);
    const value = entries.get(key) || { count: 0, until: time + windowMs };
    assert(entries.has(key) || entries.size < maxKeys, 429, 'Server is busy. Try again shortly.');
    value.count++; entries.set(key, value);
    assert(value.count <= limit, 429, 'Too many requests. Try again shortly.', 'rate_limited');
  };
}
export function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(p => { const i=p.indexOf('=');return i<0?[]:[p.slice(0,i).trim(),p.slice(i+1)]; }).filter(p=>p.length===2));
}
export function sessionCookies(session, secure, clear=false) {
  const tail=`; HttpOnly; SameSite=Strict; Path=/${secure?'; Secure':''}`;
  return [`sm_access=${clear?'':session.access_token}; Max-Age=${clear?0:Math.min(session.expires_in || 3600,3600)}${tail}`, `sm_refresh=${clear?'':session.refresh_token}; Max-Age=${clear?0:604800}${tail}`];
}
export function verifyTwilio(url, params, signature, token) {
  if (!token || !signature) return false;
  const message = url + Object.keys(params).sort().map(key => key + params[key]).join('');
  return secureEqual(createHmac('sha1', token).update(message).digest('base64'), signature);
}
export function verifyStripe(raw, signature, secret, now = Date.now()) {
  if (!secret || !signature) return false;
  const parts=signature.split(',').map(p=>p.split('=')); const timestamp=parts.find(([key])=>key==='t')?.[1];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(now/1000-Number(timestamp))>300) return false;
  const expected=createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex');
  return parts.some(([key,value])=>key==='v1' && secureEqual(expected,value));
}
