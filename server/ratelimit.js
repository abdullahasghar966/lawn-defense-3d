// Fixed-window rate limiting, in memory.
//
// Adequate for a single-process hobby deployment. If this ever runs behind more
// than one instance the counters need to move to shared storage (Redis or the
// sqlite file), because each process would otherwise allow the full quota.
const buckets = new Map();

function hit(key, limit, windowMs) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - entry.count, retryAfter: 0 };
}

/**
 * Express middleware. `keyFn` decides what is being limited — IP alone for broad
 * abuse, or IP plus the submitted email so one attacker cannot lock out an
 * unrelated account by hammering it.
 */
export function rateLimit({ limit, windowMs, keyFn, message }) {
  return (req, res, next) => {
    const key = `${req.path}|${keyFn ? keyFn(req) : req.ip}`;
    const result = hit(key, limit, windowMs);
    if (result.ok) return next();
    res.setHeader('Retry-After', String(result.retryAfter));
    return res.status(429).json({
      error: message || 'Too many attempts. Please wait a moment and try again.',
      retryAfter: result.retryAfter,
    });
  };
}

export const byIp = (req) => req.ip;
export const byIpAndEmail = (req) =>
  `${req.ip}|${String(req.body?.email || '').trim().toLowerCase()}`;

// Keeps the map from growing without bound on a long-lived process.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) if (now >= entry.resetAt) buckets.delete(key);
}, 10 * 60 * 1000).unref();
