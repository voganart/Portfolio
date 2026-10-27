import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import RAPIER from 'rapier';
import { DEFAULTS } from './config.js';
import { Sound, SOUND_FILES } from './audio.js';
import * as A from './assets.js';

const { rand, clamp, lerp, mulberry32, hash3 } = A;

// ───────────────────────── config ─────────────────────────
const STORE_KEY = 'lumber-creative-v3';
function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (Array.isArray(v)) base[k] = structuredClone(v);
    else if (v && typeof v === 'object' && base[k] && typeof base[k] === 'object') deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}
// Game mode (game.html): same world and systems, but no director/editor; game.js drives the camera,
// the economy and the UI through window.__creative.
const GAME = !!window.LUMBER_GAME;
let saved = null;
try { if (!GAME) saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* no storage */ }
const cfg = deepMerge(structuredClone(DEFAULTS), saved);
if (GAME) { cfg.freeCam = true; cfg.physics.physicsStart = 0; }
// Which lanes / cranes are working (the game unlocks them one by one: middle first, then the sides)
const UNLOCK_ORDER = [1, 0, 2];
const laneOn = (i) => UNLOCK_ORDER.indexOf(i) < cfg.production.activeLanes;
const craneOn = (b) => b < cfg.trucks.activeCranes; // far bay first: a new bay is behind the busy ones, a waiting truck can drive in
const hooks = {}; // game callbacks: cut(lane), convoy(trucks), popMoney(at)

// ───────────────────────── world layout ─────────────────────────
const LANE_Z = [-4.2, 0, 4.2];
const LANE_W = 3.4;
const LANE_LEN = 400, LANE_START = -170;
const BELT_Y = 0.4;
const GATE_X = -40, SPLIT_X = -24, SAW_X = -8; // debarker → splitter (log → bundle) → saw (bundle → halves)
const RAW_R = 1.25, LOG_LEN = 3.6, HALF = LOG_LEN / 2, LOG_R = 0.26;
const BUNDLE_Y = BELT_Y + 1.32;
const GAP = LOG_LEN + 1.3;
const YARD_Y = -3.95;
const TRUCK_Y = YARD_Y + 0.07;     // wheels sit on the asphalt ribbon, not in it
const BRIDGE_X = 220, DECK_END = -4, WATER_Y = -5.5, RIVER_Z = 12, RIVER_X0 = 150, RIVER_X1 = 1500;
const BIN = { x0: 0, x1: 16, z0: -9, z1: 9 };
const FEED_X1 = 8.5;              // bin floor from the wall to here is a feeder belt that moves logs towards the cranes
const LANE_X = 25;                // truck loading lane (trucks drive towards -z)
const BAYS = [-10, -1, 8];        // crane / bed z, furthest first
const CRANE_X = 19.4;
const TRUCK_GAP = 8.8;
const FULL = 24;

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _c = new THREE.Color(), _v = new THREE.Vector3();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const Q_Y2X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
const Q_Y2Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c = 2.2; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const easeOutBounce = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Hex-packed bundle of 19 logs (cross-section in YZ plane)
const HEX = [];
for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
  if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > 2) continue;
  const d = LOG_R * 2 + 0.012;
  HEX.push([d * (r * Math.sqrt(3) / 2), d * (q + r / 2)]);
}

// ───────────────────────── truck path (smooth spline + arc-length table) ─────────────────────────
const PATH_PTS = [[LANE_X, 420], [LANE_X, 200], [LANE_X, 60], [LANE_X, 22], [LANE_X, -18], [26.5, -27], [31, -33], [42, -36.5], [125, -37], [136, -42], [140, -55], [140, -420]];
const curve = new THREE.CatmullRomCurve3(PATH_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
curve.arcLengthDivisions = 8000;
const PATH_LEN = curve.getLength();
const PSTEP = 0.25, PN = Math.ceil(PATH_LEN / PSTEP) + 1;
const PX = new Float32Array(PN), PZ = new Float32Array(PN), PH = new Float32Array(PN);
for (let i = 0; i < PN; i++) { const p = curve.getPointAt(Math.min(1, (i * PSTEP) / PATH_LEN)); PX[i] = p.x; PZ[i] = p.z; }
for (let i = 0; i < PN; i++) { const a = Math.max(0, i - 6), b = Math.min(PN - 1, i + 6); PH[i] = Math.atan2(-(PZ[b] - PZ[a]), PX[b] - PX[a]); }
function pathAt(s, out) {
  const f = clamp(s / PSTEP, 0, PN - 1.001), i = Math.floor(f), k = f - i;
  out.x = lerp(PX[i], PX[i + 1], k); out.z = lerp(PZ[i], PZ[i + 1], k);
  let dh = PH[i + 1] - PH[i]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  out.h = PH[i] + dh * k;
  return out;
}
const BAY_S = BAYS.map((zb) => {
  let best = 0, bd = 1e9;
  for (let i = 0; i < PN; i++) if (Math.abs(PX[i] - LANE_X) < 0.5) { const d = Math.abs(PZ[i] - (zb - 1.05)); if (d < bd) { bd = d; best = i; } }
  return best * PSTEP;
});
function nearRoad(x, z, margin) {
  for (let i = 0; i < PN; i += 16) if (Math.abs(PX[i] - x) < margin && Math.abs(PZ[i] - z) < margin) return true;
  return false;
}

// ───────────────────────── sound ─────────────────────────
// How loud each event is depending on which shot is on screen (0 = silent off-screen)
const EVENT_MIX = {
  debark: { debark: 1, saw: 0.25 },
  split: { debark: 0.5, saw: 0.8 },
  saw: { saw: 1, debark: 0.25, yard: 0.3 },
  logs: { saw: 1, yard: 0.6, traffic: 0.2 },
  coins: { saw: 0.5, yard: 1, traffic: 0.7 },
  crane: { yard: 1, traffic: 0.3, saw: 0.15 },
  horns: { traffic: 1, yard: 0.4 },
  bridge: { bridge: 1 },
};
const sound = new Sound(cfg);
function sfx(event, name, opts = {}) {
  const at = GAME ? null : shotAt(state.t);
  const k = GAME ? 1 : at ? EVENT_MIX[event][at.shot.type] || 0 : 0;
  if (k > 0) sound.play(name, { ...opts, vol: (opts.vol ?? 1) * k });
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => {
  if (sound.unlocked) return;
  sound.unlocked = true;
  sound.unlock().then(() => { if (state.playing) sound.playMusic(state.t); else sound.setPaused(true); });
}, true);

// ───────────────────────── renderer / post ─────────────────────────
// sounds don't hold the start for long: on iOS Safari decoding may wait until the first tap unlocks the audio
const soundsReady = sound.load({ ...SOUND_FILES, crane: 'sounds/crane.wav', box_crash: 'sounds/box_crash.mp3' });
await Promise.all([RAPIER.init(), Promise.race([soundsReady, new Promise((r) => setTimeout(r, 2500))])]);
document.getElementById('loading').remove();

const stage = document.getElementById('stage');
const info = document.getElementById('info');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
stage.appendChild(renderer.domElement);
A.setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(45, 9 / 16, 0.5, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = cfg.freeCam;

const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 256, 256);
gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1, thickness: 1.5, scale: 1, samples: 8 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
composer.addPass(gtao);
// AO at half resolution, and without sprites/particles (otherwise they leave dark squares)
{
  const setSize = gtao.setSize.bind(gtao), render = gtao.render.bind(gtao);
  gtao.setSize = (w, h) => setSize(Math.ceil(w / 2), Math.ceil(h / 2));
  let aoSkip = null;
  gtao.render = (...args) => {
    if (!aoSkip) { aoSkip = []; scene.traverse((o) => { if (o.isSprite || o.isPoints || o.material?.transparent || o.userData.noAO) aoSkip.push(o); }); }
    const hidden = aoSkip.filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    render(...args);
    for (const o of hidden) o.visible = true;
  };
}
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.3 }, uSat: { value: 1.1 }, uContrast: { value: 1.1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(.2126,.7152,.0722)); c.rgb = mix(vec3(l), c.rgb, uSat);
      vec3 s = c.rgb * c.rgb * (3. - 2. * c.rgb);                 // S-curve around mid grey
      c.rgb = clamp(mix(c.rgb, s, uContrast - 1.) , 0., 1.);
      c.rgb *= mix(vec3(.97, 1., 1.05), vec3(1.04, 1.01, .96), smoothstep(.15, .75, l)); // cool shadows, warm highlights
      vec2 d = vUv - .5; c.rgb *= 1. - uVignette * dot(d,d) * 2.4; gl_FragColor = c; }`,
});
composer.addPass(grade);

const ASPECTS = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };
function resize() {
  const guiW = 330;
  const aw = Math.max(200, window.innerWidth - guiW - 24), ah = window.innerHeight - 24;
  const asp = ASPECTS[cfg.format] || 9 / 16;
  let w = aw, h = aw / asp;
  if (h > ah) { h = ah; w = ah * asp; }
  if (GAME) { w = window.innerWidth; h = window.innerHeight; } // the game fills the window
  w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
  const pr = Math.min(window.devicePixelRatio, 2) * cfg.renderScale;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  composer.setPixelRatio(pr);
  composer.setSize(w, h);
  bloom.resolution.set(w * pr, h * pr);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ───────────────────────── lights ─────────────────────────
const hemi = new THREE.HemisphereLight(0xd8efff, 0x5a8a3a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(cfg.look.shadowRes, cfg.look.shadowRes);
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-45, 80, 35).normalize();

// ───────────────────────── materials ─────────────────────────
const grassTex = A.makeGrassTexture(); grassTex.repeat.set(60, 60);
const concreteTex = A.makeConcreteTexture(); concreteTex.repeat.set(8, 10);
const M = {
  grass: new THREE.MeshStandardMaterial({ roughness: 0.95, map: grassTex }),
  cliff: new THREE.MeshStandardMaterial({ roughness: 1 }),
  sand: new THREE.MeshStandardMaterial({ roughness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ roughness: 0.9, map: concreteTex }),
  concretePlain: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
  curb: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
  conveyorBody: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 }),
  gate: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.25 }),
  crane: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }),
  bulb: new THREE.MeshStandardMaterial({ emissiveIntensity: 4 }),
  rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
  steel: new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.25, metalness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.25, roughness: 0.02, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  cabGlass: new THREE.MeshStandardMaterial({ color: 0x233a52, roughness: 0.05, metalness: 0.6 }),
  vcol: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }),
  pine: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
  leafy: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  mountain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  riverbed: new THREE.MeshStandardMaterial({ color: 0x15497a, roughness: 1 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd88a, emissiveIntensity: 2 }),
};
// crane paint: changes colour with the upgrade grade (yellow → orange → red → blue → black with gold)
const craneMat = M.crane.clone();
const CRANE_PAINT = [null, '#ff8a1a', '#e5321d', '#2f7be0', '#2a2c31'];
let craneGrade = 0;
const hoseMat = new THREE.MeshStandardMaterial({ color: 0xd8262a, roughness: 0.45 });
const glowMat = new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0xffb000, emissiveIntensity: 2.2, roughness: 0.3 });
function paintCranes() {
  craneMat.color.set(CRANE_PAINT[craneGrade] || cfg.look.crane);
  craneMat.metalness = craneGrade >= 4 ? 0.6 : 0.3; craneMat.roughness = craneGrade >= 4 ? 0.22 : 0.35;
}
const logSide = A.makeLogSideTextures();
const logSideMat = new THREE.MeshStandardMaterial({ map: logSide.map, normalMap: logSide.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.9 });
logSideMat.map.repeat.set(1, 0.5); logSideMat.normalMap.repeat.set(1, 0.5);
const logCapMat = new THREE.MeshStandardMaterial({ map: A.makeCapTexture(null), roughness: 0.75 });
const LOG_MATS = [logSideMat, logCapMat, logCapMat];
const halfLogGeo = A.makeLogGeo(LOG_R, HALF);
const fullLogGeo = A.makeLogGeo(LOG_R, LOG_LEN);

const beltTex = A.canvasTex(1024, 128, () => {});
const BELT_SLOTS = 8; // chevron places per texture tile; cfg.production.beltArrows of them are drawn
const beltMat = new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.45, metalness: 0.05 });
function drawBelt() {
  const g = beltTex.image.getContext('2d'), n = clamp(Math.round(cfg.production.beltArrows ?? BELT_SLOTS), 1, BELT_SLOTS);
  g.fillStyle = cfg.look.conveyor; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < 1024; x += 8) g.fillRect(x, 0, 1, 128);
  g.fillStyle = cfg.look.conveyorStripe;
  for (let k = 0; k < n; k++) { // n chevrons spread evenly over the tile
    const x0 = Math.floor((k * BELT_SLOTS) / n) * 128;
    g.beginPath(); g.moveTo(x0 + 14, 10); g.lineTo(x0 + 66, 64); g.lineTo(x0 + 14, 118); g.lineTo(x0 + 48, 118); g.lineTo(x0 + 100, 64); g.lineTo(x0 + 48, 10); g.closePath(); g.fill();
  }
  beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
  beltTex.repeat.set(LANE_LEN / (LANE_W * BELT_SLOTS), 1);
  beltTex.needsUpdate = true;
  feederTex.image = beltTex.image; feederTex.wrapS = feederTex.wrapT = THREE.RepeatWrapping;
  feederTex.repeat.set((FEED_X1 - 0.4) / (4 * BELT_SLOTS), (BIN.z1 - BIN.z0) / 4); feederTex.needsUpdate = true;
}
const hazardTex = A.canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#222'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffcc1a';
  for (let x = -h; x < w + h; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.fill(); }
});
hazardTex.wrapS = THREE.RepeatWrapping; hazardTex.repeat.set(4, 1);
const feederTex = A.canvasTex(256, 256, () => {});
const binMat = new THREE.MeshStandardMaterial({ color: 0xb9b4aa, roughness: 0.9, map: concreteTex });
const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.7 });
const asphaltTex = A.makeAsphaltTexture();
const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });

function mesh(geo, mat, x, y, z, parent = scene, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}
const box = (w, h, d, mat, x, y, z, parent, shadow) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent, shadow);
const rbox = (w, h, d, r, mat, x, y, z, parent, shadow) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z, parent, shadow);
const cyl = (r, h, seg, mat, x, y, z, parent, shadow) => mesh(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y, z, parent, shadow);

// Road ribbon along a polyline or the truck path
function roadRibbon(points, width, y) {
  const pos = [], uv = [], idx = [];
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i], [nx, nz] = points[Math.min(points.length - 1, i + 1)], [px, pz] = points[Math.max(0, i - 1)];
    let tx = nx - px, tz = nz - pz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    if (i > 0) len += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    pos.push(x - tz * width / 2, y, z + tx * width / 2, x + tz * width / 2, y, z - tx * width / 2);
    uv.push(0, len / 16, 1, len / 16);
    if (i > 0) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, asphaltMat); m.receiveShadow = true; scene.add(m);
  return m;
}

// ───────────────────────── static world ─────────────────────────
const sky = A.makeSky(3000); scene.add(sky);
// plateau (west of the cliff), lowland, river channel to the east
const plateau = new THREE.Mesh(new THREE.BoxGeometry(1500, 4, 3000), [M.cliff, M.cliff, M.grass, M.grass, M.cliff, M.cliff]);
plateau.position.set(-750, -2, 0); plateau.receiveShadow = true; scene.add(plateau);
for (const [x0, x1, z0, z1] of [[0, RIVER_X0, -1500, 1500], [RIVER_X0, RIVER_X1, RIVER_Z, 1500], [RIVER_X0, RIVER_X1, -1500, -RIVER_Z], [RIVER_X1, 2500, -1500, 1500]]) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), M.grass);
  p.position.set((x0 + x1) / 2, -4, (z0 + z1) / 2); p.receiveShadow = true; scene.add(p);
}
for (const s of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_X1 - RIVER_X0, 9.6), M.sand);
  wall.position.set((RIVER_X0 + RIVER_X1) / 2, -8.8, s * RIVER_Z); wall.rotation.y = s > 0 ? Math.PI : 0; scene.add(wall);
  box(RIVER_X1 - RIVER_X0, 0.06, 2, M.sand, (RIVER_X0 + RIVER_X1) / 2, -3.98, s * (RIVER_Z + 1), scene, false);
}
// the river is deep enough that fallen trucks sink out of the way instead of building a ramp at the deck end
box(1, 9.6, RIVER_Z * 2, M.sand, RIVER_X0, -8.8, 0, scene, false);
box(RIVER_X1 - RIVER_X0, 1, RIVER_Z * 2, M.riverbed, (RIVER_X0 + RIVER_X1) / 2, -14, 0, scene, false);

// Conveyor lanes with rollers and legs
for (const z of LANE_Z) {
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(LANE_LEN, LANE_W).rotateX(-Math.PI / 2), beltMat);
  belt.position.set(-LANE_LEN / 2, BELT_Y + 0.01, z); belt.receiveShadow = true; scene.add(belt);
  box(LANE_LEN, BELT_Y, LANE_W + 0.2, M.conveyorBody, -LANE_LEN / 2, BELT_Y / 2, z, scene, false);
}
for (const z of [-6.3, -2.1, 2.1, 6.3]) rbox(LANE_LEN, 0.6, 0.5, 0.12, M.curb, -LANE_LEN / 2, 0.3, z);
cyl(0.4, 13, 24, M.steel, -0.3, 0.1, 0).rotation.x = Math.PI / 2;
for (const z of [-8.2, 8.2]) box(LANE_LEN, 0.04, 2.6, M.sand, -LANE_LEN / 2, 0.02, z, scene, false);
{ // side posts with lamps along the line
  const n = 20, poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8), M.dark, n * 2);
  let i = 0;
  for (let k = 0; k < n; k++) for (const s of [-1, 1]) { _m.makeTranslation(-14 - k * 9, 1.6, s * 7.4); poles.setMatrixAt(i++, _m); }
  poles.castShadow = true; scene.add(poles);
}

// Debarking gate: red rings with glass and bulbs
const gate = new THREE.Group(); scene.add(gate);
const ringGeo = new THREE.TorusGeometry(1.85, 0.22, 16, 64).rotateY(Math.PI / 2);
const bulbGeo = new THREE.SphereGeometry(0.13, 12, 8);
const gateRings = [], gateNets = [];
const netMat = new THREE.MeshStandardMaterial({ map: A.makeNetTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.6 });
const netGeo = new THREE.CircleGeometry(1.72, 48).rotateY(Math.PI / 2);
for (const z of LANE_Z) {
  const ring = mesh(ringGeo, M.gate, GATE_X, 1.9, z, gate);
  for (const dx of [-0.12, 0.12]) { // two nets the log pushes through, they spin while debarking
    const net = mesh(netGeo, netMat, GATE_X + dx, 1.9, z, gate);
    net.userData.lane = gateNets.length / 2 | 0; net.userData.dir = dx > 0 ? 1 : -1; gateNets.push(net);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    mesh(bulbGeo, M.bulb, GATE_X + 0.15, 1.9 + Math.sin(a) * 2.08, z + Math.cos(a) * 2.08, gate, false);
  }
  rbox(0.7, 0.5, 2.6, 0.1, M.gate, GATE_X, 0.25, z, gate);
  gateRings.push(ring);
}
rbox(0.6, 0.6, 13.6, 0.15, M.gate, GATE_X, 4.05, 0, gate);
for (const z of [-6.6, 6.6]) rbox(0.6, 4.3, 0.6, 0.12, M.gate, GATE_X, 2.0, z, gate);
rbox(1.4, 1.6, 1.0, 0.15, M.dark, GATE_X + 1.4, 0.8, 7.6, gate);

// Saw gantry with three spinning circular blades
const sawGroup = new THREE.Group(); scene.add(sawGroup);
const sawMat = M.gate.clone(); // the gantry is repainted by the saw upgrade
const SAW_PAINT = [null, '#ff7a1a', '#2f7be0', '#8a3fe0', '#2a2c31'];
let sawGrade = 0;
for (const z of [-6.9, 6.9]) rbox(0.8, 7.8, 0.8, 0.15, sawMat, SAW_X, 3.9, z, sawGroup);
rbox(1.0, 0.9, 14.6, 0.2, sawMat, SAW_X, 7.8, 0, sawGroup);
const sawBar = new THREE.Group(); sawGroup.add(sawBar);
rbox(0.5, 0.5, 13.4, 0.12, M.dark, SAW_X, 0, 0, sawBar);
for (const s of [-1, 1]) rbox(1.0, 1.0, 1.0, 0.15, sawMat, SAW_X, 0.1, s * 6.8, sawBar);
const bladeShape = new THREE.Shape();
for (let i = 0; i < 64; i++) {
  const a0 = (i / 64) * Math.PI * 2, a1 = ((i + 0.6) / 64) * Math.PI * 2;
  bladeShape[i ? 'lineTo' : 'moveTo'](Math.cos(a0) * 1.62, Math.sin(a0) * 1.62);
  bladeShape.lineTo(Math.cos(a1) * 1.78, Math.sin(a1) * 1.78);
}
const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03).rotateY(Math.PI / 2);
const bladeMat = M.steel.clone();
const blades = LANE_Z.map((z) => {
  const b = mesh(bladeGeo, bladeMat, SAW_X, -1.6, z, sawBar);
  cyl(0.35, 0.3, 20, sawMat, SAW_X, -1.6, z, sawBar).rotation.z = Math.PI / 2;
  rbox(0.4, 1.6, 0.4, 0.08, M.dark, SAW_X, -0.8, z, sawBar);
  return b;
});
const BLADE_R = 1.78;
// glowing gold rim on the gantry beam from grade 4
const sawGlow = rbox(1.06, 0.12, 14.7, 0.04, new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0xffb000, emissiveIntensity: 2.4 }), SAW_X, 7.3, 0, sawGroup);
sawGlow.visible = false;
function paintSaw() {
  sawMat.color.set(SAW_PAINT[sawGrade] || cfg.look.gate);
  sawMat.metalness = sawGrade >= 4 ? 0.6 : 0.25; sawMat.roughness = sawGrade >= 4 ? 0.22 : 0.3;
}
function setSawGrade(n) {
  sawGrade = n; paintSaw(); sawGlow.visible = n >= 4;
  for (const b of blades) b.scale.setScalar(1 + n * 0.07);
}

// Splitter (gang saw): per lane a housing with lengthwise blades that run back and forth while a log passes
const splitGroup = new THREE.Group(); scene.add(splitGroup);
for (const z of [-6.9, 6.9]) rbox(0.8, 6.2, 0.8, 0.15, M.crane, SPLIT_X, 3.1, z, splitGroup);
rbox(1.2, 0.8, 14.6, 0.2, M.crane, SPLIT_X, 6.0, 0, splitGroup);
const splitBlades = LANE_Z.map((z) => {
  rbox(2.2, 0.9, 3.6, 0.15, M.crane, SPLIT_X, 4.1, z, splitGroup);      // hood
  for (const s of [-1, 1]) rbox(2.2, 2.2, 0.25, 0.08, M.dark, SPLIT_X, 2.6, z + s * 1.75, splitGroup); // cheeks
  const g = new THREE.Group(); g.position.set(SPLIT_X, 0, z); splitGroup.add(g);
  for (const dz of [-0.54, 0, 0.54]) box(1.9, 2.9, 0.035, bladeMat, 0, BELT_Y + 1.32, dz, g, false);        // vertical blades
  for (const dy of [-0.47, 0.47]) box(1.9, 0.035, 2.9, bladeMat, 0, BELT_Y + 1.32 + dy, 0, g, false);      // horizontal blades
  return g;
});

// Yard: concrete slab, bin with hazard stripes, money tiles
box(56, 0.3, 66, M.concrete, 28, -4.1, 3, scene, false);
{ // feeder belt in the bin floor (same chevrons as the conveyor), pushes logs towards the cranes
  const f = new THREE.Mesh(new THREE.PlaneGeometry(FEED_X1 - 0.4, BIN.z1 - BIN.z0 - 0.8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: feederTex, roughness: 0.5 }));
  f.position.set((FEED_X1 + 0.4) / 2, YARD_Y + 0.02, 0); f.receiveShadow = true; scene.add(f);
}
for (const [w, d, x, z] of [[BIN.x1, 0.7, BIN.x1 / 2, BIN.z0], [BIN.x1, 0.7, BIN.x1 / 2, BIN.z1], [0.7, BIN.z1 - BIN.z0 + 0.7, BIN.x1, 0]]) {
  rbox(w, 2.2, d, 0.12, binMat, x, YARD_Y + 1.1, z);
  box(w + 0.02, 0.45, d + 0.02, hazardMat, x, YARD_Y + 2.0, z, scene, false);
}
const moneyTex = A.canvasTex(512, 512, (g) => {
  g.fillStyle = '#23272a'; g.beginPath(); g.roundRect(10, 10, 492, 492, 60); g.fill();
  g.strokeStyle = '#59f05a'; g.lineWidth = 18; g.stroke();
  g.fillStyle = '#ffffff'; g.font = '900 190px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(GAME ? '$' : '200', 256, 210); // in the game the tiles are cash pads
  g.fillStyle = '#59f05a'; g.beginPath(); g.roundRect(110, 340, 292, 100, 26); g.fill();
  g.fillStyle = '#0f3a12'; g.font = '900 84px system-ui, Arial, sans-serif'; g.fillText('$', 256, 394);
});
const moneyMat = new THREE.MeshStandardMaterial({ map: moneyTex, roughness: 0.45 });
const moneyGlowTex = A.canvasTex(512, 512, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#59f05a'; g.beginPath(); g.roundRect(110, 340, 292, 100, 26); g.fill(); });
moneyMat.emissiveMap = moneyGlowTex; moneyMat.emissive = new THREE.Color(1, 1, 1); moneyMat.emissiveIntensity = 1.4;
const moneyTiles = [];
if (GAME) moneyTiles.push({ x: 32, z: 3, pulse: 0, size: 1.8 }); // the game has one cash pad to tap
else {
  for (const z of [-12.6, 12.6]) for (let x = 2; x <= 15; x += 3.3) moneyTiles.push({ x, z, pulse: 0 });
  for (let z = -24; z <= 30; z += 3.3) moneyTiles.push({ x: 31, z, pulse: 0 });
}
const moneyMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(2.7, 0.3, 2.7, 3, 0.1), [M.dark, M.dark, moneyMat, M.dark, M.dark, M.dark], moneyTiles.length);
moneyMesh.receiveShadow = true; scene.add(moneyMesh);
function syncMoney(dt) {
  moneyTiles.forEach((t, i) => {
    t.pulse = Math.max(0, t.pulse - dt * 2.5);
    const s = (t.size || 1) * (1 + 0.28 * Math.sin(t.pulse * Math.PI));
    _m.compose(_p.set(t.x, YARD_Y + 0.15 + t.pulse * 0.5, t.z), _q.identity(), _s.set(s, 1, s));
    moneyMesh.setMatrixAt(i, _m);
  });
  moneyMesh.instanceMatrix.needsUpdate = true;
}

// Roads
{
  const pts = [];
  for (let i = 0; i < PN; i += 8) pts.push([PX[i], PZ[i]]);
  roadRibbon(pts, 7.5, -3.92);
  roadRibbon([[BRIDGE_X, 160], [BRIDGE_X, RIVER_Z + 0.5]], 7, -3.92);
  roadRibbon([[RIVER_X0 - 6, -19], [300, -19]], 8, -3.92);
}

// Bridge: deck ends mid-river, pillars, railings
rbox(6.4, 0.7, 16.6, 0.1, M.concretePlain, BRIDGE_X, -4.35, 4);
for (const z of [0, 7]) cyl(0.7, 9, 20, M.concretePlain, BRIDGE_X, -8.8, z);
for (const s of [-1, 1]) {
  box(0.18, 0.18, 16.4, M.dark, BRIDGE_X + s * 3.0, -3.0, 4);
  for (let z = -3.8; z <= 12; z += 1.6) box(0.12, 1.0, 0.12, M.dark, BRIDGE_X + s * 3.0, -3.5, z);
}
const bridgeBlockers = []; // cones, the fence section and the sign: removed once the bridge is finished (game)
for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { // warning cones at the broken end
  const c = mesh(new THREE.ConeGeometry(0.28, 0.75, 16), M.gate, BRIDGE_X + s * (0.8 + k * 0.8), -3.62, DECK_END + 0.5);
  c.castShadow = true; bridgeBlockers.push(c);
}
// far bank: fence + CLOSED sign, street and town
const fenceX0 = RIVER_X0 + 4, fenceX1 = 300;
bridgeBlockers.push(
  box(fenceX1 - fenceX0, 0.15, 0.15, M.dark, (fenceX0 + fenceX1) / 2, -2.2, -13.0),
  box(fenceX1 - fenceX0, 0.15, 0.15, M.dark, (fenceX0 + fenceX1) / 2, -3.5, -13.0));
{
  const n = Math.ceil((fenceX1 - fenceX0) / 0.6);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1.6, 0.05), M.dark, n);
  for (let i = 0; i < n; i++) { _m.compose(_p.set(fenceX0 + i * 0.6, -2.85, -13), _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (i % 2 ? 1 : -1) * 0.5), _s.set(1, 1, 1)); bars.setMatrixAt(i, _m); }
  bars.castShadow = true; scene.add(bars); bridgeBlockers.push(bars);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 2.2, 0.22), M.dark, Math.ceil(n / 5));
  for (let i = 0; i < posts.count; i++) { _m.makeTranslation(fenceX0 + i * 3, -2.9, -13); posts.setMatrixAt(i, _m); }
  posts.castShadow = true; scene.add(posts); bridgeBlockers.push(posts);
}
const closedTex = A.canvasTex(1024, 256, (g) => {
  g.fillStyle = '#3b3f45'; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = '#d9dde2'; g.lineWidth = 14; g.strokeRect(14, 14, 996, 228);
  g.fillStyle = '#ffffff'; g.font = '900 170px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('CLOSED', 512, 136);
});
const sign = new THREE.Mesh(new RoundedBoxGeometry(7, 1.7, 0.2, 2, 0.05), [M.dark, M.dark, M.dark, M.dark, new THREE.MeshStandardMaterial({ map: closedTex, roughness: 0.5 }), M.dark]);
sign.position.set(BRIDGE_X, -1.6, -12.8); sign.castShadow = true; scene.add(sign); bridgeBlockers.push(sign);
box(150, 0.3, 50, M.concrete, 225, -4.1, -38, scene, false);
const facade = A.makeFacadeTexture();
{
  const rng = mulberry32(21), PAL = ['#f2e3c6', '#cfe0e8', '#f3c9b1', '#e6e6e6', '#d9e7c7', '#f7d98b', '#c9d3ea'];
  for (const [zc, maxD] of [[-30, 12], [-50, 14]]) {
    let x = RIVER_X0 + 6;
    while (x < 295) {
      const w = 9 + rng() * 9;
      if (zc === -30 && Math.abs(x + w / 2 - BRIDGE_X) < 12) { x += 6; continue; }
      const r = rng(), type = r < 0.3 ? 'house' : r < 0.55 ? 'shop' : r < 0.75 ? 'warehouse' : 'office';
      const h = type === 'house' ? 6 + rng() * 3 : type === 'office' ? 12 + rng() * 16 : type === 'warehouse' ? 7 + rng() * 3 : 6 + rng() * 5;
      const d = 8 + rng() * (maxD - 8);
      const b = A.makeBuilding(type, w, d, h, PAL[Math.floor(rng() * PAL.length)], facade, rng);
      b.position.set(x + w / 2, -4, zc); scene.add(b);
      x += w + 2 + rng() * 3;
    }
  }
  // street lamps
  const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 5, 8), M.dark, 16), heads = new THREE.InstancedMesh(new RoundedBoxGeometry(0.9, 0.2, 0.4, 2, 0.05), M.lamp, 16);
  // shifted so no lamp stands on the road off the bridge (x ≈ BRIDGE_X)
  for (let i = 0; i < 16; i++) { const x = RIVER_X0 + 12.5 + i * 9; _m.makeTranslation(x, -1.5, -15.5); lamps.setMatrixAt(i, _m); _m.makeTranslation(x + 0.3, 1.0, -15.5); heads.setMatrixAt(i, _m); }
  lamps.castShadow = true; scene.add(lamps, heads);
}
// industrial buildings near the mill
for (const [type, w, d, h, x, y, z, col] of [
  ['warehouse', 24, 16, 9, -40, 0, -24, '#c8ccd2'], ['warehouse', 18, 14, 8, -70, 0, 22, '#d8b98a'], ['office', 12, 10, 10, 47, -4, -20, '#e6e6e6'],
  ['warehouse', 20, 14, 8, 46, -4, 28, '#b8c7d6'], ['house', 10, 9, 7, -100, 0, -30, '#f2e3c6']]) {
  const b = A.makeBuilding(type, w, d, h, col, facade, mulberry32(x * 7 + z));
  b.position.set(x, y, z); scene.add(b);
}

// Static geometry is merged per material and per 120 m cell: hundreds of small meshes become
// a few dozen draw calls, and the cells are still culled by the camera and the shadow map.
function mergeStatic(keep) {
  scene.updateMatrixWorld(true);
  const groups = new Map(), merged = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.isShaderMaterial) return;
    for (let p = o; p; p = p.parent) if (keep.has(p)) return;
    _v.setFromMatrixPosition(o.matrixWorld);
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${Math.floor(_v.x / 120)}|${Math.floor(_v.z / 120)}`;
    if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] });
    groups.get(key).list.push(o);
  });
  for (const g of groups.values()) {
    if (g.list.length < 2) continue;
    const geos = g.list.map((o) => {
      const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', src.attributes.position);
      if (!src.attributes.normal) src.computeVertexNormals();
      out.setAttribute('normal', src.attributes.normal);
      out.setAttribute('uv', src.attributes.uv ?? new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
      if (g.mat.vertexColors && src.attributes.color) out.setAttribute('color', src.attributes.color);
      return out.applyMatrix4(o.matrixWorld);
    });
    const geo = mergeGeometries(geos);
    if (!geo) continue;
    for (const o of g.list) o.removeFromParent();
    const m = new THREE.Mesh(geo, g.mat); m.castShadow = g.cast; m.receiveShadow = g.recv;
    scene.add(m); merged.push(m);
  }
  return merged.length;
}
mergeStatic(new Set([sawBar, sky, ...gateNets, ...bridgeBlockers, ...splitBlades]));

