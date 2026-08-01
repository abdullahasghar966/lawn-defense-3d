// Express app construction, kept separate from the listener so tests can mount
// it on an ephemeral port.
import express from 'express';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { router, loadSession } from './routes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexFile = join(root, 'index.html');

/**
 * CSP hashes for the inline scripts in index.html.
 *
 * The Three.js import map has to be inline — import maps cannot be loaded from a
 * src attribute — so a bare `script-src 'self'` silently blocks it and the whole
 * module graph fails to resolve "three". Hashing it keeps the policy strict
 * without resorting to 'unsafe-inline'.
 */
let cached = { mtimeMs: 0, hashes: [] };
function inlineScriptHashes() {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(indexFile).mtimeMs;
  } catch {
    return [];
  }
  if (mtimeMs === cached.mtimeMs) return cached.hashes;

  const html = readFileSync(indexFile, 'utf8');
  const hashes = [];
  // Inline scripts only — anything with a src is covered by 'self'.
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    hashes.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  }
  cached = { mtimeMs, hashes };
  return hashes;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.serveStatic] Serve the game files from this process.
 *   True for `npm start`. False on Vercel, where the CDN serves them and only
 *   /api reaches the function.
 */
export function createApp({ serveStatic = true } = {}) {
  const app = express();

  // Behind a reverse proxy, req.ip must come from X-Forwarded-For or every client
  // looks like the proxy and rate limiting collapses into one shared bucket.
  // Vercel always fronts the function with its edge network.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  else if (process.env.VERCEL) app.set('trust proxy', 1);

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    // Google Identity Services needs its own script/frame origins allowed.
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      `script-src 'self' ${inlineScriptHashes().join(' ')} https://accounts.google.com/gsi/client`,
      "connect-src 'self' https://accounts.google.com/gsi/",
      "frame-src https://accounts.google.com/gsi/",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
      "img-src 'self' data: https://*.googleusercontent.com",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '));
    next();
  });

  app.use(express.json({ limit: '16kb' }));
  app.use(loadSession);
  app.use('/api', router);
  // Serverless rewrites can strip the /api prefix before the function sees the
  // request, so the same router is also reachable unprefixed. Whichever form
  // arrives, one of these matches.
  if (!serveStatic) app.use(router);

  if (serveStatic) {
    app.use(express.static(root, {
      index: 'index.html',
      setHeaders(res, path) {
        // The vendored Three build is the only thing worth caching hard.
        if (path.endsWith('three.module.js')) res.setHeader('Cache-Control', 'public, max-age=604800');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }));
  }

  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Something went wrong on our end.' });
  });

  return app;
}
