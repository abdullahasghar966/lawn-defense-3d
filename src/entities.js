import * as THREE from '../lib/three.module.js';
import { PLANTS, ZOMBIES, PROJECTILES, RAGE, SUNFLOWER_BEAST, ROWS, TILE, SUN_LIFETIME, boardX, boardZ, worldToCol } from './constants.js';
import { buildProjectile, buildMelon } from './models.js';
import { sfx } from './sfx.js';

function setEmissive(obj, hex) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(hex);
  });
}

export class Plant {
  constructor(type, row, col, mesh) {
    this.type = type;
    this.cfg = PLANTS[type];
    this.row = row;
    this.col = col;
    this.mesh = mesh;
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.x = boardX(col);
    this.z = boardZ(row);
    this.timer = this.cfg.behavior === 'producer' ? this.cfg.interval - 6 : 0;
    this.wobble = Math.random() * Math.PI * 2;
    this.recoil = 0;
    this.rage = false;
    this.armed = false;
    this.armTimer = 0;
    this.popT = 0;
    this.fuseT = 0;
    this.chew = 0;
    this.leap = null;
    this.pendingShot = null;
    this.swing = 0;
  }

  lanes() {
    if (this.cfg.lanes === 3) {
      return [this.row - 1, this.row, this.row + 1].filter((r) => r >= 0 && r < ROWS);
    }
    return [this.row];
  }

  update(dt, game) {
    this.wobble += dt * 2;
    const b = this.cfg.behavior;
    if (b === 'shooter') this.updateShooter(dt, game);
    else if (b === 'producer') this.updateProducer(dt, game);
    else if (b === 'wall') this.updateWall(dt);
    else if (b === 'mine') this.updateMine(dt, game);
    else if (b === 'bomb') this.updateBomb(dt, game);
    else if (b === 'squash') this.updateSquash(dt, game);
    else if (b === 'melee') this.updateChomper(dt, game);
    else if (b === 'spikes') this.updateSpikes(dt, game);
    else if (b === 'torch') this.updateTorch(dt);
    else if (b === 'lobber') this.updateLobber(dt, game);
  }

