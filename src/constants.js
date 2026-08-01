export const COLS = 9;
export const ROWS = 5;
export const TILE = 1.2;

export const boardX = (col) => (col - (COLS - 1) / 2) * TILE;
export const boardZ = (row) => (row - (ROWS - 1) / 2) * TILE;
export const worldToCol = (x) => Math.round(x / TILE + (COLS - 1) / 2);

export const ZOMBIE_SPAWN_X = boardX(COLS - 1) + 2.2;
export const MOWER_X = boardX(0) - 1.15;
export const HOUSE_X = MOWER_X - 0.9;

export const PLANTS = {
  sunflower:   { name: 'Sunflower',    cost: 50,  cooldown: 5,  hp: 300,  behavior: 'producer', interval: 14 },
  peashooter:  { name: 'Peashooter',   cost: 100, cooldown: 5,  hp: 300,  behavior: 'shooter', interval: 1.4, dmg: 25, projectile: 'pea', family: 'pea' },
  wallnut:     { name: 'Wall-nut',     cost: 50,  cooldown: 20, hp: 1600, behavior: 'wall' },
  potatomine:  { name: 'Potato Mine',  cost: 25,  cooldown: 20, hp: 300,  behavior: 'mine', armTime: 12, dmg: 1400, noBlock: true },
  snowpea:     { name: 'Snow Pea',     cost: 175, cooldown: 5,  hp: 300,  behavior: 'shooter', interval: 1.4, dmg: 25, projectile: 'snow', family: 'pea' },
  chomper:     { name: 'Chomper',      cost: 150, cooldown: 5,  hp: 300,  behavior: 'melee', chewTime: 18, dmg: 420 },
  repeater:    { name: 'Repeater',     cost: 200, cooldown: 5,  hp: 300,  behavior: 'shooter', interval: 1.4, dmg: 25, shots: 2, projectile: 'pea', family: 'pea' },
  puffshroom:  { name: 'Puff-shroom',  cost: 0,   cooldown: 6,  hp: 200,  behavior: 'shooter', interval: 1.5, dmg: 20, projectile: 'puff', range: 3.4 },
  cherrybomb:  { name: 'Cherry Bomb',  cost: 150, cooldown: 30, hp: 9999, behavior: 'bomb', fuse: 1.1, dmg: 1800, radius: 2.0 },
  squash:      { name: 'Squash',       cost: 50,  cooldown: 20, hp: 9999, behavior: 'squash', dmg: 1800 },
  threepeater: { name: 'Threepeater',  cost: 325, cooldown: 5,  hp: 300,  behavior: 'shooter', interval: 1.4, dmg: 25, lanes: 3, projectile: 'pea', family: 'pea' },
  jalapeno:    { name: 'Jalapeño',     cost: 125, cooldown: 30, hp: 9999, behavior: 'bomb', fuse: 1.0, dmg: 1800, lane: true },
  torchwood:   { name: 'Torchwood',    cost: 175, cooldown: 5,  hp: 800,  behavior: 'torch' },
  tallnut:     { name: 'Tall-nut',     cost: 125, cooldown: 20, hp: 2800, behavior: 'wall', tall: true },
  spikeweed:   { name: 'Spikeweed',    cost: 100, cooldown: 6,  hp: 600,  behavior: 'spikes', dps: 40, noBlock: true },
  melonpult:   { name: 'Melon-pult',   cost: 300, cooldown: 5,  hp: 300,  behavior: 'lobber', interval: 2.6, dmg: 95, splash: 1.0 },
};

