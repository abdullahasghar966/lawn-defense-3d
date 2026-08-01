# Lawn Defense 3D

A Plants vs. Zombies–style lane defense game built with Three.js — a full 11-level adventure where every plant, zombie, and explosion is a real 3D shape with lighting, shadows, particles, and procedural sound. A personal fan homage to PvZ mechanics; all art is original low-poly geometry.

## Run it

```
npm install && npm start
```

Then open http://localhost:5173. There is still no build step — the game is plain ES modules and Three.js is vendored in `lib/`. The install is for the server (accounts and saved progress).

Prefer to skip the backend entirely? The game is happy as a static site:

```
npm run static
```

It detects that no API is there, drops into guest mode, and stores progress in localStorage exactly as it always did. That is also what happens if you host the folder on GitHub Pages — everything works except accounts.

## Accounts (optional)

Signing in is never required; "Play as guest" is always on the sign-in screen. Signed-in players get their progress stored server-side instead of per-browser.

It runs with **no configuration at all**: verification codes print to the server console instead of being emailed, and the Google button stays hidden. To turn on the real flows, copy `.env.example` to `.env` and fill in:

- `SESSION_SECRET` — required in production. Without it a random one is generated and every restart signs everybody out.
- `GOOGLE_CLIENT_ID` — see below. This flow needs only the client ID, which is public by design; there is no client secret to leak.
- `SMTP_*` — any SMTP provider, to actually deliver the six-digit codes. Gmail needs an App Password, not your account password.

`.env` is gitignored. Don't commit real values.

### Getting unstuck in development

Without SMTP the six-digit code is printed to the server console, not emailed. If you lose it, or you restarted the server (which invalidates pending codes unless `SESSION_SECRET` is set):

```
node scripts/dev-account.mjs --list                    # who exists, and who is verified
node scripts/dev-account.mjs you@example.com --verify  # skip the code entirely
node scripts/dev-account.mjs you@example.com           # mint a fresh code
```

It needs direct access to the SQLite file, so it is not a way around the login from anywhere but your own machine, and it refuses to run with `NODE_ENV=production`. Minting a code also requires `SESSION_SECRET` to be set, since codes are signed with it.

### Turning on Google sign-in

The code is already there — the button only hides because no client ID is configured. In development the sign-in screen says so explicitly rather than pretending the feature doesn't exist.

1. Go to <https://console.cloud.google.com/apis/credentials> and pick or create a project.
2. **OAuth consent screen** → External → fill in app name and your email → Save. While it is in "Testing", add your own Google account under **Test users**.
3. **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
4. Under **Authorised JavaScript origins** add `http://localhost:5173` (and your real domain later). Leave *redirect URIs* empty — this flow doesn't use them.
5. Copy the client ID (it ends in `.apps.googleusercontent.com`) into `.env`:

   ```
   GOOGLE_CLIENT_ID=1234567890-abcdef.apps.googleusercontent.com
   ```

6. Restart the server. The button appears.

There is deliberately no client secret here. The browser receives a signed ID token from Google and the server verifies its signature and audience before trusting a single field of it, so nothing confidential ever ships to the client.

If someone signs in with Google using an address that already has a password account, the two are linked rather than duplicated — Google has already proven ownership of the address.

### How the auth is built

- Passwords hashed with **scrypt** (`node:crypto`), random per-user salt, constant-time compare. A decoy hash runs when the account doesn't exist so timing can't reveal which addresses are registered.
- Signup codes are six digits, **stored as an HMAC** (never in the clear), expiring in 10 minutes, invalidated after 5 wrong guesses.
- Sessions are opaque random tokens in an **HttpOnly, SameSite=Lax** cookie (`Secure` in production). Only a SHA-256 of the token is stored, so a database copy can't be replayed as a live login.
- Google sign-in verifies the ID token's signature and audience server-side via `google-auth-library` — the browser is never trusted to assert who it is.
- Rate limiting on signup, login, verification and resend, keyed by IP **and** by IP+email so nobody can lock out someone else's account.
- Cross-origin state-changing requests are refused, and progress is merged forward-only so a stale client can't revoke unlocked levels.

Storage is SQLite via `node:sqlite`, which ships with Node — no native build, no database to run. The file lives at `data/lawn-defense.db` (gitignored).

## Test it

```
npm test
```

Two suites, 86 checks total:

- `test/sim.mjs` (52) — headless simulation of every combat mechanic: rage mode, vaulting, shields, torchwood fire peas, boss smash/imp throw, breach handoff, campaign data integrity.
- `test/auth.mjs` (34) — boots the real Express app against a throwaway database: signup, code expiry and burnout, login, account-enumeration resistance, session lifecycle, forward-only progress, cross-origin refusal, and rate limiting.

