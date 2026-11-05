export class HttpError extends Error {
  constructor(status, message, code = 'request_failed') { super(message); this.status = status; this.code = code; }
}
export function assert(condition, status, message, code) { if (!condition) throw new HttpError(status, message, code); }
export function configuration(env) {
  const mode = env.APP_MODE || 'demo';
  assert(['demo', 'service'].includes(mode), 500, 'Invalid application mode');
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:3000');
  assert(origin.origin === origin.href.replace(/\/$/, ''), 500, 'APP_ORIGIN must be an origin without a path');
  if (mode === 'service') {
    assert(env.SUPABASE_URL && env.SUPABASE_ANON_KEY, 503, 'Supabase is not configured');
    const db = new URL(env.SUPABASE_URL);
    assert(db.protocol === 'https:' && db.hostname.endsWith('.supabase.co'), 500, 'Use a hosted Supabase HTTPS URL');
    assert(env.NODE_ENV !== 'production' || origin.protocol === 'https:', 500, 'Production requires HTTPS');
  }
  return { mode, origin: origin.origin, secure: origin.protocol === 'https:' };
}
