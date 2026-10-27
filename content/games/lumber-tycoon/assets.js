// Процедурные ассеты: текстуры (кора, срезы, асфальт, фасады, плитки) и модели
// (бревна, деревья, камни, горы, грузовик, здания). Всё генерируется кодом — без внешних файлов.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ───────────── math / noise ─────────────
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}
// periodic 2D value noise (tileable textures)
function h2(x, y, s) { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); }
function pnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a, p) => ((a % p) + p) % p;
  const c = (a, b) => h2(m(xi + a, px), m(yi + b, py), s);
  return lerp(lerp(c(0, 0), c(1, 0), u), lerp(c(0, 1), c(1, 1), u), v);
}
function pfbm(x, y, px, py, oct, s) {
  let sum = 0, a = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) { sum += a * pnoise(x, y, px, py, s + i * 13); norm += a; x *= 2; y *= 2; px *= 2; py *= 2; a *= 0.5; }
  return sum / norm;
}

// ───────────── geometry helpers ─────────────
export function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, arr = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c, i, g); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function colorize(geo, color) { const col = color.isColor ? color : new THREE.Color(color); return paint(geo, (x, y, z, c) => c.copy(col)); }
export function displace(geo, fn) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  return geo;
}
const C = (c) => new THREE.Color(c);

// ───────────── textures ─────────────
let maxAniso = 8;
export function setMaxAnisotropy(a) { maxAniso = a; }
function dataTex(size, fn, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data, out = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, out);
    const o = (y * size + x) * 4;
    d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = out[3];
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  return t;
}
function normalFromHeight(H, size, strength) {
  return dataTex(size, (u, v, o) => {
    const x = Math.round(u * size), y = Math.round(v * size), at = (a, b) => H[((b + size) % size) * size + ((a + size) % size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    o[0] = (-dx / l * 0.5 + 0.5) * 255; o[1] = (dy / l * 0.5 + 0.5) * 255; o[2] = (1 / l * 0.5 + 0.5) * 255; o[3] = 255;
  }, false);
}
// bark height field: long vertical grooves (u = around the log, v = along it)
function barkHeight(size, seed) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const warp = pfbm(u * 6, v * 2, 6, 2, 3, seed);
    const r = 1 - Math.abs(2 * pfbm(u * 14 + warp * 2.2, v * 2, 14, 2, 4, seed + 5) - 1);
    const fine = pfbm(u * 40, v * 10, 40, 10, 2, seed + 9);
    H[y * size + x] = clamp(Math.pow(r, 1.6) * 0.75 + fine * 0.25, 0, 1);
  }
  return H;
}
const BARK_SIZE = 512;
let barkH = null;
// grayscale bark for instanced (tinted) logs
export function makeLogSideTextures() {
  barkH ??= barkHeight(BARK_SIZE, 1);
  const map = dataTex(BARK_SIZE, (u, v, o) => {
    const h = barkH[Math.floor(v * BARK_SIZE) * BARK_SIZE + Math.floor(u * BARK_SIZE)];
    const g = (0.42 + 0.5 * h) * 255; o[0] = g; o[1] = g * 0.96; o[2] = g * 0.92; o[3] = 255;
  });
  return { map, normalMap: normalFromHeight(barkH, BARK_SIZE, 5) };
}
// tree-ring cap, grayscale (tinted) or colored
// the ring pattern doesn't depend on the colours: computed once, every palette only mixes its colours over it
const CAP_SIZE = 256;
let capField = null;
function getCapField() {
  if (capField) return capField;
  const ring = new Float32Array(CAP_SIZE * CAP_SIZE), edge = new Float32Array(CAP_SIZE * CAP_SIZE), crack = new Uint8Array(CAP_SIZE * CAP_SIZE);
  for (let j = 0; j < CAP_SIZE; j++) for (let i = 0; i < CAP_SIZE; i++) {
    const k = j * CAP_SIZE + i, x = (i / CAP_SIZE - 0.5) * 2, y = (j / CAP_SIZE - 0.5) * 2, r = Math.hypot(x, y), a = Math.atan2(y, x);
    const n = pfbm((a / (Math.PI * 2) + 0.5) * 8, r * 2, 8, 4, 3, 3);
    const rings = 0.5 + 0.5 * Math.sin((r + n * 0.08) * 70);
    ring[k] = Math.pow(rings, 6) * 0.55 + r * 0.25;
    crack[k] = Math.abs(Math.sin(a * 3 + 1)) < 0.02 && r > 0.2 && r < 0.8 ? 1 : 0;
    edge[k] = r > 0.86 ? 0.8 + n * 0.4 : -1;
  }
  return (capField = { ring, edge, crack });
}
export function makeCapTexture(colors) {
  const wood = colors ? C(colors.cap) : C('#ffffff'), ring = colors ? C(colors.wood) : C('#c9b9a4'), bark = colors ? C(colors.bark) : C('#5b4a3a');
  const toS = (c) => c.clone().convertLinearToSRGB();
  const W = toS(wood), R = toS(ring), B = toS(bark), c = new THREE.Color(), F = getCapField();
  return dataTex(CAP_SIZE, (u, v, o) => {
    const k = Math.round(v * CAP_SIZE) * CAP_SIZE + Math.round(u * CAP_SIZE);
    c.copy(W).lerp(R, F.ring[k]);
    if (F.crack[k]) c.lerp(R, 0.6); // cracks
    if (F.edge[k] >= 0) c.copy(B).multiplyScalar(F.edge[k]);
    o[0] = c.r * 255; o[1] = c.g * 255; o[2] = c.b * 255; o[3] = 255;
  });
}
// colored bark with moss for raw logs (one per conveyor lane)
// The noise fields (grooves, moss mask, moss detail) and the normal map depend only on the seed: they are computed once
// per seed, so a new palette (wood species) costs only one cheap colour pass
const barkFields = new Map();
function getBarkField(seed) {
  let f = barkFields.get(seed);
  if (f) return f;
  const H = barkHeight(BARK_SIZE, seed), N = BARK_SIZE * BARK_SIZE, mk = new Float32Array(N), md = new Float32Array(N);
  for (let y = 0; y < BARK_SIZE; y++) for (let x = 0; x < BARK_SIZE; x++) {
    const u = x / BARK_SIZE, v = y / BARK_SIZE, k = y * BARK_SIZE + x;
    mk[k] = pfbm(u * 4, v * 2, 4, 2, 4, seed + 31) + H[k] * 0.15;
    md[k] = 0.75 + 0.5 * pfbm(u * 60, v * 20, 60, 20, 2, seed);
  }
  f = { H, mk, md, normalMap: normalFromHeight(H, BARK_SIZE, 6) };
  barkFields.set(seed, f);
  return f;
}
export function makeRawBarkTextures(w, seed) {
  const { H, mk, md, normalMap } = getBarkField(seed);
  const bark = C(w.bark).convertLinearToSRGB(), moss = C(w.moss).convertLinearToSRGB(), c = new THREE.Color(), m2 = new THREE.Color();
  const map = dataTex(BARK_SIZE, (u, v, o) => {
    const k = Math.floor(v * BARK_SIZE) * BARK_SIZE + Math.floor(u * BARK_SIZE);
    c.copy(bark).multiplyScalar(0.5 + 0.75 * H[k]);
    const m = smooth(1 - w.mossAmount - 0.08, 1 - w.mossAmount + 0.08, mk[k]);
    if (m > 0) c.lerp(m2.copy(moss).multiplyScalar(md[k]), m);
    o[0] = c.r * 255; o[1] = c.g * 255; o[2] = c.b * 255; o[3] = 255;
  });
  return { map, normalMap };
}
export function makeAsphaltTexture() {
  return canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#4a4d52'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { const s = Math.random() * 30 + 50; g.fillStyle = `rgb(${s},${s},${s + 4})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    g.fillStyle = '#e9e6dc'; g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h);
    g.fillStyle = '#f2c94c'; for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 2, y, 4, 70);
  });
}
export function makeConcreteTexture() {
  return dataTex(256, (u, v, o) => {
    const n = pfbm(u * 8, v * 8, 8, 8, 4, 77) * 0.5 + pfbm(u * 64, v * 64, 64, 64, 1, 3) * 0.5;
    const seam = (u % 0.25 < 0.006 || v % 0.25 < 0.006) ? 0.82 : 1;
    const g = (0.84 + n * 0.16) * seam * 255; o[0] = g; o[1] = g; o[2] = g * 0.98; o[3] = 255;
  });
}
export function makeGrassTexture() {
  return dataTex(256, (u, v, o) => {
    const n = pfbm(u * 6, v * 6, 6, 6, 4, 11), f = pfbm(u * 48, v * 48, 48, 48, 2, 5);
    const g = 0.8 + n * 0.3 + f * 0.12; o[0] = g * 235; o[1] = g * 245; o[2] = g * 230; o[3] = 255;
  });
}
export function makeFacadeTexture(floorsH = 3.2) {
  // white wall + dark windows; tinted by material color. emissive map lights some windows.
  const map = canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#e8e4dc'; g.fillRect(0, 230, 256, 26);
    g.fillStyle = '#2e4257'; g.fillRect(56, 60, 144, 120);
    g.fillStyle = '#5f86a8'; g.fillRect(60, 64, 136, 50);
    g.fillStyle = '#ffffff'; g.fillRect(124, 60, 8, 120); g.fillRect(56, 116, 144, 6);
    g.fillStyle = '#d6d0c4'; g.fillRect(48, 180, 160, 10);
  });
  const emissive = canvasTex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#ffcf7a'; g.fillRect(60, 64, 136, 112);
  });
  for (const t of [map, emissive]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, emissive, floorsH };
}