// Missing bridge spans (game): they drop into place one by one, the last one reaches the far bank
const SPAN_N = 3, SPAN_Z0 = -4.3, SPAN_LEN = 2.95;
const spanZ = (k) => SPAN_Z0 - SPAN_LEN * (k + 0.5);
const spans = [];
for (let k = 0; k < SPAN_N; k++) {
  const g = new THREE.Group(); g.position.set(BRIDGE_X, 0, spanZ(k)); g.visible = false; scene.add(g);
  rbox(6.4, 0.7, SPAN_LEN + 0.02, 0.1, M.concretePlain, 0, -4.35, 0, g);
  for (const s of [-1, 1]) {
    box(0.18, 0.18, SPAN_LEN, M.dark, s * 3.0, -3.0, 0, g);
    box(0.12, 1.0, 0.12, M.dark, s * 3.0, -3.5, 0, g);
  }
  if (k === 1) cyl(0.7, 9, 20, M.concretePlain, 0, -8.8, 0, g);
  spans.push({ g, built: false, anim: 0 });
}
const bridgeState = { built: 0 };
function addSpanCollider(k) { world.createCollider(RAPIER.ColliderDesc.cuboid(3.2, 0.35, SPAN_LEN / 2).setTranslation(BRIDGE_X, -4.35, spanZ(k)).setFriction(0.8)); }
function setBridgeBuilt(n, animate = false) {
  bridgeState.built = n;
  spans.forEach((sp, k) => {
    const on = k < n;
    if (on && !sp.built) { addSpanCollider(k); if (animate) { sp.anim = 1; sfx('bridge', 'box_crash', { vol: 0.6, delay: 0.45 }); } }
    sp.built = on; sp.g.visible = on;
  });
  for (const o of bridgeBlockers) o.visible = n < SPAN_N;
}
function updateSpans(dt) { // a new span falls from above and bounces into place
  for (const sp of spans) {
    if (!sp.anim) continue;
    sp.anim = Math.max(0, sp.anim - dt * 1.6);
    const t = 1 - sp.anim;
    sp.g.position.y = (1 - easeOutBounce(t)) * 9;
    if (sp.anim === 0) emitSplash(BRIDGE_X + rand(-2, 2), sp.g.position.z, 0.5);
  }
}

