import * as THREE from '../lib/three.module.js';
import {
  grassSurface, lawnTileSurface, dirtSurface, brickSurface, woodSurface,
  shingleSurface, stoneSurface, clothSurface, skinSurface, barkSurface,
  foliageSurface, leafAlpha,
} from './textures.js';

// Everything is lit as physically-based standard material against an image-based
// environment (see Game.initScene). Plants keep their stylised silhouettes; the
// realism comes from the shading, textures and scene dressing around them.
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.82, metalness: 0.0, ...opts,
});

/**
 * Material for a textured surface. `mul` is the theme's day/night multiplier and
 * `tint` an optional extra colour.
 *
 * The base colour is deliberately near-white: three multiplies `color` by `map`,
 * so passing the surface's own colour here would square it and leave every
 * material muddy and over-saturated. The colour lives in the texture.
 */
function textured(surf, mul = 1, opts = {}) {
  const { normalScale = 1, tint = 0xffffff, ...rest } = opts;
  const m = mat(scaleColor(tint, mul), rest);
  if (surf) {
    if (surf.map) m.map = surf.map;
    if (surf.normalMap) {
      m.normalMap = surf.normalMap;
      m.normalScale = new THREE.Vector2(normalScale, normalScale);
    }
    if (surf.roughnessMap) m.roughnessMap = surf.roughnessMap;
  }
  return m;
}

// Leaves and petals: soft, slightly waxy, lit from both sides so thin geometry
// does not read as black when the sun is behind it.
const leafMat = (color, mul = 1) => mat(scaleColor(color, mul), {
  roughness: 0.55, side: THREE.DoubleSide,
});

function mesh(geo, mat_, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat_);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Theme tint is deliberately gentle now — the lighting rig carries most of the
// day/night difference, so albedo only shifts part of the way.
function scaleColor(hex, mul) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(0.55 + 0.45 * mul);
  return c.getHex();
}

function addEyes(parent, x, y, zSpread, size = 1, pupilForward = 0.035) {
  const white = mat(0xf4f4ee, { roughness: 0.22 });
  const black = mat(0x14141a, { roughness: 0.15 });
  for (const s of [-1, 1]) {
    parent.add(mesh(new THREE.SphereGeometry(0.055 * size, 14, 12), white, x, y, zSpread * s));
    parent.add(mesh(new THREE.SphereGeometry(0.027 * size, 10, 8), black, x + pupilForward * size, y, zSpread * s));
  }
}

function smile(parent, x, y, z, r = 0.07, flip = false) {
  const arc = mesh(new THREE.TorusGeometry(r, 0.014, 8, 16, Math.PI), mat(0x3a2415, { roughness: 0.6 }), x, y, z);
  arc.rotation.y = Math.PI / 2;
  arc.rotation.x = flip ? 0 : Math.PI;
  parent.add(arc);
  return arc;
}

export function buildTile(row, col, tileMul = 1, isMowerLane = false) {
  const surf = lawnTileSurface(!isMowerLane);
  // The mower strip is the same turf, just a shade shadier for having a machine on it.
  const top = textured(surf, tileMul, { roughness: 0.94, normalScale: 1.1 });
  if (isMowerLane) top.color.multiplyScalar(0.9);
  const soil = textured(dirtSurface(1), tileMul, { roughness: 0.98 });
  const mats = [soil, soil, top, soil, soil, soil];
  const tile = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), mats);
  tile.position.y = -0.1;
  tile.receiveShadow = true;
  return tile;
}

function stemAndLeaves(g, stemH = 0.4) {
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, stemH, 12), mat(0x3d8a1e, { roughness: 0.7 }), 0, stemH / 2, 0));
  for (const s of [-1, 1]) {
    const leaf = mesh(new THREE.ConeGeometry(0.1, 0.34, 8), leafMat(0x55b32c), 0.13 * s, 0.08, 0.13 * s);
    leaf.rotation.z = -0.95 * s;
    leaf.rotation.x = 0.4 * s;
    leaf.scale.z = 0.5;
    g.add(leaf);
  }
}

function shooterHead(color, dark) {
  const head = new THREE.Group();
  head.add(mesh(new THREE.SphereGeometry(0.32, 24, 20), mat(color, { roughness: 0.58 }), 0, 0, 0));
  const barrel = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.36, 18), mat(color, { roughness: 0.58 }), 0.34, 0.02, 0);
  barrel.rotation.z = -Math.PI / 2;
  head.add(barrel);
  const lip = mesh(new THREE.TorusGeometry(0.13, 0.04, 10, 20), mat(dark, { roughness: 0.5 }), 0.52, 0.02, 0);
  lip.rotation.y = Math.PI / 2;
  head.add(lip);
  head.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 14), mat(0x14240a, { roughness: 0.9 }), 0.53, 0.02, 0).rotateZ(-Math.PI / 2));
  addEyes(head, 0.16, 0.16, 0.12, 1.1);
  const sprout = mesh(new THREE.ConeGeometry(0.05, 0.2, 8), leafMat(dark), -0.05, 0.36, 0);
  sprout.rotation.z = 0.5;
  head.add(sprout);
  return head;
}

export function buildPeashooter() {
  const g = new THREE.Group();
  stemAndLeaves(g);
  const head = shooterHead(0x54b62e, 0x3d8a1e);
  head.position.set(0, 0.58, 0);
  g.add(head);
  g.userData.head = head;
  return g;
}

export function buildSnowpea() {
  const g = new THREE.Group();
  stemAndLeaves(g);
  const head = shooterHead(0x6fd0f0, 0x3a90b8);
  head.position.set(0, 0.58, 0);
  const iceMat = mat(0xe0f6ff, { emissive: 0x1b3a4c, roughness: 0.1, metalness: 0.05 });
  for (let i = 0; i < 4; i++) {
    const c = mesh(new THREE.ConeGeometry(0.05, 0.2, 6), iceMat, -0.1 + i * 0.08, 0.32, (i - 1.5) * 0.09);
    c.rotation.z = (i - 1.5) * 0.35;
    head.add(c);
  }
  g.add(head);
  g.userData.head = head;
  return g;
}

export function buildRepeater() {
  const g = new THREE.Group();
  stemAndLeaves(g);
  const head = shooterHead(0x3e9c22, 0x2c7414);
  head.position.set(0, 0.58, 0);
  const barrel2 = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.28, 14), mat(0x3e9c22, { roughness: 0.58 }), 0.12, 0.2, 0);
  barrel2.rotation.z = -Math.PI / 2 + 0.35;
  head.add(barrel2);
  g.add(head);
  g.userData.head = head;
  return g;
}

export function buildThreepeater() {
  const g = new THREE.Group();
  stemAndLeaves(g, 0.45);
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0);
  for (const s of [-1, 0, 1]) {
    const h = shooterHead(0x54b62e, 0x3d8a1e);
    h.scale.setScalar(0.7);
    h.position.set(0, s === 0 ? 0.14 : 0, s * 0.26);
    h.rotation.y = s * 0.5;
    head.add(h);
  }
  g.add(head);
  g.userData.head = head;
  return g;
}

