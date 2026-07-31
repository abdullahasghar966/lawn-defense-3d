import * as THREE from 'three';

let gradientMap = null;
function toonGradient() {
  if (!gradientMap) {
    const data = new Uint8Array([110, 170, 225, 255]);
    gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

const toon = (color, opts = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function scaleColor(hex, mul) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(mul);
  return c.getHex();
}

function addEyes(parent, x, y, zSpread, size = 1, pupilForward = 0.035) {
  const white = toon(0xffffff);
  const black = toon(0x1d1d22);
  for (const s of [-1, 1]) {
    parent.add(mesh(new THREE.SphereGeometry(0.055 * size, 10, 8), white, x, y, zSpread * s));
    parent.add(mesh(new THREE.SphereGeometry(0.027 * size, 8, 6), black, x + pupilForward * size, y, zSpread * s));
  }
}

function smile(parent, x, y, z, r = 0.07, flip = false) {
  const arc = mesh(new THREE.TorusGeometry(r, 0.014, 6, 12, Math.PI), toon(0x3a2415), x, y, z);
  arc.rotation.y = Math.PI / 2;
  arc.rotation.x = flip ? 0 : Math.PI;
  parent.add(arc);
  return arc;
}

export function buildTile(row, col, tileMul = 1, isMowerLane = false) {
  const even = (row + col) % 2 === 0;
  let top;
  if (isMowerLane) top = row % 2 === 0 ? 0x9a7a58 : 0x8a6c4c;
  else top = even ? 0x7bc24e : 0x94d465;
  const topC = scaleColor(top, tileMul);
  const sideC = scaleColor(top, tileMul * 0.72);
  const side = toon(sideC);
  const mats = [side, side, toon(topC), side, side, side];
  const tile = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.2, 1.14), mats);
  tile.position.y = -0.1;
  tile.receiveShadow = true;
  return tile;
}

function stemAndLeaves(g, stemH = 0.4) {
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, stemH, 10), toon(0x3d8a1e), 0, stemH / 2, 0));
  for (const s of [-1, 1]) {
    const leaf = mesh(new THREE.ConeGeometry(0.1, 0.34, 8), toon(0x55b32c), 0.13 * s, 0.08, 0.13 * s);
    leaf.rotation.z = -0.95 * s;
    leaf.rotation.x = 0.4 * s;
    leaf.scale.z = 0.5;
    g.add(leaf);
  }
}

function shooterHead(color, dark) {
  const head = new THREE.Group();
  head.add(mesh(new THREE.SphereGeometry(0.32, 20, 16), toon(color), 0, 0, 0));
  const barrel = mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.36, 14), toon(color), 0.34, 0.02, 0);
  barrel.rotation.z = -Math.PI / 2;
  head.add(barrel);
  const lip = mesh(new THREE.TorusGeometry(0.13, 0.04, 8, 16), toon(dark), 0.52, 0.02, 0);
  lip.rotation.y = Math.PI / 2;
  head.add(lip);
  head.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 12), toon(0x14240a), 0.53, 0.02, 0).rotateZ(-Math.PI / 2));
  addEyes(head, 0.16, 0.16, 0.12, 1.1);
  const sprout = mesh(new THREE.ConeGeometry(0.05, 0.2, 7), toon(dark), -0.05, 0.36, 0);
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
  const iceMat = toon(0xe0f6ff, { emissive: 0x22485c });
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
  const barrel2 = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.28, 12), toon(0x3e9c22), 0.12, 0.2, 0);
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
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 10), toon(0x3d8a1e), 0, 0.25, 0));
  for (const s of [-1, 1]) {
    const leaf = mesh(new THREE.ConeGeometry(0.11, 0.36, 8), toon(0x55b32c), 0.15 * s, 0.1, 0);
    leaf.rotation.z = -1.1 * s;
    leaf.scale.z = 0.5;
    g.add(leaf);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0.08);
  const face = mesh(new THREE.SphereGeometry(0.19, 16, 14), toon(0xc89a4e), 0, 0, 0.05);
  face.scale.z = 0.75;
  head.add(face);
  const petalGeo = new THREE.ConeGeometry(0.09, 0.24, 8);
  const petalMat = toon(0xffce20);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = mesh(petalGeo, petalMat, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
    p.scale.set(1, 1, 0.35);
    p.rotation.z = a + Math.PI / 2;
    head.add(p);
  }
  const white = toon(0xffffff);
  const black = toon(0x1d1d22);
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), white, 0.07 * s, 0.05, 0.17));
    head.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), black, 0.07 * s, 0.05, 0.2));
  }
  const grin = mesh(new THREE.TorusGeometry(0.06, 0.013, 6, 12, Math.PI), toon(0x3a2415), 0, -0.03, 0.18);
  grin.rotation.z = Math.PI;
  head.add(grin);
  head.rotation.x = 0.35;
  g.add(head);
  g.userData.head = head;
  return g;
}

