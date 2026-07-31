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

export const ZOMBIES = {
  basic:      { name: 'Zombie',           hp: 100, speed: 0.28, dps: 60 },
  flag:       { name: 'Flag zombie',      hp: 130, speed: 0.37, dps: 60, flag: true },
  conehead:   { name: 'Conehead',         hp: 260, speed: 0.28, dps: 60 },
  buckethead: { name: 'Buckethead',       hp: 500, speed: 0.28, dps: 60 },
  polevault:  { name: 'Pole vaulter',     hp: 240, speed: 0.44, dps: 60, vault: true },
  newspaper:  { name: 'Newspaper zombie', hp: 150, speed: 0.26, dps: 60, paper: 130 },
  screendoor: { name: 'Screen door',      hp: 120, speed: 0.28, dps: 60, shield: 300 },
  football:   { name: 'Football zombie',  hp: 560, speed: 0.5,  dps: 85 },
  imp:        { name: 'Imp',              hp: 70,  speed: 0.55, dps: 45, small: true },
  brute:      { name: 'The Brute',        hp: 3400, speed: 0.13, dps: 0, boss: true },
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
export const SKY_SUN_INTERVAL = 8;
export const SUN_LIFETIME = 9;

export const THEMES = {
  day:   { skyTop: '#5eb8e8', skyBottom: '#c8ecf8', fogFar: 45, ambient: 0.8,  sunColor: 0xfff2d0, sunIntensity: 1.7, tileMul: 1.0 },
  night: { skyTop: '#0e1630', skyBottom: '#3a4a78', fogFar: 40, ambient: 0.45, sunColor: 0x9ab0e8, sunIntensity: 0.95, tileMul: 0.55 },
  dusk:  { skyTop: '#3a2048', skyBottom: '#d88a5a', fogFar: 42, ambient: 0.6,  sunColor: 0xe8b090, sunIntensity: 1.15, tileMul: 0.75 },
};