// ───────────── logs ─────────────
export function makeRawLogGeo(R, L, seed) {
  const g = new THREE.CylinderGeometry(R, R, L, 44, 14);
  const knots = [0, 1, 2].map((i) => [hash3(seed, i, 1) * Math.PI * 2, (hash3(seed, i, 2) - 0.5) * L * 0.8]);
  displace(g, (v) => {
    const r = Math.hypot(v.x, v.z);
    if (r < 0.01) return;
    const a = Math.atan2(v.z, v.x);
    let k = 1 + (vnoise(Math.cos(a) * 1.3 + seed, v.y * 0.7, Math.sin(a) * 1.3) - 0.5) * 0.14 - (v.y / L) * 0.06;
    for (const [ka, ky] of knots) {
      const da = Math.atan2(Math.sin(a - ka), Math.cos(a - ka)), d2 = (da * R) ** 2 + (v.y - ky) ** 2;
      k += 0.1 * Math.exp(-d2 / 0.08);
    }
    v.x *= k; v.z *= k;
    v.x += (v.y / L) ** 2 * 0.12;
  });
  return g.rotateZ(-Math.PI / 2);
}
export function makeLogGeo(R, L) { return new THREE.CylinderGeometry(R, R, L, 18, 1); }

// Chunky dressing on a raw log (axis along x, like makeRawLogGeo), vertex-coloured:
// 'plates' — thick bark plates + a moss drape, 'moss' — a moss blanket, 'mushrooms' — mushroom clusters + lumps.
export function makeLogDecor(kind, R, L, seed, colors) {
  const rng = mulberry32(seed), r = (a, b) => a + rng() * (b - a), parts = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  // place a piece built "up = +y" on the log surface at axial u and angle a (0 = +z, π/2 = top)
  const put = (geo, u, a, sink, col, jitter = 0.12) => {
    n.set(0, Math.sin(a), Math.cos(a));
    q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, r(0, Math.PI * 2)));
    m.compose(new THREE.Vector3(u, n.y * (R - sink), n.z * (R - sink)), q, new THREE.Vector3(1, 1, 1));
    const c = new THREE.Color(col);
    parts.push(paint(geo.applyMatrix4(m), (x, y, z, out) => out.copy(c).multiplyScalar(1 - jitter + hash3(x * 7, y * 7, z * 7) * jitter * 2)));
  };
  const blob = (sx, sy, sz, detail = 1) => displace(new THREE.IcosahedronGeometry(1, detail), (v) => v.multiplyScalar(0.85 + vnoise(v.x * 3 + seed, v.y * 3, v.z * 3) * 0.3)).scale(sx, sy, sz);
  const top = () => Math.PI / 2 + r(-1.3, 1.3); // mostly on the upper side, where you see it
  const moss = new THREE.Color(colors.moss), bark = new THREE.Color(colors.bark);
  if (kind === 'plates') {
    for (let i = 0; i < 40; i++) put(blob(r(0.28, 0.42), r(0.13, 0.2), r(0.2, 0.32), 2), r(-L / 2 + 0.25, L / 2 - 0.25), r(0, Math.PI * 2), 0.0,
      bark.clone().lerp(new THREE.Color('#d39a5c'), r(0.45, 0.75)), 0.18);
    for (let i = 0; i < 14; i++) put(blob(r(0.25, 0.4), r(0.1, 0.18), r(0.25, 0.4), 2), L / 2 - r(0.05, 0.6), top(), 0.06, moss, 0.2);
  } else if (kind === 'moss') {
    for (let i = 0; i < 70; i++) put(blob(r(0.3, 0.55), r(0.14, 0.26), r(0.3, 0.55), 2), r(-L / 2 + 0.1, L / 2 - 0.1), Math.PI / 2 + r(-1.6, 1.6), 0.08, moss, 0.22);
    for (let i = 0; i < 12; i++) put(blob(r(0.2, 0.35), r(0.06, 0.1), r(0.15, 0.25)), r(-L / 2 + 0.3, L / 2 - 0.3), -Math.PI / 2 + r(-1, 1), 0.02, bark.clone().lerp(new THREE.Color('#c08850'), 0.5), 0.18);
  } else {
    const capC = new THREE.Color('#b9a089'), stemC = new THREE.Color('#e8dccb');
    for (let c = 0; c < 11; c++) {
      const u0 = r(-L / 2 + 0.4, L / 2 - 0.4), a0 = (c / 11) * Math.PI * 2 + r(-0.3, 0.3); // clusters all around the log
      for (let k = 0; k < 4; k++) {
        const u = u0 + r(-0.4, 0.4), a = a0 + r(-0.3, 0.3), h = r(0.16, 0.36), cr = r(0.18, 0.32);
        put(new THREE.CylinderGeometry(0.05, 0.07, h, 8).translate(0, h / 2, 0), u, a, 0.03, stemC, 0.06);
        put(new THREE.SphereGeometry(cr, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1).translate(0, h - 0.02, 0), u, a, 0.03,
          capC.clone().multiplyScalar(r(0.75, 1.05)), 0.1);
      }
    }
    for (let i = 0; i < 26; i++) put(blob(r(0.22, 0.4), r(0.1, 0.2), r(0.22, 0.4)), r(-L / 2 + 0.2, L / 2 - 0.2), r(0, Math.PI * 2), 0.05, moss.clone().multiplyScalar(0.7), 0.2);
  }
  return mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
}

