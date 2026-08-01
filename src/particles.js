import * as THREE from '../lib/three.module.js';

const boxGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.gibs = [];
  }

  burst(x, y, z, { color = 0xffaa22, count = 14, speed = 2.4, size = 1, life = 0.7, gravity = 6, up = 1.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const m = new THREE.Mesh(boxGeo, mat);
      m.position.set(x, y, z);
      const s = size * (0.6 + Math.random() * 0.8);
      m.scale.setScalar(s);
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.3 + Math.random() * 0.7);
      this.scene.add(m);
      this.items.push({
        mesh: m,
        vx: Math.cos(a) * r,
        vz: Math.sin(a) * r * 0.6,
        vy: up * (0.4 + Math.random() * 1.2),
        rx: (Math.random() - 0.5) * 10,
        t: 0,
        life: life * (0.7 + Math.random() * 0.6),
        gravity,
      });
    }
  }

  gib(mesh, worldPos, { vx = 0, vy = 2.6, vz = 0, spin = 6, life = 1.3 } = {}) {
    mesh.removeFromParent();
    mesh.position.copy(worldPos);
    this.scene.add(mesh);
    this.gibs.push({
      mesh,
      vx: vx + (Math.random() - 0.5) * 1.2,
      vy: vy + Math.random() * 0.8,
      vz: vz + (Math.random() - 0.5) * 0.8,
      spin: (Math.random() - 0.5) * spin,
      t: 0,
      life,
    });
  }

  update(dt) {
    for (const p of this.items) {
      p.t += dt;
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.y += p.rx * 0.7 * dt;
      const k = 1 - p.t / p.life;
      p.mesh.material.opacity = Math.max(0, k);
      if (p.mesh.position.y < 0.02 && p.vy < 0) { p.mesh.position.y = 0.02; p.vy *= -0.3; }
    }
    this.items = this.items.filter((p) => {
      if (p.t >= p.life) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        return false;
      }
      return true;
    });

    for (const g of this.gibs) {
      g.t += dt;
      g.vy -= 7 * dt;
      g.mesh.position.x += g.vx * dt;
      g.mesh.position.y += g.vy * dt;
      g.mesh.position.z += g.vz * dt;
      g.mesh.rotation.z += g.spin * dt;
      g.mesh.rotation.x += g.spin * 0.6 * dt;
    }
    this.gibs = this.gibs.filter((g) => {
      if (g.t >= g.life || g.mesh.position.y < -1.5) {
        this.scene.remove(g.mesh);
        return false;
      }
      return true;
    });
  }
}