// River water (flowing shader)
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uFlow: { value: 2.6 }, uWater: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float uTime, uFlow; uniform vec3 uWater, uDeep, uFoam; varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=.5; } return v; }
    void main(){
      vec2 p = vW.xz * vec2(0.22, 0.6) - vec2(uTime * uFlow * 0.22, 0.);
      float q = fbm(p + fbm(p * 1.9 + vec2(0., uTime * 0.35)));
      float foam = smoothstep(0.6, 0.66, q) * (1. - smoothstep(0.7, 0.8, q) * 0.5);
      float edge = smoothstep(${(RIVER_Z - 2.5).toFixed(1)}, ${RIVER_Z.toFixed(1)}, abs(vW.z));
      vec3 c = mix(uDeep, uWater, smoothstep(0.25, 0.65, q));
      c = mix(c, uFoam, max(foam * 0.9, edge * 0.6));
      float d = length(vW - cameraPosition);
      c = mix(c, uFoam * 0.9, smoothstep(250., 1200., d));
      gl_FragColor = vec4(c, 1.);
    }`,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_X1 - RIVER_X0, RIVER_Z * 2, 1, 1).rotateX(-Math.PI / 2), waterMat);
water.position.set((RIVER_X0 + RIVER_X1) / 2, WATER_Y, 0); scene.add(water);

// Vegetation, rocks, mountains
const vegMeshes = [], vegCells = [];
function blocked(x, z) {
  if (x < 0) { if (Math.abs(z) < 11) return true; if (x > -24 && Math.abs(z) < 16) return true; if (x > -55 && x < -24 && z > -34 && z < -14) return true; if (x > -82 && x < -58 && z > 13 && z < 31) return true; return x > -6; }
  if (x < 6) return true;
  if (x < 60 && z > -34 && z < 40) return true;
  if (nearRoad(x, z, 7)) return true;
  if (x > RIVER_X0 - 8 && Math.abs(z) < RIVER_Z + 4) return true;
  if (x > RIVER_X0 - 4 && x < 302 && z < -10 && z > -66) return true;
  if (Math.abs(x - BRIDGE_X) < 7 && z > 8 && z < 170) return true;
  if (x > BRIDGE_X - 4 && x < BRIDGE_X + 40 && z > 8 && z < 75) return true; // keep the bridge camera clear
  return false;
}
function buildVegetation() {
  for (const m of vegMeshes) { scene.remove(m); m.geometry.dispose(); }
  vegMeshes.length = 0; vegCells.length = 0;
  const L = cfg.look;
  // lo = what a cell switches to beyond lodDistance (bushes simply disappear)
  const pineLo = A.makePine(L.tree, false, 1), roundLo = A.makeRoundTree(L.roundTree, false, 2);
  const kinds = [
    { geo: A.makePine(L.tree, true, 1), lo: pineLo, mat: M.pine, w: 0.38 }, { geo: A.makePine(L.tree, true, 5), lo: pineLo, mat: M.pine, w: 0.22 },
    { geo: A.makeRoundTree(L.roundTree, true, 2), lo: roundLo, mat: M.leafy, w: 0.18 }, { geo: A.makeRoundTree(L.birch, true, 3, true), lo: A.makeRoundTree(L.birch, false, 3, true), mat: M.leafy, w: 0.1 },
    { geo: A.makeBush(L.roundTree, 4), lo: null, mat: M.leafy, w: 0.12 },
  ];
  const far = [{ geo: A.makePine(L.tree, false), mat: M.pine, w: 0.65 }, { geo: A.makeRoundTree(L.roundTree, false, 6), mat: M.leafy, w: 0.35 }];
  // instances are split into a grid of cells so the camera and the shadow map only draw nearby cells
  const place = (list, n, rng, region, shadow, cell) => {
    const buckets = new Map();
    for (let tries = 0, k = 0; k < n && tries < n * 30; tries++) {
      const [x, z] = region(rng);
      if (blocked(x, z)) continue;
      let r = rng(), t = 0; while (t < list.length - 1 && r > list[t].w) { r -= list[t].w; t++; }
      const key = `${t}:${Math.floor(x / cell)}:${Math.floor(z / cell)}`;
      if (!buckets.has(key)) buckets.set(key, { t, items: [] });
      buckets.get(key).items.push([x, x < 0 ? 0 : -4, z, 0.8 + rng() * 0.75, rng() * 6.28, 0.82 + rng() * 0.3]);
      k++;
    }
    for (const { t, items } of buckets.values()) {
      const kd = list[t];
      const [hi, lo] = [kd.geo, kd.lo].map((geo) => {
        if (!geo) return null;
        const im = new THREE.InstancedMesh(geo, kd.mat, items.length);
        items.forEach(([x, y, z, s, r, b], j) => {
          _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, r), _s.set(s, s * (0.9 + hash3(j, t, 1) * 0.3), s));
          im.setMatrixAt(j, _m); im.setColorAt(j, _c.setScalar(b));
        });
        im.computeBoundingSphere();
        im.castShadow = shadow; im.receiveShadow = shadow;
        scene.add(im); vegMeshes.push(im);
        return im;
      });
      if (kd.lo !== undefined) vegCells.push({ hi, lo, c: hi.boundingSphere.center, r: hi.boundingSphere.radius });
    }
  };
  place(kinds, cfg.world.trees, mulberry32(7), (r) => [-180 + r() * 500, -150 + r() * 330], true, 70);
  place(far, cfg.world.farTrees, mulberry32(8), (r) => {
    const a = r() * Math.PI * 2, d = 170 + r() * 520;
    return [80 + Math.cos(a) * d * 1.3, Math.sin(a) * d];
  }, false, 200);
}
// near cells draw the detailed trees, far ones the simple version (nothing for bushes)
function updateVegLod() {
  const far = cfg.world.lodDistance;
  for (const v of vegCells) {
    const d = Math.hypot(v.c.x - camera.position.x, v.c.z - camera.position.z) - v.r * 0.5;
    v.hi.visible = d < far;
    if (v.lo) v.lo.visible = d >= far;
    // only trees around the action cast shadows; far ones are lost in the distance anyway
    const cast = Math.hypot(v.c.x - camTarget.x, v.c.z - camTarget.z) - v.r < 60;
    v.hi.castShadow = cast; if (v.lo) v.lo.castShadow = cast;
  }
}
const rockMeshes = [];
{
  const rng = mulberry32(3), r = (a, b) => a + rng() * (b - a), list = [];
  for (let z = -160; z <= 160; z += 2.6) {
    if (Math.abs(z) < 7.6) continue;
    list.push([r(-4, 2.5), r(-3.4, -0.6), z, r(2.2, 4.4), r(2.6, 5.4), r(2.2, 4.4)]);
  }
  for (let x = -20; x <= -1; x += 2.1) for (const s of [-1, 1]) list.push([x, r(0, 1.2), s * r(8.4, 10.8), r(1.6, 3.2), r(2.0, 3.8), r(1.6, 3.2)]);
  for (let i = 0; i < 160; i++) {
    const x = r(-300, 600), z = r(-300, 300);
    if (blocked(x, z)) continue;
    list.push([x, x < 0 ? 0 : -4, z, r(0.5, 1.8), r(0.4, 1.3), r(0.5, 1.8)]);
  }
  for (let k = 0; k < 4; k++) {
    const mine = list.filter((_, i) => i % 4 === k);
    const im = new THREE.InstancedMesh(A.makeRock(k * 11 + 1, '#6f9a3a'), M.rock, mine.length);
    mine.forEach(([x, y, z, sx, sy, sz], i) => {
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, hash3(i, k, 4) * 6.28, 0)), _s.set(sx, sy, sz));
      im.setMatrixAt(i, _m); im.setColorAt(i, _c.setScalar(0.85 + hash3(i, 9, k) * 0.3));
    });
    im.castShadow = true; im.receiveShadow = true; scene.add(im); rockMeshes.push(im);
  }
}
const mountains = [];
function buildMountains() {
  for (const m of mountains) { scene.remove(m); m.geometry.dispose(); }
  mountains.length = 0;
  const rng = mulberry32(99);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng() * 0.3, d = 1300 + rng() * 500;
    const g = A.makeMountain(900 + rng() * 500, 260 + rng() * 260, i * 3.1, cfg.look);
    const m = new THREE.Mesh(g, M.mountain); m.position.set(80 + Math.cos(a) * d, -4, Math.sin(a) * d); m.rotation.y = rng() * 6;
    scene.add(m); mountains.push(m);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng(), d = 720 + rng() * 260;
    const g = A.makeMountain(500 + rng() * 300, 70 + rng() * 70, 50 + i, cfg.look, false);
    const m = new THREE.Mesh(g, M.mountain); m.position.set(80 + Math.cos(a) * d * 1.2, -4, Math.sin(a) * d); scene.add(m); mountains.push(m);
  }
}

// ───────────────────────── physics world ─────────────────────────
let world;
function createWorld() {
  if (world) world.free();
  world = new RAPIER.World({ x: 0, y: cfg.physics.gravity, z: 0 });
  world.timestep = 1 / 60;
  // more solver iterations: heavy trucks stacking in the river stay apart instead of sinking into each other
  if (world.integrationParameters) world.integrationParameters.numSolverIterations = 8;
  if ('numSolverIterations' in world) world.numSolverIterations = 8;
  const fixed = (hx, hy, hz, x, y, z, fr = 0.8) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr));
  fixed(80, 2, 90, -80, -2, 0);
  fixed(6, BELT_Y / 2, 6.6, -6, BELT_Y / 2, 0, 0.25);
  fixed(6.5, 2, 0.3, -6, 2, 7.0); fixed(6.5, 2, 0.3, -6, 2, -7.0);
  fixed(150, 0.5, 200, 0, -4.5, 0);
  for (const [w, d, x, z] of [[BIN.x1, 0.7, BIN.x1 / 2, BIN.z0], [BIN.x1, 0.7, BIN.x1 / 2, BIN.z1], [0.7, BIN.z1 - BIN.z0 + 0.7, BIN.x1, 0]])
    fixed(w / 2, 1.1, d / 2, x, YARD_Y + 1.1, z);
  fixed(75, 5, 39, 225, -9, 51); fixed(75, 5, 39, 225, -9, -51);
  fixed(75, 1, RIVER_Z, 225, -14, 0);
  fixed(3.2, 0.35, 8.3, BRIDGE_X, -4.35, 4);
  for (const z of [0, 7]) fixed(0.7, 4.5, 0.7, BRIDGE_X, -8.8, z);
  for (let k = 0; k < bridgeState.built; k++) addSpanCollider(k);
}

// Log pool: instanced half-logs backed by Rapier capsules. Old bodies freeze, oldest get recycled.
class LogPool {
  constructor(cap, geo, len, region) {
    this.len = len;
    this.mesh = new THREE.InstancedMesh(geo, LOG_MATS, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.boundingSphere = region; // the pool only lives in its area, so the whole batch is culled when off-screen
    this.cap = cap;
    scene.add(this.mesh);
    this.clear();
  }
  removeAll() { for (const it of this.items) world.removeRigidBody(it.body); this.clear(); }
  clear() {
    this.items = []; this.free = []; this.dynamicCount = 0;
    for (let i = this.cap - 1; i >= 0; i--) { this.free.push(i); this.mesh.setMatrixAt(i, ZERO_M); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  spawn(p, q, v, w, color, { fixed = false, maxDynamic = Infinity, limit = this.cap } = {}) {
    while (this.items.length >= limit || !this.free.length) this.remove(this.buried());
    const idx = this.free.pop();
    const desc = (fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(p.x, p.y, p.z).setRotation(q);
    if (!fixed) desc.setLinvel(v.x, v.y, v.z).setAngvel(w).setCanSleep(true);
    const body = world.createRigidBody(desc);
    world.createCollider(RAPIER.ColliderDesc.capsule(this.len / 2 - LOG_R, LOG_R).setDensity(0.6)
      .setFriction(cfg.physics.friction).setRestitution(cfg.physics.restitution), body);
    const it = { idx, body, frozen: fixed, prevY: p.y, color: color.clone(), age: 0, y: p.y };
    this.items.push(it);
    this.mesh.setColorAt(idx, color); this.mesh.instanceColor.needsUpdate = true;
    _m.compose(_p.copy(p), _q.copy(q), _s.set(1, 1, 1));
    this.mesh.setMatrixAt(idx, _m); this.mesh.instanceMatrix.needsUpdate = true;
    if (!fixed) { this.dynamicCount++; while (this.dynamicCount > maxDynamic && this.freezeOldest()); }
    return it;
  }
  // when the pool is full, the log removed is the lowest settled one: it is buried in the pile, nobody sees it go
  buried() {
    let best = null; // it.y is cached when a log freezes (fixed bodies don't move)
    for (const it of this.items) if (it.frozen && (!best || it.y < best.y)) best = it;
    return best || this.items[0];
  }
  freeze(it) { it.body.setBodyType(RAPIER.RigidBodyType.Fixed, false); it.frozen = true; it.y = it.body.translation().y; this.dynamicCount--; }
  // too many falling logs: freeze the oldest one that is well inside the bin (away from where new logs land)
  freezeOldest() {
    for (const it of this.items) {
      if (it.frozen || (this.canFreeze && !this.canFreeze(it.body.translation()))) continue;
      const v = it.body.linvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z < 1) { this.freeze(it); return true; } // never freeze a log in mid-air
    }
    return false;
  }
  // Logs that came to rest in the bin turn into fixed bodies, so only moving ones cost physics time.
  // On the feeder belt a log keeps moving towards the cranes; it settles there only if it got stuck for a while.
  // Above heapLimit a resting log is nudged further down the heap. A log is never frozen while it is still flying.
  settle(dt) {
    const P = cfg.physics;
    for (const it of [...this.items]) {
      if (it.frozen) continue;
      it.age += dt;
      const p = it.body.translation();
      if (p.y < -20 || it.age > P.settleMax * 3 || (it.age > 6 && p.x < 0.6)) { this.remove(it); continue; } // fell off or got stuck
      if (p.x < 0.6) continue;
      const v = it.body.linvel(), v2 = v.x * v.x + v.y * v.y + v.z * v.z;
      const slow = it.body.isSleeping() || (it.age > P.settleTime && v2 < 0.2);
      if (p.x < FEED_X1 && !(slow && it.age > 3)) continue; // stuck behind the heap for 3 s: it settles where it is
      const high = p.y > this.heapLimit(p.x);
      if (slow && high && it.age < P.settleMax && p.x < BIN.x1 - 2) { it.body.setLinvel({ x: rand(2, 3.5), y: 1, z: rand(-1.5, 1.5) }, true); continue; }
      if (slow || (it.age > P.settleMax && v2 < 1)) this.freeze(it);
    }
  }
  freezeAll() { for (const it of this.items) if (!it.frozen) this.freeze(it); }
  // wake settled logs around a point (moved to the end of the list so they aren't the first to be force-frozen)
  wake(x, y, z, r) {
    for (const it of [...this.items]) {
      if (!it.frozen || it.y < y) continue;
      const p = it.body.translation();
      if (Math.abs(p.x - x) > r || Math.abs(p.z - z) > r) continue;
      it.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); it.frozen = false; it.age = 0; this.dynamicCount++;
      this.items.splice(this.items.indexOf(it), 1); this.items.push(it);
    }
  }
  remove(it) {
    world.removeRigidBody(it.body);
    if (!it.frozen) this.dynamicCount--;
    this.mesh.setMatrixAt(it.idx, ZERO_M); this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(it.idx);
    this.items.splice(this.items.indexOf(it), 1);
  }
  sync() {
    let hi = -1;
    for (const it of this.items) {
      if (it.idx > hi) hi = it.idx;
      if (it.frozen || it.body.isSleeping()) continue;
      const t = it.body.translation(), r = it.body.rotation();
      _m.compose(_p.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _s.set(1, 1, 1));
      this.mesh.setMatrixAt(it.idx, _m);
    }
    this.mesh.count = hi + 1;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Plain instanced log batch rebuilt every frame (bundles on the belt, truck cargo, crane load)
class LogBatch {
  constructor(cap, geo, mats = LOG_MATS) {
    this.mesh = new THREE.InstancedMesh(geo, mats, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; // callers cull per instance
    this.n = 0; scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(matrix, color) { if (this.n >= this.mesh.instanceMatrix.count) return; this.mesh.setMatrixAt(this.n, matrix); this.mesh.setColorAt(this.n, color); this.n++; }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}

// Per-instance culling for the batches rebuilt every frame (raw logs, bundles, trucks, cargo).
// The margin keeps objects just outside the frame, so their shadows still land in it.
const viewFrustum = new THREE.Frustum(), _sph = new THREE.Sphere();
function updateViewFrustum() {
  camera.updateMatrixWorld();
  viewFrustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
const inView = (x, y, z, r) => viewFrustum.intersectsSphere(_sph.set(_sph.center.set(x, y, z), r + 5));
const farSq = () => cfg.world.lodDistance * cfg.world.lodDistance;
const camDistSq = (x, z) => (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2;

// ───────────────────────── particle FX ─────────────────────────
class PointFX {
  constructor(cap, additive) {
    this.cap = cap; this.n = 0;
    const F = (k) => new Float32Array(cap * k);
    Object.assign(this, { pos: F(3), vel: F(3), col: F(3), size: F(1), alpha: F(1), life: F(1), max: F(1), floor: F(1), drag: F(1), grav: F(1) });
    const g = new THREE.BufferGeometry();
    for (const [name, arr, k] of [['position', this.pos, 3], ['color', this.col, 3], ['aSize', this.size, 1], ['aAlpha', this.alpha, 1]])
      g.setAttribute(name, new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uGlow: { value: 1 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.);
          gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uGlow; varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
          float a = smoothstep(.5, .1, d); gl_FragColor = vec4(vC * uGlow, a * vA); }`,
      vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, color, size, life, floor = -100, drag = 0.5, grav = 1) {
    const i = this.n < this.cap ? this.n++ : Math.floor(Math.random() * this.cap);
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size; this.life[i] = this.max[i] = life; this.floor[i] = floor; this.drag[i] = drag; this.grav[i] = grav; this.alpha[i] = 1;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [arr, k] of [[this.pos, 3], [this.vel, 3], [this.col, 3], [this.size, 1], [this.alpha, 1], [this.life, 1], [this.max, 1], [this.floor, 1], [this.drag, 1], [this.grav, 1]])
      arr.copyWithin(i * k, j * k, j * k + k);
  }
  clear() { this.n = 0; }
  update(dt, g) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); i--; continue; }
      const o = i * 3, v = this.vel, p = this.pos, dr = 1 - this.drag[i] * dt;
      v[o + 1] += g * this.grav[i] * dt;
      v[o] *= dr; v[o + 1] *= dr; v[o + 2] *= dr;
      p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt;
      if (p[o + 1] < this.floor[i]) { p[o + 1] = this.floor[i]; v[o + 1] *= -0.35; v[o] *= 0.6; v[o + 2] *= 0.6; }
      this.alpha[i] = Math.min(1, (this.life[i] / this.max[i]) * 2.5);
    }
    for (const name of ['position', 'color', 'aSize', 'aAlpha']) this.geo.attributes[name].needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}

// Wood chips: splinters, flakes and bark curls (one instanced mesh per shape), simple CPU physics.
// mix = weights of [splinter, flake, curl]
const CHIP_BARK = [0.15, 0.35, 0.5], CHIP_SAW = [0.55, 0.45, 0];
class Debris {
  constructor(cap) {
    this.cap = cap; this.list = [];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    this.meshes = A.makeChipGeos().map((g) => {
      const m = new THREE.InstancedMesh(g, mat, cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true; m.count = 0;
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(-24, 1, 0), 32); // gate .. saw
      scene.add(m); return m;
    });
  }
  emit(p, v, color, scale, life, floor, mix = CHIP_SAW) {
    if (this.list.length >= this.cap) this.list.shift();
    let r = Math.random(), kind = 0; while (kind < 2 && r > mix[kind]) { r -= mix[kind]; kind++; }
    const len = kind === 0 ? rand(0.6, 1.4) : rand(0.7, 1.2);
    this.list.push({ p: p.clone(), v: v.clone(), r: new THREE.Vector3(rand(0, 6), rand(0, 6), rand(0, 6)), kind,
      w: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)), sc: new THREE.Vector3(len, rand(0.7, 1.3), rand(0.6, 1.2)),
      color: color.clone().multiplyScalar(rand(0.8, 1.15)), s: scale, life, max: life, floor, rest: false });
  }
  clear() { this.list = []; for (const m of this.meshes) m.count = 0; }
  update(dt, g) {
    this.list = this.list.filter((d) => (d.life -= dt) > 0);
    for (const m of this.meshes) m.count = 0;
    for (const d of this.list) {
      if (!d.rest) {
        d.v.y += g * dt;
        const air = 1 - Math.min(1, 1.2 * dt); // light chips flutter: air drag + wobble
        d.v.x *= air; d.v.z *= air;
        d.p.addScaledVector(d.v, dt);
        d.r.addScaledVector(d.w, dt);
        if (d.p.y < d.floor) {
          d.p.y = d.floor; d.v.y *= -0.25; d.v.x *= 0.4; d.v.z *= 0.4; d.w.multiplyScalar(0.4);
          if (Math.abs(d.v.y) < 0.6) { d.rest = true; d.r.x = d.kind === 2 ? 0 : Math.round(d.r.x / Math.PI) * Math.PI; d.r.z = Math.round(d.r.z / Math.PI) * Math.PI; }
        }
      }
      const s = d.s * Math.min(1, d.life / (d.max * 0.25));
      const m = this.meshes[d.kind], i = m.count++;
      _m.compose(d.p, _q.setFromEuler(_e.set(d.r.x, d.r.y, d.r.z)), _s.copy(d.sc).multiplyScalar(s));
      m.setMatrixAt(i, _m); m.setColorAt(i, d.color);
    }
    for (const m of this.meshes) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
}