  updateShooter(dt, game) {
    const cfg = this.cfg;
    const lanes = this.lanes();
    const maxX = cfg.range ? this.x + cfg.range : Infinity;
    const hasTarget = lanes.some((r) => game.zombieInLane(r, this.x + 0.2, maxX));

    if (cfg.family === 'pea') {
      const danger = lanes.some((r) => game.zombieInLane(r, this.x - 0.5, this.x + RAGE.range));
      if (danger && !this.rage) { this.rage = true; sfx.rage(); }
      else if (!danger && this.rage) { this.rage = false; }
      const head = this.mesh.userData.head;
      if (head) {
        if (this.rage) {
          const pulse = 0.3 + 0.22 * Math.sin(this.wobble * 14);
          head.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(pulse, 0.02, 0.02); });
          head.position.x = (Math.random() - 0.5) * 0.05;
          head.position.z = (Math.random() - 0.5) * 0.05;
          head.scale.setScalar(1.12);
        } else {
          head.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(0, 0, 0); });
          head.position.x = 0;
          head.position.z = 0;
          head.scale.setScalar(1);
        }
      }
    }

    const interval = this.rage ? cfg.interval / RAGE.rateMul : cfg.interval;
    this.timer += dt;
    this.recoil = Math.max(0, this.recoil - dt * 4);
    const head = this.mesh.userData.head;
    if (head && this.cfg.family) head.position.y = 0.58 - this.recoil * 0.03;
    this.mesh.position.y = Math.sin(this.wobble) * 0.02;

    if (this.pendingShot !== null) {
      this.pendingShot -= dt;
      if (this.pendingShot <= 0) {
        this.pendingShot = null;
        game.fireProjectile(this, this.row);
      }
    }

    if (this.timer >= interval && hasTarget) {
      this.timer = 0;
      this.recoil = 1;
      for (const r of lanes) game.fireProjectile(this, r);
      if (cfg.shots === 2) this.pendingShot = 0.13;
    }
  }

  updateProducer(dt, game) {
    const head = this.mesh.userData.head;
    if (this.beast) {
      this.beast.t += dt;
      const k = Math.min(1, this.beast.t / SUNFLOWER_BEAST.windup);
      if (head) head.rotation.z += dt * 18;
      this.mesh.scale.setScalar(1 + k * 0.35);
      this.mesh.position.x = this.x + (Math.random() - 0.5) * 0.06 * k;
      this.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setRGB(0.55 * k, 0.28 * k, 0);
      });
      if (this.beast.t >= SUNFLOWER_BEAST.windup) {
        for (let i = 0; i < SUNFLOWER_BEAST.burst; i++) {
          game.spawnSun(this.x + (Math.random() - 0.5) * 1.5, this.z + (Math.random() - 0.5) * 1.0, false);
        }
        game.particles.burst(this.x, 0.6, this.z, { color: 0xffd84a, count: 26, speed: 3.2, life: 0.8 });
        game.particles.burst(this.x, 0.5, this.z, { color: 0xff9a2a, count: 12, speed: 2.2 });
        game.shake(0.15, 0.3);
        sfx.chime();
        sfx.smallboom();
        game.removePlant(this);
      }
      return;
    }
    if (head) head.rotation.z = Math.sin(this.wobble * 0.8) * 0.12;
    const danger = game.zombieInLane(this.row, this.x - 0.5, this.x + SUNFLOWER_BEAST.range);
    if (danger) {
      this.beast = { t: 0 };
      sfx.rage();
      return;
    }
    this.timer += dt;
    if (this.timer >= this.cfg.interval) {
      this.timer = 0;
      game.spawnSun(this.x + 0.35, this.z + 0.25, false);
    }
  }

  updateWall(dt) {
    const t = this.hp / this.maxHp;
    this.mesh.scale.y = 1 - (1 - t) * 0.25;
  }

  updateMine(dt, game) {
    const ud = this.mesh.userData;
    if (!this.armed) {
      this.armTimer += dt;
      if (this.armTimer >= this.cfg.armTime) {
        this.armed = true;
        ud.potato.visible = true;
        sfx.plant();
      }
      return;
    }
    if (this.popT < 1) {
      this.popT = Math.min(1, this.popT + dt * 3);
      ud.potato.scale.setScalar(0.3 + 0.7 * this.popT);
      ud.mound.visible = this.popT < 0.5;
    }
    const blink = 0.4 + 0.4 * Math.sin(this.wobble * 6);
    ud.bulb.material.emissive.setRGB(blink, blink * 0.12, 0.02);
    const victim = game.zombies.find((z) => z.row === this.row && z.state !== 'DYING' && z.state !== 'FLYING' && Math.abs(z.x - this.x) < 0.48);
    if (victim) {
      game.explode(this.x, this.z, 0.95, this.cfg.dmg, { row: this.row });
      game.removePlant(this);
    }
  }

  updateBomb(dt, game) {
    this.fuseT += dt;
    const k = this.fuseT / this.cfg.fuse;
    const pulse = 1 + k * 0.35 + Math.sin(this.wobble * 16) * 0.06 * k;
    this.mesh.scale.setScalar(pulse);
    this.mesh.position.x = this.x + (Math.random() - 0.5) * 0.05 * k;
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(0.5 * k, 0.08 * k, 0);
    });
    if (this.fuseT >= this.cfg.fuse) {
      if (this.cfg.lane) game.laneFire(this.row, this.cfg.dmg);
      else game.explode(this.x, this.z, this.cfg.radius, this.cfg.dmg, {});
      game.removePlant(this);
    }
  }

  updateSquash(dt, game) {
    if (!this.leap) {
      const body = this.mesh.userData.body;
      if (body) body.scale.y = 1.1 + Math.sin(this.wobble) * 0.03;
      const victim = game.zombies.find((z) => z.row === this.row && z.state !== 'DYING' && z.state !== 'FLYING' && z.x > this.x - 0.9 && z.x < this.x + 0.95);
      if (victim) this.leap = { t: 0, targetX: victim.x };
      return;
    }
    this.leap.t += dt * 1.6;
    const t = this.leap.t;
    if (t < 1) {
      this.mesh.position.x = this.x + (this.leap.targetX - this.x) * t;
      this.mesh.position.y = Math.sin(Math.PI * Math.min(t, 1)) * 1.3;
      this.mesh.rotation.z = -t * 0.8;
    } else {
      game.areaDamage(this.leap.targetX, this.z, 0.65, this.cfg.dmg, { row: this.row, pierce: true });
      game.particles.burst(this.leap.targetX, 0.3, this.z, { color: 0x6a9a2a, count: 16, speed: 2.5 });
      game.shake(0.2, 0.35);
      sfx.thud();
      game.removePlant(this);
    }
  }

  updateChomper(dt, game) {
    const ud = this.mesh.userData;
    if (this.chew > 0) {
      this.chew -= dt;
      if (ud.head) {
        const s = 1 + 0.09 * Math.sin(this.wobble * 5) * Math.min(1, this.chew / (this.cfg.chewTime * 0.6));
        ud.head.scale.setScalar(s);
      }
      if (ud.jawUp) ud.jawUp.rotation.z = 0;
      return;
    }
    if (ud.jawUp) ud.jawUp.rotation.z = 0.25 + Math.sin(this.wobble * 1.5) * 0.15;
    const victim = game.zombies.find((z) => z.row === this.row && z.state !== 'DYING' && z.state !== 'FLYING' && z.x > this.x - 0.1 && z.x < this.x + 1.3);
    if (victim) {
      if (ud.jawUp) ud.jawUp.rotation.z = 0.9;
      sfx.chomp();
      if (victim.cfg.boss) {
        victim.hit(this.cfg.dmg, { pierce: true });
      } else {
        victim.devoured = true;
        game.particles.burst(victim.x, 0.7, victim.z, { color: 0x8a3a9a, count: 14, speed: 2 });
      }
      this.chew = this.cfg.chewTime;
    }
  }

  updateSpikes(dt, game) {
    this.mesh.rotation.y += dt * 0.4;
    for (const z of game.zombies) {
      if (z.row === this.row && z.state !== 'DYING' && z.state !== 'FLYING' && Math.abs(z.x - this.x) < 0.55) {
        z.hit(this.cfg.dps * dt, { pierce: true, quiet: true });
      }
    }
  }

  updateTorch(dt) {
    const flames = this.mesh.userData.flames;
    if (flames) {
      const f = 1 + Math.sin(this.wobble * 9) * 0.18;
      flames[0].scale.set(f, 1 + Math.sin(this.wobble * 7) * 0.25, f);
      flames[1].scale.set(f, 1 + Math.cos(this.wobble * 8) * 0.3, f);
    }
  }

  updateLobber(dt, game) {
    this.timer += dt;
    this.swing = Math.max(0, this.swing - dt * 3);
    const arm = this.mesh.userData.arm;
    if (arm) arm.rotation.z = -0.5 + this.swing * 1.3;
    if (this.timer >= this.cfg.interval) {
      const target = game.nearestZombie(this.row, this.x + 0.6);
      if (target) {
        this.timer = 0;
        this.swing = 1;
        const lead = target.x - target.effSpeed() * 0.85;
        game.fireLob(this, Math.max(this.x + 1, lead));
      }
    }
  }
}