export function buildSunflower() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 12), mat(0x3d8a1e, { roughness: 0.7 }), 0, 0.25, 0));
  for (const s of [-1, 1]) {
    const leaf = mesh(new THREE.ConeGeometry(0.11, 0.36, 8), leafMat(0x55b32c), 0.15 * s, 0.1, 0);
    leaf.rotation.z = -1.1 * s;
    leaf.scale.z = 0.5;
    g.add(leaf);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0.08);
  const face = mesh(new THREE.SphereGeometry(0.19, 20, 16), mat(0xa8783a, { roughness: 0.95 }), 0, 0, 0.05);
  face.scale.z = 0.75;
  head.add(face);
  // seed pattern in the disc florets
  const seedMat = mat(0x5e421e, { roughness: 0.95 });
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const r = 0.028 * Math.sqrt(i);
    const s = mesh(new THREE.SphereGeometry(0.016, 6, 5), seedMat, Math.cos(a) * r, Math.sin(a) * r, 0.16);
    s.scale.z = 0.5;
    s.castShadow = false;
    head.add(s);
  }
  const petalGeo = new THREE.ConeGeometry(0.09, 0.24, 8);
  const petalMat = leafMat(0xffce20);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = mesh(petalGeo, petalMat, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
    p.scale.set(1, 1, 0.35);
    p.rotation.z = a + Math.PI / 2;
    head.add(p);
  }
  const white = mat(0xf4f4ee, { roughness: 0.22 });
  const black = mat(0x14141a, { roughness: 0.15 });
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), white, 0.07 * s, 0.05, 0.17));
    head.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), black, 0.07 * s, 0.05, 0.2));
  }
  const grin = mesh(new THREE.TorusGeometry(0.06, 0.013, 8, 14, Math.PI), mat(0x3a2415, { roughness: 0.6 }), 0, -0.03, 0.18);
  grin.rotation.z = Math.PI;
  head.add(grin);
  head.rotation.x = 0.35;
  g.add(head);
  g.userData.head = head;
  return g;
}

export function buildWallnut() {
  const g = new THREE.Group();
  const shell = textured(woodSurface(2, [186, 140, 86]), 1, { roughness: 0.78, normalScale: 0.7 });
  const nut = mesh(new THREE.SphereGeometry(0.36, 24, 20), shell, 0, 0.42, 0);
  nut.scale.set(0.92, 1.22, 0.92);
  g.add(nut);
  const shade = mesh(new THREE.SphereGeometry(0.365, 20, 16), mat(0x8a5c28, { roughness: 0.85 }), 0, 0.34, 0);
  shade.scale.set(0.9, 1.05, 0.9);
  g.add(shade);
  addEyes(g, 0.26, 0.58, 0.15, 1.15, 0.05);
  smile(g, 0.3, 0.4, 0, 0.08);
  g.userData.nut = nut;
  return g;
}

export function buildTallnut() {
  const g = new THREE.Group();
  const shell = textured(woodSurface(2, [196, 150, 92]), 1, { roughness: 0.78, normalScale: 0.7 });
  const nut = mesh(new THREE.SphereGeometry(0.4, 24, 20), shell, 0, 0.62, 0);
  nut.scale.set(0.88, 1.65, 0.88);
  g.add(nut);
  addEyes(g, 0.28, 0.95, 0.15, 1.2, 0.06);
  const browM = mat(0x6a4a1a, { roughness: 0.8 });
  for (const s of [-1, 1]) {
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.035, 0.15), browM, 0.29, 1.1, 0.15 * s);
    brow.rotation.x = 0.35 * s;
    g.add(brow);
  }
  smile(g, 0.33, 0.76, 0, 0.07, true);
  g.userData.nut = nut;
  return g;
}

export function buildPotatomine() {
  const g = new THREE.Group();
  const mound = mesh(new THREE.SphereGeometry(0.3, 16, 12), textured(dirtSurface(1), 1, { roughness: 0.98 }), 0, 0.02, 0);
  mound.scale.set(1.1, 0.35, 1.1);
  g.add(mound);
  const potato = new THREE.Group();
  potato.add(mesh(new THREE.SphereGeometry(0.28, 20, 16), mat(0xc9a659, { roughness: 0.95 }), 0, 0.26, 0));
  addEyes(potato, 0.22, 0.32, 0.11, 0.9, 0.04);
  potato.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), mat(0x4a4a4e, { roughness: 0.4, metalness: 0.8 }), 0, 0.56, 0));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), mat(0xff3a2a, { emissive: 0x881105, roughness: 0.25 }));
  bulb.position.set(0, 0.68, 0);
  potato.add(bulb);
  potato.visible = false;
  g.add(potato);
  g.userData.mound = mound;
  g.userData.potato = potato;
  g.userData.bulb = bulb;
  return g;
}

export function buildChomper() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.35, 12), mat(0x3d8a1e, { roughness: 0.7 }), 0, 0.17, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.52, 0);
  const purple = mat(0x9a3aae, { roughness: 0.52 });
  const darkIn = mat(0x3a0a44, { roughness: 0.35 });
  const jawLow = new THREE.Group();
  const lowBox = mesh(new THREE.BoxGeometry(0.46, 0.14, 0.36), purple, 0.15, -0.08, 0);
  jawLow.add(lowBox);
  jawLow.add(mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), darkIn, 0.15, -0.02, 0));
  const toothMat = mat(0xf8f2e0, { roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    jawLow.add(mesh(new THREE.ConeGeometry(0.035, 0.09, 8), toothMat, 0.3, -0.01, (i - 1) * 0.11));
  }
  head.add(jawLow);
  const jawUp = new THREE.Group();
  const upper = mesh(new THREE.SphereGeometry(0.28, 20, 16), purple, 0.1, 0.12, 0);
  upper.scale.set(1.35, 0.95, 1);
  jawUp.add(upper);
  for (let i = 0; i < 4; i++) {
    const t = mesh(new THREE.ConeGeometry(0.035, 0.11, 8), toothMat, 0.3 + (i % 2) * 0.08, 0.02, (i - 1.5) * 0.09);
    t.rotation.z = Math.PI;
    jawUp.add(t);
  }
  const spotM = mat(0xe06ab8, { roughness: 0.5 });
  jawUp.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), spotM, -0.04, 0.26, 0.16));
  jawUp.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), spotM, 0.02, 0.3, -0.14));
  head.add(jawUp);
  addEyes(head, 0.02, 0.3, 0.22, 0.85, 0.03);
  g.add(head);
  g.userData.head = head;
  g.userData.jawUp = jawUp;
  g.userData.jawLow = jawLow;
  return g;
}

export function buildPuffshroom() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.24, 12), mat(0xf0e4c8, { roughness: 0.9 }), 0, 0.12, 0));
  const cap = mesh(new THREE.SphereGeometry(0.2, 20, 16), mat(0xa86ec8, { roughness: 0.72 }), 0, 0.28, 0);
  cap.scale.set(1, 0.75, 1);
  g.add(cap);
  const spotM = mat(0xd8b8ec, { roughness: 0.7 });
  g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), spotM, 0.08, 0.37, 0.09));
  g.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), spotM, -0.07, 0.38, -0.07));
  g.add(mesh(new THREE.SphereGeometry(0.036, 10, 8), spotM, -0.02, 0.4, 0.11));
  addEyes(g, 0.14, 0.17, 0.08, 0.8, 0.04);
  g.userData.head = cap;
  return g;
}

export function buildCherrybomb() {
  const g = new THREE.Group();
  const red = mat(0xd82a2a, { roughness: 0.28 });
  for (const s of [-1, 1]) {
    const cherry = mesh(new THREE.SphereGeometry(0.25, 20, 16), red, -0.04 * s, 0.3, 0.17 * s);
    g.add(cherry);
    g.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0xff9a9a, { roughness: 0.2 }), -0.04 * s + 0.1, 0.42, 0.17 * s + 0.08 * s));
    const stem = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8), mat(0x3a7a1a, { roughness: 0.7 }), -0.04 * s, 0.56, 0.17 * s);
    stem.rotation.z = 0.3 * s;
    g.add(stem);
    const browM = mat(0x4a0a0a, { roughness: 0.6 });
    const brow = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.13), browM, 0.18, 0.42, 0.17 * s);
    brow.rotation.x = -0.45 * s;
    g.add(brow);
    g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(0x2a0505, { roughness: 0.2 }), 0.2, 0.34, 0.17 * s));
  }
  return g;
}

export function buildJalapeno() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.17, 0.44, 10, 18), mat(0xe83218, { roughness: 0.22 }), 0, 0.3, 0);
  body.rotation.z = 1.35;
  g.add(body);
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.14, 10), mat(0x3a7a1a, { roughness: 0.7 }), -0.34, 0.44, 0));
  addEyes(g, 0.14, 0.38, 0.1, 0.85, 0.04);
  const browM = mat(0x5a0a05, { roughness: 0.6 });
  for (const s of [-1, 1]) {
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.028, 0.11), browM, 0.14, 0.47, 0.1 * s);
    brow.rotation.x = -0.55 * s;
    g.add(brow);
  }
  const scowl = smile(g, 0.2, 0.24, 0, 0.05, true);
  scowl.material = mat(0x3a0505, { roughness: 0.6 });
  return g;
}