// Upgrade celebration: a burst of coloured glitter and sparks with an expanding ring
const CONFETTI = ['#ffd23a', '#ff5d8f', '#59f05a', '#4fc3ff', '#ffffff', '#ff9a3d'].map((c) => new THREE.Color(c));
const rings = [];
for (let i = 0; i < 6; i++) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 64).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false; m.userData.t = 1; scene.add(m); rings.push(m);
}
const flashes = new Map(); // material → { base emissive, colour, t }
function celebrate(x, y, z, size = 1) {
  for (let i = 0; i < 160 * size; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(2, 9) * Math.sqrt(size), c = CONFETTI[i % CONFETTI.length];
    glitter.emit(x + rand(-0.5, 0.5) * size, y + rand(0, 1), z + rand(-0.5, 0.5) * size, Math.cos(a) * sp, rand(5, 13) * Math.sqrt(size), Math.sin(a) * sp,
      c, rand(0.18, 0.4), rand(1, 1.8), YARD_Y - 1, 1.1, 0.7);
  }
  for (let i = 0; i < 50 * size; i++) sparks.emit(x, y + 0.5, z, rand(-6, 6), rand(4, 12), rand(-6, 6), _c.set(cfg.particles.sparkColor), rand(0.1, 0.22), rand(0.4, 0.9), YARD_Y - 1, 0.8, 1);
  for (let k = 0; k < 2; k++) {
    const r = rings.find((q) => !q.visible) || rings[0];
    r.visible = true; r.userData.t = -k * 0.15; r.userData.size = size * (k ? 1.4 : 1); r.position.set(x, y + 0.3, z);
  }
  sfx('coins', 'upgrade', { vol: 0.7, rate: rand(1, 1.15) });
}
function flashMaterial(mat, color = '#ffffff', strength = 1.2) {
  if (!flashes.has(mat)) flashes.set(mat, { base: mat.emissive.clone(), baseI: mat.emissiveIntensity, color: new THREE.Color(), t: 0 });
  const f = flashes.get(mat); f.color.set(color); f.t = 1; f.strength = strength;
}
function updateCelebrations(dt) {
  for (const r of rings) {
    if (!r.visible) continue;
    r.userData.t += dt / 0.9;
    const t = clamp(r.userData.t, 0, 1);
    r.scale.setScalar(0.5 + t * 7 * r.userData.size); r.material.opacity = (1 - t) * (r.userData.t > 0 ? 1 : 0);
    if (r.userData.t >= 1) r.visible = false;
  }
  for (const [mat, f] of flashes) {
    f.t = Math.max(0, f.t - dt / 1.2);
    mat.emissive.copy(f.base).lerp(f.color, f.t); mat.emissiveIntensity = lerp(f.baseI, f.strength, f.t);
    if (!f.t) flashes.delete(mat);
  }
}

// "+$200" popups
const popTex = A.canvasTex(512, 192, (g) => {
  g.font = '900 140px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 22; g.strokeStyle = '#0d3010'; g.strokeText('+$200', 256, 100);
  g.fillStyle = '#7dff6a'; g.fillText('+$200', 256, 100);
});
const popups = [];
for (let i = 0; i < 20; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: popTex, transparent: true, depthWrite: false }));
  sp.material.color.setScalar(1.6); sp.scale.set(3.6, 1.35, 1); sp.visible = false; scene.add(sp);
  popups.push({ sp, t: 0 });
}
function popMoney(at) {
  if (hooks.popMoney) return hooks.popMoney(at);
  const tile = at ? moneyTiles.reduce((b, t) => (Math.hypot(t.x - at.x, t.z - at.z) < Math.hypot(b.x - at.x, b.z - at.z) ? t : b)) : moneyTiles[Math.floor(Math.random() * moneyTiles.length)];
  tile.pulse = 1;
  const p = popups.find((q) => !q.sp.visible) || popups[0];
  p.t = 0; p.sp.visible = true; p.sp.position.set(at ? at.x : tile.x, (at ? at.y : YARD_Y) + 1.5, at ? at.z : tile.z);
  sfx('coins', 'coins', { vol: 0.4, dur: 0.9, throttle: 0.4 });
  sfx('coins', 'popup', { vol: 0.5, rate: rand(0.95, 1.2), throttle: 0.1 });
}
function updatePopups(dt) {
  for (const p of popups) {
    if (!p.sp.visible) continue;
    p.t += dt; p.sp.position.y += dt * 3;
    p.sp.material.opacity = 1 - clamp((p.t - 0.7) / 0.6, 0, 1);
    if (p.t > 1.3) p.sp.visible = false;
  }
}

// ───────────────────────── wood / truck assets ─────────────────────────
const SLOTS = A.cargoSlots(HALF, LOG_R);
let rawGeos = [], rawMats = [], cleanMats = [], decorGeos = [], truckGeo, truckGeoLo;
const DECOR = ['plates', 'moss', 'mushrooms'];
// One wood set (materials + decor) per palette. Sets made by preloadWood are kept, so switching species is instant.
const woodSets = new Map();
function makeWoodSet(woods) {
  const rawMats = woods.map((w, i) => {
    const t = A.makeRawBarkTextures(w, 40 + i * 3);
    const bark = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95 });
    const cap = new THREE.MeshStandardMaterial({ map: A.makeCapTexture(w), roughness: 0.8 });
    for (const m of [bark, cap]) { m.clippingPlanes = DEBARK_CLIP; m.clipShadows = true; }
    return [bark, cap, cap];
  });
  // debarked log: same shape, clean wood, visible only between the debarker and the splitter
  const cleanMats = woods.map((w, i) => {
    const side = Object.assign(logSideMat.clone(), { clippingPlanes: CLEAN_CLIP, clipShadows: true });
    side.color.set(w.wood).multiplyScalar(1.05);
    const cap = Object.assign(rawMats[i][1].clone(), { clippingPlanes: CLEAN_CLIP, clipShadows: true });
    return [side, cap, cap];
  });
  const decorGeos = woods.map((w, i) => A.makeLogDecor(DECOR[i], RAW_R, LOG_LEN, 11 + i * 5, w));
  return { rawMats, cleanMats, decorGeos };
}
function useWoodSet(set) { ({ rawMats, cleanMats, decorGeos } = set); }
function buildWoodAssets() {
  if (!rawGeos.length) rawGeos = cfg.wood.map((w, i) => A.makeRawLogGeo(RAW_R, LOG_LEN, i * 7.3 + 1)); // shape doesn't depend on colours
  if (![...woodSets.values()].some((s) => s.decorGeos === decorGeos)) decorGeos.forEach((g) => g.dispose());
  useWoodSet(makeWoodSet(cfg.wood));
}
// build a palette ahead of time (textures uploaded to the GPU too), so setWoodPalette(key) later doesn't stall
function preloadWood(key, woods) {
  if (woodSets.has(key)) return;
  const set = makeWoodSet(woods);
  for (const mats of [...set.rawMats, ...set.cleanMats]) for (const m of mats) for (const t of [m.map, m.normalMap]) if (t) renderer.initTexture(t);
  woodSets.set(key, set);
}
const decorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
function buildTruckGeo() { truckGeo?.dispose(); truckGeoLo?.dispose(); truckGeo = A.makeTruckGeo(cfg.look); truckGeoLo = A.makeTruckGeo(cfg.look, true); }

// ───────────────────────── systems ─────────────────────────
const state = { t: 0, playing: true, shotIdx: -1, recording: false, acc: 0, fps: 60 };
let yardPool, riverPool, loadPool, sparks, glitter, splash, debris, bundleBatch, cargoBatch, cargoBatchLo, carryBatch;

// Production line: raw log → gate (debark) → bundle → saw (cut in halves) → physics logs
const production = {
  lanes: LANE_Z.map((z, i) => ({ z, i, items: [] })),
  // raw logs of a lane are one instanced batch; only those near the frame are drawn
  initBatches() {
    decorMat.clippingPlanes = DEBARK_CLIP; decorMat.clipShadows = true;
    this.raw = this.lanes.map((l) => new LogBatch(160, rawGeos[l.i], rawMats[l.i]));
    this.decor = this.lanes.map((l) => new LogBatch(160, decorGeos[l.i], decorMat));
    this.clean = this.lanes.map((l) => new LogBatch(40, rawGeos[l.i], cleanMats[l.i]));
    // AO ignores clipping: unclipped, a raw log and its clean twin fill the same space, so both can stay in the AO pass
    // (hidden, the belt's own AO would darken the logs lying on it); only the decor would leave stray shadows
    for (const b of this.decor) b.mesh.userData.noAO = true;
  },
  makeItem(lane, x) {
    const kind = x - HALF < GATE_X ? 'raw' : x - HALF < SPLIT_X ? 'clean' : 'bundle';
    const it = { x, kind, pop: 0, spin: rand(0, 6), entered: x + HALF >= GATE_X, split: x + HALF >= SPLIT_X, chips: 0 };
    lane.items.push(it);
    return it;
  },
  dispose() {},
  reset() {
    for (const l of this.lanes) { l.items.forEach((it) => this.dispose(it)); l.items = []; l.timer = l.i * 0.8; }
    for (const l of this.lanes) if (laneOn(l.i)) this.fillLane(l);
  },
  // same spacing as live spawning, so the saw gets the same flow from the first second
  fillLane(l) {
    const step = () => Math.max(GAP, cfg.production.conveyorSpeed * cfg.production.spawnInterval * rand(0.85, 1.2));
    const x0 = Math.min(SAW_X, cfg.production.prefillUpTo ?? SAW_X); // the game starts with logs only in front of the debarker
    for (let x = x0 - l.i * 1.7 - rand(0, 2); x > LANE_START + 4; x -= step()) this.makeItem(l, x);
    l.items.sort((a, b) => b.x - a.x);
  },
  rebuildMeshes() {
    this.raw.forEach((b, i) => { b.mesh.geometry = rawGeos[i]; b.mesh.material = rawMats[i]; });
    this.decor.forEach((b, i) => { b.mesh.geometry = decorGeos[i]; });
    this.clean.forEach((b, i) => { b.mesh.geometry = rawGeos[i]; b.mesh.material = cleanMats[i]; });
  },
  update(dt) {
    const P = cfg.production, sp = P.beltOn ? P.conveyorSpeed : 0; // stations that are off hold the logs in front of them
    beltTex.offset.x -= (sp * dt) / (LANE_W * BELT_SLOTS);
    feederTex.offset.x -= (2.5 * dt) / (4 * BELT_SLOTS);
    for (const g of splitBlades) g.position.x = SPLIT_X + (P.splitOn ? Math.sin(state.t * 40) * 0.12 : 0);
    for (const l of this.lanes) {
      l.timer -= dt;
      const last = l.items[l.items.length - 1];
      if (P.beltOn && laneOn(l.i) && l.timer <= 0 && (!last || last.x > LANE_START + GAP)) { this.makeItem(l, LANE_START); l.timer = cfg.production.spawnInterval * rand(0.85, 1.2); }
      l.items.forEach((it, k) => {
        let limit = k === 0 ? Infinity : l.items[k - 1].x - GAP;
        if (it.kind === 'raw' && !P.debarkOn) limit = Math.min(limit, GATE_X - HALF - 0.4);
        if (it.kind === 'clean' && !P.splitOn) limit = Math.min(limit, SPLIT_X - HALF - 0.4);
        if (k === 0 && it.kind === 'bundle') limit = Math.min(limit, !P.sawOn || (saw.active && it.x < SAW_X - 0.02) ? SAW_WAIT : SAW_X);
        if (limit < it.x) limit = it.x; // never pushed backwards
        it.x = Math.min(it.x + sp * dt, limit);
        // peeled while passing the debarker: bark in front of the gate, clean wood behind it
        if (it.kind === 'raw' && !it.entered && it.x + HALF >= GATE_X) { it.entered = true; debarkStart(l); }
        if (it.kind === 'raw' && it.entered) debarkStream(l, it, dt);
        if (it.kind === 'raw' && it.x - HALF >= GATE_X) { it.kind = 'clean'; debarkEnd(l); }
        // split lengthwise by the gang saw: clean log in front, bundle of 19 behind
        if (it.kind === 'clean' && !it.split && it.x + HALF >= SPLIT_X) it.split = true;
        if (it.kind === 'clean' && it.split) splitStream(l, it, dt);
        if (it.kind === 'clean' && it.x - HALF >= SPLIT_X) { it.kind = 'bundle'; it.pop = 1; }
        it.pop = Math.max(0, it.pop - dt * 3);
      });
    }
  },
  draw() {
    for (const l of this.lanes) {
      const raw = this.raw[l.i], decor = this.decor[l.i], clean = this.clean[l.i];
      raw.begin(); decor.begin(); clean.begin();
      for (const it of l.items) {
        if (!inView(it.x, BUNDLE_Y, l.z, HALF + 0.5)) continue;
        // a log crossing a station is drawn in both forms, each clipped at the station plane (see the materials)
        if (it.x - HALF < SPLIT_X) {
          const spin = it.spin + Math.max(0, Math.min(it.x + HALF, GATE_X + LOG_LEN) - GATE_X) * 1.2; // turns inside the debarker
          _m.compose(_p.set(it.x, BUNDLE_Y + Math.sin(state.t * 9 + it.spin) * 0.02, l.z), _q.setFromAxisAngle(_v.set(1, 0, 0), spin), _s.set(1, 1, 1));
          if (it.x - HALF < GATE_X) { raw.add(_m, _c.setScalar(1)); decor.add(_m, _c.setScalar(1)); }
          if (it.x + HALF > GATE_X) clean.add(_m, _c.setScalar(1));
        }
        if (it.x + HALF <= SPLIT_X) continue;
        const s = 1 + Math.sin(it.pop * Math.PI) * 0.12;
        HEX.forEach(([py, pz], j) => {
          _m.compose(_p.set(it.x + (hash3(j, l.i, 1) - 0.5) * 0.15, BUNDLE_Y + py * s, l.z + pz * s), Q_Y2X, _s.set(1, 1, 1));
          bundleBatch.add(_m, _c.set(cfg.wood[l.i].wood).multiplyScalar(0.9 + hash3(j, 2, 2) * 0.2));
        });
      }
      raw.end(); decor.end(); clean.end();
    }
  },
};
// Debarking: start (sound, gate flash), a continuous stream of bark while the log passes, sparkle at the end
const DEBARK_CLIP = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), GATE_X)];   // raw log: keep x < debarker
const CLEAN_CLIP = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -GATE_X), new THREE.Plane(new THREE.Vector3(-1, 0, 0), SPLIT_X)]; // between the two
const BUNDLE_CLIP = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -SPLIT_X)];  // bundle: keep x > splitter
function debarkStart(lane) {
  gateRings[lane.i].userData.flash = 1;
  sfx('debark', 'swoosh', { vol: 0.6, rate: rand(0.85, 1.15), throttle: 0.12 });
}
function debarkStream(lane, it, dt) {
  const w = cfg.wood[lane.i];
  const rate = cfg.particles.barkChips * cfg.production.conveyorSpeed / LOG_LEN; // barkChips per log
  it.chips += rate * dt;
  for (; it.chips >= 1; it.chips--) {
    const a = rand(0, Math.PI * 2), r = Math.random();
    _v.set(GATE_X + rand(-0.25, 0.1), BUNDLE_Y + Math.sin(a) * RAW_R, lane.z + Math.cos(a) * RAW_R);
    debris.emit(_v, new THREE.Vector3(rand(-3, 0.5), Math.sin(a) * rand(2, 6) + 3, Math.cos(a) * rand(3, 7)),
      _c.set(r < 0.35 ? w.moss : r < 0.85 ? w.bark : w.wood), rand(0.4, 0.95), rand(1.4, 2.4), BELT_Y, CHIP_BARK);
  }
  gateRings[lane.i].userData.flash = Math.max(gateRings[lane.i].userData.flash || 0, 0.7);
  for (const n of gateNets) if (n.userData.lane === lane.i) n.userData.spin = 1;
  sfx('debark', 'swoosh', { vol: 0.25, rate: rand(0.9, 1.2), throttle: 0.35 });
}
// Gang saw: sawdust and chips fly while a log runs through the splitter
function splitStream(lane, it, dt) {
  const w = cfg.wood[lane.i];
  it.chips += cfg.particles.sawdust * 1.5 * cfg.production.conveyorSpeed / LOG_LEN * dt;
  for (; it.chips >= 1; it.chips--) {
    _v.set(SPLIT_X + 1.1, BUNDLE_Y + rand(-1, 1.1), lane.z + rand(-1.1, 1.1));
    debris.emit(_v, new THREE.Vector3(rand(0.5, 3), rand(2, 5), rand(-3, 3)), _c.set(Math.random() < 0.6 ? w.cap : w.wood), rand(0.2, 0.42), rand(0.8, 1.4), BELT_Y);
  }
  if (Math.random() < dt * 20) sparks.emit(SPLIT_X + 1, BUNDLE_Y + rand(-0.8, 0.8), lane.z + rand(-1, 1), rand(0, 3), rand(1, 4), rand(-3, 3),
    _c.set(cfg.particles.sparkColor), rand(0.08, 0.16), rand(0.2, 0.5), BELT_Y, 0.8, 1);
  sfx('split', 'saw', { vol: 0.22, offset: rand(0.2, 0.6), dur: 0.5, rate: rand(1.3, 1.5), throttle: 0.45 });
}
function debarkEnd(lane) {
  const glow = new THREE.Color(cfg.particles.glitterColor);
  for (let i = 0; i < cfg.particles.gateGlitter; i++) {
    const a = rand(0, Math.PI * 2);
    glitter.emit(GATE_X + 1, BUNDLE_Y + Math.sin(a) * 1.6, lane.z + Math.cos(a) * 1.6,
      rand(0, 2), Math.sin(a) * rand(2, 5) + 2, Math.cos(a) * rand(2, 5), glow, rand(0.12, 0.25), rand(0.5, 1.1), BELT_Y, 1.2, 0.6);
  }
  sfx('debark', 'upgrade', { vol: 0.3, rate: rand(0.95, 1.1), throttle: 0.3 });
}