export function buildWallnut() {
  const g = new THREE.Group();
  const nut = mesh(new THREE.SphereGeometry(0.36, 20, 16), toon(0xb07c3e), 0, 0.42, 0);
  nut.scale.set(0.92, 1.22, 0.92);
  g.add(nut);
  const shade = mesh(new THREE.SphereGeometry(0.365, 20, 16), toon(0x8a5c28), 0, 0.34, 0);
  shade.scale.set(0.9, 1.05, 0.9);
  g.add(shade);
  addEyes(g, 0.26, 0.58, 0.15, 1.15, 0.05);
  smile(g, 0.3, 0.4, 0, 0.08);
  g.userData.nut = nut;
  return g;
}

export function buildTallnut() {
  const g = new THREE.Group();
  const nut = mesh(new THREE.SphereGeometry(0.4, 20, 16), toon(0xbc8a44), 0, 0.62, 0);
  nut.scale.set(0.88, 1.65, 0.88);
  g.add(nut);
  addEyes(g, 0.28, 0.95, 0.15, 1.2, 0.06);
  const browM = toon(0x6a4a1a);
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
  const mound = mesh(new THREE.SphereGeometry(0.3, 14, 10), toon(0x7a5c3c), 0, 0.02, 0);
  mound.scale.set(1.1, 0.35, 1.1);
  g.add(mound);
  const potato = new THREE.Group();
  potato.add(mesh(new THREE.SphereGeometry(0.28, 18, 14), toon(0xd4b060), 0, 0.26, 0));
  addEyes(potato, 0.22, 0.32, 0.11, 0.9, 0.04);
  potato.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), toon(0x555555), 0, 0.56, 0));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), toon(0xff3a2a, { emissive: 0x881105 }));
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
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.35, 10), toon(0x3d8a1e), 0, 0.17, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.52, 0);
  const purple = toon(0x9a3aae);
  const darkIn = toon(0x3a0a44);
  const jawLow = new THREE.Group();
  const lowBox = mesh(new THREE.BoxGeometry(0.46, 0.14, 0.36), purple, 0.15, -0.08, 0);
  jawLow.add(lowBox);
  jawLow.add(mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), darkIn, 0.15, -0.02, 0));
  const toothMat = toon(0xf8f2e0);
  for (let i = 0; i < 3; i++) {
    jawLow.add(mesh(new THREE.ConeGeometry(0.035, 0.09, 6), toothMat, 0.3, -0.01, (i - 1) * 0.11));
  }
  head.add(jawLow);
  const jawUp = new THREE.Group();
  const upper = mesh(new THREE.SphereGeometry(0.28, 18, 14), purple, 0.1, 0.12, 0);
  upper.scale.set(1.35, 0.95, 1);
  jawUp.add(upper);
  for (let i = 0; i < 4; i++) {
    const t = mesh(new THREE.ConeGeometry(0.035, 0.11, 6), toothMat, 0.3 + (i % 2) * 0.08, 0.02, (i - 1.5) * 0.09);
    t.rotation.z = Math.PI;
    jawUp.add(t);
  }
  const spotM = toon(0xe06ab8);
  jawUp.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), spotM, -0.04, 0.26, 0.16));
  jawUp.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), spotM, 0.02, 0.3, -0.14));
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
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.24, 10), toon(0xf0e4c8), 0, 0.12, 0));
  const cap = mesh(new THREE.SphereGeometry(0.2, 16, 12), toon(0xa86ec8), 0, 0.28, 0);
  cap.scale.set(1, 0.75, 1);
  g.add(cap);
  const spotM = toon(0xd8b8ec);
  g.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), spotM, 0.08, 0.37, 0.09));
  g.add(mesh(new THREE.SphereGeometry(0.032, 8, 6), spotM, -0.07, 0.38, -0.07));
  g.add(mesh(new THREE.SphereGeometry(0.036, 8, 6), spotM, -0.02, 0.4, 0.11));
  addEyes(g, 0.14, 0.17, 0.08, 0.8, 0.04);
  g.userData.head = cap;
  return g;
}

