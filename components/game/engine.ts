import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  loadPalette, makeColorReader, makeGradientMap, makeOutlineMaterial, readTheme, stripRootMotion, fixFeet, toonify, watchTheme,
} from '../hero/toon';

// Мини-игра по мотивам zeldaclone (Godot). Чистый three.js без React — оболочка в MiniGame.tsx.
// Числа по возможности взяты из player.tscn / enemy*.tscn.

const BASE = import.meta.env.BASE_URL;
const URL_BOY = `${BASE}content/3d/boy.glb`;
const URL_MONSTR = `${BASE}content/3d/monstr.glb`;
const URL_GOGO = `${BASE}content/3d/gogorunt.glb`;
const URL_CHEST = `${BASE}content/3d/chest.glb`;
const URL_PALETTE = `${BASE}content/3d/boy_palette.png`;

export type Action = 'attack' | 'jump' | 'roll' | 'dash';
export type Phase = 'loading' | 'error' | 'intro' | 'fight' | 'victory' | 'gameover';
export type HudState = {
  phase: Phase;
  hp: number;
  maxHp: number;
  wave: number; // 1-based, 0 до старта
  waves: number;
  banner: 'round' | 'wave' | null;
  boss: number | null; // доля HP мини-босса
};
export type GameHandle = {
  press(a: Action): void;
  setAxis(src: 'kb' | 'stick', x: number, y: number): void;
  setPaused(p: boolean): void;
  restart(): void;
  dispose(): void;
};

// --- константы ---
const R = 7.6; // радиус арены
const MAX_HP = 5;
const RUN_SPEED = 5.2;
const WALK_NAT = 2.0 / 0.767; // c_traj Boy_walk: 2 м за клип
const RUN_NAT = 3.0 / 0.767; // c_traj Boy_run: 3 м за клип
// прыжок: jump_height 1.45, time_to_peak 0.3, time_to_descent 0.25
const JUMP_V = (2 * 1.45) / 0.3;
const G_UP = (2 * 1.45) / (0.3 * 0.3);
const G_DOWN = (2 * 1.45) / (0.25 * 0.25);
const ATK_SPEED = 0.7; // primary_attack_speed 0.6 в Godot, чуть бодрее
const ATK = ['Boy_attack_naked_1', 'Boy_attack_naked_2', 'Boy_attack_naked_3'];
const ATK_WIN: Array<[number, number]> = [[0.22, 0.55], [0.22, 0.55], [0.3, 0.62]];
const COMBO_WINDOW = 0.6; // combo_window_time
const BUFFER = 0.3;
const DASH_SPEED = 10; // air_dash_speed
const DASH_TIME = 0.35; // air_dash_distance 3.5 / speed 10
const DASH_CD = 1.0;
const ROLL_CD = 0.25;
// кувырок: путь даёт root motion Boy_roll (4.63 м), множитель как roll_min/max_speed в Godot (1.0–1.4);
// анимацию чуть замедляем, чтобы кувырок не «щёлкал»
const ROLL_MIN_K = 1.0;
const ROLL_MAX_K = 1.4;
const ROLL_ANIM_SPEED = 0.8;
// двойной прыжок: max_jump_count = 2, второй прыжок сильнее (second_jump_multiplier)
const MAX_JUMPS = 2;
const SECOND_JUMP_K = 1.25;
const PLAYER_R = 0.4;

type StatKey = 'monstr' | 'runt' | 'boss';
type Stats = {
  kind: 'monstr' | 'gogo';
  hp: number; scale: number; radius: number;
  walk: number; run: number; walkNat: number; runNat: number;
  range: number; reach: number; cooldown: number; atkSpeed: number;
  hits: [number, number]; // время удара в attack_1 / attack_2 (fallback_attack_hit_times)
  boss?: boolean;
};
const STATS: Record<StatKey, Stats> = {
  monstr: { kind: 'monstr', hp: 4, scale: 1, radius: 0.55, walk: 1.6, run: 3.6, walkNat: 1.5, runNat: 4.2, range: 1.6, reach: 1.95, cooldown: 1.1, atkSpeed: 1, hits: [0.55, 0.45] },
  runt: { kind: 'gogo', hp: 2, scale: 1, radius: 0.42, walk: 1.5, run: 3.8, walkNat: 1.2, runNat: 3.4, range: 1.2, reach: 1.5, cooldown: 2.0, atkSpeed: 1, hits: [0.6, 0.55] },
  boss: { kind: 'gogo', hp: 14, scale: 3, radius: 1.3, walk: 1.8, run: 3.9, walkNat: 3.6, runNat: 10.2, range: 3.1, reach: 3.9, cooldown: 1.25, atkSpeed: 1.1, hits: [0.6, 0.55], boss: true },
};
const WAVES: StatKey[][] = [['monstr', 'monstr'], ['monstr', 'runt', 'monstr'], ['boss']];

// --- утилиты ---
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const approach = (v: number, t: number, d: number) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

function locoParams(speed: number, walkNat: number, runNat: number): [number, number] {
  if (speed < 0.05) return [0, 1];
  const blend = speed <= walkNat ? speed / walkNat : 1 + Math.min(1, (speed - walkNat) / (runNat - walkNat));
  const nat = blend <= 1 ? walkNat : walkNat + (runNat - walkNat) * (blend - 1);
  return [blend, clamp(speed / nat, 0.55, 1.6)];
}

// Микшер с ручными весами: локомоция (idle/walk/run по скорости) + один «верхний» клип с кроссфейдом
class Animator {
  readonly mixer: THREE.AnimationMixer;
  private acts = new Map<string, THREE.AnimationAction>();
  private overW = new Map<string, number>();
  private locoW = 1;
  private rate = 10;
  over: string | null = null;

  constructor(
    root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private rm: Map<string, THREE.Interpolant>,
    private loco: [string, string, string],
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    clips.forEach((c) => this.acts.set(c.name, this.mixer.clipAction(c)));
    loco.forEach((n) => this.acts.get(n)?.play());
  }

  dur(n: string) { return this.acts.get(n)?.getClip().duration ?? 0; }
  time(n = this.over ?? '') { return this.acts.get(n)?.time ?? 0; }