export class Zombie {
  constructor(type, row, mesh, spawnX) {
    this.type = type;
    this.cfg = ZOMBIES[type];
    this.row = row;
    this.mesh = mesh;
    this.hp = this.cfg.hp;
    this.maxHp = this.cfg.hp;
    this.speed = this.cfg.speed * (0.92 + Math.random() * 0.16);
    this.dps = this.cfg.dps;
    this.shieldHp = this.cfg.shield || 0;
    this.paperHp = this.cfg.paper || 0;
    this.state = 'WALKING';
    this.x = spawnX;
    this.z = boardZ(row);
    this.walkPhase = Math.random() * Math.PI * 2;
    // Per-zombie gait damage, so a crowd never marches in lockstep.
    this.gait = {
      strideL: 0.72 + Math.random() * 0.5,
      strideR: 0.72 + Math.random() * 0.5,
      lean: -0.06 - Math.random() * 0.1,
      sway: 0.6 + Math.random() * 0.8,
      headTilt: (Math.random() - 0.5) * 0.26,
    };
    this.prevSin = 0;
    this.dieTimer = 0;
    this.flash = 0;
    this.slowT = 0;
    this.target = null;
    this.vaulted = false;
    this.vaultData = null;
    this.smashT = 0;
    this.throwT = 0;
    this.thrownImp = false;
    this.raged = false;
    this.eatTimer = 0;
    this.flyData = null;
    this.hitR = this.cfg.boss ? 0.7 : this.cfg.small ? 0.24 : 0.32;
    this.scaleFactor = this.cfg.boss ? 2.15 : this.cfg.small ? 0.62 : 1;
    mesh.position.set(this.x, 0, this.z);
  }