export function buildSquash() {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.38, 22, 18), mat(0x74a832, { roughness: 0.6 }), 0, 0.4, 0);
  body.scale.set(0.95, 1.1, 0.9);
  g.add(body);
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 10), mat(0x4a6a1a, { roughness: 0.8 }), 0, 0.87, 0));
  addEyes(g, 0.31, 0.52, 0.13, 1.0, 0.05);
  const browM = mat(0x2a3a10, { roughness: 0.7 });
  for (const s of [-1, 1]) {
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.035, 0.17), browM, 0.32, 0.66, 0.13 * s);
    brow.rotation.x = -0.55 * s;
    g.add(brow);
  }
  const frown = smile(g, 0.36, 0.3, 0, 0.06, true);
  frown.material = mat(0x1a2a08, { roughness: 0.6 });
  g.userData.body = body;
  return g;
}

export function buildTorchwood() {
  const g = new THREE.Group();
  const barkM = textured(barkSurface(2), 1, { roughness: 0.95, normalScale: 1.2 });
  const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.74, 16), barkM, 0, 0.37, 0);
  g.add(trunk);
  g.add(mesh(new THREE.TorusGeometry(0.19, 0.035, 10, 18), mat(0x5e3c20, { roughness: 0.9 }), 0, 0.74, 0));
  const knotM = mat(0x6e4626, { roughness: 0.9 });
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.3, 0.05), knotM, 0.19, 0.3, 0.08));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.22, 0.05), knotM, 0.18, 0.42, -0.1));
  addEyes(g, 0.2, 0.48, 0.09, 0.9, 0.03);
  smile(g, 0.22, 0.32, 0, 0.06);
  const flameO = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.44, 12),
    mat(0xff7a1a, { emissive: 0xdd5205, emissiveIntensity: 2.2, roughness: 1, transparent: true, opacity: 0.92 })
  );
  flameO.position.set(0, 0.98, 0);
  flameO.castShadow = false;
  const flameI = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.26, 10),
    mat(0xffd84a, { emissive: 0xffb010, emissiveIntensity: 3, roughness: 1 })
  );
  flameI.position.set(0, 0.95, 0);
  flameI.castShadow = false;
  const ember = new THREE.PointLight(0xff8a30, 1.5, 3.2, 2);
  ember.position.set(0, 1.0, 0);
  g.add(flameO, flameI, ember);
  g.userData.flames = [flameO, flameI];
  g.userData.light = ember;
  return g;
}

export function buildSpikeweed() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 16), mat(0x3e6224, { roughness: 0.85 }), 0, 0.04, 0));
  const spikeM = mat(0xb8bcc6, { roughness: 0.28, metalness: 0.75 });
  const pts = [[0, 0], [0.22, 0.15], [-0.2, 0.18], [0.12, -0.22], [-0.15, -0.15], [0.3, -0.05], [-0.3, -0.02]];
  for (const [px, pz] of pts) {
    g.add(mesh(new THREE.ConeGeometry(0.055, 0.26, 8), spikeM, px, 0.19, pz));
  }
  addEyes(g, 0.4, 0.1, 0.1, 0.7, 0.03);
  return g;
}

export function buildMelonpult() {
  const g = new THREE.Group();
  const woodM = textured(woodSurface(2, [156, 118, 70]), 1, { roughness: 0.88 });
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.32, 14), woodM, 0, 0.16, 0));
  g.add(mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 16), mat(0x6a4a28, { roughness: 0.9 }), 0, 0.28, 0));
  const arm = new THREE.Group();
  arm.position.set(-0.1, 0.32, 0);
  arm.add(mesh(new THREE.BoxGeometry(0.52, 0.07, 0.11), woodM, 0.2, 0, 0));
  const basket = mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.13, 12, 1, true), mat(0x6a4a28, { roughness: 0.9, side: THREE.DoubleSide }), 0.46, 0.07, 0);
  arm.add(basket);
  const melon = mesh(new THREE.SphereGeometry(0.16, 18, 14), mat(0x3e9a2e, { roughness: 0.42 }), 0.46, 0.15, 0);
  melon.scale.set(1.3, 1, 1);
  arm.add(melon);
  const stripeM = mat(0x2a6a1c, { roughness: 0.42 });
  for (const o of [-0.06, 0.06]) {
    const st = mesh(new THREE.TorusGeometry(0.15, 0.015, 8, 16), stripeM, 0.46 + o, 0.15, 0);
    st.rotation.y = Math.PI / 2;
    st.scale.setScalar(0.95);
    arm.add(st);
  }
  arm.rotation.z = -0.5;
  g.add(arm);
  addEyes(g, 0.2, 0.22, 0.1, 0.8, 0.04);
  g.userData.arm = arm;
  g.userData.melon = melon;
  return g;
}

export const PLANT_BUILDERS = {
  sunflower: buildSunflower,
  peashooter: buildPeashooter,
  wallnut: buildWallnut,
  potatomine: buildPotatomine,
  snowpea: buildSnowpea,
  chomper: buildChomper,
  repeater: buildRepeater,
  puffshroom: buildPuffshroom,
  cherrybomb: buildCherrybomb,
  squash: buildSquash,
  threepeater: buildThreepeater,
  jalapeno: buildJalapeno,
  torchwood: buildTorchwood,
  tallnut: buildTallnut,
  spikeweed: buildSpikeweed,
  melonpult: buildMelonpult,
};

// ------------------------------------------------------------------ zombies

