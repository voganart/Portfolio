import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useTranslations } from '../../hooks/useTranslations';
import { loadPalette, makeColorReader, makeGradientMap, makeOutlineMaterial, readTheme, stripRootMotion, fixFeet, toonify, watchTheme } from './toon';

// мини-игра (движок + модели врагов) грузится отдельным чанком только по кнопке Play
const loadGame = () => import('../game/MiniGame');
const MiniGame = lazy(loadGame);

// «Вьюпорт аниматора»: персонаж Boy (toon + контур), клипы, дорожка ключей.
// Весь three.js живёт только здесь — компонент грузится через React.lazy отдельным чанком.

type Hero3DProps = { hint: string; className?: string };
type Status = 'loading' | 'ready' | 'error' | 'nowebgl';

const MODEL_URL = `${import.meta.env.BASE_URL}content/3d/boy.glb`;
const PALETTE_URL = `${import.meta.env.BASE_URL}content/3d/boy_palette.png`;
// цвет ключей берём из темы (--site-key), запасной — янтарный
const KEY_COLOR = 'var(--site-key, #fbbf24)';
const MONO = 'var(--font-mono, ui-monospace, monospace)';
const CLIPS = [
  'Boy_idle', 'Boy_walk', 'Boy_run', 'Boy_dance',
  'Boy_attack_naked_1', 'Boy_attack_naked_2', 'Boy_attack_naked_3',
  'Boy_roll', 'Boy_air_dash', 'Boy_hit', 'Boy_jump_start', 'Boy_death',
];
const ONESHOT = /attack|hit|roll$|air_dash|jump_start|death/;
const IDLE = 'Boy_idle';

