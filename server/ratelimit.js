// Fixed-window rate limiting, backed by the database.
//
// Counters deliberately live in shared storage rather than process memory: a
// serverless deployment runs many instances, and per-process counters would each
// hand out the full quota.
import { rateLimits } from './db.js';

/**
 * Express middleware. `keyFn` decides what is being limited — IP alone for broad
 * abuse, or IP plus the submitted email so one attacker cannot lock out an
 * unrelated account by hammering it.
 */
export function rateLimit({ limit, windowMs, keyFn, message }) {
  return async (req, res, next) => {
    const key = `${req.path}|${keyFn ? keyFn(req) : req.ip}`;
    let result;
    try {
      result = await rateLimits.hit(key, limit, windowMs);
    } catch (err) {
      // Never lock people out of signing in because housekeeping storage blipped.
      console.error('Rate limit check failed, allowing request:', err.message);
      return next();
    }
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