// Anatomy is built around real joint pivots: hips at the top of the leg group,
// shoulders at the top of the arm group. entities.js animates those groups, so
// the walk cycle swings from the joint instead of the middle of the limb.
export function buildZombie(type) {
  const g = new THREE.Group();
  const skinBase = type === 'imp' ? [140, 126, 92] : type === 'brute' ? [106, 126, 88] : [124, 144, 102];
  const suitBase = type === 'football' ? [138, 58, 58] : type === 'polevault' ? [162, 66, 66] : type === 'brute' ? [92, 74, 56] : [72, 79, 98];

  const skin = textured(skinSurface(1, skinBase), 1, {
    roughness: 0.86, normalScale: 0.28,
  });
  // Low repeat: at this scale a tight weave reads as a knitted sweater.
  const suit = textured(clothSurface(1, suitBase), 1, {
    roughness: 0.94, normalScale: 0.35,
  });
  const pants = textured(clothSurface(1, [58, 55, 68]), 1, { roughness: 0.95, normalScale: 0.35 });
  const shoe = mat(0x2a241f, { roughness: 0.55 });

  // Hip group carries the thigh; a nested knee group carries shin + foot, so the
  // walk cycle can lift the heel instead of swinging one rigid plank.
  const leg = (zOff) => {
    const hip = new THREE.Group();
    hip.position.set(-0.02, 0.52, zOff);
    hip.add(mesh(new THREE.CapsuleGeometry(0.072, 0.24, 6, 12), pants, 0, -0.17, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.31, 0);
    knee.add(mesh(new THREE.CapsuleGeometry(0.058, 0.14, 6, 10), pants, 0, -0.1, 0));
    knee.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.12), shoe, -0.04, -0.19, 0));
    hip.add(knee);
    hip.userData.knee = knee;
    return hip;
  };
  const legL = leg(-0.085);
  const legR = leg(0.085);

  const body = new THREE.Group();
  body.position.set(0, 0.75, 0);
  // A squared-off jacket, not a bean — the shoulder line is most of the read.
  // Kept narrow and deep: a wide, shallow box turns the torso into a fridge.
  const torso = mesh(new THREE.BoxGeometry(0.25, 0.44, 0.32), suit, 0, 0, 0);
  body.add(torso);
  const chest = mesh(new THREE.SphereGeometry(0.17, 14, 12), suit, 0, 0.09, 0);
  chest.scale.set(0.8, 0.62, 1.0);
  body.add(chest);
  // shoulders
  body.add(mesh(new THREE.SphereGeometry(0.095, 12, 10), suit, -0.01, 0.16, -0.14));
  body.add(mesh(new THREE.SphereGeometry(0.095, 12, 10), suit, -0.01, 0.16, 0.14));
  if (type !== 'football' && type !== 'brute' && type !== 'imp') {
    // grubby dress shirt and a crooked tie
    const shirt = mesh(new THREE.BoxGeometry(0.05, 0.28, 0.14), mat(0xd8d2c0, { roughness: 0.95 }), -0.15, 0.02, 0);
    body.add(shirt);
    const tie = mesh(new THREE.BoxGeometry(0.045, 0.22, 0.055), mat(0x7a2530, { roughness: 0.7 }), -0.17, -0.02, 0);
    tie.rotation.x = 0.12;
    body.add(tie);
    body.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), mat(0x7a2530, { roughness: 0.7 }), -0.17, 0.12, 0));
  }

  // Arms reach forward but sag at the elbow and wrist — a dead-straight tube
  // pointing out of the shoulder reads as a T-pose, not a shamble.
  const arm = (zOff, droop) => {
    const grp = new THREE.Group();
    grp.position.set(-0.06, 0.9, zOff);
    const upper = mesh(new THREE.CapsuleGeometry(0.058, 0.16, 6, 12), suit, -0.1, -0.01, 0);
    upper.rotation.z = Math.PI / 2 - 0.12;
    grp.add(upper);
    const elbow = new THREE.Group();
    elbow.position.set(-0.2, -0.04, 0);
    elbow.rotation.z = -0.26 + droop * 0.06;
    const fore = mesh(new THREE.CapsuleGeometry(0.05, 0.15, 6, 12), skin, -0.1, 0, 0);
    fore.rotation.z = Math.PI / 2;
    elbow.add(fore);
    elbow.add(mesh(new THREE.SphereGeometry(0.058, 10, 8), suit, 0, 0, 0));
    const hand = new THREE.Group();
    hand.position.set(-0.22, -0.01, 0);
    hand.rotation.z = -0.35;
    hand.add(mesh(new THREE.SphereGeometry(0.052, 10, 8), skin, 0, 0, 0));
    for (let i = 0; i < 3; i++) {
      const f = mesh(new THREE.CapsuleGeometry(0.016, 0.05, 4, 6), skin, -0.05, -0.012, (i - 1) * 0.031);
      f.rotation.z = Math.PI / 2 - 0.5;
      hand.add(f);
    }
    hand.add(mesh(new THREE.CapsuleGeometry(0.015, 0.035, 4, 6), skin, -0.028, 0.026, 0.036 * droop));
    elbow.add(hand);
    grp.add(elbow);
    grp.userData.hand = hand;
    return grp;
  };
  const armL = arm(-0.17, -1);
  const armR = arm(0.17, 1);

  const head = new THREE.Group();
  head.position.set(0, 1.12, 0);
  const skull = mesh(new THREE.SphereGeometry(0.19, 20, 18), skin, 0, 0, 0);
  skull.scale.set(0.96, 1.06, 0.92);
  head.add(skull);
  // brow ridge, sunken cheeks and a hanging jaw — the zombie read
  const browRidge = mesh(new THREE.BoxGeometry(0.07, 0.05, 0.24), skin, -0.13, 0.08, 0);
  browRidge.rotation.z = 0.2;
  head.add(browRidge);
  const jaw = mesh(new THREE.BoxGeometry(0.14, 0.1, 0.17), skin, -0.1, -0.15, 0);
  jaw.rotation.z = 0.18;
  head.add(jaw);
  head.add(mesh(new THREE.BoxGeometry(0.055, 0.03, 0.11), mat(0xe8e2d0, { roughness: 0.35 }), -0.15, -0.105, 0));
  // patchy hair
  const hair = mat(0x2e2a24, { roughness: 0.96 });
  for (const [hx, hy, hz, hs] of [[0.02, 0.14, 0.06, 0.07], [0.06, 0.1, -0.08, 0.055], [-0.02, 0.16, -0.03, 0.05]]) {
    const tuftM = mesh(new THREE.SphereGeometry(hs, 8, 6), hair, hx, hy, hz);
    tuftM.scale.y = 0.6;
    head.add(tuftM);
  }
  const eyes = [];
  const white = mat(0xe8ece0, { roughness: 0.18 });
  const black = mat(0x14141a, { roughness: 0.12 });
  const socket = mat(0x4a5240, { roughness: 0.95 });
  const eyeSizes = [1.25, 0.85];
  [-1, 1].forEach((s, i) => {
    const sz = eyeSizes[i];
    head.add(mesh(new THREE.SphereGeometry(0.062 * sz, 10, 8), socket, -0.125, 0.04, 0.075 * s));
    const e = mesh(new THREE.SphereGeometry(0.05 * sz, 12, 10), white, -0.15, 0.04, 0.075 * s);
    eyes.push(e);
    head.add(e);
    head.add(mesh(new THREE.SphereGeometry(0.024 * sz, 10, 8), black, -0.185, 0.04, 0.075 * s));
  });
  const brow = mesh(new THREE.BoxGeometry(0.04, 0.03, 0.11), mat(0x3e4636, { roughness: 0.9 }), -0.16, 0.13, -0.075);
  brow.rotation.x = -0.3;
  head.add(brow);

  g.add(legL, legR, body, armL, armR, head);

  let hat = null, pole = null, paper = null, shield = null, club = null, flagCloth = null;

  if (type === 'conehead') {
    hat = mesh(new THREE.ConeGeometry(0.175, 0.46, 16), mat(0xd9822f, { roughness: 0.72 }), 0, 1.48, 0);
    hat.add(mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 20), mat(0xf0f0f0, { roughness: 0.5 }), 0, 0.05, 0).rotateX(Math.PI / 2));
    g.add(hat);
  } else if (type === 'buckethead') {
    // Sits down over the brow like a helmet rather than perching on the crown.
    hat = new THREE.Group();
    hat.position.set(0, 1.29, 0);
    const metal = mat(0x9aa0a8, { roughness: 0.42, metalness: 0.85 });
    hat.add(mesh(new THREE.CylinderGeometry(0.165, 0.14, 0.25, 20), metal, 0, 0, 0));
    hat.add(mesh(new THREE.TorusGeometry(0.165, 0.022, 10, 20), mat(0x7e848c, { roughness: 0.5, metalness: 0.85 }), 0, -0.115, 0));
    hat.add(mesh(new THREE.CylinderGeometry(0.141, 0.141, 0.012, 20), mat(0x6e747c, { roughness: 0.6, metalness: 0.8 }), 0, 0.125, 0));
    // dents, because it has been through a lot
    for (const [a, dy] of [[0.6, 0.02], [2.4, -0.05], [4.3, 0.04]]) {
      const dent = mesh(new THREE.SphereGeometry(0.045, 8, 6), metal, Math.cos(a) * 0.155, dy, Math.sin(a) * 0.155);
      dent.scale.set(0.6, 1, 0.6);
      hat.add(dent);
    }
    g.add(hat);
  } else if (type === 'football') {
    hat = new THREE.Group();
    const helm = mesh(new THREE.SphereGeometry(0.215, 20, 16), mat(0xc9502c, { roughness: 0.22, metalness: 0.1 }), 0, 0.02, 0);
    helm.scale.set(1.02, 0.96, 1);
    hat.add(helm);
    // ear holes and a white centre stripe
    hat.add(mesh(new THREE.BoxGeometry(0.26, 0.06, 0.02), mat(0xf0f0f0, { roughness: 0.3 }), 0.02, 0.2, 0));
    for (const s of [-1, 1]) {
      const hole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), mat(0x2a1410, { roughness: 0.9 }), 0.02, -0.02, 0.205 * s);
      hole.rotation.x = Math.PI / 2;
      hat.add(hole);
    }
    // Facemask must sit clear of the helmet sphere or it is swallowed by it.
    const bar = mat(0xdcdcdc, { roughness: 0.3, metalness: 0.6 });
    for (const yy of [-0.07, -0.14]) {
      const m2 = mesh(new THREE.TorusGeometry(0.105, 0.014, 8, 16, Math.PI), bar, -0.15, yy, 0);
      m2.rotation.y = Math.PI / 2;
      m2.rotation.z = -Math.PI / 2;
      hat.add(m2);
    }
    hat.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), bar, -0.21, -0.105, 0));
    hat.position.set(0, 1.14, 0);
    g.add(hat);
    for (const s of [-1, 1]) {
      const pad = mesh(new THREE.SphereGeometry(0.135, 12, 10), mat(0xc9502c, { roughness: 0.35 }), -0.01, 0.93, 0.185 * s);
      pad.scale.set(0.85, 0.7, 1);
      g.add(pad);
    }
  } else if (type === 'polevault') {
    pole = mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.5, 10), textured(woodSurface(3, [214, 193, 156]), 1, { roughness: 0.7 }), -0.45, 0.85, 0);
    pole.rotation.z = Math.PI / 2 - 0.15;
    g.add(pole);
    // sweatband
    g.add(mesh(new THREE.TorusGeometry(0.175, 0.024, 8, 18), mat(0xe8e4d8, { roughness: 0.85 }), 0, 1.22, 0).rotateX(Math.PI / 2));
  } else if (type === 'newspaper') {
    paper = new THREE.Group();
    paper.position.set(-0.46, 0.72, 0);
    paper.add(mesh(new THREE.BoxGeometry(0.02, 0.38, 0.46), mat(0xdedac9, { roughness: 0.95 }), 0, 0, 0));
    const ink = mat(0x6e6e68, { roughness: 0.95 });
    for (const yy of [0.13, 0.05, -0.03, -0.11]) {
      paper.add(mesh(new THREE.BoxGeometry(0.006, 0.018, 0.34), ink, -0.013, yy, 0));
    }
    paper.add(mesh(new THREE.BoxGeometry(0.006, 0.05, 0.28), mat(0x33332e, { roughness: 0.95 }), -0.013, 0.155, 0));
    g.add(paper);
  } else if (type === 'screendoor') {
    shield = new THREE.Group();
    const frameM = mat(0x8e9298, { roughness: 0.45, metalness: 0.6 });
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.98, 0.07), frameM, 0, 0, -0.31));
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.98, 0.07), frameM, 0, 0, 0.31));
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.64), frameM, 0, 0.48, 0));
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.64), frameM, 0, -0.48, 0));
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.64), frameM, 0, 0, 0));
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.9, 0.6),
      mat(0xb8c8d0, { transparent: true, opacity: 0.26, roughness: 0.35, metalness: 0.3 })
    );
    panel.castShadow = false;
    shield.add(panel);
    shield.position.set(-0.46, 0.68, 0);
    g.add(shield);
  } else if (type === 'flag') {
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 10), textured(woodSurface(3, [154, 116, 82]), 1, { roughness: 0.8 }), -0.32, 1.0, 0));
    flagCloth = new THREE.Group();
    flagCloth.position.set(-0.32, 1.44, 0.02);
    const cloth = mesh(new THREE.BoxGeometry(0.012, 0.26, 0.42), textured(clothSurface(2, [190, 54, 42]), 1, { roughness: 0.95, side: THREE.DoubleSide }), 0, 0, 0.21);
    flagCloth.add(cloth);
    const zh = mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0x9aae82, { roughness: 0.9 }), 0.012, 0.02, 0.2);
    flagCloth.add(zh);
    g.add(flagCloth);
  } else if (type === 'brute') {
    club = mesh(new THREE.BoxGeometry(1.05, 0.18, 0.18), textured(woodSurface(3, [126, 90, 52]), 1, { roughness: 0.92, normalScale: 1.4 }), -0.55, 0.95, 0.16);
    club.rotation.z = 0.5;
    g.add(club);
    for (const s of [-1, 1]) {
      const pad = mesh(new THREE.SphereGeometry(0.15, 12, 10), suit, 0.02, 0.96, 0.22 * s);
      pad.scale.set(0.9, 0.75, 1);
      g.add(pad);
    }
    g.scale.setScalar(2.15);
  } else if (type === 'imp') {
    g.scale.setScalar(0.62);
  }

  g.userData.limbs = { legL, legR, armL, armR, head, body };
  g.userData.hat = hat;
  g.userData.pole = pole;
  g.userData.paper = paper;
  g.userData.shield = shield;
  g.userData.club = club;
  g.userData.flagCloth = flagCloth;
  g.userData.eyes = eyes;
  return g;
}

