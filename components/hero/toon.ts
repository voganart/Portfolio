import * as THREE from 'three';

// Общие помощники toon-рендера для вьюпорта и мини-игры.

// CSS-цвет (hex/rgba/oklch/color-mix…) → THREE.Color; полупрозрачный цвет кладём поверх подложки
export function makeColorReader() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  return (value: string, fallback: string, under = '#000000') => {
    const out = new THREE.Color(fallback);
    if (!ctx || !value) return out;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = under;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = fallback;
    ctx.fillStyle = value; // невалидное значение браузер просто проигнорирует
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return out.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  };
}

export type ThemeColors = {
  bg: THREE.Color;
  accent: THREE.Color;
  secondary: THREE.Color;
  surface: THREE.Color;
  key: THREE.Color;
};

export function readTheme(el: Element, read = makeColorReader()): ThemeColors {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const bg = read(v('--site-bg'), '#0b0a14');
  return {
    bg,
    accent: read(v('--site-accent'), '#2dd4bf'),
    secondary: read(v('--site-secondary'), '#a855f7'),
    surface: read(v('--site-surface'), '#1a1730', `#${bg.getHexString(THREE.SRGBColorSpace)}`),
    key: read(v('--site-key'), '#fbbf24'),
  };
}

// подписка на смену data-theme у ближайшего предка; возвращает отписку
export function watchTheme(el: Element, cb: () => void) {
  const host = el.closest('[data-theme]') ?? document.documentElement;
  const obs = new MutationObserver(() => cb());
  obs.observe(host, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}

// 3-ступенчатая карта освещения для toon
export function makeGradientMap() {
  const grad = new THREE.DataTexture(new Uint8Array([60, 150, 255]), 3, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.generateMipmaps = false;
  grad.needsUpdate = true;
  return grad;
}

// инвертированная оболочка: выдавливание по нормали после скиннинга (как в godot-шейдере)
export function makeOutlineMaterial(width = 0.012) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x0b0a14, side: THREE.BackSide });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace(
      '#include <project_vertex>',
      `#ifdef USE_SKINNING
  transformed += normalize(objectNormal) * ${width.toFixed(4)};
#else
  transformed += normalize(normal) * ${width.toFixed(4)};
#endif
#include <project_vertex>`,
    );
  };
  mat.customProgramCacheKey = () => `outline${width}`;
  return mat;
}

export function loadPalette(url: string) {
  const palette = new THREE.TextureLoader().load(url);
  palette.flipY = false;
  palette.colorSpace = THREE.SRGBColorSpace;
  palette.magFilter = palette.minFilter = THREE.NearestFilter;
  palette.generateMipmaps = false;
  return palette;
}

type ToonOpts = {
  palette: THREE.Texture;
  grad: THREE.Texture;
  outline: THREE.Material;
  // исходные материалы glTF освобождаем только у оригинала, не у клонов
  disposeSource?: boolean;
};

// заменяет материалы на toon (палитра; материал «eye» — свой цвет + эмиссия) и добавляет контур.
// возвращает созданные материалы (их освобождает вызывающий)
export function toonify(model: THREE.Object3D, { palette, grad, outline, disposeSource = true }: ToonOpts) {
  const created: THREE.MeshToonMaterial[] = [];
  const pairs: Array<[THREE.Mesh, THREE.Mesh]> = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = Array.isArray(m.material) ? m.material[0] : m.material;
    const std = src as THREE.MeshStandardMaterial;
    let mat: THREE.MeshToonMaterial;
    if (/eye/i.test(src.name) && std.color) {
      mat = new THREE.MeshToonMaterial({ color: std.color.clone(), emissive: std.emissive?.clone() ?? new THREE.Color(0), gradientMap: grad });
      mat.emissiveIntensity = 1.6;
      mat.userData.glow = true;
    } else {
      mat = new THREE.MeshToonMaterial({ map: palette, gradientMap: grad, emissive: 0x000000 });
    }
    if (disposeSource) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => mt.dispose());
    m.material = mat;
    m.frustumCulled = false;
    created.push(mat);
    let ol: THREE.Mesh;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = m as THREE.SkinnedMesh;
      const so = new THREE.SkinnedMesh(sm.geometry, outline);
      so.bindMode = sm.bindMode;
      so.bind(sm.skeleton, sm.bindMatrix);
      ol = so;
    } else {
      ol = new THREE.Mesh(m.geometry, outline);
    }
    ol.frustumCulled = false;
    ol.userData.outline = true;
    pairs.push([m, ol]);
  });
  pairs.forEach(([m, ol]) => {
    ol.position.copy(m.position);
    ol.quaternion.copy(m.quaternion);
    ol.scale.copy(m.scale);
    m.parent?.add(ol);
  });
  return created;
}

// c_traj — трек root motion (Auto-Rig Pro): в Godot он не применяется к скелету (root_motion_track).
// Вырезаем из клипа, но возвращаем трансляцию отдельно — по ней можно двигать персонажа.
export function stripRootMotion(clip: THREE.AnimationClip) {
  const tr = clip.tracks.find((t) => t.name === 'c_traj.position') as THREE.VectorKeyframeTrack | undefined;
  clip.tracks = clip.tracks.filter((t) => !t.name.startsWith('c_traj.'));
  return tr ?? null;
}

// В «стоячих» клипах Boy стопы задраны носком вверх на ~15.6° относительно позы привязки
// (подушечка висит над полом). Доворачиваем стопу вокруг её локальной оси X — в опоре она встаёт плоско.
const FOOT_FIX_CLIPS = new Set([
  'Boy_idle', 'Boy_hit', 'Boy_death', 'Boy_jump_start', 'Boy_jump_end', 'Boy_stopping', 'Boy_walk', 'Boy_run',
]);
const FOOT_FIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(15.6));

export function fixFeet(clip: THREE.AnimationClip) {
  if (!FOOT_FIX_CLIPS.has(clip.name)) return;
  const q = new THREE.Quaternion();
  clip.tracks.forEach((t) => {
    // имена костей foot.l / foot.r после санитайза three.js — footl / footr
    if (t.name !== 'footl.quaternion' && t.name !== 'footr.quaternion') return;
    const v = t.values;
    for (let i = 0; i < v.length; i += 4) {
      q.fromArray(v, i).multiply(FOOT_FIX).toArray(v, i);
    }
  });
}