## The game

- **11 levels** across day, night, and dusk themes. Beating a level unlocks the next plus new plants (progress saved in localStorage).
- **16 plants**: Sunflower, Peashooter, Wall-nut, Potato Mine, Snow Pea, Chomper, Repeater, Puff-shroom, Cherry Bomb, Squash, Threepeater, Jalapeño, Torchwood, Tall-nut, Spikeweed, Melon-pult.
- **10 zombies**: basic, flag (leads huge waves), conehead, buckethead, pole vaulter (jumps your first plant — unless it's a Tall-nut), newspaper (enrages when the paper's shot off), screen door (blocks peas, not lobbed melons), football, imp, and **The Brute** — the level-11 boss that smashes plants with a club and hurls an imp at half health.
- **Rage mode**: pea-family plants within ~2 tiles of a zombie see red — triple fire rate, bonus damage, glowing shaking heads.
- **Sunflower beast mode**: when danger closes in, sunflowers panic-bloom — spin, glow, erupt a fountain of 6 suns, and die. Replant or go broke.
- **Shovel**: the button next to the seed cards digs up a misplaced plant. No sun refund, just like the real thing.
- **Look**: semi-realistic PBR rendering — filmic (ACES) tonemapping, image-based lighting from a procedural sky, soft shadows, and physically-shaded materials on everything. Every texture (grass, brick, bark, roof shingle, cloth, zombie skin) is drawn procedurally onto a canvas at load with a matching normal map — the project still ships zero binary assets. The yard is dressed with instanced grass, leaf litter, ivy climbing the brickwork, a shingled house with a working front door, a picket fence, and a graveyard.
- **Breach cinematic**: if a zombie gets past the last mower it doesn't clip through the wall — it crosses to the front door, hammers on it, bursts it open in a shower of splinters, and walks into the dark. Then the house screams. The camera pushes in, the porch light dies, the windows flash red, and the screen bleeds to black.
- **Juice**: camera shake, particle explosions, zombie heads (and hats) that pop off on kills, fire-pea trails through Torchwood, lobbed melon arcs, WebAudio synth SFX including a formant-synthesised scream, seed-card icons rendered live from the 3D models, huge-wave flags on the progress bar.

## Architecture

| File | Role |
|------|------|
| `src/constants.js` | All balance data — plants, zombies, projectiles, themes |
| `src/levels.js` | The 11-level campaign (waves, unlocks, themes) |
| `src/models.js` | 3D mesh builders for every plant, zombie, and prop |
| `src/textures.js` | Procedural canvas textures + normal maps (no image files) |
| `src/entities.js` | Entity classes and the zombie FSM (`WALKING → ATTACKING / VAULTING / SMASH / THROW / DYING / BREACH`) |
| `src/game.js` | Engine — scene, input, economy, waves, level flow, effects |
| `src/particles.js` | Particle bursts and flying gibs |
| `src/sfx.js` | Procedural WebAudio sound effects (no audio files) |
| `src/thumbs.js` | Renders seed-card icons from the actual 3D models |
| `src/session.js` | Session state + progress store (server, or localStorage when offline) |
| `src/auth-ui.js` | Sign-in / sign-up / code-verification screen |
| `src/main.js` | Bootstrap and render loop |
| `server/index.js` | Server entry point and startup diagnostics |
| `server/app.js` | Express app: security headers, static hosting, API mount |
| `server/routes.js` | Auth and progress endpoints |
| `server/db.js` | SQLite schema and queries (`node:sqlite`) |
| `server/security.js` | scrypt hashing, session tokens, one-time codes |
| `server/mailer.js` | SMTP delivery, with a console fallback when unconfigured |
| `server/ratelimit.js` | In-memory fixed-window rate limiting |
| `test/sim.mjs` | Headless mechanics test suite |
| `test/auth.mjs` | Auth API test suite |
| `lib/three.module.js` | Three.js r160, vendored locally |

The lawn is a `Grid[5][9]` matrix; combat is lane-scoped. Plant behaviors are data-driven (`behavior:` shooter / producer / wall / mine / bomb / squash / melee / spikes / torch / lobber), so adding a plant is a config entry + a mesh builder.

## Disclaimer

This is a non-commercial fan project built to learn grid mechanics, state machines, and real-time 3D. It is not affiliated with, endorsed by, or connected to PopCap Games or Electronic Arts. All code and art here are original — every model is built from Three.js primitives at runtime; no assets from any commercial game are used or redistributed. Plant and zombie archetype names are used descriptively to reference the genre this project studies.
