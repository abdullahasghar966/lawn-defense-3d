// Vercel serverless entry point.
//
// Vercel turns each file under /api into a function. vercel.json rewrites every
// /api/* request here, and the Express app routes it. Static game files are
// served straight from Vercel's CDN, so this function never touches them.
import { createApp } from '../server/app.js';

export default createApp({ serveStatic: false });