// Difficulty pass: every zombie hits harder and takes more killing than the
// original tuning. Speeds moved only slightly — pace is what makes a lane feel
// unfair, so the pressure comes from hp, dps and wave density instead.
export const ZOMBIES = {
  basic:      { name: 'Zombie',           hp: 130, speed: 0.30, dps: 72 },
  flag:       { name: 'Flag zombie',      hp: 175, speed: 0.39, dps: 72, flag: true },
  conehead:   { name: 'Conehead',         hp: 340, speed: 0.30, dps: 72 },
  buckethead: { name: 'Buckethead',       hp: 650, speed: 0.29, dps: 78 },
  polevault:  { name: 'Pole vaulter',     hp: 310, speed: 0.46, dps: 72, vault: true },
  newspaper:  { name: 'Newspaper zombie', hp: 195, speed: 0.27, dps: 72, paper: 160 },
  screendoor: { name: 'Screen door',      hp: 160, speed: 0.29, dps: 72, shield: 380 },
  football:   { name: 'Football zombie',  hp: 740, speed: 0.52, dps: 100 },
  imp:        { name: 'Imp',              hp: 95,  speed: 0.57, dps: 55, small: true },
  brute:      { name: 'The Brute',        hp: 4300, speed: 0.14, dps: 0, boss: true },
};

export const PROJECTILES = {
  pea:  { speed: 5.5, color: 0x5fc93a },
  snow: { speed: 5.5, color: 0x8ad8f0, slow: 5 },
  fire: { speed: 5.5, color: 0xff8a2a },
  puff: { speed: 4.5, color: 0xb88ad8 },
};

export const RAGE = { range: 2.8, rateMul: 3, bonusDmg: 15 };
export const SUNFLOWER_BEAST = { range: 2.4, burst: 6, windup: 1.2 };

export const SUN_VALUE = 25;
// Sun is scarcer and expires sooner than it used to — economy pressure is the
// other half of the difficulty pass.
export const SKY_SUN_INTERVAL = 9.5;
export const SUN_LIFETIME = 8;

// How long the house-breach cinematic runs before the defeat screen appears.
export const BREACH_DURATION = 4.2;

/**
 * Per-theme lighting. The sky gradient is also the image-based light (PMREM), so
 * ambient strength falls out of the sky colours themselves; `exposure` grades the
 * ACES-tonemapped result. `tileMul` still tints albedo, but only partway (see
 * scaleColor in models.js) because the light rig now carries most of the mood.
 */
export const THEMES = {
  day: {
    name: 'day',
    skyTop: '#3f8fd6', skyMid: '#8ec6ea', skyBottom: '#d8ecf4',
    groundHaze: '#6f8a4e', groundDeep: '#33461f',
    sunGlowInner: 'rgba(255,248,222,1)', sunGlowMid: 'rgba(255,232,178,0.5)',
    clouds: true, stars: false,
    fogColor: '#bcd9e2', fogNear: 22, fogFar: 58,
    ambient: 0.12, hemiSky: 0x9ec8ea, hemiGround: 0x46602a, hemiIntensity: 0.42,
    sunColor: 0xfff0cc, sunIntensity: 4.4, sunPos: [7.5, 9, 6.5],
    exposure: 0.95, tileMul: 1.0,
  },
  night: {
    name: 'night',
    skyTop: '#060b1c', skyMid: '#132043', skyBottom: '#2b3c68',
    groundHaze: '#1e2a3a', groundDeep: '#0c1219',
    sunGlowInner: 'rgba(216,228,255,0.95)', sunGlowMid: 'rgba(150,176,232,0.28)',
    clouds: false, stars: true,
    fogColor: '#1a2540', fogNear: 16, fogFar: 44,
    ambient: 0.07, hemiSky: 0x44598e, hemiGround: 0x121c0e, hemiIntensity: 0.3,
    sunColor: 0xa8bcf0, sunIntensity: 1.7, sunPos: [8, 12, -5],
    exposure: 1.18, tileMul: 0.55,
  },
  dusk: {
    name: 'dusk',
    skyTop: '#2c1a44', skyMid: '#8a4a58', skyBottom: '#e09a5e',
    groundHaze: '#5a4230', groundDeep: '#241a14',
    sunGlowInner: 'rgba(255,214,150,1)', sunGlowMid: 'rgba(240,140,80,0.45)',
    clouds: true, stars: false,
    fogColor: '#b0794f', fogNear: 18, fogFar: 50,
    ambient: 0.09, hemiSky: 0xc8825a, hemiGround: 0x35261a, hemiIntensity: 0.34,
    sunColor: 0xffa864, sunIntensity: 3.1, sunPos: [9, 5.0, 4],
    exposure: 1.02, tileMul: 0.75,
  },
};
