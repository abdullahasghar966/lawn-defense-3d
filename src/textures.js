// Procedural PBR textures drawn on a 2D canvas at load time.
// The project ships no binary assets, so every surface — grass, brick, bark, cloth,
// zombie skin — is generated here as an albedo + normal pair. Node has no canvas, so
// every entry point returns null when there is no DOM and materials fall back to flat
// colours (that is the path the headless sim in test/sim.mjs takes).
import * as THREE from '../lib/three.module.js';

const hasDOM = typeof document !== 'undefined';
const cache = new Map();

function lcg(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Tileable value noise: the lattice wraps, so the resulting field repeats seamlessly.
function valueNoise(size, freq, rnd) {
  const w = freq + 1;
  const g = new Float32Array(w * w);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  for (let i = 0; i <= freq; i++) {
    g[i * w + freq] = g[i * w];
    g[freq * w + i] = g[i];
  }
  g[freq * w + freq] = g[0];

  const out = new Float32Array(size * size);
  const step = freq / size;
  for (let y = 0; y < size; y++) {
    const fy = y * step;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = x * step;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const a = g[y0 * w + x0];
      const b = g[y0 * w + x0 + 1];
      const c = g[(y0 + 1) * w + x0];
      const d = g[(y0 + 1) * w + x0 + 1];
      out[y * size + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}

function fbm(size, seed, octaves = 4, baseFreq = 4) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  let freq = baseFreq;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, freq, lcg(seed + o * 977));
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Paints a noise field straight into the canvas through a colour ramp.
function paintField(ctx, size, field, ramp) {
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i++) {
    const [r, g, b] = ramp(field[i], i % size, (i / size) | 0);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function lerpRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Runs `draw` nine times on a 3x3 offset grid so strokes that cross an edge reappear
// on the opposite side — the cheap way to keep hand-drawn detail seamless.
function tiled(ctx, size, draw) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      ctx.save();
      ctx.translate(dx * size, dy * size);
      draw(ctx);
      ctx.restore();
    }
  }
}

