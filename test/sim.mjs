import { Plant, Zombie, Projectile, Lob } from '../src/entities.js';
import { PLANT_BUILDERS, buildZombie } from '../src/models.js';
import { PLANTS, ZOMBIES, ROWS, TILE, boardX, boardZ, worldToCol } from '../src/constants.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

function makeGame() {
  const game = {
    plants: [],
    zombies: [],
    projectiles: [],
    lobs: [],
    suns: [],
    torchCols: Array.from({ length: ROWS }, () => new Set()),
    grid: Array.from({ length: ROWS }, () => Array(9).fill(null)),
    scene: { add() {}, remove() {} },
    particles: { burst() {}, gib() { game.gibbed++; }, items: [], gibs: [] },
    gibbed: 0,
    shaken: 0,
    impsThrown: 0,
    shake() { game.shaken++; },
    spawnSun() { game.sunsSpawned = (game.sunsSpawned || 0) + 1; },
    zombieInLane(row, minX, maxX = Infinity) {
      return game.zombies.some((z) => z.row === row && z.state !== 'DYING' && z.state !== 'FLYING' && z.x > minX && z.x < maxX);
    },
    nearestZombie(row, minX) {
      let best = null;
      for (const z of game.zombies) {
        if (z.row !== row || z.state === 'DYING' || z.state === 'FLYING' || z.x < minX) continue;
        if (!best || z.x < best.x) best = z;
      }
      return best;
    },
    plantInFront(zombie) {
      const frontX = zombie.x - 0.32 * zombie.scaleFactor;
      const col = Math.round(frontX / TILE + 4);
      if (col < 0 || col > 8) return null;
      const plant = game.grid[zombie.row][col];
      if (plant && !plant.cfg.noBlock && Math.abs(boardX(col) - frontX) < 0.62) return plant;
      return null;
    },
    fireProjectile(plant, row) {
      const dmg = plant.cfg.dmg + (plant.rage ? 15 : 0);
      game.projectiles.push(new Projectile(row, plant.x + 0.5, boardZ(row), plant.cfg.projectile, dmg, plant.cfg.range, game));
    },
    fireLob(plant, targetX) {
      game.lobs.push(new Lob(plant.row, plant.x + 0.3, plant.z, targetX, plant.cfg.dmg, plant.cfg.splash, game));
    },
    areaDamage(x, z, radius, dmg, opts = {}) {
      for (const zo of game.zombies) {
        if (zo.state === 'DYING') continue;
        if (opts.row !== undefined && zo.row !== opts.row) continue;
        const dx = zo.x - x, dz = zo.z - z;
        if (Math.sqrt(dx * dx + dz * dz) <= radius) zo.hit(dmg, { pierce: true });
      }
    },
    explode(x, z, radius, dmg, opts = {}) { game.exploded = true; game.areaDamage(x, z, radius, dmg, opts); },
    laneFire(row, dmg) {
      game.laneFired = row;
      for (const zo of game.zombies) if (zo.row === row && zo.state !== 'DYING') zo.hit(dmg, { pierce: true, fire: true });
    },
    throwImp(brute) {
      game.impsThrown++;
      const imp = new Zombie('imp', brute.row, buildZombie('imp'), brute.x);
      imp.game = game;
      imp.state = 'FLYING';
      imp.flyData = { t: 0, fromX: brute.x, toX: brute.x - 2.6 };
      game.zombies.push(imp);
    },
    removePlant(plant) {
      const i = game.plants.indexOf(plant);
      if (i !== -1) game.plants.splice(i, 1);
      if (game.grid[plant.row][plant.col] === plant) game.grid[plant.row][plant.col] = null;
      game.removed = (game.removed || []).concat(plant.type);
    },
  };
  return game;
}

function addPlant(game, type, row, col) {
  const p = new Plant(type, row, col, PLANT_BUILDERS[type]());
  game.plants.push(p);
  game.grid[row][col] = p;
  if (type === 'torchwood') game.torchCols[row].add(col);
  return p;
}

function addZombie(game, type, row, x) {
  const z = new Zombie(type, row, buildZombie(type), x);
  z.game = game;
  game.zombies.push(z);
  return z;
}

function step(game, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    for (const p of [...game.plants]) p.update(dt, game);
    for (const z of [...game.zombies]) z.update(dt, game);
    for (const pr of game.projectiles) pr.update(dt, game);
    for (const l of game.lobs) l.update(dt, game);
    game.projectiles = game.projectiles.filter((p) => !p.dead);
    game.lobs = game.lobs.filter((l) => !l.dead);
    game.zombies = game.zombies.filter((z) => !z.dead && !z.devoured);
  }
}

console.log('1. Peashooter kills a basic zombie');
{
  const g = makeGame();
  addPlant(g, 'peashooter', 2, 1);
  const z = addZombie(g, 'basic', 2, 3.5);
  step(g, 20);
  check('zombie died', !g.zombies.includes(z));
  check('head gib flew', g.gibbed > 0);
}