// Saw: bar with spinning blades descends through every bundle waiting under it, bundle splits in halves
// Saw: starts a stroke when all three bundles stand centred under it (after sawMaxWait it cuts whatever is there,
// so a lane without a bundle can't stall it); while the blades are down, late bundles wait before the blades (SAW_WAIT).
const SAW_WAIT = SAW_X - HALF - 0.7;
const saw = {
  phase: 0, active: false, lanes: [], waited: 0,
  reset() { this.phase = 0; this.active = false; this.lanes = []; this.waited = 0; },
  update(dt) {
    for (const b of blades) b.rotation.x -= dt * 25 * (1 + sawGrade * 0.35);
    const front = production.lanes.map((l) => (l.items[0]?.kind === 'bundle' ? l.items[0] : null));
    if (!this.active && cfg.production.sawOn) {
      const centred = front.map((it, i) => (it && it.x >= SAW_X - 0.02 ? i : -1)).filter((i) => i >= 0);
      const arriving = front.some((it) => it && it.x > SAW_WAIT - 0.6 && it.x < SAW_X - 0.02);
      this.waited = centred.length ? this.waited + dt : 0;
      const all = centred.length === production.lanes.filter((l) => laneOn(l.i)).length;
      if (all || (centred.length && !arriving && this.waited > cfg.production.sawMaxWait)) {
        this.active = true; this.phase = 0; this.lanes = centred; this.waited = 0;
      }
    }
    let f = 0;
    const prev = this.phase;
    if (this.active) {
      this.phase += dt / cfg.production.sawPeriod;
      const p = this.phase;
      if (p < 0.4) f = ease(p / 0.4); else if (p < 0.5) f = 1; else f = 1 - ease(Math.min(1, (p - 0.5) / 0.5));
      if (p >= 1) { this.active = false; f = 0; }
    }
    sawBar.position.y = lerp(8.2, 3.6, f);
    const bladeBottom = sawBar.position.y - 1.6 - BLADE_R;
    const waiting = this.lanes.map((i) => [i, front[i]]).filter(([, it]) => it && it.x >= SAW_X - 0.02);
    if (this.active && bladeBottom < BUNDLE_Y + 1.35 && this.phase < 0.5) {
      const sc = new THREE.Color(cfg.particles.sparkColor);
      for (const [i] of waiting) {
        const dust = _c.set(Math.random() < 0.5 ? cfg.wood[i].cap : cfg.wood[i].wood);
        for (let k = 0; k < 4; k++)
          sparks.emit(SAW_X + rand(-0.1, 0.1), Math.max(bladeBottom, BUNDLE_Y - 1.2) + 0.1, LANE_Z[i] + rand(-0.4, 0.4), rand(-3, 3), rand(2, 7), (Math.random() < 0.5 ? -1 : 1) * rand(4, 10), sc, rand(0.1, 0.2), rand(0.3, 0.7), BELT_Y, 0.8, 1);
        if (Math.random() < 0.7) debris.emit(_v.set(SAW_X, Math.max(bladeBottom, BUNDLE_Y - 1.2), LANE_Z[i]), new THREE.Vector3(rand(-2, 2), rand(2, 6), rand(-5, 5)), dust, rand(0.25, 0.45), rand(0.8, 1.5), BELT_Y);
      }
    }
    if (this.active && prev < 0.45 && this.phase >= 0.45 && waiting.length) {
      sfx('saw', 'saw', { vol: 0.75, offset: 0.25, dur: Math.min(1.2, cfg.production.sawPeriod * 0.85), rate: rand(0.95, 1.05) });
      sfx('logs', Math.random() < 0.5 ? 'logs_fall' : 'logs_scatter', { vol: 0.6, delay: 0.8, throttle: 0.5, rate: rand(0.9, 1.1) });
      for (const [i, it] of waiting) cutBundle(production.lanes[i], it);
    }
  },
};
function cutBundle(lane, it) {
  const w = cfg.wood[lane.i], wood = new THREE.Color(w.wood), sp = cfg.production.conveyorSpeed;
  // before physicsStart the bin isn't on camera yet: the halves are not simulated, the pile stays as prefilled
  const simulate = state.t >= cfg.physics.physicsStart;
  for (const [py, pz] of simulate ? HEX.filter(() => Math.random() < cfg.production.cutShare) : []) {
    const tint = _c.copy(wood).multiplyScalar(rand(0.88, 1.08)).clone();
    for (const half of [1, -1]) {
      _p.set(SAW_X + half * (HALF / 2 + 0.06), BUNDLE_Y + py, lane.z + pz);
      _q.setFromAxisAngle(UP, rand(-0.04, 0.04)).multiply(Q_Y2X);
      // halves leave the belt at different speeds, so they spread over the whole bin instead of one heap at the wall
      const vx = half > 0 ? rand(6, 12) : rand(2.5, 7);
      const it = yardPool.spawn(_p, _q, { x: vx, y: rand(0.3, 1.5), z: rand(-2.5, 2.5) }, { x: rand(-0.6, 0.6), y: rand(-0.3, 0.3), z: rand(-0.6, 0.6) },
        tint, { maxDynamic: cfg.physics.maxDynamic, limit: cfg.physics.maxLogs });
      it.kick = rand(0.55, 1.45); // each log is thrown off the belt with its own strength, so they land all over the bin
    }
  }
  const sc = new THREE.Color(cfg.particles.sparkColor), dust = [new THREE.Color(w.cap), new THREE.Color(w.wood), new THREE.Color(w.bark)];
  for (let k = 0; k < cfg.particles.sparksPerCut; k++)
    sparks.emit(SAW_X, BUNDLE_Y + rand(-1.2, 1.3), lane.z + rand(-1.3, 1.3), rand(-2, 2), rand(2, 9), rand(-8, 8), sc, rand(0.12, 0.26), rand(0.4, 1.0), BELT_Y, 0.7, 1);
  for (let k = 0; k < cfg.particles.sawdust; k++)
    debris.emit(_v.set(SAW_X + rand(-0.2, 0.2), BUNDLE_Y + rand(-1.2, 1.2), lane.z + rand(-1.2, 1.2)), new THREE.Vector3(rand(-2, 4), rand(2, 7), rand(-4, 4)),
      dust[Math.random() < 0.45 ? 0 : Math.random() < 0.85 ? 1 : 2], rand(0.25, 0.55), rand(1.0, 1.8), BELT_Y);
  production.dispose(it);
  lane.items.shift();
  hooks.cut?.(lane);
  popMoney();
}

// Trucks: drive along a smooth spline, stop in loading bays, cranes fill them, the convoy leaves when full
const trucks = {
  list: [], timer: 0, bayTruck: [null, null, null],
  // two instanced meshes: detailed trucks near the camera, simplified ones further than lodDistance
  init() {
    [this.mesh, this.meshLo] = [truckGeo, truckGeoLo].map((g) => {
      const m = new THREE.InstancedMesh(g, M.vcol, 80);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m); return m;
    });
  },
  make(s, fill = 0, v = 0) {
    const t = { s, v, a: 0, fill, cargo: [], bay: -1, leaving: false, body: null, fullAt: 0, honk: rand(2, 6) };
    const col = new THREE.Color(cfg.wood[Math.floor(rand(0, 3))].wood);
    for (let k = 0; k < fill && k < SLOTS.length; k++) {
      const [x, y, z] = SLOTS[k];
      t.cargo.push({ m: new THREE.Matrix4().compose(_p.set(x, y, z), Q_Y2X, _s.set(1, 1, 1)), c: col.clone().multiplyScalar(0.9 + hash3(k, 1, 3) * 0.18) });
    }
    return t;
  },
  // a queue right behind the bays, so the traffic jam is close to the yard
  fillQueue(from) {
    const n = Math.min(cfg.trucks.count, 21) - this.list.length;
    for (let k = 0; k < n; k++) { const s = from - TRUCK_GAP * (k + 1); if (s < 2) break; this.list.push(this.make(s)); }
  },
  clearBodies() { for (const t of this.list) if (t.body) { world.removeRigidBody(t.body); t.body = null; } },
  reset() {
    this.list = []; this.timer = 0; this.bayTruck = [null, null, null];
    BAYS.forEach((_, b) => { if (!craneOn(b)) return; const t = this.make(BAY_S[b], [12, 12, 0][b]); t.bay = b; this.bayTruck[b] = t; this.list.push(t); });
    this.fillQueue(BAY_S[2]);
    this.sort();
  },
  // yard shot: empty trucks are just pulling into the bays, cranes already hold a load
  stage() {
    this.clearBodies(); loadPool.removeAll();
    this.list = []; this.bayTruck = [null, null, null];
    BAYS.forEach((_, b) => { if (!craneOn(b)) return; const t = this.make(BAY_S[b] - 10 - b, 0, 6); t.bay = b; this.bayTruck[b] = t; this.list.push(t); });
    this.fillQueue(BAY_S[2] - 12);
    this.sort();
    for (const c of cranes) c.stagePose();
  },
  sort() { this.list.sort((a, b) => b.s - a.s); },
  arrived(t) { return t && t.bay >= 0 && Math.abs(t.s - BAY_S[t.bay]) < 0.08 && t.v < 0.1; },
  // fixed colliders for the bed while the truck stands in a bay, so dropped logs land in it
  addBody(t) {
    const p = pathAt(t.s, _pa);
    t.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, TRUCK_Y, p.z).setRotation(_q.setFromAxisAngle(UP, p.h)));
    const add = (hx, hy, hz, x, y, z) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.8), t.body);
    add(2.35, 0.11, 1.25, A.BED_X, 1.15, 0);
    for (const s of [-1, 1]) add(2.35, 0.65, 0.08, A.BED_X, 1.9, s * 1.19);
    add(0.09, 0.65, 1.25, -3.42, 1.85, 0); add(0.09, 0.8, 1.25, 1.12, 1.95, 0);
    add(0.97, 1.0, 1.22, 2.4, 2.08, 0);
  },
  // when leaving, the physical logs become part of the truck (stored in truck space)
  bake(t) {
    this.matrixOf(t, _m); _m2.copy(_m).invert();
    for (const it of [...loadPool.items]) {
      if (it.truck !== t) continue;
      const tr = it.body.translation(), r = it.body.rotation();
      _m3.compose(_p.set(tr.x, tr.y, tr.z), _q.set(r.x, r.y, r.z, r.w), _s.set(1, 1, 1));
      const local = new THREE.Matrix4().multiplyMatrices(_m2, _m3);
      _v.setFromMatrixPosition(local);
      if (Math.abs(_v.x - A.BED_X) < 2.5 && Math.abs(_v.z) < 1.3 && _v.y > 1.0) t.cargo.push({ m: local, c: it.color });
      loadPool.remove(it);
    }
    if (t.body) { world.removeRigidBody(t.body); t.body = null; }
  },
  update(dt) {
    // new trucks join the end of the queue
    this.timer -= dt;
    if (this.timer <= 0 && this.list.length < cfg.trucks.count) {
      const tail = this.list[this.list.length - 1];
      this.list.push(this.make(Math.max(0, (tail ? tail.s : BAY_S[2]) - TRUCK_GAP - 45), 0, cfg.trucks.speed));
      this.timer = cfg.trucks.spawnInterval;
    }
    for (const t of this.bayTruck) if (t && !t.body && this.arrived(t)) { this.addBody(t); t.lastFill = state.t; }
    // convoy leaves when every occupied bay is full and the logs had a moment to settle
    // (game: a truck whose crane brought nothing for partialAfter seconds goes along with the full ones, so they don't wait forever)
    const inBays = this.bayTruck.filter(Boolean), Tc = cfg.trucks;
    const ready = (t) => t.body && (t.fill >= FULL ? state.t - t.fullAt > 1.0 : state.t - t.lastFill > (Tc.partialAfter ?? Infinity));
    // game: a loaded truck leaves on its own as soon as no truck stands in a bay ahead of it (one lane, no overtaking)
    if (Tc.solo) {
      this.bayTruck.forEach((t, b) => {
        if (!t || !ready(t) || cranes[b].dropping || !(t.fill > 0)) return;
        if (this.bayTruck.some((o) => o && o !== t && o.s > t.s)) return;
        this.bake(t); t.leaving = true; t.bay = -1; this.bayTruck[b] = null;
        hooks.convoy?.([t]);
        sfx('crane', 'truck', { vol: 0.3, offset: 0.5, dur: 2.2, fadeOut: 0.8, throttle: 0.5 });
      });
    } else if (inBays.some((t) => t.fill >= FULL) && inBays.every(ready) && cranes.every((c) => !c.dropping)) {
      for (const t of inBays) { this.bake(t); t.leaving = true; t.bay = -1; }
      this.bayTruck = [null, null, null];
      hooks.convoy?.(inBays);
      popMoney({ x: LANE_X, y: YARD_Y + 2, z: 0 });
      sfx('crane', 'truck', { vol: 0.35, offset: 0.5, dur: 2.5, fadeOut: 0.8 });
    }
    // the queue waits in front of the first working bay; empty bays get the first waiting trucks (furthest bay first)
    const active = BAY_S.filter((_, b) => craneOn(b)), queueS = active.length ? Math.min(...active) - 0.01 : BAY_S[2] - 12;
    // every empty working bay takes the first waiting truck that is not past it yet (a new crane gets a truck right away)
    for (let b = 0; b < BAYS.length; b++) {
      if (!craneOn(b) || this.bayTruck[b]) continue;
      const t = this.list.find((x) => !x.leaving && x.bay < 0 && x.s <= BAY_S[b] + 1.0);
      if (!t) break;
      t.bay = b; this.bayTruck[b] = t; t.s = Math.min(t.s, BAY_S[b]);
    }
    this.sort();
    const k = cfg.trucks.speed / 9, accel = 3.2 * k, decel = 4.5 * k; // faster trucks also pull away and brake harder
    this.list.forEach((t, i) => {
      const ahead = this.list[i - 1];
      let stop = t.bay >= 0 ? BAY_S[t.bay] : t.leaving ? PATH_LEN + 50 : queueS;
      if (!t.leaving && t.bay < 0 && this.bayTruck.some((b) => b)) stop = Infinity;
      if (ahead) stop = Math.min(stop, ahead.s - TRUCK_GAP);
      const dist = stop - t.s;
      const vt = Math.min(cfg.trucks.speed, Math.sqrt(2 * decel * Math.max(0, dist - 0.02)));
      const v0 = t.v;
      t.v = vt > t.v ? Math.min(vt, t.v + accel * dt) : Math.max(vt, t.v - decel * 1.6 * dt);
      if (dist <= 0.02) t.v = Math.min(t.v, Math.max(0, dist / Math.max(dt, 1e-3)));
      t.s += t.v * dt;
      t.a = lerp(t.a, (t.v - v0) / Math.max(dt, 1e-3), clamp(dt * 4, 0, 1));
      if (t.bay < 0 && !t.leaving && t.v < 0.05) { t.honk -= dt; if (t.honk < 0) { t.honk = rand(4, 9); sfx('horns', 'horns', { vol: 0.25, offset: rand(0, 3), dur: 0.8, throttle: 1.5 }); } }
    });
    this.list = this.list.filter((t) => t.s < PATH_LEN - 2);
  },
  matrixOf(t, out) {
    const p = pathAt(t.s, _pa);
    const still = !!t.body;
    const pitch = still ? 0 : clamp(-t.a * 0.012, -0.05, 0.05), bob = !still && t.v > 0.2 ? Math.sin(state.t * 13 + t.honk) * 0.015 : 0;
    _e.set(0, p.h, pitch, 'YZX');
    return out.compose(_p.set(p.x, TRUCK_Y + bob, p.z), _q.setFromEuler(_e), _s.set(1, 1, 1));
  },
  draw() {
    let n = 0, nLo = 0;
    const far = farSq();
    for (const t of this.list) {
      const p = pathAt(t.s, _pa);
      if (!inView(p.x, TRUCK_Y + 2, p.z, 5)) continue;
      this.matrixOf(t, _m);
      const lo = camDistSq(p.x, p.z) > far;
      if (lo) this.meshLo.setMatrixAt(nLo++, _m); else this.mesh.setMatrixAt(n++, _m);
      const batch = lo ? cargoBatchLo : cargoBatch;
      for (const c of t.cargo) batch.add(_m3.multiplyMatrices(_m, c.m), c.c);
    }
    this.mesh.count = n; this.meshLo.count = nLo;
    this.mesh.instanceMatrix.needsUpdate = true; this.meshLo.instanceMatrix.needsUpdate = true;
  },
};
const _pa = { x: 0, z: 0, h: 0 };