  effSpeed() {
    let s = this.speed;
    if (this.raged) s = 0.62;
    if (this.slowT > 0) s *= 0.5;
    return s;
  }

  hit(dmg, opts = {}) {
    if (this.state === 'DYING') return;
    if (opts.slow) this.slowT = opts.slow;
    if (opts.fire) this.slowT = 0;
    if (opts.projectile && !opts.lobbed && !opts.pierce) {
      if (this.shieldHp > 0) {
        this.shieldHp -= dmg;
        sfx.crack();
        if (this.shieldHp <= 0 && this.mesh.userData.shield) this.dropPart('shield');
        return;
      }
      if (this.paperHp > 0) {
        this.paperHp -= dmg;
        if (this.paperHp <= 0) this.enrage();
        return;
      }
    }
    this.hp -= dmg;
    if (!opts.quiet) this.flash = 0.12;
    if (this.hp <= 0) this.die();
  }

  enrage() {
    this.raged = true;
    this.dps = 95;
    if (this.mesh.userData.paper) this.dropPart('paper');
    for (const e of this.mesh.userData.eyes || []) {
      e.material = e.material.clone();
      e.material.color.setHex(0xff2a1a);
      e.material.emissive = new THREE.Color(0x881105);
    }
    sfx.rage();
  }

  dropPart(key) {
    const part = this.mesh.userData[key];
    if (!part) return;
    this.mesh.userData[key] = null;
    const pos = new THREE.Vector3();
    part.getWorldPosition(pos);
    part.scale.multiplyScalar(this.scaleFactor);
    this.game.particles.gib(part, pos, { vx: -0.6, vy: 2.2 });
  }

  die() {
    if (this.state === 'DYING') return;
    this.state = 'DYING';
    this.dieTimer = 0;
    sfx.groan();
    if (!this.cfg.boss) {
      if (this.mesh.userData.hat) this.dropPart('hat');
      const head = this.mesh.userData.limbs.head;
      if (head) {
        this.mesh.userData.limbs.head = null;
        const pos = new THREE.Vector3();
        head.getWorldPosition(pos);
        head.scale.multiplyScalar(this.scaleFactor);
        this.game.particles.gib(head, pos, { vx: -0.4, vy: 3, spin: 8 });
      }
    }
  }

