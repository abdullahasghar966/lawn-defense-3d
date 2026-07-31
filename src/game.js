import * as THREE from 'three';
import {
  COLS, ROWS, TILE, boardX, boardZ,
  ZOMBIE_SPAWN_X, MOWER_X, HOUSE_X,
  PLANTS, SUN_VALUE, SKY_SUN_INTERVAL, THEMES,
} from './constants.js';
import { PLANT_BUILDERS, buildTile, buildZombie, buildSun, buildMower, buildScenery } from './models.js';
import { Plant, Zombie, Projectile, Lob, Sun, Mower } from './entities.js';
import { Particles } from './particles.js';
import { LEVELS } from './levels.js';
import { thumbnail } from './thumbs.js';
import { sfx, initAudio } from './sfx.js';

const STORE_UNLOCKED = 'ld3d.unlocked';
const STORE_PENDING = 'ld3d.pending';

let glowTex = null;
function glowTexture() {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g2 = c.getContext('2d');
    const gr = g2.createRadialGradient(32, 32, 4, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,240,180,0.9)');
    gr.addColorStop(1, 'rgba(255,220,100,0)');
    g2.fillStyle = gr;
    g2.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  return glowTex;
}

export class Game {
  constructor(container, levelIndex) {
    this.container = container;
    this.levelIndex = levelIndex;
    this.level = levelIndex === null ? LEVELS[0] : LEVELS[levelIndex];
    this.theme = THEMES[this.level.theme] || THEMES.day;
    this.status = 'menu';
    this.sun = this.level.startSun;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.lobs = [];
    this.suns = [];
    this.mowers = [];
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.torchCols = Array.from({ length: ROWS }, () => new Set());
    this.selected = null;
    this.cooldowns = {};
    this.waveIndex = 0;
    this.waveTimer = this.level.waves[0].delay;
    this.pendingSpawns = [];
    this.skySunTimer = 4;
    this.totalZombies = this.level.waves.reduce((n, w) => n + w.zombies.length + (w.huge ? 1 : 0), 0);
    this.spawnedZombies = 0;
    this.shakeT = 0;
    this.shakeDur = 0;
    this.shakeAmp = 0;

    this.initScene();
    this.initBoard();
    this.particles = new Particles(this.scene);
    this.initInput();
    this.initHud();

    if (levelIndex === null) this.showMenu();
    else this.startLevel();
  }

  initScene() {
    const th = this.theme;
    this.scene = new THREE.Scene();
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2;
    skyCanvas.height = 256;
    const skyCtx = skyCanvas.getContext('2d');
    const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, th.skyTop);
    grad.addColorStop(1, th.skyBottom);
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 2, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog(new THREE.Color(th.skyBottom), 24, th.fogFar);