export function buildCherrybomb() {
  const g = new THREE.Group();
  const red = toon(0xd82a2a);
  for (const s of [-1, 1]) {
    const cherry = mesh(new THREE.SphereGeometry(0.25, 18, 14), red, -0.04 * s, 0.3, 0.17 * s);
    g.add(cherry);
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0xff9a9a), -0.04 * s + 0.1, 0.42, 0.17 * s + 0.08 * s));
    const stem = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), toon(0x3a7a1a), -0.04 * s, 0.56, 0.17 * s);
    stem.rotation.z = 0.3 * s;
    g.add(stem);
    const browM = toon(0x4a0a0a);
    const brow = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.13), browM, 0.18, 0.42, 0.17 * s);
    brow.rotation.x = -0.45 * s;
    g.add(brow);
    g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), toon(0x2a0505), 0.2, 0.34, 0.17 * s));
  }
  return g;
}

export function buildJalapeno() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.17, 0.44, 8, 14), toon(0xe83218), 0, 0.3, 0);
  body.rotation.z = 1.35;
  g.add(body);
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.14, 8), toon(0x3a7a1a), -0.34, 0.44, 0));
  addEyes(g, 0.14, 0.38, 0.1, 0.85, 0.04);
  const browM = toon(0x5a0a05);
  for (const s of [-1, 1]) {
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.028, 0.11), browM, 0.14, 0.47, 0.1 * s);
    brow.rotation.x = -0.55 * s;
    g.add(brow);
  }
  const scowl = smile(g, 0.2, 0.24, 0, 0.05, true);
  scowl.material = toon(0x3a0505);
  return g;
}

export function buildSquash() {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.38, 18, 16), toon(0x74a832), 0, 0.4, 0);
  body.scale.set(0.95, 1.1, 0.9);
  g.add(body);
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 8), toon(0x4a6a1a), 0, 0.87, 0));
  addEyes(g, 0.31, 0.52, 0.13, 1.0, 0.05);
  const browM = toon(0x2a3a10);
  for (const s of [-1, 1]) {
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.035, 0.17), browM, 0.32, 0.66, 0.13 * s);
    brow.rotation.x = -0.55 * s;
    g.add(brow);
  }
  const frown = smile(g, 0.36, 0.3, 0, 0.06, true);
  frown.material = toon(0x1a2a08);
  g.userData.body = body;
  return g;
}