// Knuckle-boom cranes: pick logs from the pile, swing over the truck, release them into the bed (physics)
const L1 = 6.8, L2 = 6.6, SHOULDER = 2.4, REACH = L1 + L2 - 1.2;
// 12 half-logs held under the grapple (3 across × 2 rows × 2 halves), two loads fill a truck
const CARRY = [];
for (const ox of [-0.54, 0, 0.54]) for (const oy of [-1.98, -1.5]) for (const oz of [-0.93, 0.93]) CARRY.push([ox, oy, oz]);
const TUCK_R = 3.6;   // the arm folds to this radius while the turret swings, so neighbours never overlap
const LOAD_Y = -1.74; // centre of the held bundle below the grapple
// each crane picks only from its own strip of the bin, so the arms never cross
const PICK_BAND = [[-8.2, -6.6], [-2.2, 0.2], [5.8, 7.8]];
const _qa = new THREE.Quaternion(), _va = new THREE.Vector3(), Z_AXIS = new THREE.Vector3(0, 0, 1), Z_NEG = new THREE.Vector3(0, 0, -1);
class Crane {
  constructor(bay) {
    this.bay = bay; this.z = BAYS[bay];
    this.side = bay === 0 ? -1 : 1; // outer cranes swing on their outer side
    this.base = new THREE.Vector3(CRANE_X, YARD_Y, this.z);
    const root = this.root = new THREE.Group(); root.position.copy(this.base); scene.add(root);
    cyl(1.1, 0.6, 32, M.dark, 0, 0.3, 0, root);
    mesh(new THREE.CylinderGeometry(0.8, 1.0, 1.0, 32), craneMat, 0, 1.1, 0, root);
    this.turret = new THREE.Group(); this.turret.position.y = 1.6; root.add(this.turret);
    rbox(2.2, 0.8, 2.0, 0.15, craneMat, -0.2, 0.4, 0, this.turret);
    rbox(1.1, 1.5, 1.1, 0.15, craneMat, -0.6, 1.5, 0.75, this.turret);
    rbox(1.12, 0.7, 0.9, 0.1, M.cabGlass, -0.45, 1.75, 0.75, this.turret);
    this.boom1 = new THREE.Group(); this.boom1.position.y = SHOULDER - 1.6; this.turret.add(this.boom1);
    rbox(L1 + 0.5, 0.55, 0.5, 0.12, craneMat, L1 / 2, 0, 0, this.boom1);
    cyl(0.14, L1 * 0.6, 12, M.steel, L1 * 0.35, -0.45, 0, this.boom1).rotation.z = Math.PI / 2;
    cyl(0.32, 0.62, 20, M.dark, 0, 0, 0, this.boom1).rotation.x = Math.PI / 2;
    this.boom2 = new THREE.Group(); this.boom2.position.x = L1; this.boom1.add(this.boom2);
    rbox(L2 + 0.4, 0.45, 0.42, 0.1, craneMat, L2 / 2, 0, 0, this.boom2);
    cyl(0.3, 0.6, 20, M.dark, 0, 0, 0, this.boom2).rotation.x = Math.PI / 2;
    cyl(0.12, L2 * 0.5, 12, M.steel, L2 * 0.3, 0.38, 0, this.boom2).rotation.z = Math.PI / 2;
    // grapple hangs at the real end of the second boom (world-aligned)
    this.grapple = new THREE.Group(); scene.add(this.grapple);
    cyl(0.07, 0.6, 8, M.dark, 0, -0.3, 0, this.grapple);
    cyl(0.28, 0.35, 20, M.dark, 0, -0.65, 0, this.grapple);
    rbox(0.9, 0.22, 1.5, 0.06, craneMat, 0, -0.9, 0, this.grapple);
    // closed tines are arcs around the held bundle (radius 1.1 > bundle radius ~0.95), so they wrap the logs
    // instead of cutting through them; each jaw hinges at the top of its arc
    const R = 1.1, a0 = -110 * Math.PI / 180, a1 = 60 * Math.PI / 180;
    const hinge = new THREE.Vector3(Math.cos(a1) * R, LOAD_Y + Math.sin(a1) * R, 0);
    const tine = new THREE.TorusGeometry(R, 0.08, 8, 22, a1 - a0).rotateZ(a0).translate(-hinge.x, LOAD_Y - hinge.y, 0);
    this.jaws = [-1, 1].map((side) => {
      const j = new THREE.Group(); j.position.set(side * hinge.x, hinge.y, 0); j.scale.x = side; j.userData.side = side; this.grapple.add(j);
      for (const z of [-0.6, 0.6]) mesh(tine, craneMat, 0, 0, z, j);
      cyl(0.09, 1.5, 12, M.dark, 0, 0, 0, j).rotation.x = Math.PI / 2;
      return j;
    });
    // upgrade grades: each level repaints the crane (craneMat) and adds hardware big enough to see from the yard view
    this.grades = [[], [], [], []];
    const grp = (k, parent) => { const g = new THREE.Group(); g.visible = false; parent.add(g); this.grades[k].push(g); return g; };
    const ROT = Math.PI / 2;
    // 1: red hydraulic hoses along both booms, looping over the knuckle
    const h1 = grp(0, this.boom1), h2 = grp(0, this.boom2);
    for (const z of [-0.2, 0.2]) {
      cyl(0.09, L1 * 0.9, 10, hoseMat, L1 * 0.48, 0.38, z, h1).rotation.z = ROT;
      cyl(0.08, L2 * 0.85, 10, hoseMat, L2 * 0.45, 0.32, z, h2).rotation.z = ROT;
      mesh(new THREE.TorusGeometry(0.42, 0.08, 8, 20, Math.PI), hoseMat, L1, 0.36, z, h1);
    }
    // 2: second ram on each boom + hazard side plates
    const r1 = grp(1, this.boom1), r2 = grp(1, this.boom2);
    cyl(0.24, L1 * 0.55, 14, M.steel, L1 * 0.42, -0.5, 0, r1).rotation.z = ROT;
    cyl(0.2, L2 * 0.55, 14, M.steel, L2 * 0.4, -0.42, 0, r2).rotation.z = ROT;
    for (const z of [-1, 1]) {
      rbox(L1 * 0.75, 0.36, 0.05, 0.01, hazardMat, L1 * 0.5, 0, z * 0.28, r1);
      rbox(L2 * 0.7, 0.3, 0.05, 0.01, hazardMat, L2 * 0.5, 0, z * 0.24, r2);
    }
    // 3: cab roof with a light bar, a big flashing beacon, work lights on the boom
    const g3 = grp(2, this.turret), l3 = grp(2, this.boom1);
    rbox(1.35, 0.14, 1.35, 0.05, M.dark, -0.6, 2.32, 0.75, g3);
    this.beacon = mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.42, 16), new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff7000, emissiveIntensity: 3 }), -0.6, 2.6, 0.75, g3);
    for (const s of [-1, 0, 1]) mesh(new THREE.SphereGeometry(0.17, 12, 8), M.lamp, 0.1, 2.32, 0.75 + s * 0.42, g3);
    for (const z of [-0.3, 0.3]) mesh(new THREE.SphereGeometry(0.2, 12, 8), M.lamp, L1 * 0.25, 0.42, z, l3);
    // 4: heavy counterweight with chrome, glowing gold strips along the booms and around the base
    const c4 = grp(3, this.turret), b4 = grp(3, this.boom1), b5 = grp(3, this.boom2), base4 = grp(3, root);
    rbox(1.3, 1.6, 2.4, 0.15, M.dark, -1.75, 0.85, 0, c4);
    rbox(1.35, 0.14, 2.45, 0.05, M.steel, -1.75, 1.7, 0, c4);
    for (const z of [-1, 1]) {
      rbox(L1 * 0.85, 0.1, 0.06, 0.02, glowMat, L1 / 2, -0.12, z * 0.27, b4);
      rbox(L2 * 0.85, 0.09, 0.06, 0.02, glowMat, L2 / 2, -0.1, z * 0.23, b5);
    }
    mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 40).rotateX(ROT), glowMat, 0, 0.62, 0, base4);
    this.appearT = 1;
    this.home = new THREE.Vector3(CRANE_X + 3.5, YARD_Y + 8.5, this.z);
    this.tip = this.home.clone(); this.gtip = this.home.clone();
    this.segs = []; this.seg = null; this.close = 0; this.load = []; this.loadT = 0;
    this.wait = 0; this.pace = 1; this.dropping = false;
  }
  get carry() { return this.load.length; }
  setGrade(n) { this.grades.forEach((gs, k) => { for (const g of gs) g.visible = k < n; }); }
  appear() { this.appearT = 0; this.wait = Math.max(this.wait, 0.9); }
  reset() { this.segs = []; this.seg = null; this.load = []; this.close = 0; this.tip.copy(this.home); this.wait = this.bay * 0.5; this.pace = 0.92 + this.bay * 0.07; this.dropping = false; }
  // yard shot start: the crane hangs open above its part of the pile and goes down for the first load on camera
  stagePose() {
    this.reset(); this.wait = this.bay * 0.3;
    const pick = this.pickPile();
    this.tip.set(pick.x, YARD_Y + 8, pick.z);
  }
  reachable(x, y, z) { return Math.hypot(x - CRANE_X, z - this.z) < REACH - 0.8 && Math.abs(y - (YARD_Y + SHOULDER)) < 6; }
  pickPile() {
    let best = null, by = -1e9;
    const items = yardPool.items, [z0, z1] = PICK_BAND[this.bay];
    for (let k = 0; k < 300 && items.length; k++) {
      const it = items[Math.floor(Math.random() * items.length)];
      const p = it.body.translation();
      if (p.x < 0.6 || p.y > YARD_Y + 5 || p.z < z0 || p.z > z1 || !this.reachable(p.x, p.y, p.z)) continue;
      if (p.y > by) { by = p.y; best = { x: p.x, y: p.y, z: p.z }; }
    }
    // nothing within reach in this crane's strip: go to the near edge of the reach, the grapple pulls logs in from the feeder
    return best || { x: CRANE_X - (REACH - 1.5), y: YARD_Y + 0.4, z: (z0 + z1) / 2 };
  }
  // the jaws close on the real logs under the grapple: they leave the pile where they lie
  // and are pulled into a tidy bundle while the grapple closes and lifts
  // The grapple pulls in the nearest logs within grabRadius (settled or still rolling), they fly into the jaws
  grab() {
    const g = this.gtip, R = cfg.trucks.grabRadius;
    let list = [];
    for (const it of yardPool.items) {
      const p = it.body.translation();
      if (p.x < 0.6 || p.y > YARD_Y + 6) continue; // only logs inside the bin
      const d = Math.hypot(p.x - g.x, p.z - g.z, (p.y - (g.y + LOAD_Y)) * 0.5);
      if (d < R) list.push({ it, d });
    }
    list = list.sort((a, b) => a.d - b.d).slice(0, CARRY.length);
    this.load = list.map(({ it }, n) => {
      const t = it.body.translation(), r = it.body.rotation();
      const q0 = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const axis = _va.set(0, 1, 0).applyQuaternion(q0);
      const q1 = new THREE.Quaternion().setFromUnitVectors(UP, axis.z >= 0 ? Z_AXIS : Z_NEG);
      const load = { off0: new THREE.Vector3(t.x - g.x, t.y - g.y, t.z - g.z), q0, q1, n, color: it.color.clone() };
      yardPool.remove(it);
      return load;
    });
    this.loadT = 0;
    if (this.load.length) yardPool.wake(g.x, g.y + LOAD_Y - 2.5, g.z, 2.8);
    if (this.load.length) sfx('crane', 'crane', { vol: 0.35, offset: rand(0, 8), dur: 0.9, throttle: 0.4 });
  }
  loadPose(l, outP, outQ) {
    const k = ease(clamp(this.loadT / 0.9, 0, 1)), [ox, oy, oz] = CARRY[l.n];
    outP.set(lerp(l.off0.x, ox, k), lerp(l.off0.y, oy, k), lerp(l.off0.z, oz, k)).add(this.gtip);
    return outQ.slerpQuaternions(l.q0, l.q1, k);
  }
  // open the jaws: the carried logs become dynamic bodies and fall into the bed
  drop(truck) {
    if (truck) {
      for (const l of this.load) {
        this.loadPose(l, _p, _qa);
        const it = loadPool.spawn(_p, _qa, { x: rand(-0.3, 0.3), y: -1, z: rand(-0.2, 0.2) }, { x: rand(-0.4, 0.4), y: 0, z: rand(-0.4, 0.4) }, l.color);
        it.truck = truck;
      }
      truck.fill += this.load.length; truck.lastFill = state.t;
      if (truck.fill >= FULL) truck.fullAt = state.t;
      sfx('crane', 'logs_scatter', { vol: 0.5, rate: rand(1.0, 1.2), delay: 0.25, throttle: 0.3 });
      popMoney({ x: LANE_X, y: YARD_Y + 3, z: this.z });
    }
    this.load = [];
  }
  plan() {
    const truck = trucks.bayTruck[this.bay];
    const ready = truck && truck.body && truck.fill < FULL;
    if (this.carry && ready) {
      const T1 = new THREE.Vector3(LANE_X, YARD_Y + 8, this.z);
      const T2 = new THREE.Vector3(LANE_X, TRUCK_Y + A.BED_FLOOR + 2.45 + (truck.fill / CARRY.length) * 0.55, this.z);
      this.dropping = true;
      this.segs.push({ to: T1, dur: 1.9, arc: 0.8 }, { to: T2, dur: 0.6 },
        { dur: 0.2, jaw: 0, end: () => this.drop(trucks.bayTruck[this.bay]) }, { dur: 0.25 }, { to: T1, dur: 0.45, end: () => { this.dropping = false; } });
    } else if (!this.carry && truck && !truck.leaving && truck.fill < FULL) {
      const pick = this.pickPile();
      const P2 = new THREE.Vector3(pick.x, pick.y - LOAD_Y, pick.z), P1 = new THREE.Vector3(pick.x, YARD_Y + 8, pick.z);
      this.segs.push({ to: P1, dur: 1.9, arc: 0.8, jaw: 0 }, { to: P2, dur: 0.7 }, { dur: 0.4, jaw: 1, start: () => this.grab() }, { to: P1, dur: 0.7 });
    } else if (!this.carry && this.tip.distanceTo(this.home) > 0.5) this.segs.push({ to: this.home.clone(), dur: 1.8, arc: 0.3, jaw: 0 });
  }
  startSeg(s) {
    s.t = 0; s.jaw0 = this.close;
    s.start?.();
    if (s.to) {
      const ang = (p) => Math.atan2(-(p.z - this.z), p.x - CRANE_X);
      s.a0 = ang(this.tip); s.r0 = Math.hypot(this.tip.x - CRANE_X, this.tip.z - this.z); s.y0 = this.tip.y;
      s.r1 = Math.hypot(s.to.x - CRANE_X, s.to.z - this.z); s.y1 = s.to.y;
      let da = ang(s.to) - s.a0; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.min(s.r0, s.r1) < 0.6) da = 0; // straight up/down over the base: keep the heading
      // big swings go around this crane's own side (sin < 0 in turret angles means +z)
      if (Math.abs(da) > 1.2 && Math.sign(-Math.sin(s.a0 + da / 2)) !== this.side) da -= Math.sign(da) * Math.PI * 2;
      s.da = da; s.swing = Math.abs(da) > 0.9;
    }
    this.seg = s;
  }
  update(dt) {
    if (this.appearT < 1) this.appearT = Math.min(1, this.appearT + dt / 0.8);
    this.loadT += dt * cfg.trucks.craneSpeed;
    if (this.wait > 0) this.wait -= dt;
    else {
      if (!this.seg) {
        if (!this.segs.length) this.plan();
        if (this.segs.length) this.startSeg(this.segs.shift());
      }
      const s = this.seg;
      if (s) {
        s.t = Math.min(1, s.t + (dt * cfg.trucks.craneSpeed * this.pace) / s.dur);
        const k = ease(s.t);
        if (s.to) {
          // move in turret coordinates (angle, radius, height): the turret slews smoothly,
          // and on big swings the knuckle folds the arm in (radius dips to TUCK_R) and opens again
          const b = Math.sin(Math.PI * k), a = s.a0 + s.da * k;
          let r = lerp(s.r0, s.r1, k);
          if (s.swing) r = lerp(r, Math.min(r, TUCK_R), Math.min(1, b * 1.4));
          this.tip.set(CRANE_X + Math.cos(a) * r, lerp(s.y0, s.y1, k) + b * (s.arc || 0), this.z - Math.sin(a) * r);
        }
        if (s.jaw !== undefined) this.close = lerp(s.jaw0, s.jaw, k);
        if (s.t >= 1) { s.end?.(); this.seg = null; }
      }
    }
    this.pose();
  }
  pose() {
    // two-bone IK in the vertical plane of the turret, then the grapple follows the real boom end
    const S = _v.set(this.base.x, this.base.y + SHOULDER, this.base.z);
    const dx = this.tip.x - S.x, dz = this.tip.z - S.z, d = Math.hypot(dx, dz), dy = this.tip.y - S.y;
    const D = clamp(Math.hypot(d, dy), 2, L1 + L2 - 0.05);
    const a2 = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    const a1 = Math.atan2(dy, d) + Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    this.turret.rotation.y = Math.atan2(-dz, dx);
    this.boom1.rotation.z = a1;
    this.boom2.rotation.z = -(Math.PI - a2);
    // pops out of the ground with an overshoot when bought
    const sc = this.appearT < 1 ? Math.max(0.001, easeOutBack(this.appearT)) : 1;
    this.root.scale.setScalar(sc); this.grapple.scale.setScalar(sc);
    if (this.beacon) this.beacon.material.emissiveIntensity = 1.5 + Math.max(0, Math.sin(state.t * 8)) * 3;
    this.root.updateMatrixWorld(true);
    this.boom2.localToWorld(this.gtip.set(L2, 0, 0));
    this.grapple.position.copy(this.gtip);
    // open = tips swing outwards; the left jaw is mirrored, so the sign follows the side
    for (const j of this.jaws) j.rotation.z = j.userData.side * lerp(0.75, 0, this.close);
  }
  draw() {
    for (const l of this.load) carryBatch.add(_m.compose(_p, this.loadPose(l, _p, _qa), _s.set(1, 1, 1)), l.color);
  }
}
let cranes = [];

// Zones: on the bridge shot the mill and the yard are hidden (and paused in tick), elsewhere the river logs are.
// The mill is also paused on the traffic shot (it is behind that camera), but stays visible for the camera blend.
// In free camera everything stays visible.
function setZones(type = shotAt(state.t)?.shot.type) {
  const bridgeOnly = type === 'bridge' && !cfg.freeCam, all = cfg.freeCam;
  const yardObjs = [yardPool.mesh, loadPool.mesh, trucks.mesh, trucks.meshLo, cargoBatch.mesh, cargoBatchLo.mesh, carryBatch.mesh,
    bundleBatch.mesh, ...production.raw.map((b) => b.mesh), ...debris.meshes, ...cranes.flatMap((c) => [c.root, c.grapple])];
  for (const o of yardObjs) o.visible = !bridgeOnly;
  riverPool.mesh.visible = all || type === 'bridge';
}