export function buildProjectile(color) {
  const m = mesh(new THREE.SphereGeometry(0.11, 16, 12), mat(color, { roughness: 0.3 }));
  return m;
}

export function buildMelon() {
  const m = mesh(new THREE.SphereGeometry(0.17, 18, 14), mat(0x3e9a2e, { roughness: 0.4 }));
  m.scale.set(1.3, 1, 1);
  const stripeM = mat(0x2a6a1c, { roughness: 0.4 });
  for (const o of [-0.06, 0.06]) {
    const st = mesh(new THREE.TorusGeometry(0.16, 0.016, 8, 16), stripeM, o, 0, 0);
    st.rotation.y = Math.PI / 2;
    m.add(st);
  }
  return m;
}

export function buildSun() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 20, 16),
    mat(0xffdd55, { emissive: 0xffc21e, emissiveIntensity: 2.4, roughness: 0.4 })
  );
  g.add(core);
  const spikeMat = mat(0xffeb8a, { emissive: 0xffc21e, emissiveIntensity: 1.8, roughness: 0.5 });
  const spikeGeo = new THREE.ConeGeometry(0.06, 0.19, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = mesh(spikeGeo, spikeMat, Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0);
    s.rotation.z = a - Math.PI / 2;
    s.castShadow = false;
    g.add(s);
  }
  core.castShadow = false;
  const light = new THREE.PointLight(0xffd257, 1.1, 2.6, 2);
  g.add(light);
  return g;
}

export function buildMower() {
  const g = new THREE.Group();
  const paint = mat(0xb03a2c, { roughness: 0.32, metalness: 0.25 });
  const steel = mat(0x9a9ea6, { roughness: 0.3, metalness: 0.85 });
  const body = mesh(new THREE.BoxGeometry(0.5, 0.22, 0.34), paint, 0, 0.26, 0);
  g.add(body);
  g.add(mesh(new THREE.BoxGeometry(0.52, 0.05, 0.36), paint, 0, 0.37, 0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.14, 0.26), steel, -0.18, 0.44, 0));
  const handle = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), mat(0x4a4a52, { roughness: 0.4, metalness: 0.7 }), -0.32, 0.5, 0);
  handle.rotation.z = 0.7;
  g.add(handle);
  // The cutting reel spins on its own pivot so the chassis can stay upright —
  // rotating the whole mower just drives it nose-first into the lawn.
  const reel = new THREE.Group();
  reel.position.set(0.28, 0.11, 0);
  reel.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 12), steel, 0, 0, 0).rotateX(Math.PI / 2));
  const bladeMat = mat(0xc8ccd4, { roughness: 0.22, metalness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.015, 0.19, 0.34), bladeMat, 0, 0, 0);
    fin.rotation.x = (i / 5) * Math.PI;
    reel.add(fin);
  }
  g.add(reel);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 14);
  const wheelMat = mat(0x1e1e24, { roughness: 0.85 });
  const hubMat = mat(0xb0b4bc, { roughness: 0.35, metalness: 0.8 });
  for (const s of [-1, 1]) {
    const w = mesh(wheelGeo, wheelMat, -0.12, 0.09, 0.18 * s);
    w.rotation.x = Math.PI / 2;
    w.add(mesh(new THREE.BoxGeometry(0.13, 0.07, 0.02), hubMat, 0, 0, 0));
    g.add(w);
    wheels.push(w);
  }
  g.userData.reel = reel;
  g.userData.wheels = wheels;
  g.userData.body = body;
  return g;
}