  /**
   * The shamble. A zombie walk is a normal gait done badly, so this is a real
   * cycle — hips swing, the trailing knee folds to lift the heel, the pelvis
   * counter-rotates against the shoulders, and the body drops onto each planted
   * foot — then degraded per zombie by `gait`: one leg is stiffer than the other
   * (the limp), the torso is permanently pitched forward, and the head lolls.
   */
  animateWalk(phase, limbs) {
    if (!limbs) return;
    const g = this.gait;
    const s = Math.sin(phase);
    const sL = Math.sin(phase);
    const sR = Math.sin(phase + Math.PI);

    // Hip swing, each leg scaled by its own stiffness so the gait is lopsided.
    if (limbs.legL) {
      limbs.legL.rotation.z = sL * 0.5 * g.strideL;
      // Knee only ever folds backward, and folds most as the foot trails behind.
      if (limbs.legL.userData.knee) {
        limbs.legL.userData.knee.rotation.z = Math.max(0, sL) * 0.85 * g.strideL + 0.06;
      }
    }
    if (limbs.legR) {
      limbs.legR.rotation.z = sR * 0.5 * g.strideR;
      if (limbs.legR.userData.knee) {
        limbs.legR.userData.knee.rotation.z = Math.max(0, sR) * 0.85 * g.strideR + 0.06;
      }
    }

    // Body drops onto whichever foot is planted — twice per stride.
    const drop = Math.abs(Math.cos(phase));
    this.mesh.position.y = (0.035 - drop * 0.035) * this.scaleFactor;

    if (limbs.body) {
      limbs.body.rotation.z = g.lean + Math.sin(phase * 2) * 0.018;
      limbs.body.rotation.y = -s * 0.1;           // pelvis counter-rotation
      limbs.body.rotation.x = Math.sin(phase) * 0.03 * g.sway;
    }
    // Arms swing opposite the leg on the same side, and drag rather than pump.
    if (limbs.armL) {
      limbs.armL.rotation.z = -sL * 0.16;
      limbs.armL.rotation.y = sL * 0.14;
    }
    if (limbs.armR) {
      limbs.armR.rotation.z = -sR * 0.16;
      limbs.armR.rotation.y = sR * 0.14;
    }
    if (limbs.head) {
      limbs.head.rotation.z = g.headTilt + Math.sin(phase * 0.5) * 0.1;
      limbs.head.rotation.y = Math.sin(phase * 0.34) * 0.16;
      limbs.head.rotation.x = Math.sin(phase) * 0.05;
    }
  }