export default function Hero3D({ hint, className = '' }: Hero3DProps) {
  const { t } = useTranslations();
  const g = t.game;
  const [mode, setMode] = useState<'viewport' | 'game'>('viewport');
  const [apiFs, setApiFs] = useState(false);
  const [fakeFs, setFakeFs] = useState(false);
  const fs = apiFs || fakeFs;
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<(name: string) => void>(() => {});

  const [status, setStatus] = useState<Status>('loading');
  const [current, setCurrent] = useState(IDLE);

  useEffect(() => {
    if (mode !== 'viewport') return;
    const root = rootRef.current;
    const stage = stageRef.current;
    const host = canvasHostRef.current;
    if (!root || !stage || !host) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      setStatus('nowebgl');
      return;
    }
    setStatus('loading');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.className = 'block h-full w-full';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(2.6, 1.7, 4.2);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.85, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.minPolarAngle = 0.6;
    controls.maxPolarAngle = 1.55;
    controls.autoRotateSpeed = 0.6;
    // на тач-экранах вертикальный свайп скроллит страницу, горизонтальный — вращает
    canvas.style.touchAction = 'pan-y';

    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => { controls.autoRotate = !motionMq.matches; };
    applyMotion();
    motionMq.addEventListener('change', applyMotion);
    cleanups.push(() => motionMq.removeEventListener('change', applyMotion));

    // свет: заполняющий + ключевой + контровой (цвет акцента) + подкрашивающий (вторичный)
    // r155+: физичные единицы света, умножаем на PI, чтобы совпасть с прототипом (r149 legacy)
    const PI = Math.PI;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 0.9 * PI));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4 * PI);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0xffffff, 1.6 * PI);
    rim.position.set(-4, 2.5, -3);
    scene.add(rim);
    const tint = new THREE.PointLight(0xffffff, 0.8 * PI, 8, 1);
    tint.position.set(-1.5, 1.2, 1.5);
    scene.add(tint);

    // пьедестал: диск + кольцо
    const discMat = new THREE.MeshToonMaterial({ color: 0x222034 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.12, 48), discMat);
    disc.position.y = -0.06;
    scene.add(disc);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.5, 64), ringMat);
    ring.rotation.x = -PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    const grad = makeGradientMap();
    const outlineMat = makeOutlineMaterial(0.012);

    // тема
    const readColor = makeColorReader();
    const applyTheme = () => {
      const th = readTheme(root, readColor);
      rim.color.copy(th.accent);
      ringMat.color.copy(th.accent);
      tint.color.copy(th.secondary);
      discMat.color.copy(th.surface);
      outlineMat.color.copy(th.bg);
    };
    applyTheme();
    cleanups.push(watchTheme(root, applyTheme));

    const palette = loadPalette(PALETTE_URL);

    // анимация
    let mixer: THREE.AnimationMixer | null = null;
    const actions: Record<string, THREE.AnimationAction> = {};
    let currentAction: THREE.AnimationAction | null = null;
    let currentName = '';
    const owned: Array<{ dispose: () => void }> = [];

    const play = (name: string) => {
      const next = actions[name];
      if (!mixer || !next || next === currentAction) return;
      next.reset();
      next.setLoop(ONESHOT.test(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = true;
      next.fadeIn(0.2).play();
      currentAction?.fadeOut(0.2);
      currentAction = next;
      currentName = name;
      setCurrent(name);
    };
    playRef.current = play;

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) owned.push(m.geometry);
        });
        owned.push(...toonify(model, { palette, grad, outline: outlineMat }));
        model.traverse((o) => {
          const sk = (o as THREE.SkinnedMesh).skeleton;
          if (sk && !owned.includes(sk)) owned.push(sk);
        });

        if (disposed) {
          owned.forEach((d) => d.dispose());
          return;
        }

        // нормируем рост ~1.7 и ставим на пьедестал
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const h = box.max.y - box.min.y || 1;
        const k = 1.7 / h;
        model.scale.setScalar(k);
        // земля — начало координат модели (там стоит c_traj, как в Godot), а не низ bbox позы привязки
        model.position.y = 0;
        scene.add(model);

        mixer = new THREE.AnimationMixer(model);
        // c_traj — трек root motion: в Godot он не применяется к скелету (root_motion_track),
        // поэтому вырезаем его, иначе персонаж уезжает с диска и тянется по масштабу
        gltf.animations.forEach((c) => {
          stripRootMotion(c);
          fixFeet(c);
          actions[c.name] = mixer!.clipAction(c);
        });
        mixer.addEventListener('finished', () => play(IDLE));
        setStatus('ready');
        play(actions[IDLE] ? IDLE : (gltf.animations[0]?.name ?? ''));
      },
      undefined,
      () => { if (!disposed) setStatus('error'); },
    );

    // клик без перетаскивания — следующая анимация по кругу
    let cycle = 0; // idle — первый в списке
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) { down = null; return; }
      down = null;
      const list = CLIPS.filter((n) => actions[n]);
      if (!list.length) return;
      cycle = (cycle + 1) % list.length;
      if (list[cycle] === currentName) cycle = (cycle + 1) % list.length;
      play(list[cycle]);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);

    const resize = () => {
      const r = stage.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();
    cleanups.push(() => ro.disconnect());

    // цикл рендера: только когда видно на экране и вкладка активна
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      mixer?.update(dt);
      controls.update(dt);
      renderer.render(scene, camera);
    };
    let inView = true;
    let running = false;
    const sync = () => {
      const should = inView && !document.hidden && !disposed;
      if (should === running) return;
      running = should;
      last = 0;
      renderer.setAnimationLoop(should ? tick : null);
    };
    const io = new IntersectionObserver((entries) => {
      inView = entries.some((e) => e.isIntersecting);
      sync();
    });
    io.observe(stage);
    document.addEventListener('visibilitychange', sync);
    sync();
    cleanups.push(() => { io.disconnect(); document.removeEventListener('visibilitychange', sync); });

    return () => {
      disposed = true;
      playRef.current = () => {};
      renderer.setAnimationLoop(null);
      cleanups.forEach((fn) => fn());
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      controls.dispose();
      mixer?.stopAllAction();
      if (mixer) mixer.uncacheRoot(mixer.getRoot());
      owned.forEach((d) => d.dispose());
      disc.geometry.dispose();
      ring.geometry.dispose();
      discMat.dispose();
      ringMat.dispose();
      outlineMat.dispose();
      grad.dispose();
      palette.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [mode]);

  // полноэкранный режим: Fullscreen API на карточке, иначе (iOS Safari) — фиксированный оверлей
  useEffect(() => {
    const onChange = () => {
      const on = !!rootRef.current && document.fullscreenElement === rootRef.current;
      setApiFs(on);
      if (on) setFakeFs(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement && document.fullscreenElement === rootRef.current) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!fakeFs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFakeFs(false); };
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fakeFs]);

  const toggleFs = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) { void document.exitFullscreen().catch(() => {}); return; }
    if (fakeFs) { setFakeFs(false); return; }
    if (document.fullscreenEnabled && el.requestFullscreen) {
      el.requestFullscreen().catch(() => setFakeFs(true));
      // встроенные браузеры/вебвью иногда молча игнорируют запрос — тогда тоже оверлей
      window.setTimeout(() => { if (document.fullscreenElement !== el) setFakeFs(true); }, 1200);
    } else setFakeFs(true);
  }, [fakeFs]);

  const exitGame = useCallback(() => {
    if (document.fullscreenElement === rootRef.current) void document.exitFullscreen().catch(() => {});
    setFakeFs(false);
    setMode('viewport');
  }, []);

  const overlay =
    status === 'loading' ? 'loading boy.glb…'
      : status === 'error' ? 'model failed to load'
        : status === 'nowebgl' ? '3D unavailable (WebGL is off)'
          : null;

  return (
    <div
      ref={rootRef}
      className={`min-w-0 overflow-hidden border-white/10 ${
        fs
          ? `flex h-full w-full flex-col bg-[color:var(--site-bg)] ${fakeFs ? 'fixed inset-0 z-[200]' : ''}`
          : `rounded-[18px] border bg-[color:var(--site-surface)] ${className}`
      }`}
      aria-label="3D viewport"
      role="group"
    >
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2 text-xs tracking-[.04em] text-white/55"
        style={{ fontFamily: MONO }}
      >
        {mode === 'viewport' ? (
          <>
            <span>Boy · 44 bones · 1.1k verts</span>
            <span className="flex items-center gap-2.5">
              <span style={{ color: KEY_COLOR }}>● {current}</span>
              <button
                type="button"
                onClick={() => setMode('game')}
                onPointerEnter={() => { void loadGame(); }}
                onFocus={() => { void loadGame(); }}
                className="theme-accent-bg rounded-md px-2.5 py-1 text-[11px] font-bold tracking-[.06em] transition hover:brightness-110"
                style={{ fontFamily: MONO }}
              >
                ▶ {g.play}
              </button>
            </span>
          </>
        ) : (
          <>
            <span className="text-[color:var(--site-accent)]">▶ {g.round}</span>
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleFs}
                onMouseDown={(e) => e.preventDefault()} // фокус остаётся в игре — без паузы
                aria-label={fs ? g.exitFullscreen : g.fullscreen}
                title={fs ? g.exitFullscreen : g.fullscreen}
                className="grid h-7 min-w-7 place-items-center rounded-md border border-white/10 px-1.5 text-white/70 transition hover:text-white"
              >
                {fs ? '⤢' : '⛶'}
              </button>
              <button
                type="button"
                onClick={exitGame}
                aria-label={g.back}
                title={g.back}
                className="flex h-7 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-white/70 transition hover:text-white"
              >
                ✕ <span className="hidden sm:inline">{g.back}</span>
              </button>
            </span>
          </>
        )}
      </div>

      {mode === 'game' ? (
        <Suspense
          fallback={(
            <div className="grid aspect-[4/3.1] w-full place-items-center text-xs text-white/55" style={{ fontFamily: MONO }}>
              {g.loading}
            </div>
          )}
        >
          <MiniGame onExit={exitGame} fullscreen={fs} />
        </Suspense>
      ) : (
      <>
      <div ref={stageRef} className="relative aspect-[4/3.1] w-full max-w-full cursor-grab select-none active:cursor-grabbing">
        <div ref={canvasHostRef} className="absolute inset-0" />
        {overlay && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-white/55" style={{ fontFamily: MONO }}>
            {overlay}
          </div>
        )}
        {status !== 'nowebgl' && status !== 'error' && (
          <span
            className="pointer-events-none absolute bottom-3 left-3.5 right-3.5 text-xs tracking-[.04em] text-white/55"
            style={{ fontFamily: MONO }}
          >
            {hint}
          </span>
        )}
      </div>

      </>
      )}
    </div>
  );
}