// ------------------------------------------------------------------ scenery

// Pushes vertices along their normals by a noise-ish amount so a sphere reads as a
// clump of leaves instead of a ball. Cheap stand-in for real foliage geometry.
function roughen(geo, amount, seed) {
  const pos = geo.attributes.position;
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const v = new THREE.Vector3();
  // Deterministic per-vertex offset keyed on the rounded position, so shared
  // vertices on the seam move together and the surface stays closed.
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) {
      k = 1 + (rnd() - 0.5) * amount * 2;
      seen.set(key, k);
    }
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function bladeGeometry() {
  const seg = 4;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const half = 0.012 * (1 - t * 0.85) + 0.001;
    const bend = t * t * 0.32;
    pos.push(-half, t, bend, half, t, bend);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Instanced ground cover. These only soften the silhouette — the texture does the
// heavy lifting, so blades stay short. Oversized blades read as bright green shards
// lying on the lawn rather than as grass.
function scatterGrass(scene, count, area, mul, seed, height) {
  const geo = bladeGeometry();
  const m = mat(scaleColor(0x4f7f33, mul), { roughness: 0.92, side: THREE.DoubleSide });
  const inst = new THREE.InstancedMesh(geo, m, count);
  inst.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const x = area.x0 + rnd() * (area.x1 - area.x0);
    const z = area.z0 + rnd() * (area.z1 - area.z0);
    if (area.exclude && area.exclude(x, z)) {
      dummy.position.set(0, -50, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      continue;
    }
    dummy.position.set(x, area.y ?? -0.2, z);
    dummy.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
    const h = height * (0.6 + rnd() * 0.8);
    dummy.scale.set(0.8 + rnd() * 0.6, h, 1);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    // Blades are thin and self-shadowing, so keep them at or below the ground
    // tone — brighter than the turf and they read as scattered straw.
    const v = 0.4 + rnd() * 0.4;
    color.setRGB(v * 0.95, v, v * 0.7);
    inst.setColorAt(i, color);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  scene.add(inst);
  return inst;
}

// Fallen leaves lying flat on the grass, matching the litter in the reference art.
function scatterLitter(scene, count, area, mul, seed) {
  const alpha = leafAlpha();
  const geo = new THREE.PlaneGeometry(0.1, 0.145);
  // alphaTest keeps the cards in the opaque pass — no depth sorting for 300 leaves.
  const m = mat(scaleColor(0xa9702f, mul), {
    roughness: 0.86, side: THREE.DoubleSide, alphaMap: alpha, alphaTest: alpha ? 0.5 : 0,
  });
  const inst = new THREE.InstancedMesh(geo, m, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Muted and varied — saturated orange at this size reads as plastic confetti.
  const tones = [[0.54, 0.36, 0.18], [0.66, 0.47, 0.22], [0.42, 0.31, 0.17], [0.7, 0.58, 0.31]];
  for (let i = 0; i < count; i++) {
    const x = area.x0 + rnd() * (area.x1 - area.x0);
    const z = area.z0 + rnd() * (area.z1 - area.z0);
    dummy.position.set(x, (area.y ?? -0.19) + rnd() * 0.01, z);
    dummy.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.3, 0, rnd() * Math.PI * 2);
    dummy.scale.setScalar(0.7 + rnd() * 0.7);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    const t = tones[(rnd() * tones.length) | 0];
    color.setRGB(t[0] * mul, t[1] * mul, t[2] * mul);
    inst.setColorAt(i, color);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  scene.add(inst);
  return inst;
}

// Ivy climbing the brickwork — instanced leaf cards pinned to the wall face.
function buildIvy(parent, faceX, zFrom, zTo, yTop, mul, seed) {
  const alpha = leafAlpha();
  const geo = new THREE.PlaneGeometry(0.085, 0.105);
  const m = mat(scaleColor(0x33642a, mul), {
    roughness: 0.62, side: THREE.DoubleSide, alphaMap: alpha, alphaTest: alpha ? 0.5 : 0,
  });
  const count = 2200;
  const inst = new THREE.InstancedMesh(geo, m, count);
  inst.castShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const t = rnd();
    const z = zFrom + rnd() * (zTo - zFrom);
    // denser low and toward the back of the wall, thinning as it climbs
    const climb = Math.pow(rnd(), 1.5);
    const y = 0.05 + climb * yTop;
    const density = 1 - climb * 0.55;
    if (rnd() > density) {
      dummy.position.set(0, -50, 0);
      dummy.scale.setScalar(0.001);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      continue;
    }
    dummy.position.set(faceX + 0.02 + rnd() * 0.04, y, z);
    dummy.rotation.set((rnd() - 0.5) * 0.9, Math.PI / 2 + (rnd() - 0.5) * 0.7, rnd() * Math.PI * 2);
    dummy.scale.setScalar(0.6 + rnd() * 0.8);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    // Wide tonal spread: flat, evenly lit leaves read as paper cut-outs.
    const v = 0.45 + rnd() * 0.75;
    color.setRGB(v * 0.66, v, v * 0.42);
    inst.setColorAt(i, color);
    void t;
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  parent.add(inst);
  return inst;
}

function tuft(x, z, mul) {
  const g = new THREE.Group();
  const m = leafMat(0x5aa838, mul);
  for (let i = 0; i < 4; i++) {
    const c = mesh(new THREE.ConeGeometry(0.03, 0.2 + (i % 2) * 0.08, 5), m, (i - 1.5) * 0.045, 0.1, ((i * 7) % 3 - 1) * 0.04);
    c.rotation.z = (i - 1.5) * 0.22;
    g.add(c);
  }
  g.position.set(x, 0, z);
  return g;
}

function daisy(x, z, petalColor, mul) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.2, 6), mat(scaleColor(0x4a8a2a, mul), { roughness: 0.8 }), 0, 0.1, 0));
  g.add(mesh(new THREE.SphereGeometry(0.032, 10, 8), mat(scaleColor(0xe8a818, mul), { roughness: 0.7 }), 0, 0.2, 0));
  const pm = leafMat(petalColor, mul);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const p = mesh(new THREE.SphereGeometry(0.028, 8, 6), pm, Math.cos(a) * 0.055, 0.2, Math.sin(a) * 0.055);
    p.scale.y = 0.4;
    g.add(p);
  }
  g.position.set(x, 0, z);
  return g;
}

function tree(x, z, mul, seed) {
  const g = new THREE.Group();
  const trunkM = textured(barkSurface(2), mul, { roughness: 0.97, normalScale: 1.6 });
  const leafM = textured(foliageSurface(1, [86, 140, 58]), mul, { roughness: 0.78, normalScale: 1.4, tint: 0xa8b49c });
  const trunk = mesh(new THREE.CylinderGeometry(0.14, 0.24, 1.5, 12), trunkM, 0, 0.75, 0);
  trunk.receiveShadow = true;
  g.add(trunk);
  // a couple of limbs so the canopy is not a floating ball
  for (const [a, ly] of [[0.7, 1.25], [-2.1, 1.4]]) {
    const b = mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.7, 8), trunkM, Math.cos(a) * 0.22, ly, Math.sin(a) * 0.22);
    b.rotation.z = -Math.cos(a) * 0.7;
    b.rotation.x = Math.sin(a) * 0.7;
    g.add(b);
  }
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blobs = [[0, 1.95, 0, 0.72], [0.48, 1.62, 0.26, 0.5], [-0.42, 1.7, -0.2, 0.46], [0.2, 2.2, -0.32, 0.42], [-0.25, 2.05, 0.36, 0.4]];
  for (const [bx, by, bz, br] of blobs) {
    const b = mesh(roughen(new THREE.SphereGeometry(br, 16, 14), 0.22, seed + br * 1000), leafM, bx, by, bz);
    b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    b.scale.set(1, 0.85 + rnd() * 0.25, 1);
    b.receiveShadow = true;
    g.add(b);
  }
  g.position.set(x, 0, z);
  return g;
}