console.log('2. Rage mode triggers close-up and fires faster');
{
  const g = makeGame();
  const p = addPlant(g, 'peashooter', 2, 1);
  const zFar = addZombie(g, 'basic', 2, 6.0);
  zFar.speed = 0;
  let farShots = 0;
  const t0 = g.projectiles.length;
  for (let i = 0; i < 56; i++) { const b = g.projectiles.length; step(g, 0.05); if (g.projectiles.length > b) farShots++; }
  check('no rage at range', !p.rage);
  const g2 = makeGame();
  const p2 = addPlant(g2, 'peashooter', 2, 1);
  const zNear = addZombie(g2, 'basic', 2, p2.x + 1.5);
  zNear.speed = 0;
  zNear.hp = 100000;
  let nearShots = 0;
  for (let i = 0; i < 56; i++) { const b = g2.projectiles.length; step(g2, 0.05); if (g2.projectiles.length > b) nearShots++; }
  check('rage active up close', p2.rage);
  check(`rage fires ~3x faster (${nearShots} vs ${farShots})`, nearShots >= farShots * 2);
}

console.log('3. Snow pea slows');
{
  const g = makeGame();
  addPlant(g, 'snowpea', 2, 1);
  const z = addZombie(g, 'basic', 2, 3.0);
  z.hp = 100000;
  step(g, 3);
  check('slow applied', z.slowT > 0);
  check('speed halved', Math.abs(z.effSpeed() - z.speed * 0.5) < 1e-9);
}

console.log('4. Wall-nut blocks and gets eaten');
{
  const g = makeGame();
  const w = addPlant(g, 'wallnut', 2, 3);
  const z = addZombie(g, 'basic', 2, w.x + 0.5);
  step(g, 3);
  check('zombie attacking', z.state === 'ATTACKING');
  check('wallnut losing hp', w.hp < w.maxHp);
}

console.log('5. Pole vaulter vaults a wall-nut but not a tall-nut');
{
  const g = makeGame();
  const w = addPlant(g, 'wallnut', 2, 3);
  const z = addZombie(g, 'polevault', 2, w.x + 0.8);
  step(g, 4);
  check('vaulted past', z.vaulted && z.x < w.x - 0.5);
  const g2 = makeGame();
  const t = addPlant(g2, 'tallnut', 2, 3);
  const z2 = addZombie(g2, 'polevault', 2, t.x + 0.8);
  step(g2, 4);
  check('tall-nut stops vault', z2.state === 'ATTACKING' && !z2.vaulted);
}

console.log('6. Newspaper zombie enrages when paper is shot off');
{
  const g = makeGame();
  addPlant(g, 'peashooter', 2, 0);
  const z = addZombie(g, 'newspaper', 2, 4.5);
  z.hp = 100000;
  const baseSpeed = z.effSpeed();
  step(g, 12);
  check('paper destroyed', z.paperHp <= 0);
  check('enraged and faster', z.raged && z.effSpeed() > baseSpeed * 1.5);
}

console.log('7. Screen door absorbs peas, melon bypasses');
{
  const g = makeGame();
  addPlant(g, 'peashooter', 2, 0);
  const z = addZombie(g, 'screendoor', 2, 4.5);
  z.speed = 0;
  step(g, 4);
  check('shield ate the damage', z.hp === z.maxHp && z.shieldHp < ZOMBIES.screendoor.shield);
  z.hit(90, { projectile: true, lobbed: true });
  check('lobbed melon bypasses shield', z.hp === z.maxHp - 90);
}

console.log('8. Cherry bomb explodes after fuse');
{
  const g = makeGame();
  addPlant(g, 'cherrybomb', 2, 4);
  const z1 = addZombie(g, 'basic', 2, boardX(4) + 0.8);
  const z2 = addZombie(g, 'conehead', 1, boardX(4) + 0.4);
  z1.speed = 0; z2.speed = 0;
  step(g, 2.5);
  check('exploded', g.exploded === true);
  check('cherry removed itself', (g.removed || []).includes('cherrybomb'));
  check('both lanes hit', !g.zombies.includes(z1) && !g.zombies.includes(z2));
}

console.log('9. Jalapeño torches its whole lane');
{
  const g = makeGame();
  const z1 = addZombie(g, 'buckethead', 2, 5.0);
  const z2 = addZombie(g, 'basic', 2, 1.0);
  const z3 = addZombie(g, 'basic', 1, 1.0);
  z1.speed = z2.speed = z3.speed = 0;
  addPlant(g, 'jalapeno', 2, 4);
  step(g, 2.5);
  check('lane fired', g.laneFired === 2);
  check('lane cleared, other lane spared', !g.zombies.includes(z1) && !g.zombies.includes(z2) && g.zombies.includes(z3));
}

console.log('10. Chomper devours a zombie then chews');
{
  const g = makeGame();
  const c = addPlant(g, 'chomper', 2, 2);
  const z = addZombie(g, 'basic', 2, c.x + 1.0);
  step(g, 1);
  check('zombie devoured', !g.zombies.includes(z));
  check('chomper is chewing', c.chew > 10);
  const z2 = addZombie(g, 'basic', 2, c.x + 0.8);
  z2.speed = 0;
  step(g, 2);
  check('cannot bite while chewing', g.zombies.includes(z2));
}