// Bridge: a column of loaded trucks drives onto the closed bridge and falls off one after another
const deckY = (z) => lerp(-3.93, -3.85, A.smooth(RIVER_Z - 1, RIVER_Z + 2, Math.abs(z))); // deck top → road ribbon (both banks), + a hair for the tyres
const bridge = {
  trucks: [], meshes: [],
  init() {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(truckGeo, M.vcol); m.castShadow = true; m.receiveShadow = true; m.visible = false;
      const cargo = new THREE.InstancedMesh(halfLogGeo, LOG_MATS, SLOTS.length);
      cargo.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS.length * 3), 3);
      SLOTS.forEach(([x, y, z], k) => { _m.compose(_p.set(x, y, z), Q_Y2X, _s.set(1, 1, 1)); cargo.setMatrixAt(k, _m); cargo.setColorAt(k, _c.set(cfg.wood[i % 3].wood).multiplyScalar(0.9 + hash3(k, i, 1) * 0.2)); });
      cargo.castShadow = true; m.add(cargo); m.userData.cargo = cargo; m.userData.wood = i % 3;
      scene.add(m); this.meshes.push(m);
    }
  },
  clear() {
    for (const t of this.trucks) if (t.body) world.removeRigidBody(t.body);
    this.trucks = [];
    for (const m of this.meshes) m.visible = false;
  },
  start(cross = false) {
    this.cross = cross;
    this.clear(); riverPool.removeAll(); seedRiver();
    for (let k = 0; k < cfg.trucks.bridgeConvoy; k++) this.spawn(36 + k * cfg.trucks.bridgeGap);
    sfx('bridge', 'truck', { vol: 0.4, offset: 1, dur: 3, fadeOut: 0.8 });
  },
  spawn(z) {
    const mesh = this.meshes.find((m) => !this.trucks.some((t) => t.mesh === m));
    if (!mesh) return;
    mesh.visible = true; mesh.userData.cargo.visible = true;
    this.trucks.push({ mesh, z, v: cfg.trucks.bridgeSpeed, body: null, t: rand(0, 3), prevY: -4 });
  },
  update(dt) {
    for (const t of [...this.trucks]) {
      t.t += dt;
      if (!t.body) {
        t.z -= t.v * dt;
        // on the finished bridge the convoy turns right onto the riverside street and drives off into town
        const d = this.cross ? -16 - t.z : 0, R = 5;
        let x = BRIDGE_X, z = t.z, h = Math.PI / 2;
        if (d > 0) {
          const a = Math.min(d / R, Math.PI / 2);
          x = BRIDGE_X + R - R * Math.cos(a); z = -16 - R * Math.sin(a); h = Math.PI / 2 - a;
          if (d > R * Math.PI / 2) x += d - R * Math.PI / 2;
        }
        t.mesh.position.set(x, deckY(z) + Math.abs(Math.sin(t.t * 13)) * 0.02, z);
        t.mesh.rotation.set(0, h, 0);
        if (!this.cross && t.z <= DECK_END - 0.8) this.drop(t); // centre past the broken edge: it tips nose-first
        if (this.cross && x > BRIDGE_X + 110) { t.mesh.visible = false; this.trucks.splice(this.trucks.indexOf(t), 1); }
      } else {
        const p = t.body.translation(), r = t.body.rotation();
        t.mesh.position.set(p.x, p.y, p.z); t.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        if (t.t > 20 || p.y < -18) { world.removeRigidBody(t.body); t.mesh.visible = false; this.trucks.splice(this.trucks.indexOf(t), 1); }
      }
    }
  },
  drop(t) {
    t.t = 0;
    const q = _q2.setFromAxisAngle(UP, Math.PI / 2);
    const y0 = deckY(t.z);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(BRIDGE_X, y0, t.z).setRotation(q)
      .setLinvel(rand(-1.2, 1.2), 0, -t.v).setAngvel({ x: 0, y: rand(-0.4, 0.4), z: 0 }).setAngularDamping(0.3).setCcdEnabled(true));
    const add = (hx, hy, hz, x, y, z, dens = 1.2) => {
      const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setDensity(dens).setFriction(0.35);
      d.setContactSkin?.(0.04);
      return world.createCollider(d, body);
    };
    // colliders follow the visible truck: wheels + chassis down to the ground, cab, thick bed walls
    add(3.5, 0.62, 1.3, 0, 0.62, 0, 2.0);
    add(0.98, 1.02, 1.24, 2.4, 2.08, 0);
    add(2.35, 0.68, 0.14, A.BED_X, 1.88, 1.16, 0.3); add(2.35, 0.68, 0.14, A.BED_X, 1.88, -1.16, 0.3);
    add(0.12, 0.68, 1.25, -3.42, 1.88, 0, 0.3); add(0.12, 0.78, 1.25, 1.12, 1.95, 0, 0.3);
    t.body = body; t.mesh.userData.cargo.visible = false;
    sfx('bridge', 'fail', { vol: 0.7, delay: 0.4, throttle: 0.8 });
    sfx('bridge', 'box_crash', { vol: 0.5, delay: 0.7, throttle: 0.5 });
    const wood = new THREE.Color(cfg.wood[t.mesh.userData.wood].wood);
    for (const [x, y, z] of SLOTS) {
      _p.set(x, y + 0.02, z).applyQuaternion(q).add(_v.set(BRIDGE_X, y0, t.z));
      _q.copy(q).multiply(Q_Y2X);
      riverPool.spawn(_p, _q, { x: 0, y: 0, z: -t.v }, { x: 0, y: 0, z: 0 }, _c.copy(wood).multiplyScalar(rand(0.9, 1.08)), { limit: 280 });
    }
  },
};
function seedRiver() {
  const wood = new THREE.Color(cfg.wood[0].wood);
  for (let i = 0; i < 70; i++) {
    _p.set(rand(160, 300), WATER_Y + 0.05, rand(-RIVER_Z + 2, RIVER_Z - 2));
    _q.setFromAxisAngle(UP, rand(0, Math.PI)).multiply(Q_Y2X);
    riverPool.spawn(_p, _q, { x: cfg.physics.current, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, _c.copy(wood).multiplyScalar(rand(0.85, 1.1)), { limit: 280 });
  }
}

// Water forces: buoyancy, drag, current; splashes on entry
function applyWater(body, buoy, halfH, dt, track) {
  const p = body.translation();
  if (p.x < RIVER_X0 || Math.abs(p.z) > RIVER_Z + 1) return;
  const depth = WATER_Y - (p.y - halfH);
  if (track) {
    const v = body.linvel();
    if (track.prevY > WATER_Y && p.y <= WATER_Y && v.y < -2) emitSplash(p.x, p.z, Math.min(1.5, -v.y / 8));
    track.prevY = p.y;
  }
  if (depth <= 0) return;
  const sub = clamp(depth / (2 * halfH), 0, 1), m = body.mass(), g = -cfg.physics.gravity, v = body.linvel();
  const drag = 3 * sub;
  body.applyImpulse({
    x: m * (cfg.physics.current - v.x) * drag * dt * 0.5,
    y: m * g * buoy * sub * dt - m * v.y * drag * dt,
    z: -m * v.z * drag * dt * 0.7,
  }, true);
  const w = body.angvel(), k = 1 - clamp(2 * sub * dt, 0, 1);
  body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
}
function emitSplash(x, z, power) {
  sfx('bridge', 'splash', { vol: clamp(power, 0.3, 1), rate: rand(0.85, 1.15), throttle: 0.2 });
  const c = new THREE.Color(cfg.look.foam);
  const n = Math.round(cfg.particles.splash * power);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(1, 5) * power;
    splash.emit(x + Math.cos(a) * 0.6, WATER_Y + 0.1, z + Math.sin(a) * 0.6, Math.cos(a) * s, rand(4, 11) * power, Math.sin(a) * s, c, rand(0.3, 0.7), rand(0.6, 1.2), WATER_Y, 0.6, 1);
  }
}

function physicsStep(dt) {
  const sp = cfg.production.conveyorSpeed;
  yardPool.settle(dt);
  for (const it of yardPool.items) {
    if (it.frozen) continue;
    const p = it.body.translation();
    if (p.x < 0.3 && p.y > 0.2) {
      const v = it.body.linvel(), want = p.x > -4 ? cfg.physics.throwSpeed * (it.kick ?? 1) : sp; // the last metres throw the logs into the bin
      if (v.x < want) it.body.setLinvel({ x: lerp(v.x, want, p.x > -4 ? 0.3 : 0.15), y: v.y, z: v.z * 0.95 }, true);
    } else if (p.x > 0.6 && p.x < FEED_X1 && p.y < YARD_Y + 2.5) { // feeder belt in the bin floor
      const v = it.body.linvel();
      if (v.x < 2.5) it.body.setLinvel({ x: lerp(v.x, 2.5, 0.1), y: v.y, z: v.z }, true);
    }
  }
  for (const it of [...riverPool.items]) {
    applyWater(it.body, cfg.physics.buoyancy, LOG_R, dt, it);
    const p = it.body.translation();
    if (p.x > 320 || p.y < -18) riverPool.remove(it);
  }
  for (const t of bridge.trucks) if (t.body) applyWater(t.body, cfg.physics.truckBuoyancy, 1.3, dt, t);
  world.step();
}

// ───────────────────────── director (timeline + camera) ─────────────────────────
const activeShots = () => cfg.shots.filter((s) => s.enabled);
const totalDuration = () => activeShots().reduce((a, s) => a + s.duration, 0);
function shotAt(t) {
  const list = activeShots();
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (t < start + list[i].duration || i === list.length - 1) return { shot: list[i], prev: list[i - 1], idx: i, local: t - start, start };
    start += list[i].duration;
  }
  return null;
}
function shotStart(shot) {
  let s = 0;
  for (const x of activeShots()) { if (x === shot) return s; s += x.duration; }
  return 0;
}
const camTarget = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ta = new THREE.Vector3(), _tb = new THREE.Vector3();
function shotCam(s, local, outP, outT) {
  const k = ease(clamp(local / s.duration, 0, 1));
  outP.fromArray(s.camStart.pos).lerp(_v.fromArray(s.camEnd.pos), k);
  outT.fromArray(s.camStart.target).lerp(_v.fromArray(s.camEnd.target), k);
}
function direct() {
  if (GAME) { camTarget.copy(controls.target); return; }
  const at = shotAt(state.t);
  if (!at) return;
  if (at.idx !== state.shotIdx) { state.shotIdx = at.idx; onShotEnter(at.shot); }
  if (cfg.freeCam) { camTarget.copy(controls.target); return; }
  shotCam(at.shot, at.local, _a, _ta);
  if (at.prev && at.shot.blendIn > 0 && at.local < at.shot.blendIn) {
    shotCam(at.prev, at.prev.duration, _b, _tb);
    const k = ease(at.local / at.shot.blendIn);
    _a.copy(_b.lerp(_a, k)); _ta.copy(_tb.lerp(_ta, k));
  }
  camTarget.copy(_ta);
  camera.position.copy(_a); camera.lookAt(camTarget);
  if (camera.fov !== at.shot.fov) { camera.fov = at.shot.fov; camera.updateProjectionMatrix(); }
  controls.target.copy(camTarget);
}
function onShotEnter(shot) {
  ui.shotName = shot.name;
  if (shot.type === 'bridge') { bridge.start(); yardPool.freezeAll(); }
  setZones(shot.type);
  if (shot.type === 'yard') trucks.stage();
  if (shot.type === 'traffic') sfx('horns', 'horns', { vol: 0.6 });
}
// Shadow frustum: quantized size and texel-snapped center so shadows don't shimmer while the camera moves
const _lr = new THREE.Vector3(), _lu = new THREE.Vector3(), _lf = new THREE.Vector3();
_lf.copy(SUN_DIR).negate(); _lr.crossVectors(_lf, UP).normalize(); _lu.crossVectors(_lr, _lf).normalize();
function updateShadowFrustum() {
  const dist = camera.position.distanceTo(camTarget);
  const half = Math.ceil(clamp(dist * 0.9, 24, 100) / 12) * 12;
  const sc = sun.shadow.camera;
  if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 500; sc.updateProjectionMatrix(); }
  const texel = (2 * half) / sun.shadow.mapSize.x;
  const a = Math.round(camTarget.dot(_lr) / texel) * texel, b = Math.round(camTarget.dot(_lu) / texel) * texel, c = camTarget.dot(_lf);
  sun.target.position.copy(_lr).multiplyScalar(a).addScaledVector(_lu, b).addScaledVector(_lf, c);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
}

// ───────────────────────── reset / jump ─────────────────────────
function resetWorld(toTime = 0) {
  createWorld();
  yardPool.clear(); riverPool.clear(); loadPool.clear(); sparks.clear(); glitter.clear(); splash.clear(); debris.clear();
  bridge.trucks = []; for (const m of bridge.meshes) m.visible = false;
  for (const p of popups) p.sp.visible = false;
  state.t = toTime; state.shotIdx = -1; state.acc = 0; saw.reset();
  production.reset();
  const pileN = Math.min(Math.floor((toTime + 6) * cfg.production.prefillRate), cfg.physics.maxLogs - 400);
  for (let i = 0; i < pileN; i++) {
    const x = rand(FEED_X1, BIN.x1 - 1.5), z = rand(BIN.z0 + 1.0, BIN.z1 - 1.0);
    const h = rand(0, Math.min(1.8, 0.3 + pileN / 500)) * (0.6 + 0.4 * Math.min(1, x / 8)); // even low layer, room for new logs
    _p.set(x, YARD_Y + LOG_R + rand(0, h), z);
    _q.setFromAxisAngle(UP, rand(-0.7, 0.7)).multiply(Q_Y2X);
    const w = cfg.wood[i % 3];
    yardPool.spawn(_p, _q, null, null, _c.set(w.wood).multiplyScalar(rand(0.88, 1.08)), { fixed: true, limit: cfg.physics.maxLogs });
  }
  trucks.reset(toTime);
  for (const c of cranes) c.reset();
  if (sound.unlocked) sound.playMusic(toTime);
}
function jumpTo(t) { resetWorld(t); setPlaying(true); }
function setPlaying(p) { state.playing = p; if (sound.unlocked) sound.setPaused(!p); }

// ───────────────────────── look ─────────────────────────
const TONE = { Neutral: THREE.NeutralToneMapping, ACES: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping };
function applyLook() {
  const L = cfg.look;
  renderer.toneMapping = TONE[L.toneMapping] ?? THREE.NeutralToneMapping;
  renderer.toneMappingExposure = L.exposure;
  bloom.strength = L.bloomStrength; bloom.radius = L.bloomRadius; bloom.threshold = L.bloomThreshold;
  grade.uniforms.uVignette.value = L.vignette; grade.uniforms.uSat.value = L.saturation;
  gtao.enabled = L.ao; gtao.blendIntensity = L.aoIntensity;
  renderer.shadowMap.enabled = sun.castShadow = L.shadows;
  if (sun.shadow.mapSize.x !== L.shadowRes) { sun.shadow.mapSize.set(L.shadowRes, L.shadowRes); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  grade.uniforms.uContrast.value = L.contrast;
  sun.intensity = L.sunIntensity; hemi.intensity = L.skyIntensity; scene.environmentIntensity = L.envIntensity;
  sky.material.uniforms.uTop.value.set(L.sky); sky.material.uniforms.uHorizon.value.set(L.horizon);
  scene.background = new THREE.Color(L.horizon);
  scene.fog = new THREE.Fog(L.horizon, 200, 2000);
  M.grass.color.set(L.grass); M.cliff.color.set(L.cliff); M.sand.color.set(L.sand); M.concrete.color.set(L.concrete); M.concretePlain.color.set(L.concrete);
  M.curb.color.set(L.curb); M.gate.color.set(L.gate); paintSaw(); M.crane.color.set(L.crane); paintCranes(); M.rock.color.set(L.rock);
  M.conveyorBody.color.set(L.conveyor).multiplyScalar(0.55);
  M.bulb.color.set(L.bulbs); M.bulb.emissive.set(L.bulbs);
  moneyMat.emissive.set(L.money);
  waterMat.uniforms.uWater.value.set(L.water); waterMat.uniforms.uDeep.value.set(L.waterDeep); waterMat.uniforms.uFoam.value.set(L.foam);
  drawBelt();
}
function applyTruckColors() {
  buildTruckGeo();
  trucks.mesh.geometry = truckGeo; trucks.meshLo.geometry = truckGeoLo;
  for (const m of bridge.meshes) m.geometry = truckGeo;
}

// ───────────────────────── init ─────────────────────────
buildWoodAssets();
buildTruckGeo();
buildVegetation();
buildMountains();
createWorld();
const sphere = (x, y, z, r) => new THREE.Sphere(new THREE.Vector3(x, y, z), r);
yardPool = new LogPool(1900, halfLogGeo, HALF, sphere(4, -2, 0, 24));      // saw exit + bin
// The heap may rise towards the far wall but stays a bit below the belt under it, so new logs always have room to land.
yardPool.heapLimit = (x) => YARD_Y + (x < FEED_X1 ? 0.8 : cfg.physics.heapNearBelt + (x - FEED_X1) * 0.15);
yardPool.canFreeze = (p) => p.x > FEED_X1; // forced freezing (too many moving logs) only where the cranes pick
riverPool = new LogPool(300, halfLogGeo, HALF, sphere(240, -6, 0, 95));    // river around the bridge
loadPool = new LogPool(240, halfLogGeo, HALF, sphere(LANE_X, -2, 0, 18));  // truck beds in the bays
bundleBatch = new LogBatch(19 * 80, fullLogGeo, LOG_MATS.map((m) => Object.assign(m.clone(), { clippingPlanes: BUNDLE_CLIP, clipShadows: true })));
cargoBatch = new LogBatch(FULL * 80, halfLogGeo);
cargoBatchLo = new LogBatch(FULL * 80, new THREE.CylinderGeometry(LOG_R, LOG_R, HALF, 7, 1));
production.initBatches();
carryBatch = new LogBatch(CARRY.length * BAYS.length, halfLogGeo); // every crane can hold a full load at once
sparks = new PointFX(1600, true);
glitter = new PointFX(1400, true);
splash = new PointFX(1200, false);
debris = new Debris(700);
trucks.init();
cranes = BAYS.map((_, b) => new Crane(b));
function setActiveCranes(n, animate = false) {
  cfg.trucks.activeCranes = n;
  for (const c of cranes) {
    const on = craneOn(c.bay), was = c.root.visible;
    c.root.visible = c.grapple.visible = on; if (!on) c.load = [];
    if (on && !was && animate) { c.appear(); celebrate(c.base.x, c.base.y, c.base.z, 1.3); }
  }
}
function setCraneGrade(n) { craneGrade = n; paintCranes(); for (const c of cranes) c.setGrade(n); }
// a new wood palette: raw logs (bark, moss, decor), clean logs, and every log already in the bin, the trucks and the bridge convoy
function setWoodPalette(key) {
  if (woodSets.has(key)) useWoodSet(woodSets.get(key)); else buildWoodAssets();
  production.rebuildMeshes();
  for (const pool of [yardPool, loadPool]) {
    for (const it of pool.items) { it.color.set(cfg.wood[it.idx % 3].wood).multiplyScalar(rand(0.88, 1.08)); pool.mesh.setColorAt(it.idx, it.color); }
    pool.mesh.instanceColor.needsUpdate = true;
  }
  for (const t of trucks.list) t.cargo.forEach((c, k) => c.c.set(cfg.wood[k % 3].wood).multiplyScalar(rand(0.9, 1.1)));
  bridge.meshes.forEach((m, i) => {
    const cargo = m.userData.cargo;
    for (let k = 0; k < SLOTS.length; k++) cargo.setColorAt(k, _c.set(cfg.wood[i % 3].wood).multiplyScalar(0.9 + hash3(k, i, 1) * 0.2));
    cargo.instanceColor.needsUpdate = true;
  });
}
// the player drags through the bin: logs under the finger are woken and pushed along the drag (towards the cranes)
function rakeLogs(x, z, vx, vz, r = 2.6) {
  const sp = Math.hypot(vx, vz), k = sp > 9 ? 9 / sp : 1;
  let n = 0;
  for (const it of [...yardPool.items]) {
    const p = it.body.translation();
    if (p.x < 0.6 || p.y > YARD_Y + 6 || Math.hypot(p.x - x, p.z - z) > r) continue;
    if (it.frozen) {
      it.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); it.frozen = false; yardPool.dynamicCount++;
      yardPool.items.splice(yardPool.items.indexOf(it), 1); yardPool.items.push(it);
    }
    it.age = 0;
    it.body.setLinvel({ x: vx * k, y: 1.2, z: vz * k }, true);
    if (++n > 24) break;
  }
  return n;
}
function setActiveLanes(n) {
  const before = production.lanes.map((l) => laneOn(l.i));
  cfg.production.activeLanes = n;
  for (const l of production.lanes) if (laneOn(l.i) && !before[l.i]) production.fillLane(l); // a new line opens already loaded
}
setActiveCranes(cfg.trucks.activeCranes);
bridge.init();
applyLook();
resize();
resetWorld(0);

