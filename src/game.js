import * as THREE from '../lib/three.module.js';
import {
  COLS, ROWS, TILE, boardX, boardZ,
  ZOMBIE_SPAWN_X, MOWER_X, HOUSE_X,
  PLANTS, SUN_VALUE, SKY_SUN_INTERVAL, THEMES, BREACH_DURATION,
} from './constants.js';
import { PLANT_BUILDERS, buildTile, buildZombie, buildSun, buildMower, buildScenery } from './models.js';
import { skyEquirect } from './textures.js';
import { Plant, Zombie, Projectile, Lob, Sun, Mower } from './entities.js';
import { Particles } from './particles.js';
import { LEVELS } from './levels.js';
import { thumbnail } from './thumbs.js';
import { sfx, initAudio } from './sfx.js';
import { state as session, getUnlocked, setUnlocked } from './session.js';
import { openAuth, signOut } from './auth-ui.js';

// Which level to open after the reload that level buttons trigger. Purely a
// page-handoff, so it stays local even for signed-in players.
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

    this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 120);
    this.camBase = new THREE.Vector3(0.4, 9.2, 8.6);
    this.camLookBase = new THREE.Vector3(0, 0, 0.4);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLookBase);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic tonemapping is what stops the bright lawn from clipping to flat white
    // and gives the highlights the roll-off a rendered still has.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = th.exposure;
    this.baseExposure = th.exposure;
    this.container.prepend(this.renderer.domElement);

    // The sky serves double duty: visible background and, through PMREM, the
    // image-based light that gives every material its ambient reflection.
    const sky = skyEquirect(th);
    if (sky) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envRT = pmrem.fromEquirectangular(sky);
      this.scene.environment = this.envRT.texture;
      this.scene.background = sky;
      pmrem.dispose();
    } else {
      this.scene.background = new THREE.Color(th.skyBottom);
    }
    this.scene.fog = new THREE.Fog(new THREE.Color(th.fogColor), th.fogNear, th.fogFar);

    this.scene.add(new THREE.AmbientLight(0xffffff, th.ambient));
    this.scene.add(new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity));

    const sunLight = new THREE.DirectionalLight(th.sunColor, th.sunIntensity);
    sunLight.position.set(...th.sunPos);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const sc = sunLight.shadow.camera;
    sc.left = -13; sc.right = 13; sc.top = 11; sc.bottom = -11;
    sc.near = 0.5; sc.far = 42;
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.022;
    sunLight.shadow.radius = 2.2;
    this.scene.add(sunLight);
    this.sunLight = sunLight;

    // Cool bounce from the opposite side so shadowed faces keep their form.
    const fill = new THREE.DirectionalLight(th.hemiSky, th.sunIntensity * 0.16);
    fill.position.set(-8, 5, -6);
    this.scene.add(fill);
    this.fillLight = fill;

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
    this.scenery = buildScenery(this.scene, boardX(0) - 0.6, boardX(COLS - 1) + 0.6, ROWS * TILE, this.theme);
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
      vignette: document.getElementById('breach-vignette'),
      fade: document.getElementById('fade'),
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
    return Math.min(LEVELS.length - 1, getUnlocked());
  }

  showMenu() {
    this.status = 'menu';
    this.hud.bar.style.display = 'none';
    const unlocked = this.unlockedCount();
    const o = this.hud.overlay;
    o.classList.remove('hidden');
    o.innerHTML = `
      <div id="account-bar"></div>
      <h1 class="menu-title">Lawn Defense 3D</h1>
      <p class="menu-sub">The zombies are coming. Pick a level — beat it to unlock the next one and new plants.</p>
      <div class="level-grid"></div>
      <p class="menu-hint">Click seed card → click tile. Click suns to collect. Right-click or Esc cancels.</p>`;
    this.renderAccountBar();
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

  /** Who's playing, plus the way in or out. Only meaningful when a server exists. */
  renderAccountBar() {
    const bar = document.getElementById('account-bar');
    if (!bar) return;
    if (!session.online) {
      // Most likely a static-only deploy with no API behind it. Say so, rather
      // than leaving the missing sign-in button unexplained.
      bar.innerHTML = '<span class="acct-who">No server — progress saved on this device only</span>';
      return;
    }
    if (session.user) {
      bar.innerHTML = `<span class="acct-who">Signed in as <b>${escapeHtml(session.user.name)}</b></span>`;
      const out = document.createElement('button');
      out.className = 'acct-btn';
      out.textContent = 'Sign out';
      out.addEventListener('click', async () => { await signOut(); this.showMenu(); });
      bar.append(out);
    } else {
      bar.innerHTML = '<span class="acct-who">Playing as guest — progress stays on this device</span>';
      const inBtn = document.createElement('button');
      inBtn.className = 'acct-btn';
      inBtn.textContent = 'Sign in';
      inBtn.addEventListener('click', () => openAuth());
      bar.append(inBtn);
    }
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

  /**
   * A zombie got past the last mower. Instead of cutting straight to the defeat
   * screen, hand control to a scripted shot: the zombie crosses to the front door,
   * tears it open, steps into the dark, and something in there screams.
   */
  beginBreach(zombie) {
    if (this.breach) return;
    this.status = 'breach';
    this.select(null);
    this.setShovel(false);
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }

    const doorX = this.scenery ? this.scenery.doorWorldX : HOUSE_X;
    this.breach = {
      t: 0,
      zombie,
      doorX,
      fromX: zombie.x,
      fromZ: zombie.z,
      camFrom: this.camera.position.clone(),
      camTo: new THREE.Vector3(doorX + 3.5, 2.15, 2.95),
      lookFrom: this.camLookBase.clone(),
      lookTo: new THREE.Vector3(doorX + 0.1, 1.02, -0.05),
      look: this.camLookBase.clone(),
      stages: {},
    };
    zombie.state = 'BREACH';
    this.hud.bar.classList.add('dimmed');
    this.hud.banner.classList.remove('show');
    clearTimeout(this.bannerT);
    sfx.heartbeat(0);
    sfx.heartbeat(0.95);
  }

  updateBreach(dt) {
    const b = this.breach;
    b.t += dt;
    const t = b.t;
    const z = b.zombie;
    const s = this.scenery;
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const clamp01 = (k) => Math.min(1, Math.max(0, k));
    const once = (key, fn) => { if (!b.stages[key]) { b.stages[key] = true; fn(); } };

    const porchX = b.doorX + 0.66;

    // ---- zombie: cross to the door, hammer on it, then walk into the dark
    if (t < 1.15) {
      const k = ease(clamp01(t / 1.15));
      z.x = b.fromX + (porchX - b.fromX) * k;
      z.z = b.fromZ + (0 - b.fromZ) * k;
      z.walkPhase += dt * 6;
      z.animateWalk(z.walkPhase, z.mesh.userData.limbs);
    } else if (t < 1.9) {
      // pounding on the door
      const k = (t - 1.15) / 0.75;
      const limbs = z.mesh.userData.limbs;
      const swing = Math.sin(k * Math.PI * 3);
      if (limbs.armL) limbs.armL.rotation.z = 0.5 + swing * 0.8;
      if (limbs.armR) limbs.armR.rotation.z = 0.5 - swing * 0.8;
      z.x = porchX + Math.abs(swing) * 0.06;
    } else {
      const k = ease(clamp01((t - 1.9) / 1.0));
      z.x = porchX - 1.45 * k;
      const limbs = z.mesh.userData.limbs;
      z.walkPhase += dt * 5;
      z.animateWalk(z.walkPhase, limbs);
      // arms up and groping as it goes in
      if (limbs.armL) limbs.armL.rotation.z = 0.9 + Math.sin(t * 9) * 0.25;
      if (limbs.armR) limbs.armR.rotation.z = 0.9 - Math.sin(t * 9) * 0.25;
    }
    z.mesh.position.set(z.x, z.mesh.position.y, z.z);

    // ---- door: two knocks, then it goes in
    if (t >= 1.2) once('knock', () => sfx.doorSlam());
    if (t >= 1.5 && s && s.door) {
      once('burst', () => {
        sfx.doorBurst();
        this.shake(0.55, 0.55);
        this.particles.burst(b.doorX + 0.1, 1.0, 0, { color: 0x8a5f34, count: 26, speed: 3.4, life: 0.8, size: 1.2 });
        this.particles.burst(b.doorX + 0.1, 1.4, 0, { color: 0xc4a074, count: 14, speed: 2.6, life: 0.7 });
      });
      // slams open past its stop and rebounds
      const k = clamp01((t - 1.5) / 0.45);
      const over = Math.sin(ease(k) * Math.PI * 0.5) * 2.15 - Math.max(0, k - 0.8) * 0.9;
      s.door.rotation.y = -over;
    }

    // ---- the house reacts
    if (s && s.interiorLight) {
      if (t >= 1.5 && t < 2.25) s.interiorLight.intensity = 1.4;
      else if (t >= 2.25) {
        // red flare, guttering
        s.interiorLight.intensity = 14 * Math.max(0, 1 - (t - 2.25) / 1.4) * (0.65 + 0.35 * Math.sin(t * 27));
      }
    }
    if (t >= 2.25) {
      once('scream', () => {
        sfx.scream();
        sfx.screamFar(0.42);
        this.shake(0.4, 0.9);
        if (s && s.porchLight) {
          s.porchLight.material.emissiveIntensity = 0;
          if (s.porchLampLight) s.porchLampLight.intensity = 0;
        }
      });
      const flare = Math.max(0, 1 - (t - 2.25) / 1.3);
      for (const w of (s ? s.windows : [])) {
        w.material.emissive.setRGB(1, 0.08, 0.03);
        w.material.emissiveIntensity = flare * (1.6 + Math.sin(t * 23) * 0.7);
      }
      this.renderer.toneMappingExposure = this.baseExposure * (1 + flare * 0.22);
    }
    if (t >= 2.7) once('crunch', () => sfx.crunch());
    if (t >= 3.15) once('crunch2', () => sfx.crunch(0.05));

    // ---- camera: push in on the porch, then a slow creep during the scream
    const push = ease(clamp01(t / 1.5));
    const creep = clamp01((t - 1.5) / 2.4) * 0.5;
    const pos = b.camFrom.clone().lerp(b.camTo, push);
    pos.lerp(b.camTo.clone().lerp(b.lookTo, 0.22), creep);
    b.look.lerpVectors(b.lookFrom, b.lookTo, push);
    if (this.shakeT < this.shakeDur) {
      this.shakeT += dt;
      const k = 1 - this.shakeT / this.shakeDur;
      pos.x += (Math.random() - 0.5) * this.shakeAmp * k;
      pos.y += (Math.random() - 0.5) * this.shakeAmp * k * 0.7;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(b.look);

    // ---- grade: red vignette pulls in, then black
    if (this.hud.vignette) {
      const v = t < 2.25 ? clamp01(t / 2.25) * 0.45 : 0.45 + clamp01((t - 2.25) / 0.35) * 0.55;
      this.hud.vignette.style.opacity = String(v);
    }
    if (this.hud.fade && t >= 2.85) {
      this.hud.fade.style.opacity = String(clamp01((t - 2.85) / 1.15) * 0.92);
    }

    if (t >= BREACH_DURATION) {
      this.breach = null;
      this.endGame(false);
    }
  }

  endGame(won) {
    this.status = won ? 'won' : 'lost';
    if (won) sfx.victory(); else sfx.defeat();

    let unlockedMsg = '';
    if (won) {
      const prev = this.unlockedCount();
      const next = Math.min(LEVELS.length - 1, Math.max(prev, this.levelIndex + 1));
      setUnlocked(next);
      const names = (this.level.unlocks || []).map((t) => PLANTS[t].name);
      if (names.length) unlockedMsg = `New plants unlocked: <b>${names.join(', ')}</b>`;
      else if (this.levelIndex === LEVELS.length - 1) unlockedMsg = 'You beat the whole adventure. The lawn is legend.';
    }

    const o = this.hud.overlay;
    o.classList.remove('hidden');
    const hasNext = won && this.levelIndex < LEVELS.length - 1;
    o.innerHTML = `
      <h1 class="menu-title ${won ? '' : 'lost'}">${won ? 'Level complete!' : 'The zombies ate your brains'}</h1>
      <p class="menu-sub">${won ? unlockedMsg : 'One got through the front door. Try a different defense.'}</p>
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
    if (this.status === 'breach') {
      this.updateBreach(dt);
      this.particles.update(dt);
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
        // Hand over to the cinematic as soon as the lane is lost, rather than
        // letting the zombie march the last stretch nose-first into the brickwork.
        else if (z.x < MOWER_X + 0.1) { this.beginBreach(z); return; }
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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