export function buildTorchwood() {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.74, 12), toon(0x8a5c34), 0, 0.37, 0);
  g.add(trunk);
  g.add(mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 14), toon(0x5e3c20), 0, 0.74, 0));
  const barkM = toon(0x6e4626);
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.3, 0.05), barkM, 0.19, 0.3, 0.08));
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.22, 0.05), barkM, 0.18, 0.42, -0.1));
  addEyes(g, 0.2, 0.48, 0.09, 0.9, 0.03);
  smile(g, 0.22, 0.32, 0, 0.06);
  const flameO = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.44, 10), new THREE.MeshToonMaterial({ color: 0xff7a1a, emissive: 0xbb4205, gradientMap: toonGradient() }));
  flameO.position.set(0, 0.98, 0);
  const flameI = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.26, 8), new THREE.MeshToonMaterial({ color: 0xffd84a, emissive: 0xcc9210, gradientMap: toonGradient() }));
  flameI.position.set(0, 0.95, 0);
  g.add(flameO, flameI);
  g.userData.flames = [flameO, flameI];
  return g;
}

export function buildSpikeweed() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 14), toon(0x3e6224), 0, 0.04, 0));
  const spikeM = toon(0xc8c8d2);
  const pts = [[0, 0], [0.22, 0.15], [-0.2, 0.18], [0.12, -0.22], [-0.15, -0.15], [0.3, -0.05], [-0.3, -0.02]];
  for (const [px, pz] of pts) {
    g.add(mesh(new THREE.ConeGeometry(0.055, 0.26, 7), spikeM, px, 0.19, pz));
  }
  addEyes(g, 0.4, 0.1, 0.1, 0.7, 0.03);
  return g;
}

export function buildMelonpult() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.32, 10), toon(0x8a6a3c), 0, 0.16, 0));
  g.add(mesh(new THREE.TorusGeometry(0.19, 0.025, 6, 12), toon(0x6a4a28), 0, 0.28, 0));
  const arm = new THREE.Group();
  arm.position.set(-0.1, 0.32, 0);
  arm.add(mesh(new THREE.BoxGeometry(0.52, 0.07, 0.11), toon(0x9a7444), 0.2, 0, 0));
  const basket = mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.13, 10, 1, true), toon(0x6a4a28), 0.46, 0.07, 0);
  basket.material.side = THREE.DoubleSide;
  arm.add(basket);
  const melon = mesh(new THREE.SphereGeometry(0.16, 14, 12), toon(0x3e9a2e), 0.46, 0.15, 0);
  melon.scale.set(1.3, 1, 1);
  arm.add(melon);
  const stripeM = toon(0x2a6a1c);
  for (const o of [-0.06, 0.06]) {
    const st = mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 12), stripeM, 0.46 + o, 0.15, 0);
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