  update(dt, game) {
    this.game = game;
    const limbs = this.mesh.userData.limbs;

    if (this.flash > 0) {
      this.flash -= dt;
      const on = this.flash > 0;
      for (const key of ['body', 'legL', 'legR', 'armL', 'armR', 'head']) {
        setEmissive(limbs[key], on ? 0x660000 : 0x000000);
      }
    }

    if (this.slowT > 0) {
      this.slowT -= dt;
      const icy = this.slowT > 0;
      if (this.flash <= 0) {
        for (const key of ['head', 'armL', 'armR']) {
          setEmissive(limbs[key], icy ? 0x1a3a66 : 0x000000);
        }
      }
    }

    if (this.state === 'DYING') {
      this.dieTimer += dt;
      const dur = this.cfg.boss ? 1.5 : 0.85;
      const t = Math.min(this.dieTimer / dur, 1);
      this.mesh.rotation.z = t * -1.5;
      this.mesh.position.y = -t * 0.35 * this.scaleFactor;
      if (this.cfg.boss && !this.bossThud && t > 0.9) {
        this.bossThud = true;
        game.shake(0.35, 0.6);
        sfx.thud();
        game.particles.burst(this.x, 0.3, this.z, { color: 0x8a9a72, count: 26, speed: 3.2 });
      }
      if (this.dieTimer > dur + 0.15) this.dead = true;
      return;
    }

    if (this.state === 'FLYING') {
      const f = this.flyData;
      f.t += dt / 0.75;
      const t = Math.min(f.t, 1);
      this.x = f.fromX + (f.toX - f.fromX) * t;
      this.mesh.position.x = this.x;
      this.mesh.position.y = Math.sin(Math.PI * t) * 1.7;
      this.mesh.rotation.z = Math.sin(t * Math.PI * 2) * 0.4;
      if (t >= 1) { this.state = 'WALKING'; this.mesh.rotation.z = 0; }
      return;
    }

    if (this.state === 'VAULTING') {
      const v = this.vaultData;
      v.t += dt / 0.55;
      const t = Math.min(v.t, 1);
      this.x = v.fromX + (v.toX - v.fromX) * t;
      this.mesh.position.x = this.x;
      this.mesh.position.y = Math.sin(Math.PI * t) * 0.95;
      this.mesh.rotation.z = -Math.sin(Math.PI * t) * 0.5;
      if (t >= 1) {
        this.state = 'WALKING';
        this.mesh.rotation.z = 0;
        this.speed = 0.28;
      }
      return;
    }

    if (this.state === 'SMASH') {
      this.smashT += dt;
      const club = this.mesh.userData.club;
      if (club) {
        if (this.smashT < 0.5) club.rotation.z = 0.5 + this.smashT * 2.4;
        else club.rotation.z = Math.max(-0.9, 1.7 - (this.smashT - 0.5) * 9);
      }
      if (!this.smashed && this.smashT >= 0.62) {
        this.smashed = true;
        if (this.target && game.plants.includes(this.target)) {
          game.particles.burst(this.target.x, 0.4, this.target.z, { color: 0x6a9a2a, count: 20, speed: 3 });
          game.removePlant(this.target);
          game.shake(0.28, 0.4);
          sfx.thud();
        }
      }
      if (this.smashT >= 1.5) {
        this.state = 'WALKING';
        this.smashT = 0;
        this.smashed = false;
        this.target = null;
      }
      return;
    }

    if (this.state === 'THROW') {
      this.throwT += dt;
      const limbsA = this.mesh.userData.limbs;
      if (limbsA.armL) limbsA.armL.rotation.z = Math.sin(Math.min(this.throwT / 0.4, 1) * Math.PI) * 1.2;
      if (!this.impLaunched && this.throwT >= 0.4) {
        this.impLaunched = true;
        game.throwImp(this);
      }
      if (this.throwT >= 0.8) this.state = 'WALKING';
      return;
    }

    if (this.cfg.boss && !this.thrownImp && this.hp < this.maxHp * 0.55) {
      this.thrownImp = true;
      this.state = 'THROW';
      this.throwT = 0;
      this.impLaunched = false;
      return;
    }

    if (this.state === 'WALKING') {
      this.walkPhase += dt * (this.raged ? 10 : 6);
      this.x -= this.effSpeed() * dt;
      this.mesh.position.x = this.x;
      this.animateWalk(this.walkPhase, limbs);
      const fc = this.mesh.userData.flagCloth;
      if (fc) fc.rotation.y = Math.sin(this.walkPhase * 1.4) * 0.3;

      if (this.cfg.boss) {
        const s = Math.sin(this.walkPhase * 0.5);
        if (this.prevSin < 0 && s >= 0) { game.shake(0.05, 0.18); }
        this.prevSin = s;
      }

      const plant = game.plantInFront(this);
      if (plant) {
        if (this.cfg.vault && !this.vaulted && !plant.cfg.tall) {
          this.vaulted = true;
          this.vaultData = { t: 0, fromX: this.x, toX: plant.x - TILE * 0.95 };
          this.state = 'VAULTING';
          if (this.mesh.userData.pole) this.dropPart('pole');
          sfx.vault();
        } else if (this.cfg.boss) {
          this.state = 'SMASH';
          this.smashT = 0;
          this.smashed = false;
          this.target = plant;
        } else {
          this.state = 'ATTACKING';
          this.target = plant;
          this.attackPhase = 0;
        }
      }
    } else if (this.state === 'ATTACKING') {
      if (!this.target || this.target.hp <= 0 || game.plants.indexOf(this.target) === -1) {
        this.target = null;
        this.state = 'WALKING';
        return;
      }
      this.attackPhase = (this.attackPhase || 0) + dt * 8;
      this.eatTimer += dt;
      if (this.eatTimer > 0.9) { this.eatTimer = 0; sfx.chomp(); }
      if (limbs) {
        if (limbs.armL) limbs.armL.rotation.z = Math.sin(this.attackPhase) * 0.45 - 0.2;
        if (limbs.armR) limbs.armR.rotation.z = Math.sin(this.attackPhase + 1.2) * 0.45 - 0.2;
        if (limbs.head) limbs.head.rotation.x = Math.sin(this.attackPhase) * 0.15;
      }
      this.target.hp -= this.dps * dt;
      if (this.target.hp <= 0) {
        game.removePlant(this.target);
        this.target = null;
        this.state = 'WALKING';
      }
    }
  }
}