/**
 * Builds the yard around the board: house with a working front door (the breach
 * cinematic swings it), fence, graveyard, trees and ground cover.
 * Returns the animatable references the game needs.
 */
export function buildScenery(scene, boardLeftX, boardRightX, boardDepth, theme) {
  const mul = theme.tileMul;
  const refs = { windows: [], door: null, doorway: null, porchLight: null, interiorLight: null };

  const groundM = textured(grassSurface(26), mul, { roughness: 0.96, normalScale: 1.3 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), groundM);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Distant hills sit low on the horizon — raised any higher they dominate the
  // skyline behind the fence instead of just filling it.
  for (const [hx, hz, hs] of [[-16, -22, 7], [4, -26, 9], [19, -21, 6]]) {
    const hill = mesh(new THREE.SphereGeometry(hs, 20, 14), textured(grassSurface(12), mul * 0.85, { roughness: 0.98 }), hx, -hs * 0.78, hz);
    hill.receiveShadow = true;
    hill.castShadow = false;
    scene.add(hill);
  }

  // ---- house
  const house = new THREE.Group();
  const wallDepth = boardDepth + 3.4;
  const brickM = textured(brickSurface([3.2, 2.4]), mul, { roughness: 0.95, normalScale: 1.5 });
  // The wall is built in three pieces around a genuine door-shaped hole. A solid box
  // would leave the breach cinematic with nowhere to walk except through brick.
  const DOOR_W = 1.06;
  const DOOR_H = 2.02;
  const sideDepth = (wallDepth - DOOR_W) / 2;
  for (const s of [-1, 1]) {
    const seg = mesh(new THREE.BoxGeometry(2.6, 3.4, sideDepth), brickM, 0, 1.7, s * (DOOR_W / 2 + sideDepth / 2));
    seg.receiveShadow = true;
    house.add(seg);
  }
  const lintel = mesh(new THREE.BoxGeometry(2.6, 3.4 - DOOR_H, DOOR_W), brickM, 0, DOOR_H + (3.4 - DOOR_H) / 2, 0);
  lintel.receiveShadow = true;
  house.add(lintel);

  // Unlit hallway behind the opening — what you actually see through the doorway.
  // It must stay inside the door's footprint in z, or it swallows the wall segments
  // either side and you end up looking at the back of the brickwork.
  const roomM = mat(0x0a0b0e, { roughness: 1, side: THREE.BackSide, metalness: 0 });
  const room = new THREE.Mesh(new THREE.BoxGeometry(2.5, DOOR_H - 0.04, DOOR_W - 0.06), roomM);
  room.position.set(-0.05, (DOOR_H - 0.04) / 2, 0);
  house.add(room);
  const roomFloor = mesh(new THREE.BoxGeometry(2.45, 0.05, DOOR_W - 0.08), mat(0x140f0c, { roughness: 0.9 }), -0.05, 0.02, 0);
  roomFloor.castShadow = false;
  house.add(roomFloor);

  // gable roof with an overhang, seen edge-on from the play camera
  const shingleM = textured(shingleSurface([2, 6]), mul, { roughness: 0.92, normalScale: 1.3 });
  for (const s of [-1, 1]) {
    const slope = mesh(new THREE.BoxGeometry(2.1, 0.14, wallDepth + 0.7), shingleM, s * 0.78, 4.02, 0);
    slope.rotation.z = s * 0.62;
    slope.receiveShadow = true;
    house.add(slope);
  }
  const fascia = textured(woodSurface(4, [226, 218, 200]), mul, { roughness: 0.8 });
  house.add(mesh(new THREE.BoxGeometry(0.16, 0.2, wallDepth + 0.8), fascia, 1.62, 3.42, 0));
  house.add(mesh(new THREE.BoxGeometry(2.9, 0.16, 0.16), fascia, 0, 4.28, wallDepth / 2 + 0.35));

  // ---- front door, centred on the middle lane so a breach reads as "they got in"
  const doorway = new THREE.Group();
  doorway.position.set(1.3, 0, 0);
  const jamb = textured(woodSurface(3, [232, 224, 208]), mul, { roughness: 0.7 });
  doorway.add(mesh(new THREE.BoxGeometry(0.16, DOOR_H + 0.1, 0.1), jamb, 0.02, (DOOR_H + 0.1) / 2, -0.53));
  doorway.add(mesh(new THREE.BoxGeometry(0.16, DOOR_H + 0.1, 0.1), jamb, 0.02, (DOOR_H + 0.1) / 2, 0.53));
  doorway.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 1.16), jamb, 0.02, DOOR_H + 0.06, 0));
  const doorPivot = new THREE.Group();
  doorPivot.position.set(0, 0, -0.48);
  const doorM = textured(woodSurface(2, [150, 104, 62]), mul, { roughness: 0.62, normalScale: 1.1 });
  const doorPanel = mesh(new THREE.BoxGeometry(0.09, 1.94, 0.94), doorM, 0, 0.98, 0.47);
  doorPivot.add(doorPanel);
  const inset = mat(scaleColor(0x67421f, mul), { roughness: 0.65 });
  for (const py of [1.42, 0.62]) {
    doorPivot.add(mesh(new THREE.BoxGeometry(0.03, 0.6, 0.62), inset, 0.055, py, 0.47));
  }
  doorPivot.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), mat(0xc9a227, { roughness: 0.25, metalness: 0.9 }), 0.08, 0.98, 0.83));
  doorway.add(doorPivot);
  refs.door = doorPivot;
  refs.doorway = doorway;
  house.add(doorway);

  // porch step and light
  const stoneM = textured(stoneSurface(1), mul, { roughness: 0.95 });
  const step = mesh(new THREE.BoxGeometry(0.5, 0.12, 1.5), stoneM, 1.6, 0.02, 0);
  step.receiveShadow = true;
  house.add(step);
  const lampGlow = mul < 0.9 ? 0xffd08a : 0x3a2a18;
  const lamp = mesh(new THREE.SphereGeometry(0.075, 12, 10), mat(0xfff0c8, { emissive: lampGlow, emissiveIntensity: mul < 0.9 ? 3 : 0.2, roughness: 0.3 }), 1.36, 2.3, 0.72);
  house.add(lamp);
  refs.porchLight = lamp;
  if (mul < 0.9) {
    const pl = new THREE.PointLight(0xffc078, 2.4, 5, 2);
    pl.position.set(1.5, 2.28, 0.72);
    house.add(pl);
    refs.porchLampLight = pl;
  }

  // Windows: a polished, slightly metallic surface reflecting the environment map
  // reads as glass here and costs nothing — real transmission would force an extra
  // full scene pass every frame.
  const glass = mat(0x9fc4d4, {
    roughness: 0.05, metalness: 0.55, transparent: true, opacity: 0.72,
    emissive: mul < 0.9 ? 0x6a5216 : 0x16242e, emissiveIntensity: 1,
  });
  for (const wz of [-2.0, 2.2]) {
    const w = mesh(new THREE.BoxGeometry(0.1, 0.86, 0.86), glass, 1.3, 2.05, wz);
    w.castShadow = false;
    house.add(w);
    refs.windows.push(w);
    const frame = textured(woodSurface(3, [238, 230, 214]), mul, { roughness: 0.72 });
    house.add(mesh(new THREE.BoxGeometry(0.14, 1.0, 0.1), frame, 1.31, 2.05, wz - 0.46));
    house.add(mesh(new THREE.BoxGeometry(0.14, 1.0, 0.1), frame, 1.31, 2.05, wz + 0.46));
    house.add(mesh(new THREE.BoxGeometry(0.14, 0.1, 1.02), frame, 1.31, 2.53, wz));
    house.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 1.06), frame, 1.33, 1.55, wz));
    house.add(mesh(new THREE.BoxGeometry(0.13, 0.9, 0.05), frame, 1.33, 2.05, wz));
    house.add(mesh(new THREE.BoxGeometry(0.13, 0.05, 0.9), frame, 1.33, 2.05, wz));
  }

  buildIvy(house, 1.3, -wallDepth / 2 + 0.3, -0.9, 3.1, mul, 4242);
  buildIvy(house, 1.3, 1.1, wallDepth / 2 - 0.4, 2.6, mul, 9182);

  house.position.x = boardLeftX - 2.9;
  scene.add(house);
  refs.house = house;
  refs.doorWorldX = house.position.x + 1.3;

  // A dim red bulb just inside the doorway, lit only during the breach. Point lights
  // ignore occluders, so its range is kept short — otherwise it floods the whole
  // facade through the brick instead of spilling out of the door.
  const interiorLight = new THREE.PointLight(0xff2a12, 0, 2.1, 2);
  interiorLight.position.set(house.position.x + 0.95, 1.0, 0);
  scene.add(interiorLight);
  refs.interiorLight = interiorLight;

  // ---- graveyard
  const graveStoneM = textured(stoneSurface(1), mul, { roughness: 0.96, normalScale: 1.5 });
  const dirtM = textured(dirtSurface(1), mul, { roughness: 0.99 });
  for (let i = 0; i < 6; i++) {
    const gx = boardRightX + 1.5 + (i % 2) * 0.85;
    const gz = -boardDepth / 2 - 0.4 + i * ((boardDepth + 1.4) / 5);
    const lean = (i - 2.5) * 0.09;
    const grave = new THREE.Group();
    const h = 0.62 + (i % 3) * 0.16;
    const slab = mesh(new THREE.BoxGeometry(0.46, h, 0.16), graveStoneM, 0, h / 2, 0);
    slab.receiveShadow = true;
    grave.add(slab);
    const cap = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.16, 16, 1, false, 0, Math.PI), graveStoneM, 0, h, 0);
    cap.rotation.x = Math.PI / 2;
    cap.rotation.z = Math.PI;
    cap.receiveShadow = true;
    grave.add(cap);
    // Engraving reads as a shadowed recess cut into the face, not a pale plaque.
    const carve = mesh(new THREE.BoxGeometry(0.3, h * 0.5, 0.02), mat(scaleColor(0x4e4c4a, mul), { roughness: 1 }), 0, h * 0.55, 0.072);
    carve.castShadow = false;
    grave.add(carve);
    const lineM = mat(scaleColor(0x6e6c68, mul), { roughness: 1 });
    for (let k = 0; k < 3; k++) {
      const ln = mesh(new THREE.BoxGeometry(0.18 - k * 0.03, 0.022, 0.012), lineM, -0.01, h * 0.55 + 0.09 - k * 0.075, 0.079);
      ln.castShadow = false;
      grave.add(ln);
    }
    grave.position.set(gx, 0, gz);
    grave.rotation.y = (i - 2.5) * 0.22;
    grave.rotation.z = lean;
    scene.add(grave);

    const mound = mesh(new THREE.SphereGeometry(0.44, 14, 10), dirtM, gx - 0.05, -0.2, gz + 0.12);
    mound.scale.set(1.5, 0.4, 1.1);
    mound.receiveShadow = true;
    scene.add(mound);
  }

  // ---- back fence
  const fenceM = textured(woodSurface(1, [168, 138, 92]), mul, { roughness: 0.94, normalScale: 1.3 });
  const railM = textured(woodSurface(3, [150, 122, 84]), mul, { roughness: 0.94 });
  const fenceZ = -boardDepth / 2 - 1.35;
  const span = boardRightX - boardLeftX + 3.6;
  for (let i = 0; i < 16; i++) {
    const fx = boardLeftX - 1.6 + i * (span / 15);
    const p = mesh(new THREE.BoxGeometry(0.13, 0.95 + (i % 3) * 0.04, 0.13), fenceM, fx, 0.47, fenceZ);
    p.rotation.z = ((i * 13) % 5 - 2) * 0.012;
    p.receiveShadow = true;
    scene.add(p);
    // pointed cap
    const capTop = mesh(new THREE.ConeGeometry(0.1, 0.12, 4), fenceM, fx, 1.0, fenceZ);
    capTop.rotation.y = Math.PI / 4;
    scene.add(capTop);
  }
  for (const [ry, rz] of [[0.72, fenceZ + 0.09], [0.34, fenceZ + 0.09]]) {
    const rail = mesh(new THREE.BoxGeometry(span, 0.11, 0.06), railM, (boardLeftX + boardRightX) / 2, ry, rz);
    rail.receiveShadow = true;
    scene.add(rail);
  }

  // ---- shrubbery
  const bushM = textured(foliageSurface(1, [70, 122, 46]), mul, { roughness: 0.85, normalScale: 1.6, tint: 0x9aa88e });
  for (let i = 0; i < 9; i++) {
    const bx = boardLeftX - 1.2 + i * ((boardRightX - boardLeftX + 2.6) / 8);
    const bush = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const r = 0.3 + ((i + j) % 3) * 0.09;
      const b = mesh(roughen(new THREE.SphereGeometry(r, 16, 12), 0.26, 700 + i * 31 + j), bushM, (j - 1) * 0.22, 0.1 + (j % 2) * 0.06, ((j * 5) % 3 - 1) * 0.12);
      b.scale.y = 0.8;
      b.receiveShadow = true;
      bush.add(b);
    }
    bush.position.set(bx, 0, fenceZ + 0.55);
    scene.add(bush);
  }

  const rand = [0.13, 0.71, 0.42, 0.89, 0.27, 0.58, 0.95, 0.05, 0.33, 0.77, 0.51, 0.19, 0.63, 0.85];
  for (let i = 0; i < 14; i++) {
    const fx = boardLeftX + rand[i] * (boardRightX - boardLeftX);
    const fz = boardDepth / 2 + 0.75 + rand[(i + 3) % 14] * 1.9;
    scene.add(tuft(fx, fz, mul));
    if (i % 3 === 0) scene.add(daisy(fx + 0.3, fz + 0.2, i % 2 ? 0xf0f0f0 : 0xe86a9a, mul));
  }

  scene.add(tree(boardRightX + 3.6, -boardDepth / 2 - 2.4, mul, 7331));
  scene.add(tree(boardLeftX + 1.4, -boardDepth / 2 - 3.6, mul, 991));
  scene.add(tree(boardRightX + 5.2, boardDepth / 2 + 1.8, mul, 5150));

  // ---- ground cover
  const insideBoard = (x, z) =>
    x > boardLeftX - 0.7 && x < boardRightX + 0.7 && z > -boardDepth / 2 - 0.1 && z < boardDepth / 2 + 0.1;
  // Only the rough grass outside the board gets blades. The lawn itself is mown —
  // sprigs poking through the play grid just read as litter at this camera distance.
  scatterGrass(scene, 11000, {
    x0: boardLeftX - 8, x1: boardRightX + 9, z0: -boardDepth / 2 - 7, z1: boardDepth / 2 + 6,
    y: -0.205, exclude: insideBoard,
  }, mul, 2468, 0.07);
  scatterLitter(scene, 200, {
    x0: boardLeftX - 7, x1: boardRightX + 8, z0: -boardDepth / 2 - 5, z1: boardDepth / 2 + 5, y: -0.19,
  }, mul, 8642);
  scatterLitter(scene, 45, {
    x0: boardLeftX, x1: boardRightX, z0: -boardDepth / 2, z1: boardDepth / 2, y: 0.005,
  }, mul, 1122);

  if (mul < 0.9) {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 20), new THREE.MeshBasicMaterial({ color: 0xf4f4e2 }));
    moon.position.set(8, 10, -14);
    scene.add(moon);
    const crater = new THREE.MeshBasicMaterial({ color: 0xd4d4bc });
    for (const [cx, cy, cr] of [[-0.3, 0.3, 0.18], [0.25, -0.1, 0.13], [-0.05, -0.35, 0.1]]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(cr, 10, 8), crater);
      c.position.set(8 + cx, 10 + cy, -13.2);
      scene.add(c);
    }
  }

  return refs;
}