export function buildZombie(type) {
  const g = new THREE.Group();
  const skinColor = type === 'imp' ? 0xb09a72 : type === 'brute' ? 0x8fa476 : 0xa2b586;
  const suitColor = type === 'football' ? 0x9a3e3e : type === 'polevault' ? 0xb84848 : type === 'brute' ? 0x5e4c3a : 0x4e5568;
  const skin = toon(skinColor);
  const suit = toon(suitColor);
  const pants = toon(0x3e3a48);
  const shoe = toon(0x2c2620);

  const legL = new THREE.Group();
  legL.position.set(-0.02, 0.17, -0.09);
  legL.add(mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), pants, 0, 0, 0));
  legL.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.12), shoe, -0.05, -0.16, 0));
  const legR = new THREE.Group();
  legR.position.set(-0.02, 0.17, 0.09);
  legR.add(mesh(new THREE.BoxGeometry(0.13, 0.34, 0.13), pants, 0, 0, 0));
  legR.add(mesh(new THREE.BoxGeometry(0.2, 0.08, 0.12), shoe, -0.05, -0.16, 0));

  const body = new THREE.Group();
  body.position.set(0, 0.55, 0);
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.44, 0.36), suit, 0, 0, 0));
  if (type !== 'football' && type !== 'brute' && type !== 'imp') {
    body.add(mesh(new THREE.BoxGeometry(0.04, 0.3, 0.13), toon(0xe8e2d0), -0.155, 0.04, 0));
    body.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.06), toon(0x8a2a35), -0.165, 0.02, 0));
  }

  const armL = new THREE.Group();
  armL.position.set(-0.26, 0.66, -0.14);
  armL.add(mesh(new THREE.BoxGeometry(0.38, 0.1, 0.1), suit, 0, 0, 0));
  armL.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), skin, -0.21, 0, 0));
  const armR = new THREE.Group();
  armR.position.set(-0.26, 0.66, 0.14);
  armR.add(mesh(new THREE.BoxGeometry(0.38, 0.1, 0.1), suit, 0, 0, 0));
  armR.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), skin, -0.21, 0, 0));

  const head = new THREE.Group();
  head.position.set(0, 0.92, 0);
  head.add(mesh(new THREE.SphereGeometry(0.19, 16, 14), skin, 0, 0, 0));
  head.add(mesh(new THREE.BoxGeometry(0.12, 0.09, 0.15), skin, -0.11, -0.13, 0));
  head.add(mesh(new THREE.BoxGeometry(0.06, 0.025, 0.1), toon(0xf0ead8), -0.155, -0.1, 0));
  const eyes = [];
  const white = toon(0xf0f2e8);
  const black = toon(0x1d1d22);
  const eyeSizes = [1.25, 0.85];
  [-1, 1].forEach((s, i) => {
    const sz = eyeSizes[i];
    const e = mesh(new THREE.SphereGeometry(0.05 * sz, 10, 8), white, -0.15, 0.04, 0.075 * s);
    eyes.push(e);
    head.add(e);
    head.add(mesh(new THREE.SphereGeometry(0.024 * sz, 8, 6), black, -0.185, 0.04, 0.075 * s));
  });
  const brow = mesh(new THREE.BoxGeometry(0.04, 0.03, 0.11), toon(0x4a5540), -0.16, 0.13, -0.075);
  brow.rotation.x = -0.3;
  head.add(brow);

  g.add(legL, legR, body, armL, armR, head);

  let hat = null, pole = null, paper = null, shield = null, club = null, flagCloth = null;

  if (type === 'conehead') {
    hat = mesh(new THREE.ConeGeometry(0.17, 0.44, 12), toon(0xe8923a), 0, 1.28, 0);
    g.add(hat);
  } else if (type === 'buckethead') {
    hat = new THREE.Group();
    hat.position.set(0, 1.22, 0);
    hat.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 14), toon(0xaaaab4), 0, 0, 0));
    hat.add(mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 14), toon(0x8a8a94), 0, -0.14, 0));
    g.add(hat);
  } else if (type === 'football') {
    hat = new THREE.Group();
    const helm = mesh(new THREE.SphereGeometry(0.24, 16, 14), toon(0xd4542e), 0, 0, 0);
    helm.scale.set(1, 0.94, 1);
    hat.add(helm);
    hat.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.2), toon(0xf0f0f0), 0, 0.16, 0));
    const mask = mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12), toon(0xe8e8e8), -0.19, -0.07, 0);
    mask.rotation.y = Math.PI / 2;
    hat.add(mask);
    hat.position.set(0, 0.97, 0);
    g.add(hat);
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.24, 0.13, 0.18), toon(0xd4542e), 0, 0.76, 0.21 * s));
  } else if (type === 'polevault') {
    pole = mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.5, 8), toon(0xe0cca8), -0.45, 0.7, 0);
    pole.rotation.z = Math.PI / 2 - 0.15;
    g.add(pole);
  } else if (type === 'newspaper') {
    paper = new THREE.Group();
    paper.position.set(-0.42, 0.55, 0);
    paper.add(mesh(new THREE.BoxGeometry(0.03, 0.38, 0.46), toon(0xe4e0d2), 0, 0, 0));
    for (const yy of [0.1, 0.02, -0.06]) {
      paper.add(mesh(new THREE.BoxGeometry(0.012, 0.02, 0.34), toon(0x8a8a84), -0.012, yy, 0));
    }
    g.add(paper);
  } else if (type === 'screendoor') {
    shield = new THREE.Group();
    const frameM = toon(0x9a9aa4);
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.92, 0.07), frameM, 0, 0, -0.31));
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.92, 0.07), frameM, 0, 0, 0.31));
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.64), frameM, 0, 0.45, 0));
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.64), frameM, 0, -0.45, 0));
    shield.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.64), frameM, 0, 0, 0));
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.86, 0.6), new THREE.MeshToonMaterial({ color: 0xb8c8d0, transparent: true, opacity: 0.3, gradientMap: toonGradient() }));
    shield.add(panel);
    shield.position.set(-0.44, 0.5, 0);
    g.add(shield);
  } else if (type === 'flag') {
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), toon(0x9a7452), -0.3, 0.85, 0));
    flagCloth = new THREE.Group();
    flagCloth.position.set(-0.3, 1.28, 0.02);
    flagCloth.add(mesh(new THREE.BoxGeometry(0.02, 0.26, 0.42), toon(0xd83a2a), 0, 0, 0.21));
    const zh = mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0xa2b586), 0.02, 0.02, 0.2);
    flagCloth.add(zh);
    g.add(flagCloth);
  } else if (type === 'brute') {
    club = mesh(new THREE.BoxGeometry(1.05, 0.18, 0.18), toon(0x6e4c2a), -0.55, 0.75, 0.16);
    club.rotation.z = 0.5;
    g.add(club);
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.26, 0.14, 0.2), suit, 0.02, 0.78, 0.22 * s));
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
  const m = mesh(new THREE.SphereGeometry(0.11, 12, 10), toon(color));
  const hl = mesh(new THREE.SphereGeometry(0.035, 8, 6), toon(0xffffff), 0.04, 0.05, 0.04);
  hl.castShadow = false;
  m.add(hl);
  return m;
}