// Sobel height -> tangent-space normal map.
function normalFrom(heightCanvas, strength = 2.0) {
  const size = heightCanvas.width;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, size, size).data;
  const out = makeCanvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const at = (x, y) => src[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function toTexture(canvas, { srgb = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Every public texture goes through here. Both the source canvases and the uploaded
// GPU textures are cached: repeat is baked into the texture object, so the cache key
// includes it and callers asking for the same surface share one upload. Without this,
// every plant placed during a match would allocate a fresh set of textures.
function surface(key, build, repeat = 1) {
  if (!hasDOM) return null;
  const rep = Array.isArray(repeat) ? repeat : [repeat, repeat];
  const texKey = `${key}@${rep[0]}x${rep[1]}`;
  if (cache.has(texKey)) return cache.get(texKey);

  let entry = cache.get(key);
  if (!entry) {
    entry = build();
    cache.set(key, entry);
  }
  const out = {};
  for (const [k, canvas] of Object.entries(entry)) {
    if (!canvas) continue;
    const prop = k === 'albedo' ? 'map' : k === 'normal' ? 'normalMap' : 'roughnessMap';
    const t = toTexture(canvas, { srgb: k === 'albedo' });
    t.repeat.set(rep[0], rep[1]);
    out[prop] = t;
  }
  cache.set(texKey, out);
  return out;
}

// ---------------------------------------------------------------- grass

function grassBlades(ctx, size, rnd, count, palette, lengthMul = 1) {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = (size * 0.018 + rnd() * size * 0.035) * lengthMul;
    const ang = rnd() * Math.PI * 2;
    const bend = (rnd() - 0.5) * 0.9;
    ctx.strokeStyle = palette[(rnd() * palette.length) | 0];
    ctx.lineWidth = size * (0.0035 + rnd() * 0.004);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5,
      y + Math.sin(ang) * len * 0.5,
      x + Math.cos(ang + bend) * len,
      y + Math.sin(ang + bend) * len
    );
    ctx.stroke();
  }
}

function buildGrass(seed) {
  const size = 512;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const patch = fbm(size, seed, 4, 3);
  const fine = fbm(size, seed + 31, 3, 16);
  // Olive, not emerald — real turf is desaturated and yellow-leaning.
  const dark = [44, 62, 30];
  const light = [116, 138, 68];
  paintField(actx, size, patch, (v, x, y) => {
    const f = fine[y * size + x];
    const t = Math.min(1, Math.max(0, v * 0.75 + f * 0.35));
    const c = lerpRGB(dark, light, t);
    // occasional sun-bleached patch
    const dry = Math.max(0, v - 0.72) * 2.4;
    return [c[0] + dry * 60, c[1] + dry * 44, c[2] + dry * 6];
  });

  const rnd = lcg(seed + 5);
  const greens = ['#4a7a30', '#5e8f3c', '#3a6224', '#6f9a46', '#537f34', '#7da24f'];
  const dryish = ['#9a8f4a', '#847e3c', '#a89a58'];
  tiled(actx, size, (c) => grassBlades(c, size, lcg(seed + 11), 900, greens));
  tiled(actx, size, (c) => grassBlades(c, size, lcg(seed + 17), 90, dryish));
  // scattered dead leaf specks, like the litter in the reference shot
  const litter = ['#8a5a24', '#a06a2c', '#6e4a1e', '#b07a34'];
  tiled(actx, size, (c) => {
    const r2 = lcg(seed + 23);
    for (let i = 0; i < 26; i++) {
      c.fillStyle = litter[(r2() * litter.length) | 0];
      c.save();
      c.translate(r2() * size, r2() * size);
      c.rotate(r2() * Math.PI);
      c.beginPath();
      c.ellipse(0, 0, size * (0.006 + r2() * 0.008), size * 0.0035, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  });
  void rnd;

  const height = makeCanvas(size);
  const hctx = height.getContext('2d');
  hctx.fillStyle = '#6a6a6a';
  hctx.fillRect(0, 0, size, size);
  const hPal = ['#9a9a9a', '#b4b4b4', '#7c7c7c', '#c8c8c8'];
  tiled(hctx, size, (c) => grassBlades(c, size, lcg(seed + 11), 900, hPal));

  const rough = makeCanvas(size);
  const rctx = rough.getContext('2d');
  paintField(rctx, size, fine, (v) => {
    const g = 190 + v * 50;
    return [g, g, g];
  });

  return { albedo, normal: normalFrom(height, 1.4), rough };
}

export const grassSurface = (repeat = 8) => surface('grass', () => buildGrass(1201), repeat);

// ---------------------------------------------------------------- lawn tile

// One board cell: grass plus the chalk grid line the reference art uses to mark
// plantable squares. Half-width on each edge so neighbours add up to one clean line.
function buildLawnTile(chalk) {
  const size = 256;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const patch = fbm(size, 7717, 4, 3);
  const fine = fbm(size, 7748, 3, 14);
  // Mown turf: a touch lighter and cleaner than the rough grass, same olive family.
  const dark = [48, 68, 32];
  const light = [118, 142, 70];
  paintField(actx, size, patch, (v, x, y) => lerpRGB(dark, light, Math.min(1, v * 0.7 + fine[y * size + x] * 0.4)));
  const greens = ['#4c7c30', '#5f9038', '#3c6626', '#719c48', '#557f33'];
  tiled(actx, size, (c) => grassBlades(c, size, lcg(7761), 340, greens, 0.8));

  if (chalk) {
    // Thin and dusty. A thick, opaque grid reads as painted lines on concrete
    // rather than chalk scuffed onto turf.
    const w = size * 0.016;
    const rnd = lcg(991);
    actx.save();
    actx.globalAlpha = 0.5;
    actx.fillStyle = 'rgb(232,234,220)';
    actx.fillRect(0, 0, size, w);
    actx.fillRect(0, size - w, size, w);
    actx.fillRect(0, 0, w, size);
    actx.fillRect(size - w, 0, w, size);
    // dusty, uneven edge — chalk on grass is never a crisp rectangle
    actx.globalAlpha = 0.28;
    for (let i = 0; i < 420; i++) {
      const along = rnd() * size;
      const off = (rnd() - 0.5) * w * 3.2;
      const edge = (rnd() * 4) | 0;
      const px = edge === 0 ? along : edge === 1 ? along : off < 0 ? off + w : size - w + off;
      const py = edge === 0 ? off + w * 0.5 : edge === 1 ? size - w * 0.5 + off : along;
      actx.fillRect(px, py, rnd() * 3 + 1, rnd() * 3 + 1);
    }
    actx.restore();
  }

  const height = makeCanvas(size);
  const hctx = height.getContext('2d');
  hctx.fillStyle = '#707070';
  hctx.fillRect(0, 0, size, size);
  tiled(hctx, size, (c) => grassBlades(c, size, lcg(7761), 340, ['#a0a0a0', '#bcbcbc', '#828282'], 0.8));

  return { albedo, normal: normalFrom(height, 1.2) };
}

export const lawnTileSurface = (chalk) =>
  surface(`lawn${chalk ? 'c' : ''}`, () => buildLawnTile(chalk));

// ---------------------------------------------------------------- dirt

function buildDirt() {
  const size = 256;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const f = fbm(size, 4404, 5, 5);
  const g = fbm(size, 4431, 3, 22);
  const dark = [56, 40, 26];
  const light = [126, 96, 62];
  paintField(actx, size, f, (v, x, y) => lerpRGB(dark, light, Math.min(1, v * 0.8 + g[y * size + x] * 0.35)));
  const rnd = lcg(4460);
  tiled(actx, size, (c) => {
    for (let i = 0; i < 90; i++) {
      const r = 1 + rnd() * 3.5;
      c.fillStyle = `rgba(${(150) | 0},${(132) | 0},${(110) | 0},${0.3 + rnd() * 0.4})`;
      c.beginPath();
      c.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
      c.fill();
    }
  });

  const height = makeCanvas(size);
  paintField(height.getContext('2d'), size, f, (v, x, y) => {
    const h = 70 + (v * 0.7 + g[y * size + x] * 0.3) * 150;
    return [h, h, h];
  });
  return { albedo, normal: normalFrom(height, 2.2) };
}

export const dirtSurface = (repeat = 2) => surface('dirt', () => buildDirt(), repeat);

// ---------------------------------------------------------------- brick

function buildBrick() {
  const size = 512;
  const rows = 10;
  const bh = size / rows;
  const bw = size / 4;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const mortarNoise = fbm(size, 3301, 4, 8);
  paintField(actx, size, mortarNoise, (v) => {
    const g = (150 + v * 40);
    return [g, g * 0.97, g * 0.9];
  });

  const height = makeCanvas(size);
  const hctx = height.getContext('2d');
  hctx.fillStyle = '#3c3c3c';
  hctx.fillRect(0, 0, size, size);

  const grain = fbm(size, 3355, 4, 14);
  const rnd = lcg(3370);
  const mortar = size * 0.012;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * bw * 0.5;
    for (let b = -1; b < 5; b++) {
      const x = b * bw + offset + mortar;
      const y = r * bh + mortar;
      const w = bw - mortar * 2;
      const h = bh - mortar * 2;
      const shade = 0.78 + rnd() * 0.44;
      const warm = rnd();
      const cr = (150 * shade + warm * 28);
      const cg = (82 * shade + warm * 16);
      const cb = (62 * shade + warm * 12);
      actx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      actx.fillRect(x, y, w, h);
      // per-brick speckle and a worn top edge
      actx.save();
      actx.beginPath();
      actx.rect(x, y, w, h);
      actx.clip();
      for (let i = 0; i < 40; i++) {
        const a = 0.05 + rnd() * 0.12;
        actx.fillStyle = rnd() > 0.5 ? `rgba(255,240,220,${a})` : `rgba(40,20,14,${a})`;
        actx.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 4, 1 + rnd() * 3);
      }
      actx.fillStyle = 'rgba(255,255,255,0.07)';
      actx.fillRect(x, y, w, h * 0.14);
      actx.fillStyle = 'rgba(0,0,0,0.10)';
      actx.fillRect(x, y + h * 0.84, w, h * 0.16);
      actx.restore();

      const hv = 190 + rnd() * 40;
      hctx.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`;
      hctx.fillRect(x, y, w, h);
    }
  }

  // grime wash so the wall is not uniformly clean
  actx.save();
  actx.globalCompositeOperation = 'multiply';
  paintFieldOverlay(actx, size, grain, 0.22);
  actx.restore();

  return { albedo, normal: normalFrom(height, 2.6) };
}

function paintFieldOverlay(ctx, size, field, strength) {
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i++) {
    const g = 255 * (1 - strength + field[i] * strength);
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  const tmp = makeCanvas(size);
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

export const brickSurface = (repeat = 1) => surface('brick', () => buildBrick(), repeat);

// ---------------------------------------------------------------- wood

function buildWood(base) {
  const size = 256;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const warp = fbm(size, 8801, 4, 6);
  const fine = fbm(size, 8830, 3, 26);
  const dark = [base[0] * 0.55, base[1] * 0.55, base[2] * 0.55];
  const light = [base[0], base[1], base[2]];
  const img = actx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // rings running along the plank, pushed around by low-frequency warp
      const rings = Math.sin((x * 0.28 + warp[i] * 14) * 1.6) * 0.5 + 0.5;
      const t = Math.min(1, rings * 0.6 + fine[i] * 0.5);
      const c = lerpRGB(dark, light, t);
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = 255;
    }
  }
  actx.putImageData(img, 0, 0);

  const rnd = lcg(8866);
  actx.strokeStyle = `rgba(${(base[0] * 0.35) | 0},${(base[1] * 0.32) | 0},${(base[2] * 0.3) | 0},0.5)`;
  for (let i = 0; i < 26; i++) {
    actx.lineWidth = 0.6 + rnd() * 1.4;
    const y = rnd() * size;
    actx.beginPath();
    actx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) actx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
    actx.stroke();
  }

  const height = makeCanvas(size);
  const hctx = height.getContext('2d');
  paintField(hctx, size, fine, (v, x, y) => {
    const rings = Math.sin((x * 0.28 + warp[y * size + x] * 14) * 1.6) * 0.5 + 0.5;
    const g = 90 + rings * 90 + v * 60;
    return [g, g, g];
  });
  return { albedo, normal: normalFrom(height, 1.6) };
}

export const woodSurface = (repeat = 1, base = [172, 128, 78]) =>
  surface(`wood${base.join('_')}`, () => buildWood(base), repeat);

// ---------------------------------------------------------------- roof shingles

function buildShingle() {
  const size = 256;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  actx.fillStyle = `rgb(${(58) | 0},${(50) | 0},${(46) | 0})`;
  actx.fillRect(0, 0, size, size);
  const height = makeCanvas(size);
  const hctx = height.getContext('2d');
  hctx.fillStyle = '#404040';
  hctx.fillRect(0, 0, size, size);

  const rows = 8;
  const rh = size / rows;
  const rnd = lcg(6612);
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * rh * 0.5;
    for (let c = -1; c < rows + 1; c++) {
      const x = c * rh + off;
      const y = r * rh;
      const s = 0.75 + rnd() * 0.5;
      actx.fillStyle = `rgb(${(96 * s) | 0},${(84 * s) | 0},${(76 * s) | 0})`;
      actx.beginPath();
      actx.roundRect ? actx.roundRect(x + 1, y + 1, rh - 2, rh * 0.92, 3) : actx.rect(x + 1, y + 1, rh - 2, rh * 0.92);
      actx.fill();
      actx.fillStyle = 'rgba(0,0,0,0.28)';
      actx.fillRect(x + 1, y + rh * 0.84, rh - 2, rh * 0.1);
      const hv = 130 + rnd() * 40;
      hctx.fillStyle = `rgb(${hv | 0},${hv | 0},${hv | 0})`;
      hctx.fillRect(x + 1, y + 1, rh - 2, rh * 0.9);
      hctx.fillStyle = '#303030';
      hctx.fillRect(x + 1, y + rh * 0.9, rh - 2, rh * 0.1);
    }
  }
  return { albedo, normal: normalFrom(height, 2.4) };
}

export const shingleSurface = (repeat = 1) => surface('shingle', () => buildShingle(), repeat);

// ---------------------------------------------------------------- stone

function buildStone() {
  const size = 256;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const f = fbm(size, 5501, 5, 6);
  const speck = fbm(size, 5528, 2, 40);
  const dark = [92, 92, 96];
  const light = [162, 162, 158];
  paintField(actx, size, f, (v, x, y) => {
    const c = lerpRGB(dark, light, v);
    const s = speck[y * size + x];
    const grit = s > 0.72 ? (s - 0.72) * 200 : s < 0.3 ? -(0.3 - s) * 120 : 0;
    return [c[0] + grit, c[1] + grit, c[2] + grit * 0.9];
  });
  // moss creeping up from the base
  const rnd = lcg(5544);
  actx.save();
  for (let i = 0; i < 60; i++) {
    const y = size - rnd() * size * 0.45;
    actx.fillStyle = `rgba(${(72) | 0},${(96) | 0},${(44) | 0},${0.05 + rnd() * 0.28})`;
    actx.beginPath();
    actx.arc(rnd() * size, y, 4 + rnd() * 18, 0, Math.PI * 2);
    actx.fill();
  }
  actx.restore();

  const height = makeCanvas(size);
  paintField(height.getContext('2d'), size, f, (v, x, y) => {
    const g = 60 + v * 150 + speck[y * size + x] * 45;
    return [g, g, g];
  });
  return { albedo, normal: normalFrom(height, 2.0) };
}

export const stoneSurface = (repeat = 1) => surface('stone', () => buildStone(), repeat);

// ---------------------------------------------------------------- cloth

function buildCloth(base) {
  const size = 128;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const f = fbm(size, 2201, 3, 10);
  const img = actx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // over/under weave
      const weave = ((x >> 1) + (y >> 1)) % 2 === 0 ? 1.08 : 0.92;
      const wear = 0.85 + f[i] * 0.3;
      img.data[i * 4] = base[0] * weave * wear;
      img.data[i * 4 + 1] = base[1] * weave * wear;
      img.data[i * 4 + 2] = base[2] * weave * wear;
      img.data[i * 4 + 3] = 255;
    }
  }
  actx.putImageData(img, 0, 0);
  // grave dirt smeared into the fabric
  const rnd = lcg(2233);
  for (let i = 0; i < 40; i++) {
    actx.fillStyle = `rgba(${(70) | 0},${(54) | 0},${(34) | 0},${0.04 + rnd() * 0.14})`;
    actx.beginPath();
    actx.arc(rnd() * size, rnd() * size, 3 + rnd() * 14, 0, Math.PI * 2);
    actx.fill();
  }

  const height = makeCanvas(size);
  const hctx = height.getContext('2d');
  const himg = hctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const g = ((x >> 1) + (y >> 1)) % 2 === 0 ? 190 : 110;
      himg.data[i * 4] = himg.data[i * 4 + 1] = himg.data[i * 4 + 2] = g;
      himg.data[i * 4 + 3] = 255;
    }
  }
  hctx.putImageData(himg, 0, 0);
  return { albedo, normal: normalFrom(height, 0.9) };
}

export const clothSurface = (repeat = 2, base = [78, 85, 104]) =>
  surface(`cloth${base.join('_')}`, () => buildCloth(base), repeat);

// ---------------------------------------------------------------- zombie skin

function buildSkin(base) {
  const size = 256;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const blotch = fbm(size, 9901, 4, 5);
  const pores = fbm(size, 9931, 3, 30);
  paintField(actx, size, blotch, (v, x, y) => {
    const p = pores[y * size + x];
    const t = v * 0.8 + p * 0.3;
    const r = base[0] * (0.72 + t * 0.5);
    const g = base[1] * (0.78 + t * 0.42);
    const b = base[2] * (0.7 + t * 0.5);
    return [r, g, b];
  });
  const rnd = lcg(9955);
  // bruising and dark veins
  for (let i = 0; i < 26; i++) {
    actx.fillStyle = `rgba(${(58) | 0},${(46) | 0},${(62) | 0},${0.06 + rnd() * 0.16})`;
    actx.beginPath();
    actx.arc(rnd() * size, rnd() * size, 6 + rnd() * 26, 0, Math.PI * 2);
    actx.fill();
  }
  actx.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    actx.strokeStyle = `rgba(${(48) | 0},${(64) | 0},${(52) | 0},${0.1 + rnd() * 0.2})`;
    actx.lineWidth = 0.5 + rnd() * 1.2;
    let x = rnd() * size;
    let y = rnd() * size;
    actx.beginPath();
    actx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (rnd() - 0.5) * 30;
      y += (rnd() - 0.5) * 30;
      actx.lineTo(x, y);
    }
    actx.stroke();
  }

  const height = makeCanvas(size);
  paintField(height.getContext('2d'), size, pores, (v, x, y) => {
    const g = 90 + v * 90 + blotch[y * size + x] * 50;
    return [g, g, g];
  });
  return { albedo, normal: normalFrom(height, 1.1) };
}

export const skinSurface = (repeat = 1, base = [150, 168, 124]) =>
  surface(`skin${base.join('_')}`, () => buildSkin(base), repeat);

// ---------------------------------------------------------------- bark

function buildBark() {
  const size = 256;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const warp = fbm(size, 7001, 4, 5);
  const fine = fbm(size, 7033, 3, 22);
  const img = actx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // vertical furrows
      const furrow = Math.abs(Math.sin((x * 0.18 + warp[i] * 10) * 1.4));
      const t = furrow * 0.7 + fine[i] * 0.4;
      img.data[i * 4] = (52 + t * 78);
      img.data[i * 4 + 1] = (38 + t * 56);
      img.data[i * 4 + 2] = (26 + t * 34);
      img.data[i * 4 + 3] = 255;
    }
  }
  actx.putImageData(img, 0, 0);

  const height = makeCanvas(size);
  paintField(height.getContext('2d'), size, fine, (v, x, y) => {
    const i = y * size + x;
    const furrow = Math.abs(Math.sin((x * 0.18 + warp[i] * 10) * 1.4));
    const g = 40 + furrow * 160 + v * 50;
    return [g, g, g];
  });
  return { albedo, normal: normalFrom(height, 3.0) };
}

export const barkSurface = (repeat = 1) => surface('bark', () => buildBark(), repeat);

// ---------------------------------------------------------------- foliage / leaf card

function buildFoliage(base) {
  const size = 256;
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const clump = fbm(size, 6101, 4, 6);
  const fine = fbm(size, 6133, 3, 24);
  paintField(actx, size, clump, (v, x, y) => {
    const t = v * 0.75 + fine[y * size + x] * 0.4;
    return [base[0] * (0.55 + t * 0.75), base[1] * (0.55 + t * 0.75), base[2] * (0.5 + t * 0.8)];
  });
  const height = makeCanvas(size);
  paintField(height.getContext('2d'), size, clump, (v, x, y) => {
    const g = 60 + v * 140 + fine[y * size + x] * 55;
    return [g, g, g];
  });
  return { albedo, normal: normalFrom(height, 2.4) };
}

export const foliageSurface = (repeat = 1, base = [86, 140, 58]) =>
  surface(`foliage${base.join('_')}`, () => buildFoliage(base), repeat);

// A single leaf silhouette used as an alpha mask for ivy and litter cards.
export function leafAlpha() {
  if (!hasDOM) return null;
  const key = 'leafAlpha';
  if (cache.has(key)) return cache.get(key);
  const size = 64;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.04);
  ctx.bezierCurveTo(size * 0.95, size * 0.3, size * 0.85, size * 0.82, size * 0.5, size * 0.98);
  ctx.bezierCurveTo(size * 0.15, size * 0.82, size * 0.05, size * 0.3, size * 0.5, size * 0.04);
  ctx.fill();
  // Alpha masks are data, not colour — leave it in linear space.
  const t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

// ---------------------------------------------------------------- sky / environment

// Equirectangular sky used both as the background and — through PMREM — as the
// image-based light that gives every standard material its ambient reflection.
export function skyEquirect(theme) {
  if (!hasDOM) return null;
  const key = `sky${theme.name}`;
  if (cache.has(key)) return cache.get(key);
  const w = 1024;
  const h = 512;
  const c = makeCanvas(1);
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, theme.skyTop);
  grad.addColorStop(0.42, theme.skyMid || theme.skyBottom);
  grad.addColorStop(0.5, theme.skyBottom);
  grad.addColorStop(0.52, theme.groundHaze || '#5a6a44');
  grad.addColorStop(1, theme.groundDeep || '#2c3a1c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // sun/moon disc plus bloom, positioned to match the key light direction
  const sx = w * 0.68;
  const sy = h * 0.2;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.42);
  glow.addColorStop(0, theme.sunGlowInner || 'rgba(255,246,214,1)');
  glow.addColorStop(0.12, theme.sunGlowMid || 'rgba(255,232,176,0.55)');
  glow.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  if (theme.clouds) {
    const rnd = lcg(4242);
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const cx = rnd() * w;
      const cy = h * 0.06 + rnd() * h * 0.34;
      const r = 18 + rnd() * 70;
      const a = 0.05 + rnd() * 0.2;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      cg.addColorStop(0, `rgba(255,255,255,${a})`);
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (theme.stars) {
    const rnd = lcg(8484);
    for (let i = 0; i < 320; i++) {
      const y = rnd() * h * 0.46;
      ctx.fillStyle = `rgba(255,255,244,${0.25 + rnd() * 0.65})`;
      const s = rnd() > 0.9 ? 2 : 1;
      ctx.fillRect(rnd() * w, y, s, s);
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