// ───────────── vegetation ─────────────
export function makePine(color, hi = true, seed = 1) {
  const base = C(color), trunkC = C('#5e4129');
  const parts = [colorize(new THREE.CylinderGeometry(0.16, 0.3, 1.6, hi ? 9 : 5).translate(0, 0.8, 0), trunkC)];
  const tiers = hi ? 4 : 2;
  for (let i = 0; i < tiers; i++) {
    const r = (hi ? 1.7 : 1.5) * (1 - i * (hi ? 0.21 : 0.35)), h = hi ? 1.9 : 2.6, y0 = 1.0 + i * (hi ? 0.95 : 1.4);
    const cone = new THREE.ConeGeometry(r, h, hi ? 12 : 7, hi ? 2 : 1);
    if (hi) displace(cone, (v) => {
      const rr = Math.hypot(v.x, v.z); if (rr < 0.01) return;
      const k = 1 + (vnoise(v.x * 2 + seed + i, v.y * 2, v.z * 2) - 0.5) * 0.25;
      v.x *= k; v.z *= k;
      if (v.y < -h / 2 + 0.01) v.y -= (vnoise(v.x * 3, i, v.z * 3)) * 0.25;
    });
    cone.translate(0, y0 + h / 2, 0);
    const top = y0 + h;
    parts.push(paint(cone, (x, y, z, c) => {
      const t = clamp((y - y0) / h, 0, 1);
      c.copy(base).multiplyScalar(0.62 + i * 0.07 + t * 0.32);
      if (Math.hypot(x, z) < 0.3 && y > top - 0.4) c.multiplyScalar(1.1);
    }));
  }
  return mergeGeometries(parts);
}
function blob(r, seed, detail = 11) {
  const g = new THREE.SphereGeometry(r, detail, Math.round(detail * 0.7));
  return displace(g, (v) => { const k = 1 + (fbm3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3, 3) - 0.5) * 0.35; v.multiplyScalar(k); });
}
export function makeRoundTree(color, hi = true, seed = 2, birch = false) {
  const base = C(color), parts = [];
  const trunk = new THREE.CylinderGeometry(0.17, 0.28, 2.4, hi ? 9 : 5).translate(0, 1.2, 0);
  parts.push(birch
    ? paint(trunk, (x, y, z, c) => c.set(hash3(Math.round(y * 6), Math.round(Math.atan2(z, x) * 2), 3) > 0.75 ? '#2b2b2b' : '#efece4'))
    : colorize(trunk, '#5e4129'));
  const n = hi ? (birch ? 3 : 4) : 1;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed, rr = i === 0 ? 0 : 0.85;
    const r = (birch ? 1.0 : 1.35) * (i === 0 ? 1.15 : 0.85 + hash3(seed, i, 0) * 0.3);
    const b = hi ? blob(r, seed + i * 3) : new THREE.IcosahedronGeometry(r * 1.4, 1);
    b.translate(Math.cos(a) * rr, (birch ? 3.2 : 3.0) + (i === 0 ? 0.6 : hash3(seed, i, 1) * 0.6), Math.sin(a) * rr);
    parts.push(paint(b, (x, y, z, c) => c.copy(base).multiplyScalar(0.6 + clamp((y - 2.2) / 2.6, 0, 1) * 0.55 + (vnoise(x * 2, y * 2, z * 2) - 0.5) * 0.15)));
  }
  return mergeGeometries(parts);
}
export function makeBush(color, seed = 4) {
  const base = C(color), parts = [];
  for (let i = 0; i < 3; i++) {
    const b = blob(0.7 + hash3(seed, i, 2) * 0.35, seed + i, 14);
    b.translate((i - 1) * 0.7, 0.45, (hash3(seed, i, 3) - 0.5) * 0.8);
    parts.push(paint(b, (x, y, z, c) => c.copy(base).multiplyScalar(0.62 + clamp(y, 0, 1.2) * 0.4)));
  }
  return mergeGeometries(parts);
}
export function makeRock(seed, mossColor) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  displace(g, (v) => {
    const n = fbm3(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4, 4);
    v.multiplyScalar(0.75 + n * 0.55);
    v.x *= 1 + hash3(seed, 1, 1) * 0.3; v.z *= 1 + hash3(seed, 2, 2) * 0.3;
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.25;
    // terrace facets
    v.y = Math.round(v.y * 7) / 7 * 0.35 + v.y * 0.65;
  });
  const moss = C(mossColor);
  return paint(g, (x, y, z, c) => {
    const n = vnoise(x * 4 + seed, y * 4, z * 4);
    c.setRGB(0.55 + n * 0.25, 0.52 + n * 0.23, 0.47 + n * 0.2);
    if (y > 0.35 + n * 0.25) c.lerp(moss, 0.55);
  });
}
export function makeMountain(size, height, seed, colors, snow = true) {
  const g = new THREE.PlaneGeometry(size, size, 64, 64).rotateX(-Math.PI / 2);
  displace(g, (v) => {
    const d = Math.hypot(v.x, v.z) / (size / 2);
    const fall = Math.pow(smooth(1, 0.05, d), 1.4);
    const ridge = 1 - Math.abs(2 * fbm3(v.x * 0.004 + seed, seed, v.z * 0.004, 5) - 1);
    v.y = height * fall * (0.45 + 0.75 * ridge) - 2;
  });
  const grass = C(colors.grass), forest = C(colors.tree).multiplyScalar(0.55), rock = C('#8d8678'), snowC = C('#f4f7fb');
  return paint(g, (x, y, z, c, i, ng) => {
    const t = y / height, slope = 1 - ng.attributes.normal.getY(i), n = vnoise(x * 0.05, y * 0.05, z * 0.05);
    c.copy(grass).lerp(forest, smooth(0.02, 0.15, t));
    c.lerp(rock, smooth(0.35, 0.6, t + slope * 0.6 + (n - 0.5) * 0.2));
    if (snow) c.lerp(snowC, smooth(0.7, 0.8, t + (n - 0.5) * 0.15));
  });
}