export function buildMelon() {
  const m = mesh(new THREE.SphereGeometry(0.17, 14, 12), toon(0x3e9a2e));
  m.scale.set(1.3, 1, 1);
  const stripeM = toon(0x2a6a1c);
  for (const o of [-0.06, 0.06]) {
    const st = mesh(new THREE.TorusGeometry(0.16, 0.016, 6, 12), stripeM, o, 0, 0);
    st.rotation.y = Math.PI / 2;
    m.add(st);
  }
  return m;
}

export function buildSun() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 14),
    new THREE.MeshToonMaterial({ color: 0xffdd55, emissive: 0xdda818, gradientMap: toonGradient() })
  );
  g.add(core);
  const spikeMat = new THREE.MeshToonMaterial({ color: 0xffeb8a, emissive: 0xbb8c14, gradientMap: toonGradient() });
  const spikeGeo = new THREE.ConeGeometry(0.06, 0.19, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = mesh(spikeGeo, spikeMat, Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0);
    s.rotation.z = a - Math.PI / 2;
    s.castShadow = false;
    g.add(s);
  }
  core.castShadow = false;
  return g;
}

export function buildMower() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.22, 0.34), toon(0xc84232), 0, 0.26, 0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.14, 0.26), toon(0x9a9aa2), -0.18, 0.44, 0));
  const handle = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), toon(0x5a5a62), -0.32, 0.5, 0);
  handle.rotation.z = 0.7;
  g.add(handle);
  const roller = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 12), toon(0x4a4a52), 0.28, 0.11, 0);
  roller.rotation.x = Math.PI / 2;
  g.add(roller);
  const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10);
  const wheelMat = toon(0x26262c);
  for (const s of [-1, 1]) {
    const w = mesh(wheelGeo, wheelMat, -0.12, 0.09, 0.18 * s);
    w.rotation.x = Math.PI / 2;
    g.add(w);
  }
  return g;
}