  play(n: string, o: { fade?: number; loop?: boolean; speed?: number; at?: number } = {}) {
    const a = this.acts.get(n);
    if (!a) return;
    a.reset();
    a.setLoop(o.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.timeScale = o.speed ?? 1;
    a.time = o.at ?? 0;
    a.play();
    if (!this.overW.has(n)) this.overW.set(n, 0);
    this.over = n;
    const f = o.fade ?? 0.12;
    this.rate = f > 0 ? 1 / f : 1e4;
  }

  release(fade = 0.18) {
    this.over = null;
    this.rate = fade > 0 ? 1 / fade : 1e4;
  }

  // смещение по c_traj (вперёд, ось Z модели) между двумя временами клипа
  rmDelta(n: string, t0: number, t1: number) {
    const i = this.rm.get(n);
    if (!i) return 0;
    const d = this.dur(n);
    const z0 = i.evaluate(clamp(t0, 0, d))[2] as number;
    const z1 = i.evaluate(clamp(t1, 0, d))[2] as number;
    return z1 - z0;
  }

  update(dt: number, blend: number, locoScale: number) {
    const step = this.rate * dt;
    for (const [n, w] of this.overW) {
      const nw = approach(w, n === this.over ? 1 : 0, step);
      if (nw <= 0 && n !== this.over) {
        this.acts.get(n)?.stop();
        this.overW.delete(n);
      } else this.overW.set(n, nw);
    }
    this.locoW = approach(this.locoW, this.over ? 0 : 1, step);
    let total = this.locoW;
    this.overW.forEach((w) => { total += w; });
    const [ia, wa, ra] = this.loco.map((n) => this.acts.get(n));
    if (total < 1e-3) {
      ia?.setEffectiveWeight(1);
      wa?.setEffectiveWeight(0);
      ra?.setEffectiveWeight(0);
    } else {
      const k = 1 / total;
      const b = clamp(blend, 0, 2);
      const lw = this.locoW * k;
      ia?.setEffectiveWeight(Math.max(0, 1 - b) * lw);
      wa?.setEffectiveWeight(Math.max(0, 1 - Math.abs(b - 1)) * lw);
      ra?.setEffectiveWeight(Math.max(0, b - 1) * lw);
      this.overW.forEach((w, n) => this.acts.get(n)?.setEffectiveWeight(w * k));
    }
    if (wa) wa.timeScale = locoScale;
    if (ra) ra.timeScale = locoScale;
    // walk/run синхронны по фазе шага
    if (wa && ra) ra.time = (wa.time / (wa.getClip().duration || 1)) * ra.getClip().duration;
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}

type Kind = { scene: THREE.Object3D; clips: THREE.AnimationClip[]; rm: Map<string, THREE.Interpolant> };

function prepKind(gltf: GLTF): Kind {
  const rm = new Map<string, THREE.Interpolant>();
  gltf.animations.forEach((c) => {
    const tr = stripRootMotion(c);
    fixFeet(c);
    if (tr) rm.set(c.name, new THREE.LinearInterpolant(tr.times, tr.values, 3));
  });
  return { scene: gltf.scene, clips: gltf.animations, rm };
}

type EState = 'spawn' | 'chase' | 'stance' | 'attack' | 'recover' | 'hit' | 'down' | 'dead' | 'idle';
type Enemy = {
  s: Stats;
  root: THREE.Group;
  model: THREE.Object3D;
  anim: Animator;
  mats: THREE.MeshToonMaterial[];
  skeletons: THREE.Skeleton[];
  tele: THREE.Mesh;
  teleMat: THREE.MeshBasicMaterial;
  shadow: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  vy: number;
  yaw: number;
  hp: number;
  state: EState;
  t: number;
  cd: number;
  atk: number;
  hitT: number;
  endT: number;
  hitDone: boolean;
  lunged: boolean;
  flash: number;
  strafe: number;
  strafeT: number;
  gone: boolean;
  prevAnimT: number;
};

type PState = 'move' | 'stop' | 'attack' | 'roll' | 'dash' | 'air' | 'slam' | 'hit' | 'dead' | 'victory';

export function createGame(host: HTMLElement, themeEl: Element, onHud: (h: HudState) => void): GameHandle {
  let disposed = false;
  const cleanups: Array<() => void> = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'block h-full w-full';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

  // свет как во вьюпорте
  const PI = Math.PI;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 0.9 * PI));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.3 * PI);
  keyLight.position.set(3, 6, 4);
  scene.add(keyLight);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4 * PI);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  const tint = new THREE.PointLight(0xffffff, 0.7 * PI, 14, 1);
  tint.position.set(-3, 2, 3);
  scene.add(tint);

  const grad = makeGradientMap();
  const palette = loadPalette(URL_PALETTE);
  const outlineMat = makeOutlineMaterial(0.012);
  disposables.push(grad, palette, outlineMat);

  // --- арена ---
  const floorMat = new THREE.MeshToonMaterial({ color: 0x222034, gradientMap: grad });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.5, R + 0.75, 0.5, 72), floorMat);
  floor.position.y = -0.25;
  scene.add(floor);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.06, R + 0.04, 96), ringMat);
  ring.rotation.x = -PI / 2;
  ring.position.y = 0.006;
  scene.add(ring);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
  const inner = new THREE.Mesh(new THREE.RingGeometry(2.9, 2.96, 72), innerMat);
  inner.rotation.x = -PI / 2;
  inner.position.y = 0.005;
  scene.add(inner);
  disposables.push(floor.geometry, floorMat, ring.geometry, ringMat, inner.geometry, innerMat);

  // колонны и камни по краю — инстансы (2 draw call на группу с контуром)
  const propMat = new THREE.MeshToonMaterial({ color: 0x8866cc, gradientMap: grad });
  const rockMat = new THREE.MeshToonMaterial({ color: 0x333048, gradientMap: grad });
  const pillarGeo = new THREE.CylinderGeometry(0.32, 0.45, 1.5, 6);
  pillarGeo.translate(0, 0.75, 0);
  const rockGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const propOutline = makeOutlineMaterial(0.04);
  disposables.push(propMat, rockMat, pillarGeo, rockGeo, propOutline);
  const PILLARS = 10;
  const pillars = new THREE.InstancedMesh(pillarGeo, propMat, PILLARS);
  const pillarsOl = new THREE.InstancedMesh(pillarGeo, propOutline, PILLARS);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  for (let i = 0; i < PILLARS; i++) {
    const a = (i / PILLARS) * PI * 2 + 0.2;
    const h = 0.7 + ((i * 37) % 5) * 0.12;
    m4.compose(v3.set(Math.sin(a) * (R + 0.15), 0, Math.cos(a) * (R + 0.15)), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a * 3), s3.set(1, h, 1));
    pillars.setMatrixAt(i, m4);
    pillarsOl.setMatrixAt(i, m4);
  }
  const ROCKS = 14;
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
  const rocksOl = new THREE.InstancedMesh(rockGeo, propOutline, ROCKS);
  for (let i = 0; i < ROCKS; i++) {
    const a = (i / ROCKS) * PI * 2 + 0.5 + Math.sin(i * 12.9) * 0.15;
    const r = R + 1.1 + Math.abs(Math.sin(i * 7.3)) * 1.2;
    const sc = 0.6 + Math.abs(Math.sin(i * 3.1)) * 0.9;
    q.setFromEuler(new THREE.Euler(i * 0.7, i * 1.3, i * 0.4));
    m4.compose(v3.set(Math.sin(a) * r, 0.05, Math.cos(a) * r), q, s3.set(sc, sc * 0.8, sc));
    rocks.setMatrixAt(i, m4);
    rocksOl.setMatrixAt(i, m4);
  }
  scene.add(pillars, pillarsOl, rocks, rocksOl);
  disposables.push(pillars, pillarsOl, rocks, rocksOl);

  // мягкие тени-«блины» под персонажами
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTex, transparent: true, opacity: 0.45, depthWrite: false });
  disposables.push(blobTex, shadowGeo, shadowMat);
  const makeShadow = (size: number) => {
    const m = new THREE.Mesh(shadowGeo, shadowMat);
    m.scale.setScalar(size);
    m.position.y = 0.012;
    m.renderOrder = 1;
    scene.add(m);
    return m;
  };

  // искры попаданий (спрайты) и кольца-волны
  const starTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.translate(32, 32);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 7 : 31;
      const a = (i / 8) * PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  disposables.push(starTex);
  type Fx = { obj: THREE.Sprite | THREE.Mesh; mat: THREE.SpriteMaterial | THREE.MeshBasicMaterial; t: number; life: number; size: number };
  const sparks: Fx[] = [];
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(mat);
    sp.visible = false;
    sp.renderOrder = 10;
    scene.add(sp);
    sparks.push({ obj: sp, mat, t: 1, life: 0.18, size: 1 });
    disposables.push(mat);
  }
  const waveGeo = new THREE.RingGeometry(0.82, 1, 56);
  waveGeo.rotateX(-PI / 2);
  disposables.push(waveGeo);
  const waves: Fx[] = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(waveGeo, mat);
    m.visible = false;
    m.position.y = 0.02;
    scene.add(m);
    waves.push({ obj: m, mat, t: 1, life: 0.4, size: 1 });
    disposables.push(mat);
  }
  const fxColor = new THREE.Color();
  const spawnSpark = (p: THREE.Vector3, size: number, color: THREE.Color) => {
    const f = sparks.find((s) => s.t >= s.life) ?? sparks[0];
    f.t = 0;
    f.size = size;
    f.obj.position.copy(p);
    (f.mat as THREE.SpriteMaterial).rotation = Math.random() * PI;
    f.mat.color.copy(color);
    f.obj.visible = true;
  };
  const spawnWave = (x: number, z: number, size: number, color: THREE.Color, life = 0.4) => {
    const f = waves.find((s) => s.t >= s.life) ?? waves[0];
    f.t = 0;
    f.life = life;
    f.size = size;
    f.obj.position.set(x, 0.02, z);
    f.mat.color.copy(color);
    f.obj.visible = true;
  };
  const updateFx = (dt: number) => {
    sparks.forEach((f) => {
      if (f.t >= f.life) return;
      f.t += dt;
      const k = f.t / f.life;
      f.obj.scale.setScalar(f.size * (0.4 + k * 0.9));
      f.mat.opacity = 1 - k;
      if (f.t >= f.life) f.obj.visible = false;
    });
    waves.forEach((f) => {
      if (f.t >= f.life) return;
      f.t += dt;
      const k = f.t / f.life;
      f.obj.scale.setScalar(f.size * (0.15 + 0.85 * (1 - Math.pow(1 - k, 3))));
      f.mat.opacity = 0.85 * (1 - k);
      if (f.t >= f.life) f.obj.visible = false;
    });
  };

  // телеграф атаки врага — сектор на полу
  const teleGeo = new THREE.CircleGeometry(1, 24, -PI / 2 - 1.0, 2.0);
  teleGeo.rotateX(-PI / 2);
  disposables.push(teleGeo);

  // --- тема ---
  const readColor = makeColorReader();
  const theme = readTheme(themeEl, readColor);
  const white = new THREE.Color(1, 1, 1);
  const applyTheme = () => {
    Object.assign(theme, readTheme(themeEl, readColor));
    rim.color.copy(theme.accent);
    ringMat.color.copy(theme.accent);
    innerMat.color.copy(theme.accent);
    tint.color.copy(theme.secondary);
    floorMat.color.copy(theme.surface);
    rockMat.color.copy(theme.surface).lerp(theme.bg, 0.25);
    propMat.color.copy(theme.secondary).lerp(theme.surface, 0.6);
    outlineMat.color.copy(theme.bg);
    propOutline.color.copy(theme.bg);
    enemies.forEach((e) => e.teleMat.color.copy(theme.key));
  };
  cleanups.push(watchTheme(themeEl, applyTheme));

  // --- состояние ---
  let phase: Phase = 'loading';
  let phaseT = 0;
  let waveIdx = -1;
  let waveBannerT = 0;
  let clearT = 0;
  const spawnQueue: Array<{ key: StatKey; x: number; z: number; t: number; fx: boolean }> = [];
  const enemies: Enemy[] = [];
  let kinds: { boy: Kind; monstr: Kind; gogo: Kind; chest: Kind } | null = null;
  const sourceScenes: THREE.Object3D[] = [];

  // ввод
  const axis = { kx: 0, ky: 0, sx: 0, sy: 0 };
  let clock = 0;
  const buf: Record<Action, number> = { attack: -9, jump: -9, roll: -9, dash: -9 };
  const consume = (a: Action) => {
    if (clock - buf[a] <= BUFFER) { buf[a] = -9; return true; }
    return false;
  };
  const inp = { x: 0, z: 0, mag: 0 };
  const readInput = () => {
    let x = axis.sx, y = axis.sy;
    let mag = Math.min(1, Math.hypot(x, y));
    if (mag < 0.12) {
      x = axis.kx; y = axis.ky;
      mag = x || y ? 1 : 0;
    }
    const l = Math.hypot(x, y) || 1;
    inp.x = x / l;
    inp.z = -y / l;
    inp.mag = mag;
  };

  // игрок
  const P = {
    root: new THREE.Group(),
    anim: null as Animator | null,
    shadow: makeShadow(1.3),
    pos: new THREE.Vector3(0, 0, 2),
    vel: new THREE.Vector3(),
    vy: 0,
    yaw: PI,
    hp: MAX_HP,
    state: 'move' as PState,
    t: 0,
    combo: 0,
    comboNext: 0,
    comboT: 0,
    comboCD: 0,
    hitSet: new Set<Enemy>(),
    inv: false,
    iframes: 0,
    rollCD: 0,
    dashCD: 0,
    airDash: false,
    slamPhase: 0,
    rollK: 1,
    jumps: 0,
    prevAnimT: 0,
    prevSpeed: 0,
  };
  scene.add(P.root);
  const fwd = (yaw: number, out = new THREE.Vector3()) => out.set(Math.sin(yaw), 0, Math.cos(yaw));

  // сундук на победу
  const chest = {
    root: new THREE.Group(), mixer: null as THREE.AnimationMixer | null, t: -1, shadow: makeShadow(1.6),
    open: null as THREE.AnimationAction | null, idle: null as THREE.AnimationAction | null,
  };
  chest.root.visible = false;
  chest.shadow.visible = false;
  scene.add(chest.root);

  // hit-stop и тряска камеры
  let stopT = 0;
  let stopScale = 1;
  const hitStop = (scale: number, dur: number) => {
    if (dur > stopT) { stopT = dur; stopScale = scale; }
  };
  let shake = 0;
  const addShake = (s: number) => { shake = Math.max(shake, s); };

  // --- HUD ---
  let hudKey = '';
  const emitHud = () => {
    const boss = enemies.find((e) => e.s.boss && !e.gone);
    const h: HudState = {
      phase,
      hp: P.hp,
      maxHp: MAX_HP,
      wave: waveIdx + 1,
      waves: WAVES.length,
      banner: phase === 'intro' ? 'round' : waveBannerT > 0 ? 'wave' : null,
      boss: boss ? Math.max(0, Math.round((boss.hp / boss.s.hp) * 100) / 100) : null,
    };
    const key = JSON.stringify(h);
    if (key !== hudKey) {
      hudKey = key;
      onHud(h);
    }
  };

  // --- враги ---
  const tmp = new THREE.Vector3();
  const spawnEnemy = (key: StatKey, x: number, z: number) => {
    if (!kinds) return;
    const s = STATS[key];
    const k = kinds[s.kind];
    const model = cloneSkinned(k.scene);
    const mats = toonify(model, { palette, grad, outline: outlineMat, disposeSource: false });
    const skeletons: THREE.Skeleton[] = [];
    model.traverse((o) => {
      const sk = (o as THREE.SkinnedMesh).skeleton;
      if (sk && !skeletons.includes(sk)) skeletons.push(sk);
    });
    const root = new THREE.Group();
    root.add(model);
    model.scale.setScalar(0.001);
    const teleMat = new THREE.MeshBasicMaterial({ color: theme.key, transparent: true, opacity: 0, depthWrite: false });
    const tele = new THREE.Mesh(teleGeo, teleMat);
    tele.position.y = 0.03;
    tele.visible = false;
    tele.renderOrder = 2;
    root.add(tele);
    scene.add(root);
    const anim = new Animator(model, k.clips, k.rm, ['Monstr_idle', 'Monstr_walk', 'Monstr_run']);
    const yaw = Math.atan2(P.pos.x - x, P.pos.z - z);
    const e: Enemy = {
      s, root, model, anim, mats, skeletons, tele, teleMat,
      shadow: makeShadow(s.radius * 2.6),
      pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector3(), vy: 0, yaw,
      hp: s.hp, state: 'spawn', t: 0, cd: 0.6 + Math.random() * 0.8, atk: 0, hitT: 0, endT: 0,
      hitDone: false, lunged: false, flash: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 1.5,
      gone: false, prevAnimT: 0,
    };
    anim.play('Monstr_angry', { fade: 0, speed: 1.3 });
    enemies.push(e);
  };

  const removeEnemy = (e: Enemy) => {
    e.gone = true;
    scene.remove(e.root, e.shadow);
    e.anim.dispose();
    e.mats.forEach((m) => m.dispose());
    e.teleMat.dispose();
    e.skeletons.forEach((s) => s.dispose());
  };

  const attackers = () => enemies.reduce((n, e) => n + (e.state === 'attack' ? (e.s.boss ? 2 : 1) : 0), 0);

  const startEnemyAttack = (e: Enemy) => {
    e.state = 'attack';
    e.t = 0;
    e.atk ^= 1;
    const name = e.atk ? 'Monstr_attack_1' : 'Monstr_attack_2';
    const spd = e.s.atkSpeed;
    e.anim.play(name, { fade: 0.1, speed: spd });
    e.hitT = e.s.hits[e.atk ? 0 : 1] / spd;
    e.endT = e.anim.dur(name) / spd;
    e.hitDone = false;
    e.lunged = false;
    e.tele.visible = true;
  };

  const hurtPlayer = (from: THREE.Vector3) => {
    if (P.inv || P.iframes > 0 || P.state === 'dead' || P.state === 'victory' || !P.anim) return;
    P.hp -= 1;
    P.iframes = 1.1;
    tmp.set(P.pos.x - from.x, 0, P.pos.z - from.z).normalize();
    P.vel.copy(tmp).multiplyScalar(5.5);
    P.yaw = Math.atan2(-tmp.x, -tmp.z);
    addShake(0.28);
    hitStop(0.08, 0.07);
    spawnSpark(tmp.set(P.pos.x, P.pos.y + 1.1, P.pos.z), 1.3, white);
    if (P.hp <= 0) {
      P.hp = 0;
      P.state = 'dead';
      P.t = 0;
      P.prevAnimT = 0;
      P.anim.play('Boy_death', { fade: 0.06 });
      hitStop(0.05, 0.2);
    } else {
      P.state = 'hit';
      P.t = 0;
      P.anim.play('Boy_hit', { fade: 0.04 });
    }
  };

  type Power = 'normal' | 'finisher' | 'slam';
  const hurtEnemy = (e: Enemy, dmg: number, power: Power) => {
    if (e.state === 'dead' || (e.state === 'spawn' && e.t < 0.4)) return;
    tmp.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z);
    if (tmp.lengthSq() < 1e-6) fwd(P.yaw, tmp);
    tmp.normalize();
    e.hp -= dmg;
    e.flash = 0.14;
    const sz = e.s.scale;
    spawnSpark(v3.set(e.pos.x - tmp.x * e.s.radius * 0.6, e.pos.y + 1.0 * sz, e.pos.z - tmp.z * e.s.radius * 0.6), 1.1 + 0.3 * sz, power === 'normal' ? white : theme.key);
    const resist = e.s.boss ? 0.4 : 1;
    if (e.hp <= 0) {
      e.state = 'dead';
      e.t = 0;
      e.prevAnimT = 0;
      e.tele.visible = false;
      e.vel.copy(tmp).multiplyScalar((power === 'normal' ? 3.5 : 6) * resist);
      e.anim.play('Monstr_death', { fade: 0.06 });
      hitStop(0.02, e.s.boss ? 0.25 : 0.13);
      addShake(e.s.boss ? 0.5 : 0.22);
      return;
    }
    e.vel.addScaledVector(tmp, (power === 'normal' ? 4 : 8) * resist);
    const armored = e.s.boss && (e.state === 'attack' || (power === 'normal' && Math.random() < 0.5));
    if (power === 'finisher') { hitStop(0.03, 0.08); addShake(0.18); } else if (power === 'slam') { hitStop(0.05, 0.06); } else { hitStop(0.05, 0.045); addShake(0.06); }
    if (armored) return; // гипер-броня босса: только вспышка и толчок
    e.tele.visible = false;
    if (power !== 'normal' && !e.s.boss) {
      e.state = 'down';
      e.t = 0;
      e.vy = power === 'finisher' ? 4.5 : 5.5;
      e.anim.play('Monstr_knockdown', { fade: 0.05 });
    } else {
      e.state = 'hit';
      e.t = 0;
      e.anim.play('Monstr_hit', { fade: 0.05 });
    }
  };

  const toChase = (e: Enemy) => {
    e.state = 'chase';
    e.t = 0;
    e.anim.release(0.22);
  };

  const fwdE = new THREE.Vector3();
  const updateEnemy = (e: Enemy, dt: number) => {
    e.t += dt;
    e.cd -= dt;
    e.flash = Math.max(0, e.flash - dt);
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    const yawTo = Math.atan2(dx, dz);
    const alive = P.state !== 'dead';
    let dvx = 0, dvz = 0, steer = false;
    let face: number | null = null;
    let turn = 7;
    let windup = 0;
    const s = e.s;

    switch (e.state) {
      case 'spawn': {
        const k = Math.min(1, e.t / 0.4);
        e.model.scale.setScalar(s.scale * Math.max(0.001, easeOutBack(k)));
        face = yawTo;
        if (e.t >= e.anim.dur('Monstr_angry') / 1.3) toChase(e);
        break;
      }
      case 'chase': {
        if (!alive || phase === 'victory') { e.state = 'idle'; e.t = 0; e.anim.play('Monstr_angry', { fade: 0.25 }); break; }
        const canAttack = e.cd <= 0 && attackers() < 2;
        if (dist <= s.range + PLAYER_R && canAttack && P.pos.y < 1.2) { startEnemyAttack(e); break; }
        if (dist <= s.range + 1.4 && !canAttack) {
          e.state = 'stance';
          e.t = 0;
          e.strafeT = 1 + Math.random() * 1.5;
          break;
        }
        const sp = dist > 4.5 ? s.run : s.walk + (s.run - s.walk) * clamp((dist - 1.5) / 3, 0, 1);
        dvx = (dx / dist) * sp;
        dvz = (dz / dist) * sp;
        steer = true;
        face = yawTo;
        break;
      }
      case 'stance': {
        if (!alive || phase === 'victory') { e.state = 'idle'; e.t = 0; e.anim.play('Monstr_angry', { fade: 0.25 }); break; }
        face = yawTo;
        turn = 10;
        if (e.cd <= 0 && attackers() < 2) { toChase(e); break; }
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = 1.4 + Math.random() * 1.6; }
        const tx = (dz / dist) * e.strafe, tz = (-dx / dist) * e.strafe;
        const radial = clamp((dist - (s.range + 1.0)) * 1.5, -1.2, 1.2);
        dvx = tx * 1.2 + (dx / dist) * radial;
        dvz = tz * 1.2 + (dz / dist) * radial;
        steer = true;
        // правый бок персонажа при взгляде на +Z — это -X
        const side = tx * -Math.cos(e.yaw) + tz * Math.sin(e.yaw);
        const want = side > 0 ? 'Monstr_walk_strafe_r' : 'Monstr_walk_strafe_l';
        if (e.anim.over !== want) e.anim.play(want, { loop: true, fade: 0.25, speed: 1.1 * (s.boss ? 0.8 : 1) });
        break;
      }
      case 'attack': {
        if (e.t < e.hitT - 0.15) { face = yawTo; turn = 5; }
        windup = clamp(e.t / e.hitT, 0, 1);
        e.tele.scale.setScalar(s.reach * (0.3 + 0.7 * windup));
        e.teleMat.opacity = e.hitDone ? Math.max(0, 0.5 - (e.t - e.hitT) * 5) : 0.12 + 0.3 * windup;
        if (!e.lunged && e.t >= e.hitT - 0.2) {
          e.lunged = true;
          e.vel.addScaledVector(fwd(e.yaw, fwdE), 3 * (s.boss ? 1.3 : 1));
        }
        if (!e.hitDone && e.t >= e.hitT) {
          e.hitDone = true;
          fwd(e.yaw, fwdE);
          const px = P.pos.x - e.pos.x, pz = P.pos.z - e.pos.z;
          const d = Math.hypot(px, pz) || 1e-4;
          const dot = (px * fwdE.x + pz * fwdE.z) / d;
          if (d <= s.reach + PLAYER_R && (dot > 0.42 || d < s.radius + PLAYER_R + 0.2) && P.pos.y < 1.1) hurtPlayer(e.pos);
          if (s.boss) { addShake(0.15); spawnWave(e.pos.x + fwdE.x * 1.4, e.pos.z + fwdE.z * 1.4, 1.6, theme.key, 0.3); }
        }
        if (e.t >= e.hitT + 0.12) e.tele.visible = false;
        e.vel.multiplyScalar(Math.exp(-5 * dt));
        if (e.t >= e.endT) {
          e.state = 'recover';
          e.t = 0;
          e.tele.visible = false;
          e.anim.play('Monstr_attack_idle', { loop: true, fade: 0.2 });
        }
        break;
      }
      case 'recover': {
        face = yawTo;
        turn = 3;
        e.vel.multiplyScalar(Math.exp(-6 * dt));
        if (e.t >= 0.45) {
          e.cd = s.cooldown * (0.8 + Math.random() * 0.5);
          toChase(e);
        }
        break;
      }
      case 'hit': {
        e.vel.multiplyScalar(Math.exp(-5 * dt));
        if (e.t >= e.anim.dur('Monstr_hit') + 0.08) { e.cd = Math.max(e.cd, 0.35); toChase(e); }
        break;
      }
      case 'down': {
        e.vy -= 22 * dt;
        e.pos.y = Math.max(0, e.pos.y + e.vy * dt);
        e.vel.multiplyScalar(Math.exp(-(e.pos.y > 0 ? 1 : 6) * dt));
        if (e.pos.y <= 0 && e.t > 0.85) { e.cd = Math.max(e.cd, 0.5); toChase(e); }
        break;
      }
      case 'dead': {
        e.vel.multiplyScalar(Math.exp(-5 * dt));
        e.vy -= 22 * dt;
        e.pos.y = Math.max(0, e.pos.y + e.vy * dt);
        // root motion клипа смерти (Monstr_death уезжает назад на 0.42)
        const at = e.anim.time('Monstr_death');
        const dzr = e.anim.rmDelta('Monstr_death', e.prevAnimT, at) * s.scale;
        e.prevAnimT = at;
        fwd(e.yaw, fwdE);
        e.pos.addScaledVector(fwdE, dzr);
        const d = e.anim.dur('Monstr_death');
        if (e.t > d + 0.7) {
          const k = (e.t - d - 0.7) / 0.7;
          e.model.position.y = -k * 1.1 * s.scale;
          e.shadow.scale.setScalar(s.radius * 2.6 * Math.max(0, 1 - k));
          if (k >= 1) removeEnemy(e);
        }
        break;
      }
      case 'idle': {
        e.vel.multiplyScalar(Math.exp(-6 * dt));
        if (e.anim.over === 'Monstr_angry' && e.t > e.anim.dur('Monstr_angry')) e.anim.release(0.3);
        break;
      }
    }
    if (e.gone) return;

    if (steer) {
      const k = damp(8, dt);
      e.vel.x += (dvx - e.vel.x) * k;
      e.vel.z += (dvz - e.vel.z) * k;
    } else if (e.state === 'spawn') e.vel.set(0, 0, 0);
    e.pos.x += e.vel.x * dt;
    e.pos.z += e.vel.z * dt;
    if (face !== null) e.yaw += clamp(angDiff(e.yaw, face), -turn * dt, turn * dt);

    // вспышка от удара / свечение замаха
    e.mats.forEach((m) => {
      if (m.userData.glow) return;
      if (e.flash > 0) m.emissive.copy(white).multiplyScalar((e.flash / 0.14) * 0.85);
      else if (windup > 0 && !e.hitDone) m.emissive.copy(theme.key).multiplyScalar(0.35 * windup * (0.7 + 0.3 * Math.sin(e.t * 40)));
      else m.emissive.setRGB(0, 0, 0);
    });

    const hs = Math.hypot(e.vel.x, e.vel.z);
    const [blend, ts] = e.state === 'chase' ? locoParams(hs, s.walkNat, s.runNat) : [0, 1];
    e.anim.update(dt, blend, ts);
  };

  // --- игрок ---
  const fwdP = new THREE.Vector3();
  const softLock = () => {
    let best: Enemy | null = null;
    let bestD = 4;
    const sx = inp.mag > 0.1 ? inp.x : Math.sin(P.yaw);
    const sz = inp.mag > 0.1 ? inp.z : Math.cos(P.yaw);
    for (const e of enemies) {
      if (e.gone || e.state === 'dead') continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD || d < 1e-3) continue;
      if ((dx * sx + dz * sz) / d < 0) continue; // ±90°
      best = e;
      bestD = d;
    }
    if (best) P.yaw = Math.atan2(best.pos.x - P.pos.x, best.pos.z - P.pos.z);
    else if (inp.mag > 0.1) P.yaw = Math.atan2(inp.x, inp.z);
  };

  const startAttack = (i: number) => {
    if (!P.anim) return;
    P.state = 'attack';
    P.combo = i;
    P.t = 0;
    P.prevAnimT = 0;
    P.hitSet.clear();
    softLock();
    P.vel.multiplyScalar(0.2);
    P.anim.play(ATK[i], { fade: 0.06, speed: ATK_SPEED });
  };
  const startRoll = () => {
    if (!P.anim) return;
    const hs = Math.hypot(P.vel.x, P.vel.z);
    if (inp.mag > 0.1) P.yaw = Math.atan2(inp.x, inp.z);
    P.rollK = ROLL_MIN_K + (ROLL_MAX_K - ROLL_MIN_K) * clamp(hs / RUN_SPEED, 0, 1); // roll_min/max_speed
    P.state = 'roll';
    P.t = 0;
    P.prevAnimT = 0;
    P.inv = true;
    P.vel.set(0, 0, 0);
    P.anim.play('Boy_roll', { fade: 0.05, speed: ROLL_ANIM_SPEED });
  };
  const startJump = () => {
    if (!P.anim) return;
    const second = P.jumps >= 1;
    P.state = 'air';
    P.t = 0;
    P.jumps += 1;
    P.vy = JUMP_V * (second ? SECOND_JUMP_K : 1);
    P.anim.play('Boy_jump_start', { fade: second ? 0.08 : 0.05 });
    if (second) spawnWave(P.pos.x, P.pos.z, 0.8, theme.accent, 0.22);
  };
  // Shift / кнопка уклонения: на земле — кувырок, в воздухе — рывок
  const evade = () => consume('roll') || consume('dash');
  const startDash = () => {
    if (!P.anim) return;
    if (inp.mag > 0.1) P.yaw = Math.atan2(inp.x, inp.z);
    P.state = 'dash';
    P.t = 0;
    P.inv = true;
    P.dashCD = DASH_CD;
    if (P.pos.y > 0.01) P.airDash = true;
    fwd(P.yaw, P.vel).multiplyScalar(DASH_SPEED);
    P.vy = 0;
    P.anim.play('Boy_air_dash', { fade: 0.04 });
  };
  const startSlam = () => {
    if (!P.anim) return;
    P.state = 'slam';
    P.t = 0;
    P.slamPhase = 0;
    P.vy = 1.5;
    P.vel.multiplyScalar(0.2);
    softLock();
    P.anim.play('Boy_attack_air_naked_start', { fade: 0.04 });
  };
  const toMove = (fade = 0.15) => {
    P.state = 'move';
    P.t = 0;
    P.inv = false;
    if (P.pos.y <= 0) { P.airDash = false; P.jumps = 0; }
    P.anim?.release(fade);
  };
  const steerVel = (dt: number, speed: number, k: number) => {
    const tx = inp.x * inp.mag * speed, tz = inp.z * inp.mag * speed;
    const a = damp(k, dt);
    P.vel.x += (tx - P.vel.x) * a;
    P.vel.z += (tz - P.vel.z) * a;
  };
  const faceInput = (dt: number, k: number) => {
    if (inp.mag > 0.1) P.yaw += angDiff(P.yaw, Math.atan2(inp.x, inp.z)) * damp(k, dt);
  };
  // root motion по c_traj клипа, вдоль взгляда; не пробиваем врагов насквозь
  const applyRootMotion = (name: string, scale: number, block: boolean) => {
    if (!P.anim) return;
    const at = P.anim.time(name);
    let d = P.anim.rmDelta(name, P.prevAnimT, at) * scale;
    P.prevAnimT = at;
    if (!d) return;
    fwd(P.yaw, fwdP);
    if (block && d > 0) {
      for (const e of enemies) {
        if (e.gone || e.state === 'dead') continue;
        const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
        const dd = Math.hypot(dx, dz);
        if (dd < e.s.radius + PLAYER_R + 0.35 && (dx * fwdP.x + dz * fwdP.z) / (dd || 1) > 0.5) { d = 0; break; }
      }
    }
    P.pos.addScaledVector(fwdP, d);
  };

  const updatePlayer = (dt: number) => {
    const A = P.anim;
    if (!A) return;
    readInput();
    P.t += dt;
    P.iframes = Math.max(0, P.iframes - dt);
    P.rollCD -= dt;
    P.dashCD -= dt;
    P.comboCD -= dt;
    P.comboT -= dt;
    const fighting = phase === 'fight' || phase === 'intro';
    const grounded = P.pos.y <= 0.0001;

    switch (P.state) {
      case 'move': {
        if (!grounded) { P.state = 'air'; P.anim?.play('Boy_jump_mid', { loop: true, fade: 0.15 }); break; }
        steerVel(dt, RUN_SPEED, inp.mag > 0.05 ? 12 : 14);
        faceInput(dt, 14);
        const hs = Math.hypot(P.vel.x, P.vel.z);
        // отпустили стик на полном беге — Boy_stopping
        if (inp.mag < 0.05 && P.prevSpeed > 4.3 && !A.over) {
          P.state = 'stop';
          P.t = 0;
          P.prevAnimT = 0;
          P.vel.set(0, 0, 0);
          A.play('Boy_stopping', { fade: 0.1 });
          break;
        }
        P.prevSpeed = hs;
        // приземление: отпускаем jump_end, когда доиграл или игрок побежал
        if (A.over && (A.time() >= A.dur(A.over) - 0.02 || (hs > 1.5 && P.t > 0.08))) A.release(0.15);
        if (fighting && consume('attack') && P.comboCD <= 0) { startAttack(P.comboT > 0 ? P.comboNext : 0); break; }
        if (consume('jump')) { P.jumps = 0; startJump(); break; }
        if (P.rollCD <= 0 && evade()) { startRoll(); break; }
        break;
      }
      case 'stop': {
        applyRootMotion('Boy_stopping', 1, true);
        if (inp.mag > 0.2 || P.t >= A.dur('Boy_stopping')) { P.prevSpeed = 0; toMove(0.15); break; }
        if (fighting && consume('attack')) { startAttack(0); break; }
        if (consume('jump')) { P.jumps = 0; startJump(); break; }
        if (P.rollCD <= 0 && evade()) startRoll();
        break;
      }
      case 'attack': {
        const name = ATK[P.combo];
        const dur = A.dur(name);
        const at = A.time(name);
        const frac = dur ? at / dur : 1;
        applyRootMotion(name, 1, true);
        P.vel.multiplyScalar(Math.exp(-12 * dt));
        faceInput(dt, 2);
        const [w0, w1] = ATK_WIN[P.combo];
        if (frac >= w0 && frac <= w1) {
          fwd(P.yaw, fwdP);
          for (const e of enemies) {
            if (e.gone || e.state === 'dead' || P.hitSet.has(e)) continue;
            const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 1.3 + e.s.radius || Math.abs(e.pos.y - P.pos.y) > 1.2) continue;
            if (d > 0.5 && (dx * fwdP.x + dz * fwdP.z) / d < 0.3) continue;
            P.hitSet.add(e);
            hurtEnemy(e, P.combo === 2 ? 2 : 1, P.combo === 2 ? 'finisher' : 'normal');
          }
        }
        if (P.rollCD <= 0 && evade()) { startRoll(); break; }
        if (P.combo < 2 && frac >= 0.5 && consume('attack')) { startAttack(P.combo + 1); break; }
        if (frac > w1 && consume('jump')) { P.jumps = 0; startJump(); break; }
        if (at >= dur - 0.001) {
          P.comboNext = P.combo < 2 ? P.combo + 1 : 0;
          P.comboT = P.combo < 2 ? COMBO_WINDOW : 0;
          if (P.combo === 2) P.comboCD = 0.3; // combo_cooldown_after_combo
          toMove(0.2);
        }
        break;
      }
      case 'roll': {
        const dur = A.dur('Boy_roll') / ROLL_ANIM_SPEED;
        const frac = P.t / dur;
        faceInput(dt, 2.5); // roll_control
        applyRootMotion('Boy_roll', P.rollK, false);
        if (frac >= 0.6 && consume('jump')) { P.inv = false; P.jumps = 0; startJump(); break; }
        if (frac >= 0.5 && fighting && consume('attack')) { P.inv = false; startAttack(0); break; }
        if (P.t >= dur) {
          P.rollCD = ROLL_CD;
          fwd(P.yaw, P.vel).multiplyScalar(inp.mag > 0.1 ? RUN_SPEED * 0.7 : 0);
          toMove(0.12);
        }
        break;
      }
      case 'dash': {
        if (P.t >= DASH_TIME) {
          P.inv = false;
          P.vel.multiplyScalar(0.35);
          if (P.pos.y > 0.01) { P.state = 'air'; P.t = 0; A.play('Boy_jump_mid', { loop: true, fade: 0.12 }); } else toMove(0.12);
        }
        break;
      }
      case 'air': {
        P.vy -= (P.vy > 0 ? G_UP : G_DOWN) * dt;
        P.pos.y += P.vy * dt;
        steerVel(dt, RUN_SPEED * 0.9, 6);
        faceInput(dt, 8);
        if (P.vy < 0 && A.over === 'Boy_jump_start') A.play('Boy_jump_mid', { loop: true, fade: 0.1 });
        if (P.pos.y <= 0) {
          P.pos.y = 0;
          P.vy = 0;
          P.airDash = false;
          P.jumps = 0;
          P.state = 'move';
          P.t = 0;
          A.play('Boy_jump_end', { fade: 0.05 });
          spawnWave(P.pos.x, P.pos.z, 0.9, theme.accent, 0.25);
          break;
        }
        if (fighting && consume('attack') && P.pos.y > 0.35) { startSlam(); break; }
        if (P.jumps < MAX_JUMPS && consume('jump')) { startJump(); break; }
        if (P.dashCD <= 0 && !P.airDash && evade()) { startDash(); break; }
        break;
      }
      case 'slam': {
        if (P.slamPhase === 0) {
          P.vy = approach(P.vy, 0, 20 * dt);
          P.pos.y += P.vy * dt;
          if (P.t >= 0.16) { P.slamPhase = 1; P.vy = -24; A.play('Boy_attack_air_naked_mid', { loop: true, fade: 0.03 }); }
        } else if (P.slamPhase === 1) {
          P.pos.y += P.vy * dt;
          if (P.pos.y <= 0) {
            P.pos.y = 0;
            P.vy = 0;
            P.slamPhase = 2;
            P.t = 0;
            P.airDash = false;
            A.play('Boy_attack_air_naked_end', { fade: 0.02, speed: 0.6 });
            fwd(P.yaw, fwdP);
            const cx = P.pos.x + fwdP.x * 0.4, cz = P.pos.z + fwdP.z * 0.4;
            spawnWave(cx, cz, 2.7, theme.accent, 0.4);
            spawnWave(cx, cz, 1.6, white, 0.25);
            addShake(0.4);
            for (const e of enemies) {
              if (e.gone || e.state === 'dead') continue;
              if (Math.hypot(e.pos.x - cx, e.pos.z - cz) <= 2.5 + e.s.radius) hurtEnemy(e, 1, 'slam');
            }
          }
        } else {
          if (P.t >= A.dur('Boy_attack_air_naked_end') / 0.6 + 0.15) toMove(0.15);
          else if (P.t > 0.15 && P.rollCD <= 0 && evade()) startRoll();
        }
        P.vel.multiplyScalar(Math.exp(-8 * dt));
        break;
      }
      case 'hit': {
        P.vel.multiplyScalar(Math.exp(-7 * dt));
        if (P.pos.y > 0 || P.vy > 0) {
          P.vy -= G_DOWN * dt;
          P.pos.y = Math.max(0, P.pos.y + P.vy * dt);
          if (P.pos.y === 0) P.vy = 0;
        }
        if (P.t >= 0.4) toMove(0.15);
        break;
      }
      case 'dead': {
        P.vel.multiplyScalar(Math.exp(-6 * dt));
        if (P.pos.y > 0) { P.vy -= G_DOWN * dt; P.pos.y = Math.max(0, P.pos.y + P.vy * dt); }
        applyRootMotion('Boy_death', 1, false);
        break;
      }
      case 'victory': {
        P.vel.multiplyScalar(Math.exp(-8 * dt));
        if (P.pos.y > 0) { P.vy -= G_DOWN * dt; P.pos.y = Math.max(0, P.pos.y + P.vy * dt); }
        P.yaw += angDiff(P.yaw, 0) * damp(4, dt);
        break;
      }
    }

    if (P.state !== 'roll' && P.state !== 'stop') {
      P.pos.x += P.vel.x * dt;
      P.pos.z += P.vel.z * dt;
    }

    const hs = Math.hypot(P.vel.x, P.vel.z);
    const [blend, ts] = locoParams(hs, WALK_NAT, RUN_NAT);
    A.update(dt, blend, ts);
  };

  // разведение тел и границы арены
  const resolve = () => {
    const live = enemies.filter((e) => !e.gone && e.state !== 'dead');
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.s.radius + b.s.radius;
        if (d < min && d > 1e-4) {
          const k = ((min - d) / d) * 0.5;
          a.pos.x -= dx * k; a.pos.z -= dz * k;
          b.pos.x += dx * k; b.pos.z += dz * k;
        }
      }
    }
    const ghost = P.state === 'roll' || P.state === 'dash' || P.state === 'dead' || P.pos.y > 0.9;
    if (!ghost) {
      for (const e of live) {
        if (e.pos.y > 0.9) continue;
        const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        const min = e.s.radius + PLAYER_R;
        if (d < min && d > 1e-4) {
          const k = (min - d) / d;
          P.pos.x += dx * k * 0.75; P.pos.z += dz * k * 0.75;
          e.pos.x -= dx * k * 0.25; e.pos.z -= dz * k * 0.25;
        }
      }
    }
    const clampArena = (p: THREE.Vector3, r: number) => {
      const l = Math.hypot(p.x, p.z);
      const m = R - r;
      if (l > m) { p.x *= m / l; p.z *= m / l; }
    };
    clampArena(P.pos, PLAYER_R);
    enemies.forEach((e) => { if (!e.gone) clampArena(e.pos, e.s.radius); });
  };

  // --- волны ---
  const startWave = (i: number) => {
    waveIdx = i;
    waveBannerT = 1.4;
    clearT = 0;
    const list = WAVES[i];
    const base = Math.atan2(-P.pos.x, -P.pos.z) + (P.pos.lengthSq() < 1 ? Math.random() * PI * 2 : 0);
    list.forEach((key, n) => {
      const a = base + (n - (list.length - 1) / 2) * 0.9;
      const r = key === 'boss' ? 4.2 : 5.2;
      spawnQueue.push({ key, x: Math.sin(a) * r, z: Math.cos(a) * r, t: 0.9 + n * 0.45, fx: false });
    });
  };

  const showChest = () => {
    if (!kinds) return;
    fwd(P.yaw, fwdP);
    let cx = P.pos.x, cz = P.pos.z - 2.4;
    const l = Math.hypot(cx, cz);
    if (l > R - 1.2) { cx *= (R - 1.2) / l; cz *= (R - 1.2) / l; }
    chest.root.position.set(cx, 0, cz);
    chest.root.rotation.y = Math.atan2(P.pos.x - cx, P.pos.z - cz);
    chest.root.visible = true;
    chest.shadow.visible = true;
    chest.shadow.position.set(cx, 0.012, cz);
    chest.t = 0;
    chest.open?.reset().stop();
    chest.idle?.reset().play();
    spawnWave(cx, cz, 1.8, theme.secondary, 0.5);
  };

  const step = (dt: number) => {
    phaseT += dt;
    waveBannerT = Math.max(0, waveBannerT - dt);
    if (phase === 'intro' && phaseT >= 1.7) {
      phase = 'fight';
      phaseT = 0;
      startWave(0);
    }

    for (let i = spawnQueue.length - 1; i >= 0; i--) {
      const s = spawnQueue[i];
      s.t -= dt;
      if (!s.fx && s.t <= 0.45) {
        s.fx = true;
        spawnWave(s.x, s.z, s.key === 'boss' ? 2.4 : 1.5, theme.secondary, 0.55);
      }
      if (s.t <= 0) {
        spawnQueue.splice(i, 1);
        spawnEnemy(s.key, s.x, s.z);
      }
    }

    updatePlayer(dt);
    enemies.forEach((e) => { if (!e.gone) updateEnemy(e, dt); });
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].gone) enemies.splice(i, 1);
    resolve();

    if (phase === 'fight') {
      if (P.state === 'dead') {
        if (P.t > 1.5) { phase = 'gameover'; phaseT = 0; }
      } else if (!spawnQueue.length && enemies.every((e) => e.state === 'dead')) {
        clearT += dt;
        if (clearT > 1.1) {
          if (waveIdx + 1 < WAVES.length) startWave(waveIdx + 1);
          else {
            phase = 'victory';
            phaseT = 0;
            P.inv = true;
          }
        }
      }
    }
    if (phase === 'victory' && P.anim) {
      if (P.state !== 'victory' && P.state !== 'dead' && P.pos.y <= 0 && (P.state === 'move' || P.state === 'stop' || phaseT > 1.2)) {
        P.state = 'victory';
        P.t = 0;
        P.anim.play('Boy_dance', { loop: true, fade: 0.3 });
        showChest();
      }
    }

    // сундук
    if (chest.t >= 0 && chest.mixer) {
      chest.t += dt;
      const k = Math.min(1, chest.t / 0.45);
      chest.root.scale.setScalar(Math.max(0.001, easeOutBack(k)));
      if (chest.t >= 0.7 && chest.open && !chest.open.isRunning() && chest.open.time === 0) {
        chest.open.reset();
        chest.open.setLoop(THREE.LoopOnce, 1);
        chest.open.clampWhenFinished = true;
        chest.idle?.stop();
        chest.open.play();
        spawnSpark(v3.set(chest.root.position.x, 1.0, chest.root.position.z), 2.2, theme.key);
      }
      chest.mixer.update(dt);
    }

    // визуальные позиции
    P.root.position.copy(P.pos);
    P.root.rotation.y = P.yaw;
    P.root.visible = !(P.iframes > 0 && P.state !== 'hit' && Math.floor(P.iframes * 14) % 2 === 1);
    const sh = 1.3 * clamp(1 - P.pos.y * 0.25, 0.45, 1);
    P.shadow.scale.setScalar(sh);
    P.shadow.position.set(P.pos.x, 0.012, P.pos.z);
    enemies.forEach((e) => {
      e.root.position.copy(e.pos);
      e.root.rotation.y = e.yaw;
      e.shadow.position.set(e.pos.x, 0.012, e.pos.z);
    });
    updateFx(dt);
  };

  // --- камера ---
  const focus = new THREE.Vector3(0, 0, 1.5);
  const camOff = new THREE.Vector3(0, 12.2, 10.8);
  let aspect = 1;
  const updateCamera = (rdt: number) => {
    focus.x += (P.pos.x * 0.6 - focus.x) * damp(5, rdt);
    focus.z += (P.pos.z * 0.6 - focus.z) * damp(5, rdt);
    const k = aspect < 1.25 ? Math.pow(1.25 / aspect, 0.8) : 1;
    camera.position.set(focus.x + camOff.x * k, camOff.y * k, focus.z + camOff.z * k);
    camera.lookAt(focus.x, 0.6, focus.z);
    if (shake > 0) {
      shake = Math.max(0, shake - rdt * 1.6);
      const s = shake * shake * 0.6;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
  };

  applyTheme();

  // --- загрузка ---
  const loader = new GLTFLoader();
  Promise.all([URL_BOY, URL_MONSTR, URL_GOGO, URL_CHEST].map((u) => loader.loadAsync(u)))
    .then(([boy, monstr, gogo, chestG]) => {
      [boy, monstr, gogo, chestG].forEach((g) => sourceScenes.push(g.scene));
      if (disposed) { freeSources(); return; }
      kinds = { boy: prepKind(boy), monstr: prepKind(monstr), gogo: prepKind(gogo), chest: prepKind(chestG) };
      // исходники врагов только клонируются — их glTF-материалы сразу не нужны
      [monstr, gogo].forEach((g) => g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => mt.dispose());
      }));

      // игрок — сама сцена boy (без клона)
      disposables.push(...toonify(boy.scene, { palette, grad, outline: outlineMat }));
      boy.scene.traverse((o) => { const sk = (o as THREE.SkinnedMesh).skeleton; if (sk) disposables.push(sk); });
      P.root.add(boy.scene);
      P.anim = new Animator(boy.scene, kinds.boy.clips, kinds.boy.rm, ['Boy_idle', 'Boy_walk', 'Boy_run']);

      disposables.push(...toonify(chestG.scene, { palette, grad, outline: outlineMat }));
      chestG.scene.traverse((o) => { const sk = (o as THREE.SkinnedMesh).skeleton; if (sk) disposables.push(sk); });
      chest.root.add(chestG.scene);
      chest.mixer = new THREE.AnimationMixer(chestG.scene);
      const openClip = kinds.chest.clips.find((c) => c.name === 'Chest_open');
      chest.open = openClip ? chest.mixer.clipAction(openClip) : null;
      const idleClip = kinds.chest.clips.find((c) => c.name === 'Chest_idle');
      chest.idle = idleClip ? chest.mixer.clipAction(idleClip) : null;

      applyTheme();
      reset();
    })
    .catch(() => {
      if (disposed) return;
      phase = 'error';
      emitHud();
    });

  const freeSources = () => {
    sourceScenes.forEach((s) => s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.outline) m.geometry.dispose();
    }));
  };

  const reset = () => {
    enemies.forEach(removeEnemy);
    enemies.length = 0;
    spawnQueue.length = 0;
    Object.assign(P, {
      vy: 0, yaw: 0, hp: MAX_HP, state: 'move', t: 0, combo: 0, comboNext: 0, comboT: 0, comboCD: 0,
      inv: false, iframes: 0, rollCD: 0, dashCD: 0, airDash: false, prevSpeed: 0,
    });
    P.pos.set(0, 0, 1.5);
    P.vel.set(0, 0, 0);
    P.anim?.release(0);
    P.root.visible = true;
    chest.root.visible = false;
    chest.shadow.visible = false;
    chest.t = -1;
    waveIdx = -1;
    waveBannerT = 0;
    clearT = 0;
    phase = 'intro';
    phaseT = 0;
    shake = 0;
    stopT = 0;
    (Object.keys(buf) as Action[]).forEach((k) => { buf[k] = -9; });
    emitHud();
  };

  // --- цикл ---
  const resize = () => {
    const r = host.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    renderer.setSize(r.width, r.height, false);
    aspect = r.width / r.height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (!running) renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  cleanups.push(() => ro.disconnect());

  let last = 0;
  const tick = (now: number) => {
    const rdt = last ? Math.min((now - last) / 1000, 1 / 20) : 0;
    last = now;
    clock += rdt;
    let scale = 1;
    if (stopT > 0) { stopT -= rdt; scale = stopScale; }
    if (phase !== 'loading' && phase !== 'error') step(rdt * scale);
    updateCamera(rdt);
    renderer.render(scene, camera);
    emitHud();
  };
  let inView = true;
  let paused = false;
  let running = false;
  const sync = () => {
    const should = inView && !document.hidden && !disposed && !paused;
    if (should === running) return;
    running = should;
    last = 0;
    renderer.setAnimationLoop(should ? tick : null);
    if (!should && !disposed) renderer.render(scene, camera);
  };
  const io = new IntersectionObserver((entries) => {
    inView = entries.some((e) => e.isIntersecting);
    sync();
  });
  io.observe(host);
  document.addEventListener('visibilitychange', sync);
  cleanups.push(() => { io.disconnect(); document.removeEventListener('visibilitychange', sync); });
  resize();
  updateCamera(0);
  sync();
  emitHud();

  return {
    press(a) { buf[a] = clock; },
    setAxis(src, x, y) {
      if (src === 'kb') { axis.kx = x; axis.ky = y; } else { axis.sx = x; axis.sy = y; }
    },
    setPaused(p) {
      paused = p;
      if (p) { axis.kx = axis.ky = axis.sx = axis.sy = 0; }
      sync();
    },
    restart() { if (kinds) reset(); },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      cleanups.forEach((fn) => fn());
      enemies.forEach(removeEnemy);
      enemies.length = 0;
      P.anim?.dispose();
      chest.mixer?.stopAllAction();
      if (chest.mixer) chest.mixer.uncacheRoot(chest.mixer.getRoot());
      freeSources();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