export class Projectile {
  constructor(row, x, z, kind, dmg, range, game) {
    this.row = row;
    this.x = x;
    this.startX = x;
    this.z = z;
    this.kind = kind;
    this.dmg = dmg;
    this.range = range || Infinity;
    this.mesh = buildProjectile(PROJECTILES[kind].color);
    this.mesh.position.set(x, 0.62, z);
    if (kind === 'puff') this.mesh.scale.setScalar(0.8);
    this.trailT = 0;
    this.dead = false;
    game.scene.add(this.mesh);
  }

  update(dt, game) {
    this.x += PROJECTILES[this.kind].speed * dt;
    this.mesh.position.x = this.x;

    if ((this.kind === 'pea' || this.kind === 'snow') && game.torchCols[this.row]) {
      const col = worldToCol(this.x);
      if (game.torchCols[this.row].has(col)) {
        this.kind = 'fire';
        this.dmg *= 2;
        this.mesh.material.color.setHex(PROJECTILES.fire.color);
        this.mesh.material.emissive = new THREE.Color(0x883205);
        this.mesh.scale.setScalar(1.25);
        sfx.fire();
      }
    }

    if (this.kind === 'fire') {
      this.trailT += dt;
      if (this.trailT > 0.05) {
        this.trailT = 0;
        game.particles.burst(this.x - 0.1, 0.62, this.z, { color: 0xff9a2a, count: 1, speed: 0.4, life: 0.3, gravity: -1.5, up: 0.3, size: 0.8 });
      }
    }

    if (this.x - this.startX > this.range || this.x > boardX(8) + 2.5) {
      this.dead = true;
      return;
    }

    for (const z of game.zombies) {
      if (z.row !== this.row || z.state === 'DYING' || z.state === 'FLYING') continue;
      if (Math.abs(this.x - z.x) < z.hitR) {
        const slowAmt = this.kind === 'snow' ? PROJECTILES.snow.slow : 0;
        z.hit(this.dmg, { projectile: true, slow: slowAmt, fire: this.kind === 'fire' });
        const col = this.kind === 'snow' ? 0x8ad8f0 : this.kind === 'fire' ? 0xff8a2a : this.kind === 'puff' ? 0xb88ad8 : 0x5fc93a;
        game.particles.burst(this.x, 0.65, this.z, { color: col, count: 5, speed: 1.2, life: 0.35, size: 0.7 });
        if (this.kind !== 'fire') sfx.splat();
        this.dead = true;
        break;
      }
    }
  }
}

export class Lob {
  constructor(row, x0, z, targetX, dmg, splash, game) {
    this.row = row;
    this.x0 = x0;
    this.z = z;
    this.targetX = targetX;
    this.dmg = dmg;
    this.splash = splash;
    this.t = 0;
    this.mesh = buildMelon();
    this.dead = false;
    game.scene.add(this.mesh);
  }

  update(dt, game) {
    this.t += dt / 1.0;
    const t = Math.min(this.t, 1);
    const x = this.x0 + (this.targetX - this.x0) * t;
    this.mesh.position.set(x, 0.5 + Math.sin(Math.PI * t) * 2.4, this.z);
    this.mesh.rotation.z -= dt * 6;
    if (this.t >= 1) {
      this.dead = true;
      sfx.splat();
      game.particles.burst(x, 0.4, this.z, { color: 0x3e8a2e, count: 16, speed: 2.4, life: 0.5 });
      game.particles.burst(x, 0.4, this.z, { color: 0xd85a70, count: 8, speed: 1.6, life: 0.45 });
      for (const z of game.zombies) {
        if (z.row === this.row && z.state !== 'DYING' && Math.abs(z.x - x) <= this.splash) {
          z.hit(this.dmg, { projectile: true, lobbed: true });
        }
      }
    }
  }
}