function tuft(x, z, mul) {
  const g = new THREE.Group();
  const m = toon(scaleColor(0x5aa838, mul));
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.ConeGeometry(0.035, 0.16 + (i % 2) * 0.06, 5), m, (i - 1) * 0.05, 0.08, ((i * 7) % 3 - 1) * 0.04);
    c.rotation.z = (i - 1) * 0.25;
    g.add(c);
  }
  g.position.set(x, 0, z);
  return g;
}

function daisy(x, z, petalColor, mul) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.18, 6), toon(scaleColor(0x4a8a2a, mul)), 0, 0.09, 0));
  g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), toon(scaleColor(0xe8a818, mul)), 0, 0.19, 0));
  const pm = toon(scaleColor(petalColor, mul));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = mesh(new THREE.SphereGeometry(0.028, 6, 5), pm, Math.cos(a) * 0.055, 0.19, Math.sin(a) * 0.055);
    p.scale.y = 0.5;
    g.add(p);
  }
  g.position.set(x, 0, z);
  return g;
}

function tree(x, z, mul) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), toon(scaleColor(0x6e4c2c, mul)), 0, 0.6, 0));
  const leafM = toon(scaleColor(0x4e9a34, mul));
  g.add(mesh(new THREE.SphereGeometry(0.65, 12, 10), leafM, 0, 1.5, 0));
  g.add(mesh(new THREE.SphereGeometry(0.45, 10, 8), leafM, 0.4, 1.2, 0.2));
  g.add(mesh(new THREE.SphereGeometry(0.4, 10, 8), leafM, -0.35, 1.25, -0.15));
  g.position.set(x, 0, z);
  return g;
}