// ───────────── truck ─────────────
// Faces +x, origin on the ground. Bed floor top at y = 1.26, bed center x = -1.15.
export const BED_X = -1.15, BED_FLOOR = 1.26;
// lo = distant LOD: plain boxes, fewer cylinder segments, no small details
export function makeTruckGeo(colors, lo = false) {
  const P = [];
  const add = (g, col, x = 0, y = 0, z = 0) => { if (g) { g.translate(x, y, z); P.push(colorize(g, col)); } };
  const RB = (w, h, d, seg, r) => (lo ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, seg, r));
  const CY = (r, h, seg) => new THREE.CylinderGeometry(r, r, h, lo ? Math.max(6, Math.round(seg / 3)) : seg);
  const D = (make) => (lo ? null : make());
  const body = C(colors.truck), bodyD = body.clone().multiplyScalar(0.7), cab = C(colors.truckCab);
  const dark = C('#2a2d31'), tire = C('#1a1b1d'), rim = C('#b8bcc2'), glass = C('#1d3550'), chrome = C('#dfe3e8');
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(6.6, 0.32, 0.28), dark, -0.1, 0.78, s * 0.72);
  add(new THREE.BoxGeometry(6.4, 0.12, 1.7), dark, -0.1, 0.66, 0);
  for (const x of [2.35, -1.6, -2.75]) for (const s of [-1, 1]) {
    add(CY(0.56, 0.42, 28).rotateX(Math.PI / 2), tire, x, 0.56, s * 1.08);
    add(CY(0.33, 0.44, 18).rotateX(Math.PI / 2), rim, x, 0.56, s * 1.08);
    add(D(() => CY(0.11, 0.48, 8).rotateX(Math.PI / 2)), chrome, x, 0.56, s * 1.08);
  }
  for (const s of [-1, 1]) {
    add(RB(2.6, 0.14, 0.56, 2, 0.05), bodyD, -2.17, 1.22, s * 1.08);
    add(RB(1.3, 0.14, 0.56, 2, 0.05), cab, 2.35, 1.24, s * 1.08);
  }
  add(RB(1.95, 2.05, 2.45, 5, 0.3), cab, 2.4, 2.08, 0);
  add(RB(0.08, 0.9, 2.1, 2, 0.03), glass, 3.37, 2.5, 0);
  for (const s of [-1, 1]) add(RB(0.95, 0.72, 0.06, 2, 0.02), glass, 2.55, 2.5, s * 1.23);
  add(RB(0.08, 0.62, 1.5, 2, 0.03), dark, 3.38, 1.5, 0);
  for (let i = 0; i < 5; i++) add(D(() => new THREE.BoxGeometry(0.04, 0.05, 1.4)), chrome, 3.43, 1.27 + i * 0.12, 0);
  add(RB(0.28, 0.32, 2.55, 2, 0.06), dark, 3.45, 0.86, 0);
  for (const s of [-1, 1]) {
    add(CY(0.15, 0.08, 16).rotateZ(Math.PI / 2), new THREE.Color(4, 4, 3.3), 3.42, 1.38, s * 0.92);
    add(new THREE.BoxGeometry(0.08, 0.42, 0.16), dark, 3.05, 2.45, s * 1.48);
    add(D(() => new THREE.BoxGeometry(0.05, 0.05, 0.28)), dark, 3.05, 2.6, s * 1.34);
    add(CY(0.3, 0.9, 16).rotateZ(Math.PI / 2), chrome, 1.0, 0.85, s * 0.98);
    add(new THREE.BoxGeometry(0.05, 0.2, 0.36), new THREE.Color(3.5, 0.18, 0.1), -3.53, 1.12, s * 0.92);
  }
  add(RB(0.45, 0.14, 1.7, 2, 0.05), dark, 3.0, 3.16, 0);
  for (const z of [-0.5, 0, 0.5]) add(new THREE.BoxGeometry(0.12, 0.08, 0.2), new THREE.Color(4, 1.6, 0.15), 3.1, 3.26, z);
  add(CY(0.08, 1.5, 10), chrome, 1.32, 2.45, -1.05);
  // bed
  add(new THREE.BoxGeometry(4.7, 0.22, 2.5), bodyD, BED_X, 1.15, 0);
  add(new THREE.BoxGeometry(0.18, 1.5, 2.5), body, 1.12, 1.95, 0);
  add(new THREE.BoxGeometry(0.18, 1.25, 2.5), body, -3.42, 1.85, 0);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(4.7, 1.25, 0.12), body, BED_X, 1.85, s * 1.19);
    add(new THREE.BoxGeometry(4.74, 0.12, 0.18), bodyD, BED_X, 2.5, s * 1.19);
    for (let x = -3.2; x <= 1.0; x += 0.7) add(D(() => new THREE.BoxGeometry(0.1, 1.27, 0.06)), bodyD, x, 1.86, s * 1.27);
  }
  return mergeGeometries(P);
}
// 22 half-log slots in the bed, filled bottom-up (axis along local x)
export function cargoSlots(halfLen, r) {
  const slots = [];
  const layers = [[-0.78, -0.26, 0.26, 0.78], [-0.52, 0, 0.52], [-0.78, -0.26, 0.26, 0.78]];
  layers.forEach((zs, li) => { for (const z of zs) for (const dx of [-0.93, 0.93]) slots.push([BED_X + dx, BED_FLOOR + r + 0.01 + li * 0.46, z]); });
  return slots;
}