console.log('11. Potato mine arms then detonates');
{
  const g = makeGame();
  const m = addPlant(g, 'potatomine', 2, 3);
  const z = addZombie(g, 'basic', 2, m.x + 4.4);
  step(g, 8);
  check('not armed early, zombie walks over it later', g.zombies.includes(z));
  step(g, 6);
  check('armed', m.armed);
  step(g, 8);
  check('mine detonated on contact', g.exploded && !g.zombies.includes(z) && (g.removed || []).includes('potatomine'));
}

console.log('12. Squash leaps and flattens');
{
  const g = makeGame();
  addPlant(g, 'squash', 2, 3);
  const z = addZombie(g, 'buckethead', 2, boardX(3) + 0.85);
  step(g, 3);
  check('squash killed buckethead and left', !g.zombies.includes(z) && (g.removed || []).includes('squash'));
}

console.log('13. Torchwood upgrades peas to fire');
{
  const g = makeGame();
  addPlant(g, 'peashooter', 2, 1);
  addPlant(g, 'torchwood', 2, 3);
  const z = addZombie(g, 'basic', 2, 4.8);
  z.speed = 0; z.hp = 100000;
  let sawFire = false;
  for (let i = 0; i < 100; i++) {
    step(g, 0.05);
    if (g.projectiles.some((p) => p.kind === 'fire' && p.dmg === 50)) sawFire = true;
  }
  check('pea became a 50-damage fire pea', sawFire);
}

console.log('14. Threepeater lane spread clamps at edges');
{
  const g = makeGame();
  const top = addPlant(g, 'threepeater', 0, 1);
  const mid = addPlant(g, 'threepeater', 2, 2);
  check('row 0 spread', JSON.stringify(top.lanes()) === '[0,1]');
  check('row 2 spread', JSON.stringify(mid.lanes()) === '[1,2,3]');
  const z = addZombie(g, 'basic', 3, 4.0);
  z.speed = 0;
  step(g, 2);
  check('fires into all its lanes', g.projectiles.some((p) => p.row === 1) && g.projectiles.some((p) => p.row === 3));
}

console.log('15. Melon-pult lobs with splash');
{
  const g = makeGame();
  addPlant(g, 'melonpult', 2, 0);
  const z1 = addZombie(g, 'basic', 2, 3.0);
  const z2 = addZombie(g, 'basic', 2, 3.6);
  z1.speed = z2.speed = 0;
  step(g, 5);
  check('splash damaged both', z1.hp < z1.maxHp && z2.hp < z2.maxHp || (!g.zombies.includes(z1) && z2.hp < z2.maxHp));
}

console.log('16. Spikeweed hurts walkers without blocking');
{
  const g = makeGame();
  addPlant(g, 'spikeweed', 2, 3);
  const z = addZombie(g, 'basic', 2, boardX(3) + 0.4);
  step(g, 1.5);
  check('zombie kept walking', z.state === 'WALKING');
  check('zombie took spike damage', z.hp < z.maxHp);
}

console.log('17. The Brute smashes plants and hurls an imp');
{
  const g = makeGame();
  const w = addPlant(g, 'wallnut', 2, 3);
  const b = addZombie(g, 'brute', 2, w.x + 1.2);
  step(g, 5);
  check('smashed the wall-nut flat', (g.removed || []).includes('wallnut'));
  b.hit(b.maxHp * 0.5, { pierce: true });
  step(g, 2);
  check('imp thrown at half hp', g.impsThrown === 1);
  const imp = g.zombies.find((z) => z.type === 'imp');
  check('imp landed and walks', imp && imp.state === 'WALKING');
  b.hit(999999, { pierce: true });
  step(g, 2.5);
  check('boss died', !g.zombies.includes(b));
}

console.log('18. Puff-shroom range limit');
{
  const g = makeGame();
  const p = addPlant(g, 'puffshroom', 2, 1);
  const zFar = addZombie(g, 'basic', 2, p.x + 5);
  zFar.speed = 0;
  step(g, 3);
  check('holds fire beyond range', g.projectiles.length === 0 && zFar.hp === zFar.maxHp);
  const zNear = addZombie(g, 'basic', 2, p.x + 2);
  zNear.speed = 0;
  step(g, 3);
  check('fires inside range', zNear.hp < zNear.maxHp);
}

console.log('19. Sunflower beast mode — panic bloom then sacrifice');
{
  const g = makeGame();
  const s = addPlant(g, 'sunflower', 2, 1);
  step(g, 2);
  check('calm while safe', !s.beast && g.plants.includes(s));
  const z = addZombie(g, 'basic', 2, s.x + 1.5);
  z.speed = 0;
  step(g, 0.2);
  check('beast mode triggered by danger', !!s.beast);
  step(g, 2);
  check('erupted a fountain of suns', (g.sunsSpawned || 0) >= 6);
  check('sacrificed itself — tile is free again', (g.removed || []).includes('sunflower') && g.grid[2][1] === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