export class Sun {
  constructor(mesh, x, z, fromSky) {
    this.mesh = mesh;
    this.x = x;
    this.z = z;
    this.y = fromSky ? 8.5 : 1.1;
    this.targetY = 0.45;
    this.vy = fromSky ? 0 : 1.6;
    this.fromSky = fromSky;
    this.life = 0;
    this.dead = false;
    this.fly = null;
    this.spin = Math.random() * Math.PI * 2;
    mesh.position.set(x, this.y, z);
  }

  update(dt) {
    this.spin += dt * 1.5;
    this.mesh.rotation.y = this.spin;

    if (this.fly) {
      this.fly.t += dt / 0.35;
      const t = Math.min(this.fly.t, 1);
      this.mesh.position.lerpVectors(this.fly.from, this.fly.to, t);
      this.mesh.scale.setScalar(1 - t * 0.7);
      if (t >= 1) this.dead = true;
      return;
    }

    if (this.fromSky) {
      if (this.y > this.targetY) this.y = Math.max(this.targetY, this.y - 1.6 * dt);
      else this.life += dt;
    } else {
      if (this.vy > 0 || this.y > this.targetY) {
        this.vy -= 4.5 * dt;
        this.y += this.vy * dt;
        if (this.y < this.targetY) { this.y = this.targetY; this.vy = 0; }
      } else this.life += dt;
    }
    this.mesh.position.y = this.y + Math.sin(this.spin * 2) * 0.03;
    if (this.life > SUN_LIFETIME) this.dead = true;
    const fade = SUN_LIFETIME - this.life;
    if (fade < 2) this.mesh.scale.setScalar(Math.max(0.2, 0.6 + 0.4 * (fade / 2)));
  }
}

export class Mower {
  constructor(row, mesh, x) {
    this.row = row;
    this.mesh = mesh;
    this.x = x;
    this.z = boardZ(row);
    this.active = false;
    this.gone = false;
    this.runT = 0;
    this.speed = 0;
    this.clipT = 0;
    mesh.position.set(x, 0, this.z);
  }

  update(dt, game) {
    if (!this.active) return;
    const ud = this.mesh.userData;
    this.runT += dt;

    // Spool up rather than teleporting to full speed the instant it trips.
    this.speed = Math.min(6.8, this.speed + 16 * dt);
    this.x += this.speed * dt;
    this.mesh.position.x = this.x;

    // Engine vibration: the chassis judders and pitches slightly, it does not roll.
    const shake = Math.min(1, this.runT * 6);
    this.mesh.position.y = Math.abs(Math.sin(this.runT * 46)) * 0.012 * shake;
    this.mesh.position.z = this.z + Math.sin(this.runT * 39) * 0.012 * shake;
    this.mesh.rotation.z = -0.05 * shake + Math.sin(this.runT * 31) * 0.02 * shake;
    if (ud.reel) ud.reel.rotation.x += dt * 46;
    for (const w of ud.wheels || []) w.rotation.y += dt * this.speed * 7;

    // Throw a steady spray of shredded grass out of the back of the reel.
    this.clipT -= dt;
    if (this.clipT <= 0) {
      this.clipT = 0.03;
      game.particles.burst(this.x + 0.3, 0.12, this.z, {
        color: 0x69a83a, count: 2, speed: 1.8, life: 0.45, size: 0.55, up: 2.2, gravity: 9,
      });
    }

    for (const z of game.zombies) {
      if (z.row === this.row && z.state !== 'DYING' && Math.abs(z.x - this.x) < 0.55) {
        // Hit hard enough to be worth watching: debris, a jolt, and a lurch.
        game.particles.burst(z.x, 0.5, this.z, { color: 0x7a8a5e, count: 18, speed: 3.2, life: 0.6 });
        game.particles.burst(z.x, 0.3, this.z, { color: 0x4a5a2a, count: 10, speed: 2.2, life: 0.5 });
        game.shake(0.14, 0.22);
        this.speed *= 0.55;
        sfx.crunch();
        z.die();
      }
    }
    if (this.x > boardX(8) + 3) this.gone = true;
  }
}