    this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 100);
    this.camBase = new THREE.Vector3(0.4, 9.2, 8.6);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, 0.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.prepend(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, th.ambient));
    this.scene.add(new THREE.HemisphereLight(0xbde8ff, 0x4e7a32, 0.3));
    const sunLight = new THREE.DirectionalLight(th.sunColor, th.sunIntensity);
    sunLight.position.set(6, 12, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const sc = sunLight.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 8; sc.bottom = -8;
    this.scene.add(sunLight);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  initBoard() {
    this.tiles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = buildTile(r, c, this.theme.tileMul);
        t.position.x = boardX(c);
        t.position.z = boardZ(r);
        t.userData.cell = { row: r, col: c };
        this.scene.add(t);
        this.tiles.push(t);
      }
      const strip = buildTile(r, 0, this.theme.tileMul, true);
      strip.position.x = MOWER_X;
      strip.position.z = boardZ(r);
      this.scene.add(strip);

      const mower = new Mower(r, buildMower(), MOWER_X);
      this.scene.add(mower.mesh);
      this.mowers.push(mower);
    }
    buildScenery(this.scene, boardX(0) - 0.6, boardX(COLS - 1) + 0.6, ROWS * TILE, this.theme);
  }

  initInput() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.ghost = null;
    this.hoverCell = null;

    this.shovel = false;
    this.shovelTarget = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.select(null); this.setShovel(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.select(null); this.setShovel(false); } });
  }

  initHud() {
    this.hud = {
      bar: document.getElementById('hud'),
      sun: document.getElementById('sun-amount'),
      cardsWrap: document.getElementById('seed-cards'),
      levelLabel: document.getElementById('level-label'),
      waveLabel: document.getElementById('wave-label'),
      waveFill: document.getElementById('wave-fill'),
      banner: document.getElementById('banner'),
      overlay: document.getElementById('overlay'),
      shovelBtn: document.getElementById('shovel-btn'),
    };
    this.cards = [];
    this.hud.shovelBtn.addEventListener('click', () => {
      if (this.status !== 'playing') return;
      this.setShovel(!this.shovel);
    });
  }

  setShovel(on) {
    if (on) this.select(null);
    this.shovel = on;
    if (!on && this.shovelTarget) {
      this.tintPlant(this.shovelTarget, 0x000000);
      this.shovelTarget = null;
    }
    this.hud.shovelBtn.classList.toggle('selected', on);
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
  }

  tintPlant(plant, hex) {
    plant.mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(hex);
    });
  }

  unlockedCount() {
    return Math.min(LEVELS.length - 1, parseInt(localStorage.getItem(STORE_UNLOCKED) || '0', 10));
  }

  showMenu() {
    this.status = 'menu';
    this.hud.bar.style.display = 'none';
    const unlocked = this.unlockedCount();
    const o = this.hud.overlay;
    o.classList.remove('hidden');
    o.innerHTML = `
      <h1 class="menu-title">Lawn Defense 3D</h1>
      <p class="menu-sub">The zombies are coming. Pick a level — beat it to unlock the next one and new plants.</p>
      <div class="level-grid"></div>
      <p class="menu-hint">Click seed card → click tile. Click suns to collect. Right-click or Esc cancels.</p>`;
    const grid = o.querySelector('.level-grid');
    LEVELS.forEach((lv, i) => {
      const btn = document.createElement('button');
      const locked = i > unlocked;
      btn.className = 'level-btn' + (locked ? ' locked' : '') + (lv.theme === 'night' ? ' night' : '') + (lv.theme === 'dusk' ? ' dusk' : '');
      btn.innerHTML = `<span class="lvl-num">${i + 1}</span><span class="lvl-name">${locked ? 'Locked' : lv.name}</span>`;
      btn.disabled = locked;
      if (!locked) {
        btn.addEventListener('click', () => {
          initAudio();
          localStorage.setItem(STORE_PENDING, String(i));
          location.reload();
        });
      }
      grid.appendChild(btn);
    });
  }

  startLevel() {
    this.status = 'playing';
    this.hud.bar.style.display = 'flex';
    this.hud.overlay.classList.add('hidden');
    this.hud.levelLabel.textContent = `${this.levelIndex + 1}. ${this.level.name}`;
    this.hud.waveLabel.textContent = `Wave 0 / ${this.level.waves.length}`;
    const bar = document.getElementById('wave-bar');
    bar.querySelectorAll('.wave-flag').forEach((el) => el.remove());
    let cum = 0;
    for (const w of this.level.waves) {
      cum += w.zombies.length + (w.huge ? 1 : 0);
      if (w.huge) {
        const flag = document.createElement('div');
        flag.className = 'wave-flag';
        flag.textContent = '⚑';
        flag.style.left = `calc(${(cum / this.totalZombies) * 100}% - 8px)`;
        bar.appendChild(flag);
      }
    }
    this.buildSeedBar();
    initAudio();
    this.showBanner('Ready… plant!', 1600);
  }

  buildSeedBar() {
    this.hud.cardsWrap.innerHTML = '';
    this.cards = [];
    for (const type of this.level.plants) {
      this.cooldowns[type] = 0;
      const cfg = PLANTS[type];
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.plant = type;
      card.title = cfg.name;
      card.innerHTML = `<img class="card-img" alt="${cfg.name}"><div class="card-cost">${cfg.cost}</div><div class="card-cd"></div>`;
      card.querySelector('img').src = thumbnail(type);
      card.addEventListener('click', () => {
        if (this.status !== 'playing') return;
        if (this.cooldowns[type] > 0 || this.sun < cfg.cost) return;
        this.select(this.selected === type ? null : type);
      });
      this.hud.cardsWrap.appendChild(card);
      this.cards.push(card);
    }
  }

  select(type) {
    if (type && this.shovel) this.setShovel(false);
    this.selected = type;
    for (const card of this.cards) card.classList.toggle('selected', card.dataset.plant === type);
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    if (type) {
      this.ghost = PLANT_BUILDERS[type]();
      if (type === 'potatomine') {
        this.ghost.userData.potato.visible = true;
        this.ghost.userData.mound.visible = false;
      }
      this.ghost.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.55;
          o.castShadow = false;
        }
      });
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
  }

  setPointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  onPointerMove(e) {
    if (!this.ghost && !this.shovel) return;
    this.setPointer(e);
    const hits = this.raycaster.intersectObjects(this.tiles, false);
    this.hoverCell = hits.length ? hits[0].object.userData.cell : null;

    if (this.ghost) {
      if (this.hoverCell) {
        const { row, col } = this.hoverCell;
        this.ghost.visible = true;
        this.ghost.position.set(boardX(col), 0.02, boardZ(row));
        const occupied = !!this.grid[row][col];
        this.ghost.traverse((o) => {
          if (o.isMesh && o.material.emissive) o.material.emissive.setHex(occupied ? 0x881111 : 0x115511);
        });
      } else {
        this.ghost.visible = false;
      }
    }

    if (this.shovel) {
      const plant = this.hoverCell ? this.grid[this.hoverCell.row][this.hoverCell.col] : null;
      if (this.shovelTarget !== plant) {
        if (this.shovelTarget) this.tintPlant(this.shovelTarget, 0x000000);
        this.shovelTarget = plant;
        if (plant) this.tintPlant(plant, 0x661a08);
      }
    }
  }

  onPointerDown(e) {
    if (this.status !== 'playing' || e.button !== 0) return;
    this.setPointer(e);

    const sunMeshes = this.suns.filter((s) => !s.fly).map((s) => s.mesh);
    const sunHits = this.raycaster.intersectObjects(sunMeshes, true);
    if (sunHits.length) {
      let obj = sunHits[0].object;
      while (obj && !obj.userData.sunRef) obj = obj.parent;
      if (obj) { this.collectSun(obj.userData.sunRef); return; }
    }

    if (this.shovel) {
      if (this.hoverCell) {
        const plant = this.grid[this.hoverCell.row][this.hoverCell.col];
        if (plant) {
          this.particles.burst(plant.x, 0.3, plant.z, { color: 0x8a6c4c, count: 16, speed: 2.4, life: 0.6 });
          this.particles.burst(plant.x, 0.4, plant.z, { color: 0x55b32c, count: 8, speed: 1.6, life: 0.45 });
          this.shovelTarget = null;
          this.removePlant(plant);
          sfx.thud();
          this.setShovel(false);
        }
      }
      return;
    }

    if (this.selected && this.hoverCell) {
      const { row, col } = this.hoverCell;
      if (!this.grid[row][col]) this.placePlant(this.selected, row, col);
    }
  }

  placePlant(type, row, col) {
    const mesh = PLANT_BUILDERS[type]();
    mesh.position.set(boardX(col), 0, boardZ(row));
    this.scene.add(mesh);
    const plant = new Plant(type, row, col, mesh);
    this.plants.push(plant);
    this.grid[row][col] = plant;
    if (type === 'torchwood') this.torchCols[row].add(col);
    this.sun -= PLANTS[type].cost;
    this.cooldowns[type] = PLANTS[type].cooldown;
    this.select(null);
    sfx.plant();
    this.particles.burst(boardX(col), 0.15, boardZ(row), { color: 0x8bc45e, count: 8, speed: 1.2, life: 0.4, gravity: 3 });
  }

  removePlant(plant) {
    const i = this.plants.indexOf(plant);
    if (i !== -1) this.plants.splice(i, 1);
    if (this.grid[plant.row][plant.col] === plant) this.grid[plant.row][plant.col] = null;
    if (plant.type === 'torchwood') this.torchCols[plant.row].delete(plant.col);
    this.scene.remove(plant.mesh);
  }

  zombieInLane(row, minX, maxX = Infinity) {
    return this.zombies.some((z) => z.row === row && z.state !== 'DYING' && z.state !== 'FLYING' && z.x > minX && z.x < Math.min(maxX, ZOMBIE_SPAWN_X + 0.5));
  }

  nearestZombie(row, minX) {
    let best = null;
    for (const z of this.zombies) {
      if (z.row !== row || z.state === 'DYING' || z.state === 'FLYING' || z.x < minX || z.x > ZOMBIE_SPAWN_X + 0.5) continue;
      if (!best || z.x < best.x) best = z;
    }
    return best;
  }

  plantInFront(zombie) {
    const frontX = zombie.x - 0.32 * zombie.scaleFactor;
    const col = Math.round(frontX / TILE + (COLS - 1) / 2);
    if (col < 0 || col >= COLS) return null;
    const plant = this.grid[zombie.row][col];
    if (plant && !plant.cfg.noBlock && Math.abs(boardX(col) - frontX) < 0.62) return plant;
    return null;
  }

  fireProjectile(plant, row) {
    const cfg = plant.cfg;
    const dmg = cfg.dmg + (plant.rage ? 15 : 0);
    this.projectiles.push(new Projectile(row, plant.x + 0.5, boardZ(row), cfg.projectile, dmg, cfg.range, this));
    if (cfg.projectile === 'puff') sfx.puff();
    else sfx.pew();
  }

  fireLob(plant, targetX) {
    this.lobs.push(new Lob(plant.row, plant.x + 0.3, plant.z, targetX, plant.cfg.dmg, plant.cfg.splash, this));
  }

  areaDamage(x, z, radius, dmg, opts = {}) {
    for (const zo of this.zombies) {
      if (zo.state === 'DYING') continue;
      if (opts.row !== undefined && zo.row !== opts.row) continue;
      const dx = zo.x - x;
      const dz = zo.z - z;
      if (Math.sqrt(dx * dx + dz * dz) <= radius) zo.hit(dmg, { pierce: true });
    }
  }

  explode(x, z, radius, dmg, opts = {}) {
    this.areaDamage(x, z, radius, dmg, opts);
    this.particles.burst(x, 0.5, z, { color: 0xff6a1a, count: 30, speed: 4, life: 0.7, size: 1.4 });
    this.particles.burst(x, 0.5, z, { color: 0xffd84a, count: 18, speed: 2.8, life: 0.55 });
    this.particles.burst(x, 0.4, z, { color: 0x333333, count: 12, speed: 2, life: 0.9, up: 2.4 });
    this.shake(0.3, 0.5);
    sfx.boom();
  }

  laneFire(row, dmg) {
    const z = boardZ(row);
    for (let c = 0; c < COLS; c++) {
      this.particles.burst(boardX(c), 0.4, z, { color: 0xff6a1a, count: 8, speed: 1.6, life: 0.6, gravity: -2, up: 1.8 });
      this.particles.burst(boardX(c), 0.3, z, { color: 0xffd84a, count: 5, speed: 1.2, life: 0.5, gravity: -1.5, up: 1.4 });
    }
    for (const zo of this.zombies) {
      if (zo.row === row && zo.state !== 'DYING') zo.hit(dmg, { pierce: true, fire: true });
    }
    this.shake(0.25, 0.45);
    sfx.boom();
    sfx.fire();
  }

  throwImp(brute) {
    const mesh = buildZombie('imp');
    const imp = new Zombie('imp', brute.row, mesh, brute.x);
    imp.state = 'FLYING';
    imp.flyData = { t: 0, fromX: brute.x, toX: Math.max(brute.x - 2.6, boardX(1)) };
    this.scene.add(mesh);
    this.zombies.push(imp);
    sfx.vault();
  }

  spawnSun(x, z, fromSky) {
    const mesh = buildSun();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffdd66, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    sprite.scale.set(1.4, 1.4, 1);
    mesh.add(sprite);
    const sun = new Sun(mesh, x, z, fromSky);
    mesh.traverse((o) => { o.userData.sunRef = sun; });
    this.scene.add(mesh);
    this.suns.push(sun);
  }

  collectSun(sun) {
    if (sun.fly) return;
    this.sun += SUN_VALUE;
    sfx.chime();
    const target = new THREE.Vector3(-0.82, 0.86, 0.5).unproject(this.camera);
    sun.fly = { t: 0, from: sun.mesh.position.clone(), to: target };
  }

  spawnZombie(type, row, xOffset = 0) {
    if (row < 0 || row >= ROWS) row = Math.floor(Math.random() * ROWS);
    const mesh = buildZombie(type);
    const z = new Zombie(type, row, mesh, ZOMBIE_SPAWN_X + xOffset);
    z.game = this;
    this.scene.add(mesh);
    this.zombies.push(z);
    this.spawnedZombies++;
  }

  shake(amp, dur) {
    if (amp > this.shakeAmp || this.shakeT >= this.shakeDur) {
      this.shakeAmp = amp;
      this.shakeDur = dur;
      this.shakeT = 0;
    }
  }

  showBanner(text, ms = 2000) {
    const b = this.hud.banner;
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('show'), ms);
  }

  endGame(won) {
    this.status = won ? 'won' : 'lost';
    if (won) sfx.victory(); else sfx.defeat();

    let unlockedMsg = '';
    if (won) {
      const prev = this.unlockedCount();
      const next = Math.min(LEVELS.length - 1, Math.max(prev, this.levelIndex + 1));
      localStorage.setItem(STORE_UNLOCKED, String(next));
      const names = (this.level.unlocks || []).map((t) => PLANTS[t].name);
      if (names.length) unlockedMsg = `New plants unlocked: <b>${names.join(', ')}</b>`;
      else if (this.levelIndex === LEVELS.length - 1) unlockedMsg = 'You beat the whole adventure. The lawn is legend.';
    }

    const o = this.hud.overlay;
    o.classList.remove('hidden');
    const hasNext = won && this.levelIndex < LEVELS.length - 1;
    o.innerHTML = `
      <h1 class="menu-title ${won ? '' : 'lost'}">${won ? 'Level complete!' : 'The zombies ate your brains'}</h1>
      <p class="menu-sub">${won ? unlockedMsg : 'A zombie reached the house. Try a different defense.'}</p>
      <div class="end-btns">
        ${hasNext ? '<button id="btn-next">Next level</button>' : ''}
        <button id="btn-retry">${won ? 'Replay' : 'Retry'}</button>
        <button id="btn-menu">Level select</button>
      </div>`;
    const go = (idx) => { localStorage.setItem(STORE_PENDING, idx === null ? '' : String(idx)); location.reload(); };
    if (hasNext) document.getElementById('btn-next').addEventListener('click', () => go(this.levelIndex + 1));
    document.getElementById('btn-retry').addEventListener('click', () => go(this.levelIndex));
    document.getElementById('btn-menu').addEventListener('click', () => go(null));
  }

  update(dt) {
    if (this.status === 'menu') {
      const t = performance.now() * 0.0001;
      this.camera.position.set(this.camBase.x + Math.sin(t) * 0.6, this.camBase.y, this.camBase.z);
      this.camera.lookAt(0, 0, 0.4);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.status !== 'playing') {
      this.particles.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);

    this.skySunTimer -= dt;
    if (this.skySunTimer <= 0) {
      this.skySunTimer = SKY_SUN_INTERVAL * (0.8 + Math.random() * 0.5);
      const col = Math.floor(Math.random() * COLS);
      const row = Math.floor(Math.random() * ROWS);
      this.spawnSun(boardX(col) + (Math.random() - 0.5) * 0.4, boardZ(row) + (Math.random() - 0.5) * 0.4, true);
    }

    if (this.waveIndex < this.level.waves.length) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        const wave = this.level.waves[this.waveIndex];
        const isFinal = this.waveIndex === this.level.waves.length - 1;
        this.showBanner(wave.huge ? (isFinal ? 'Final wave!' : 'A huge wave approaches!') : `Wave ${this.waveIndex + 1}`, 2200);
        const list = [...wave.zombies];
        if (wave.huge) list.unshift({ type: 'flag', row: -1 });
        list.forEach((zd, i) => {
          this.pendingSpawns.push({ ...zd, t: i * 0.7 + Math.random() * 0.4 });
        });
        this.waveIndex++;
        this.waveTimer = this.waveIndex < this.level.waves.length ? this.level.waves[this.waveIndex].delay : Infinity;
      }
    }
    for (const p of this.pendingSpawns) p.t -= dt;
    for (const p of this.pendingSpawns.filter((s) => s.t <= 0)) this.spawnZombie(p.type, p.row, Math.random() * 0.6);
    this.pendingSpawns = this.pendingSpawns.filter((s) => s.t > 0);

    for (const p of this.plants) p.update(dt, this);
    for (const z of this.zombies) z.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);
    for (const l of this.lobs) l.update(dt, this);
    for (const s of this.suns) s.update(dt);
    for (const m of this.mowers) m.update(dt, this);
    this.particles.update(dt);

    for (const z of this.zombies) {
      if (z.state === 'DYING' || z.dead) continue;
      if (z.x < MOWER_X + 0.35) {
        const mower = this.mowers.find((m) => m.row === z.row && !m.active && !m.gone);
        if (mower) { mower.active = true; sfx.mower(); }
        else if (z.x < HOUSE_X) { this.endGame(false); return; }
      }
    }

    const cull = (arr) => arr.filter((o) => (o.dead ? (this.scene.remove(o.mesh), false) : true));
    this.projectiles = cull(this.projectiles);
    this.lobs = cull(this.lobs);
    this.suns = cull(this.suns);
    this.zombies = this.zombies.filter((z) => {
      if (z.devoured) { this.scene.remove(z.mesh); return false; }
      if (z.dead) { this.scene.remove(z.mesh); return false; }
      return true;
    });
    this.mowers = this.mowers.filter((m) => (m.gone ? (this.scene.remove(m.mesh), false) : true));

    if (this.waveIndex >= this.level.waves.length && this.pendingSpawns.length === 0 && this.zombies.length === 0) {
      this.endGame(true);
      return;
    }

    if (this.shakeT < this.shakeDur) {
      this.shakeT += dt;
      const k = 1 - this.shakeT / this.shakeDur;
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * this.shakeAmp * k,
        this.camBase.y + (Math.random() - 0.5) * this.shakeAmp * k * 0.6,
        this.camBase.z
      );
    } else {
      this.camera.position.copy(this.camBase);
      this.shakeAmp = 0;
    }

    this.updateHud();
    this.renderer.render(this.scene, this.camera);
  }

  updateHud() {
    this.hud.sun.textContent = this.sun;
    for (const card of this.cards) {
      const type = card.dataset.plant;
      const cd = this.cooldowns[type];
      card.querySelector('.card-cd').style.height = cd > 0 ? `${(cd / PLANTS[type].cooldown) * 100}%` : '0%';
      card.classList.toggle('disabled', this.sun < PLANTS[type].cost || cd > 0);
    }
    this.hud.waveLabel.textContent = `Wave ${Math.min(this.waveIndex, this.level.waves.length)} / ${this.level.waves.length}`;
    this.hud.waveFill.style.width = `${(this.spawnedZombies / this.totalZombies) * 100}%`;
  }
}

export function bootLevelIndex() {
  const pending = localStorage.getItem(STORE_PENDING);
  localStorage.removeItem(STORE_PENDING);
  if (pending !== null && pending !== '') {
    const idx = parseInt(pending, 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < LEVELS.length) return idx;
  }
  return null;
}