// ───────────── chips (saw / debark debris) ─────────────
// Unit-sized shapes, the instance scale stretches them. Vertex colour is a light→dark shade,
// the instance colour (wood or bark) multiplies it.
export function makeChipGeos() {
  // splinter: long tapered sliver with a slight twist
  const splinter = displace(new THREE.BoxGeometry(1, 0.1, 0.22, 6, 1, 1), (v) => {
    const t = v.x + 0.5, taper = 0.25 + 0.75 * Math.sin(Math.PI * clamp(t, 0.04, 0.96)) ** 0.6;
    v.z *= taper * (1 - 0.35 * Math.max(0, t - 0.6)); v.y *= taper;
    const a = (t - 0.5) * 0.7; const z = v.z, y = v.y;
    v.z = z * Math.cos(a) - y * Math.sin(a); v.y = z * Math.sin(a) + y * Math.cos(a) + Math.sin(t * 3) * 0.03;
  });
  // flake: irregular thin chip
  const shape = new THREE.Shape();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, r = 0.32 + hash3(i, 3, 7) * 0.2;
    shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 1.3, Math.sin(a) * r);
  }
  const flake = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03).rotateX(Math.PI / 2);
  // curl: a bent strip of bark
  const curl = displace(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 8, 2, true, 0, Math.PI * 1.1).rotateZ(Math.PI / 2), (v) => { v.y += v.x * v.x * 0.25; });
  const shade = (g) => paint(g, (x, y, z, c) => c.setScalar(0.72 + 0.38 * hash3(Math.round(x * 9), Math.round(y * 9), Math.round(z * 9))));
  return [shade(splinter), shade(flake), shade(curl)];
}