// ───────────────────────── editor (right panel) ─────────────────────────
const ui = {
  shotName: '',
  time: '0.0',
  playPause() { setPlaying(!state.playing); },
  restart() { jumpTo(0); },
  jump: activeShots()[0]?.name,
  save() { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); flash('Сохранено в браузере'); },
  exportJSON() { download(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }), 'lumber-creative.json'); },
  importJSON() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      localStorage.setItem(STORE_KEY, JSON.stringify(deepMerge(structuredClone(DEFAULTS), JSON.parse(await f.text()))));
      location.reload();
    };
    inp.click();
  },
  resetDefaults() { if (confirm('Сбросить все настройки к значениям по умолчанию?')) { localStorage.removeItem(STORE_KEY); location.reload(); } },
  record() { startRecording(); },
  screenshot() { state.wantShot = true; },
  copyCam() {
    const s = { pos: camera.position.toArray().map((v) => +v.toFixed(2)), target: controls.target.toArray().map((v) => +v.toFixed(2)) };
    navigator.clipboard?.writeText(JSON.stringify(s)); flash('Камера скопирована: ' + JSON.stringify(s));
  },
};
function flash(msg) { info.dataset.msg = msg; info.dataset.until = performance.now() + 2500; }

const gui = new GUI({ title: '🪵 Lumber Creative — редактор', width: 330 });
if (GAME) gui.hide();
const fPlay = gui.addFolder('▶ Воспроизведение');
fPlay.add(ui, 'playPause').name('Пауза / Пуск  [Space]');
fPlay.add(ui, 'restart').name('С начала  [R]');
fPlay.add({ game: () => window.open('game.html', '_blank') }, 'game').name('🎮 Открыть игру');
fPlay.add(ui, 'shotName').name('Текущий шот').disable().listen();
fPlay.add(ui, 'time').name('Время, с').disable().listen();
let jumpCtrl;
function rebuildJump() {
  jumpCtrl?.destroy();
  jumpCtrl = fPlay.add(ui, 'jump', activeShots().map((s) => s.name)).name('Перейти к шоту').onChange((n) => {
    const s = activeShots().find((x) => x.name === n); if (s) jumpTo(shotStart(s));
  });
}
rebuildJump();
fPlay.add(cfg.playback, 'speed', 0.1, 3, 0.05).name('Скорость');
fPlay.add(cfg.playback, 'loop').name('Зациклить');

const fFmt = gui.addFolder('📐 Формат и камера');
fFmt.add(cfg, 'format', Object.keys(ASPECTS)).name('Формат').onChange(resize);
fFmt.add(cfg, 'renderScale', 0.5, 2, 0.25).name('Качество рендера').onChange(resize);
fFmt.add(cfg.world, 'lodDistance', 40, 300, 10).name('Дистанция LOD, м');
fFmt.add(cfg, 'freeCam').name('Свободная камера [F]').onChange((v) => { controls.enabled = v; setZones(); }).listen();
fFmt.add(ui, 'copyCam').name('Скопировать камеру (JSON)');

const fShots = gui.addFolder('🎬 Шоты');
fShots.close();
cfg.shots.forEach((s) => {
  const f = fShots.addFolder(s.name); f.close();
  f.add(s, 'enabled').name('Включён').onChange(rebuildJump);
  f.add(s, 'duration', 1, 30, 0.5).name('Длительность, с');
  f.add(s, 'blendIn', 0, 6, 0.1).name('Переход, с (0 = склейка)');
  f.add(s, 'fov', 20, 80, 1).name('FOV');
  f.add({ go: () => { if (s.enabled) jumpTo(shotStart(s)); } }, 'go').name('▶ Перейти сюда');
  f.add({ set: () => setCam(s, 'camStart') }, 'set').name('📷 Старт = текущий вид');
  f.add({ set: () => setCam(s, 'camEnd') }, 'set').name('📷 Конец = текущий вид');
});
function setCam(s, key) {
  s[key] = { pos: camera.position.toArray().map((v) => +v.toFixed(2)), target: controls.target.toArray().map((v) => +v.toFixed(2)) };
  flash(`${s.name}: ${key === 'camStart' ? 'старт' : 'конец'} камеры записан`);
}

const fProd = gui.addFolder('⚙️ Производство');
fProd.add(cfg.production, 'conveyorSpeed', 1, 14, 0.5).name('Скорость конвейера');
fProd.add(cfg.production, 'spawnInterval', 0.8, 6, 0.1).name('Интервал брёвен, с');
fProd.add(cfg.production, 'sawPeriod', 0.6, 3, 0.05).name('Период пилы, с');
fProd.add(cfg.production, 'sawMaxWait', 0, 15, 0.5).name('Пила ждёт все пачки до, с');
const fWood = fProd.addFolder('Породы (3 линии)'); fWood.close();
cfg.wood.forEach((w, i) => {
  const f = fWood.addFolder(`Линия ${i + 1}`);
  const rebuild = () => { buildWoodAssets(); production.rebuildMeshes(); };
  f.addColor(w, 'bark').name('Кора').onFinishChange(rebuild);
  f.addColor(w, 'moss').name('Мох').onFinishChange(rebuild);
  f.add(w, 'mossAmount', 0, 1, 0.05).name('Сколько мха').onFinishChange(rebuild);
  f.addColor(w, 'wood').name('Древесина').onFinishChange(rebuild);
  f.addColor(w, 'cap').name('Срез').onFinishChange(rebuild);
});

const fTr = gui.addFolder('🚚 Грузовики и краны'); fTr.close();
fTr.add(cfg.trucks, 'count', 3, 80, 1).name('Грузовиков всего');
fTr.add(cfg.trucks, 'speed', 2, 25, 0.5).name('Скорость');
fTr.add(cfg.trucks, 'spawnInterval', 0.3, 6, 0.1).name('Интервал появления');
fTr.add(cfg.trucks, 'craneSpeed', 0.3, 3, 0.05).name('Скорость кранов');
fTr.add(cfg.trucks, 'grabRadius', 2, 10, 0.5).name('Радиус захвата ковша, м');
fTr.add(cfg.trucks, 'bridgeSpeed', 2, 20, 0.5).name('Скорость на мосту');
fTr.add(cfg.trucks, 'bridgeConvoy', 1, 8, 1).name('Машин в колонне на мосту');
fTr.add(cfg.trucks, 'bridgeGap', 7, 30, 0.5).name('Дистанция в колонне, м');

const fPhys = gui.addFolder('🧲 Физика'); fPhys.close();
fPhys.add(cfg.physics, 'gravity', -40, -5, 0.5).name('Гравитация').onChange((v) => { world.gravity = { x: 0, y: v, z: 0 }; });
fPhys.add(cfg.physics, 'maxDynamic', 50, 1000, 10).name('Активных тел (макс)');
fPhys.add(cfg.physics, 'physicsStart', 0, 30, 0.5).name('Физика брёвен с, сек');
fPhys.add(cfg.physics, 'throwSpeed', 4, 16, 0.5).name('Сила броска с конвейера');
fPhys.add(cfg.physics, 'settleTime', 0.3, 5, 0.1).name('Успокоение через, сек');
fPhys.add(cfg.physics, 'settleMax', 2, 20, 0.5).name('Физика не дольше, сек');
fPhys.add(cfg.physics, 'heapNearBelt', 0.5, 4.3, 0.1).name('Высота кучи у конвейера');
fPhys.add(cfg.physics, 'maxLogs', 300, 1900, 50).name('Брёвен на складе (макс)');
fPhys.add(cfg.physics, 'friction', 0, 1.5, 0.05).name('Трение');
fPhys.add(cfg.physics, 'restitution', 0, 0.8, 0.02).name('Упругость');
fPhys.add(cfg.physics, 'buoyancy', 0.5, 3, 0.05).name('Плавучесть брёвен');
fPhys.add(cfg.physics, 'truckBuoyancy', 0, 1.5, 0.05).name('Плавучесть грузовика');
fPhys.add(cfg.physics, 'current', 0, 8, 0.1).name('Течение реки').onChange((v) => { waterMat.uniforms.uFlow.value = v; });

const fFx = gui.addFolder('✨ Частицы'); fFx.close();
fFx.add(cfg.particles, 'sparksPerCut', 0, 250, 5).name('Искры за распил');
fFx.addColor(cfg.particles, 'sparkColor').name('Цвет искр');
fFx.add(cfg.particles, 'sparkGlow', 1, 15, 0.5).name('Свечение искр');
fFx.add(cfg.particles, 'sawdust', 0, 120, 2).name('Опилки');
fFx.add(cfg.particles, 'barkChips', 0, 120, 2).name('Щепки коры');
fFx.add(cfg.particles, 'gateGlitter', 0, 120, 2).name('Блёстки у рамки');
fFx.addColor(cfg.particles, 'glitterColor').name('Цвет блёсток');
fFx.add(cfg.particles, 'splash', 0, 250, 5).name('Брызги');

const fLook = gui.addFolder('🎨 Рендер и цвета'); fLook.close();
fLook.add(cfg.look, 'toneMapping', Object.keys(TONE)).name('Тонмаппинг').onChange(applyLook);
fLook.add(cfg.look, 'exposure', 0.3, 2.5, 0.05).name('Экспозиция').onChange(applyLook);
fLook.add(cfg.look, 'bloomStrength', 0, 3, 0.05).name('Bloom сила').onChange(applyLook);
fLook.add(cfg.look, 'bloomRadius', 0, 1.5, 0.05).name('Bloom радиус').onChange(applyLook);
fLook.add(cfg.look, 'bloomThreshold', 0, 2, 0.05).name('Bloom порог').onChange(applyLook);
fLook.add(cfg.look, 'contrast', 1, 1.5, 0.01).name('Контраст (HDR)').onChange(applyLook);
fLook.add(cfg.look, 'ao').name('Ambient occlusion').onChange(applyLook);
fLook.add(cfg.look, 'aoIntensity', 0, 1.5, 0.05).name('Сила AO').onChange(applyLook);
fLook.add(cfg.look, 'vignette', 0, 1.5, 0.05).name('Виньетка').onChange(applyLook);
fLook.add(cfg.look, 'saturation', 0, 2, 0.05).name('Насыщенность').onChange(applyLook);
fLook.add(cfg.look, 'sunIntensity', 0, 6, 0.1).name('Солнце').onChange(applyLook);
fLook.add(cfg.look, 'skyIntensity', 0, 4, 0.1).name('Небо (заполняющий)').onChange(applyLook);
fLook.add(cfg.look, 'envIntensity', 0, 2, 0.05).name('Отражения').onChange(applyLook);
fLook.add(cfg.look, 'shadows').name('Тени').onChange(applyLook);
fLook.add(cfg.look, 'shadowRes', [1024, 2048, 4096]).name('Разрешение теней').onChange(applyLook);
const fCol = fLook.addFolder('Палитра'); fCol.close();
const COLOR_NAMES = { sky: 'Небо (зенит)', horizon: 'Горизонт / туман', grass: 'Трава', cliff: 'Склон', sand: 'Песок', tree: 'Ели', roundTree: 'Лиственные', birch: 'Берёзы', rock: 'Камни',
  conveyor: 'Конвейер', conveyorStripe: 'Шевроны', curb: 'Бортики', gate: 'Рамки/пила', bulbs: 'Лампочки', crane: 'Краны', concrete: 'Бетон', truck: 'Кузов', truckCab: 'Кабина',
  money: 'Деньги', water: 'Вода', waterDeep: 'Глубина', foam: 'Пена' };
for (const [k, n] of Object.entries(COLOR_NAMES)) {
  const c = fCol.addColor(cfg.look, k).name(n);
  if (['tree', 'roundTree', 'birch'].includes(k)) c.onFinishChange(() => { buildVegetation(); buildMountains(); });
  else if (k === 'truck' || k === 'truckCab') c.onFinishChange(applyTruckColors);
  else c.onChange(applyLook);
}

const fSnd = gui.addFolder('🔊 Звук');
fSnd.add(cfg.audio, 'enabled').name('Звук включён').onChange(() => sound.applyVolumes());
fSnd.add(cfg.audio, 'master', 0, 1.5, 0.05).name('Общая громкость').onChange(() => sound.applyVolumes());
fSnd.add(cfg.audio, 'music', 0, 1.5, 0.05).name('Музыка').onChange(() => sound.applyVolumes());
fSnd.add(cfg.audio, 'sfx', 0, 1.5, 0.05).name('Эффекты').onChange(() => sound.applyVolumes());

const fOut = gui.addFolder('💾 Пресет и экспорт');
fOut.add(ui, 'save').name('Сохранить в браузере');
fOut.add(ui, 'exportJSON').name('Скачать пресет JSON');
fOut.add(ui, 'importJSON').name('Загрузить пресет JSON');
fOut.add(ui, 'resetDefaults').name('Сбросить к дефолту');
fOut.add(cfg.export, 'fps', [24, 30, 60]).name('FPS видео');
fOut.add(cfg.export, 'mbps', 4, 40, 1).name('Битрейт, Мбит/с');
fOut.add(ui, 'record').name('⏺ Записать весь ролик');
fOut.add(ui, 'screenshot').name('📸 Скриншот PNG');

window.addEventListener('keydown', (e) => {
  if (GAME) return;
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); ui.playPause(); }
  if (e.code === 'KeyR') ui.restart();
  if (e.code === 'KeyF') { cfg.freeCam = !cfg.freeCam; controls.enabled = cfg.freeCam; setZones(); }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= activeShots().length) jumpTo(shotStart(activeShots()[n - 1]));
});

// ───────────────────────── recording ─────────────────────────
let recorder = null;
function startRecording() {
  if (recorder) { recorder.stop(); return; }
  const types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'];
  const mime = types.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mime) { flash('Запись не поддерживается этим браузером'); return; }
  const chunks = [];
  sound.unlocked = true; sound.unlock();
  const stream = new MediaStream([
    ...renderer.domElement.captureStream(cfg.export.fps).getVideoTracks(),
    ...(cfg.audio.enabled ? sound.streamDest.stream.getAudioTracks() : []),
  ]);
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: cfg.export.mbps * 1e6, audioBitsPerSecond: 192000 });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    download(new Blob(chunks, { type: mime }), `lumber-creative_${cfg.format.replace(':', 'x')}.${mime.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
    recorder = null; state.recording = false; document.getElementById('rec').style.display = 'none';
  };
  cfg.freeCam = false; controls.enabled = false;
  jumpTo(0);
  recorder.start(250);
  state.recording = true; document.getElementById('rec').style.display = 'block';
}

// ───────────────────────── main loop ─────────────────────────
let last = performance.now();
function frame(now) {
  const rdt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  state.fps = lerp(state.fps, 1 / Math.max(rdt, 1e-3), 0.05);
  const dt = state.playing ? rdt * cfg.playback.speed : 0;
  tick(dt);
  render(now);
  requestAnimationFrame(frame);
}
function tick(dt) {
  if (dt > 0) {
    state.t += dt;
    if (!GAME && state.t >= totalDuration()) {
      if (state.recording) recorder.stop();
      if (cfg.playback.loop || state.recording) resetWorld(0); else { state.t = totalDuration() - 0.001; setPlaying(false); }
    }
  }
  direct();
  if (dt > 0) {
    // zones off-screen in this shot are paused: the mill and the yard stop on the bridge shot,
    // the bridge only runs during its own shot
    const shotType = GAME ? 'game' : shotAt(state.t)?.shot.type, free = cfg.freeCam;
    if (free || shotType !== 'bridge' && shotType !== 'traffic') { // the mill and the pile are behind the traffic camera
      production.update(dt);
      saw.update(dt);
    }
    if (free || shotType !== 'bridge') {
      trucks.update(dt);
      for (const c of cranes) if (craneOn(c.bay)) c.update(dt);
    }
    if (shotType === 'bridge' || (GAME && bridge.trucks.length)) bridge.update(dt);
    updateSpans(dt);
    state.acc += dt;
    let steps = 0;
    // at most 2 physics steps per frame: on a slow machine the sim slows a bit instead of snowballing
    while (state.acc >= 1 / 60 && steps < 2) { physicsStep(1 / 60); state.acc -= 1 / 60; steps++; }
    if (steps === 2) state.acc = Math.min(state.acc, 1 / 60);
    const g = cfg.physics.gravity;
    sparks.update(dt, g); glitter.update(dt, g); splash.update(dt, g); debris.update(dt, g);
    updatePopups(dt);
    updateCelebrations(dt);
    waterMat.uniforms.uTime.value += dt;
    for (const r of gateRings) r.userData.flash = Math.max(0, (r.userData.flash || 0) - dt * 3);
    for (const n of gateNets) { n.userData.spin = Math.max(0, (n.userData.spin || 0) - dt * 1.5); n.rotation.x += n.userData.dir * dt * (0.4 + n.userData.spin * 5); }
  }
}
function render(now) {
  M.gate.emissive.set(cfg.look.gate).multiplyScalar(Math.max(...gateRings.map((r) => r.userData.flash || 0)) * 0.6);
  M.bulb.emissiveIntensity = 3 + Math.sin(state.t * 10) * 1.2;
  if (cfg.freeCam) controls.update();
  updateViewFrustum(); updateVegLod();
  yardPool.sync(); riverPool.sync(); loadPool.sync(); syncMoney(state.playing ? 1 / 60 : 0);
  bundleBatch.begin(); cargoBatch.begin(); cargoBatchLo.begin(); carryBatch.begin();
  production.draw(); trucks.draw(); for (const c of cranes) c.draw();
  bundleBatch.end(); cargoBatch.end(); cargoBatchLo.end(); carryBatch.end();
  updateShadowFrustum();

  const scale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  for (const fx of [sparks, glitter, splash]) fx.mat.uniforms.uScale.value = scale;
  sparks.mat.uniforms.uGlow.value = cfg.particles.sparkGlow;
  glitter.mat.uniforms.uGlow.value = cfg.particles.sparkGlow * 0.6;

  composer.render();
  if (state.wantShot) {
    state.wantShot = false;
    renderer.domElement.toBlob((b) => download(b, `lumber-frame_${state.t.toFixed(1)}s.png`));
  }

  ui.time = `${state.t.toFixed(1)} / ${totalDuration().toFixed(1)}`;
  let msg = info.dataset.until > now ? '\n' + info.dataset.msg : '';
  if (!sound.unlocked && cfg.audio.enabled) msg += '\n🔇 кликни по сцене, чтобы включить звук';
  info.textContent = `${Math.round(state.fps)} fps · тел: ${yardPool.dynamicCount}/${yardPool.items.length} + река ${riverPool.items.length} · грузовиков ${trucks.list.length}${state.playing ? '' : ' · ПАУЗА'}${msg}`;
}
requestAnimationFrame(frame);

// debug: advance the simulation by `sec` seconds at a fixed step, then draw one frame
function advance(sec) { for (let i = 0; i < sec * 60; i++) { direct(); tick(1 / 60); } direct(); render(performance.now()); }
window.__creative = { cfg, state, camera, controls, scene, jumpTo, shotStart, activeShots, advance, sound, soundsReady, trucks, cranes, renderer, pools: () => ({ yardPool, loadPool, riverPool }), production,
  GAME, hooks, bridge, saw, moneyTiles, moneyMesh, sfx, resetWorld, setActiveLanes, setActiveCranes, laneOn, craneOn, YARD_Y, LANE_X, BRIDGE_X, SAW_X, GATE_X, SPLIT_X, HALF, LANE_Z, CRANE_X, BAYS, BIN, celebrate, flashMaterial, setCraneGrade, drawBelt,
  beltMat, bladeMat, M, setBridgeBuilt, bridgeState, SPAN_N, setWoodPalette, preloadWood, rakeLogs, setSawGrade, FULL };