export function buildScenery(scene, boardLeftX, boardRightX, boardDepth, theme) {
  const mul = theme.tileMul;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), toon(scaleColor(0x559238, mul)));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  scene.add(ground);

  for (const [hx, hz, hs] of [[-14, -16, 7], [4, -18, 9], [17, -15, 6]]) {
    const hill = mesh(new THREE.SphereGeometry(hs, 14, 10), toon(scaleColor(0x4a8032, mul * 0.9)), hx, -hs * 0.62, hz);
    hill.receiveShadow = true;
    scene.add(hill);
  }

  const house = new THREE.Group();
  const wall = mesh(new THREE.BoxGeometry(2.6, 3.2, boardDepth + 3), toon(scaleColor(0xd8b488, mul)), 0, 1.6, 0);
  wall.receiveShadow = true;
  house.add(wall);
  const roof = mesh(new THREE.ConeGeometry(2.7, 1.7, 4), toon(scaleColor(0xa4523c, mul)), 0, 4.05, 0);
  roof.rotation.y = Math.PI / 4;
  house.add(roof);
  house.add(mesh(new THREE.BoxGeometry(0.1, 1.3, 0.8), toon(scaleColor(0x744e2c, mul)), 1.31, 0.65, 0.8));
  house.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(0xd8b830), 1.38, 0.68, 1.08));
  const winGlow = mul < 1 ? 0x997726 : 0x2e4656;
  const winMat = new THREE.MeshToonMaterial({ color: 0xb2e0ec, emissive: winGlow, gradientMap: toonGradient() });
  for (const wz of [-0.9, 1.5]) {
    house.add(mesh(new THREE.BoxGeometry(0.1, 0.7, 0.7), winMat, 1.31, 1.9, wz));
    house.add(mesh(new THREE.BoxGeometry(0.12, 0.78, 0.08), toon(scaleColor(0xf0e8d8, mul)), 1.31, 1.9, wz - 0.39));
    house.add(mesh(new THREE.BoxGeometry(0.12, 0.78, 0.08), toon(scaleColor(0xf0e8d8, mul)), 1.31, 1.9, wz + 0.39));
  }
  house.position.x = boardLeftX - 2.9;
  scene.add(house);

  const stoneM = toon(scaleColor(0x92929c, mul));
  const stoneDark = toon(scaleColor(0x72727c, mul));
  for (let i = 0; i < 5; i++) {
    const gx = boardRightX + 1.6 + (i % 2) * 0.7;
    const gz = -boardDepth / 2 + 0.4 + i * (boardDepth / 5);
    const s = mesh(new THREE.BoxGeometry(0.42, 0.55 + (i % 3) * 0.12, 0.18), stoneM, gx, 0.28, gz);
    s.rotation.y = (i - 2) * 0.2;
    s.rotation.z = ((i * 13) % 5 - 2) * 0.04;
    scene.add(s);
    const cap = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.18, 10), stoneDark, gx, 0.55 + (i % 3) * 0.06, gz);
    cap.rotation.x = Math.PI / 2;
    cap.rotation.z = (i - 2) * 0.2;
    scene.add(cap);
    const dirt = mesh(new THREE.SphereGeometry(0.3, 8, 6), toon(scaleColor(0x6a5238, mul)), gx - 0.1, -0.16, gz);
    dirt.scale.set(1.3, 0.25, 0.9);
    scene.add(dirt);
  }

  const fenceM = toon(scaleColor(0xa88c68, mul));
  const railM = toon(scaleColor(0x947858, mul));
  for (let i = 0; i < 14; i++) {
    const fx = boardLeftX - 1.5 + i * ((boardRightX - boardLeftX + 3) / 13);
    const p = mesh(new THREE.BoxGeometry(0.12, 0.85, 0.3), fenceM, fx, 0.42, -boardDepth / 2 - 1.35);
    scene.add(p);
  }
  scene.add(mesh(new THREE.BoxGeometry(boardRightX - boardLeftX + 3.6, 0.09, 0.06), railM, (boardLeftX + boardRightX) / 2, 0.62, -boardDepth / 2 - 1.2));

  const bushM = toon(scaleColor(0x3e7a2a, mul));
  for (let i = 0; i < 6; i++) {
    const bx = boardLeftX - 0.8 + i * ((boardRightX - boardLeftX + 1.6) / 5);
    const b = mesh(new THREE.SphereGeometry(0.32 + (i % 2) * 0.1, 10, 8), bushM, bx, 0.12, -boardDepth / 2 - 0.95);
    b.scale.y = 0.75;
    scene.add(b);
  }

  const rand = [0.13, 0.71, 0.42, 0.89, 0.27, 0.58, 0.95, 0.05, 0.33, 0.77, 0.51, 0.19, 0.63, 0.85];
  for (let i = 0; i < 12; i++) {
    const fx = boardLeftX + rand[i] * (boardRightX - boardLeftX);
    const fz = boardDepth / 2 + 0.7 + rand[(i + 3) % 14] * 1.6;
    scene.add(tuft(fx, fz, mul));
    if (i % 3 === 0) scene.add(daisy(fx + 0.3, fz + 0.2, i % 2 ? 0xf0f0f0 : 0xe86a9a, mul));
  }

  scene.add(tree(boardRightX + 3.4, -boardDepth / 2 - 2.6, mul));
  scene.add(tree(boardLeftX + 1.2, -boardDepth / 2 - 3.4, mul));

  if (mul < 0.9) {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 16), new THREE.MeshBasicMaterial({ color: 0xf0f0da }));
    moon.position.set(8, 10, -14);
    scene.add(moon);
    const crater = new THREE.MeshBasicMaterial({ color: 0xd8d8be });
    for (const [cx, cy, cr] of [[-0.3, 0.3, 0.18], [0.25, -0.1, 0.13], [-0.05, -0.35, 0.1]]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(cr, 8, 6), crater);
      c.position.set(8 + cx, 10 + cy, -13.2);
      scene.add(c);
    }
  }
}