// Debarker net: wire mesh + radial brushes, RGBA with transparent holes (for alphaTest)
export function makeNetTexture() {
  return canvasTex(512, 512, (g, w) => {
    g.clearRect(0, 0, w, w);
    const c = w / 2, R = w / 2 - 6;
    g.save(); g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
    g.strokeStyle = '#cfd6dd'; g.lineWidth = 5;
    const step = 30, h = step * Math.sqrt(3) / 2;
    for (let row = -1, y = 0; y < w + h; row++, y += h) for (let x = (row % 2) * step / 2 - step; x < w + step; x += step) {
      g.beginPath();
      for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + (k / 6) * Math.PI * 2; g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * step * 0.55, y + Math.sin(a) * step * 0.55); }
      g.stroke();
    }
    g.strokeStyle = '#ffd23a'; g.lineWidth = 9;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 46, c + Math.sin(a) * 46); g.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R); g.stroke(); }
    g.restore();
    g.strokeStyle = '#2b2f33'; g.lineWidth = 16; g.beginPath(); g.arc(c, c, R - 6, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(c, c, 46, 0, Math.PI * 2); g.lineWidth = 10; g.stroke();
  });
}

// ───────────── buildings ─────────────
const matCache = new Map();
function mat(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
export function makeBuilding(type, w, d, h, color, facade, rng) {
  const grp = new THREE.Group();
  const meshes = [];
  const m = (geo, material, x, y, z) => { const me = new THREE.Mesh(geo, material); me.position.set(x, y, z); me.castShadow = me.receiveShadow = true; grp.add(me); meshes.push(me); return me; };
  const roofMat = mat('roof-' + type, () => new THREE.MeshStandardMaterial({ color: type === 'house' ? 0xb5523b : 0x6d7178, roughness: 0.8 }));
  const trim = mat('trim', () => new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.7 }));
  const darkM = mat('darkb', () => new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.6 }));
  // facade with window grid repeated per floor / per 4 m
  const wallMat = (fw) => {
    const map = facade.map.clone(), em = facade.emissive.clone();
    for (const t of [map, em]) { t.repeat.set(Math.max(1, Math.round(fw / 4)), Math.max(1, Math.round(h / facade.floorsH))); t.needsUpdate = true; }
    return new THREE.MeshStandardMaterial({ color, map, emissiveMap: em, emissive: 0xffc070, emissiveIntensity: rng() < 0.5 ? 0.0 : 0.25, roughness: 0.85 });
  };
  if (type === 'warehouse') {
    const corr = mat('corr-' + color, () => {
      const t = canvasTex(64, 64, (g) => { for (let x = 0; x < 64; x += 8) { g.fillStyle = '#ffffff'; g.fillRect(x, 0, 5, 64); g.fillStyle = '#c9c9c9'; g.fillRect(x + 5, 0, 3, 64); } });
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1);
      return new THREE.MeshStandardMaterial({ color, map: t, roughness: 0.6, metalness: 0.2 });
    });
    m(new THREE.BoxGeometry(w, h, d), corr, 0, h / 2, 0);
    const roof = new THREE.CylinderGeometry(d * 0.62, d * 0.62, w, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
    roof.scale(1, 0.35, 1);
    m(roof, roofMat, 0, h, 0);
    m(new THREE.BoxGeometry(0.1, h * 0.6, d * 0.45), darkM, w / 2 + 0.05, h * 0.3, 0);
  } else if (type === 'house') {
    m(new THREE.BoxGeometry(w, h, d), [wallMat(d), wallMat(d), trim, trim, wallMat(w), wallMat(w)], 0, h / 2, 0);
    const shape = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.4, 0), new THREE.Vector2(d / 2 + 0.4, 0), new THREE.Vector2(0, d * 0.45)]);
    const roof = new THREE.ExtrudeGeometry(shape, { depth: w + 0.6, bevelEnabled: false }).translate(0, 0, -(w + 0.6) / 2).rotateY(Math.PI / 2);
    m(roof, roofMat, 0, h, 0);
    m(new THREE.BoxGeometry(0.9, 2.2, 0.1), darkM, w * 0.25, 1.1, d / 2 + 0.05);
    m(new THREE.BoxGeometry(0.7, 1.6, 0.7), trim, -w * 0.3, h + d * 0.3, 0);
  } else {
    m(new THREE.BoxGeometry(w, h, d), [wallMat(d), wallMat(d), trim, trim, wallMat(w), wallMat(w)], 0, h / 2, 0);
    m(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), trim, 0, h + 0.2, 0);
    for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) m(new THREE.BoxGeometry(1.4, 0.9, 1.1), darkM, (rng() - 0.5) * (w - 2), h + 0.85, (rng() - 0.5) * (d - 2));
    if (type === 'shop') {
      const aw = mat('awning' + color, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0.5, 0.2, -0.15), roughness: 0.6 }));
      m(new THREE.BoxGeometry(w * 0.9, 0.15, 1.6), aw, 0, 3.2, d / 2 + 0.8).rotation.x = 0.25;
    }
  }
  return grp;
}

// ───────────── sky ─────────────
export function makeSky(radius) {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 uTop, uHorizon; varying vec3 vP;
      void main(){ float t = smoothstep(-0.02, 0.45, vP.y); gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.); }`,
  });
  return new THREE.Mesh(geo, material);
}
