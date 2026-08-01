# Lawn Defense 3D

A Plants vs. Zombies–style lane defense game built with Three.js — a full 11-level adventure where every plant, zombie, and explosion is a real 3D shape with lighting, shadows, particles, and procedural sound. A personal fan homage to PvZ mechanics; all art is original low-poly geometry.

## Run it

```
npx --yes http-server -p 5173 -c-1 .
```

Then open http://localhost:5173. No build step, no install — the game is plain ES modules and Three.js is vendored in `lib/`.

## Test it

```
npm test
```

Headless simulation of every combat mechanic (52 checks): rage mode, vaulting, shields, torchwood fire peas, boss smash/imp throw, breach handoff, and campaign data integrity.

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
| `src/main.js` | Bootstrap and render loop |
| `test/sim.mjs` | Headless mechanics test suite |
| `lib/three.module.js` | Three.js r160, vendored locally |

The lawn is a `Grid[5][9]` matrix; combat is lane-scoped. Plant behaviors are data-driven (`behavior:` shooter / producer / wall / mine / bomb / squash / melee / spikes / torch / lobber), so adding a plant is a config entry + a mesh builder.

## Disclaimer

This is a non-commercial fan project built to learn grid mechanics, state machines, and real-time 3D. It is not affiliated with, endorsed by, or connected to PopCap Games or Electronic Arts. All code and art here are original — every model is built from Three.js primitives at runtime; no assets from any commercial game are used or redistributed. Plant and zombie archetype names are used descriptively to reference the genre this project studies.

## Roadmap (from the crazy-ideas session)

1. AI Director — subagent designs waves that counter your playstyle
2. Excel-as-level-editor — design waves in a spreadsheet, convert to level data
3. Claude the playtester — automated browser playthroughs with balance reports
4. Nightly balance patch — telemetry + scheduled tuning
