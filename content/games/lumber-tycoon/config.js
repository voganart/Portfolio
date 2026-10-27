// Все настройки креатива по умолчанию. Редактор справа меняет копию этих значений
// и может сохранить её в браузер (localStorage) или выгрузить в JSON.

export const DEFAULTS = {
  format: '9:16',            // '9:16' | '4:5' | '1:1' | '16:9'
  renderScale: 1,            // множитель разрешения рендера
  freeCam: false,            // свободная камера (мышью) вместо режиссёра

  playback: { speed: 1, loop: true },

  look: {
    toneMapping: 'Neutral',  // 'Neutral' | 'ACES' | 'AgX'
    exposure: 1.05,
    bloomStrength: 0.22,
    bloomRadius: 0.35,
    bloomThreshold: 1.2,
    contrast: 1.12,          // S-кривая: глубже тени, ярче света
    vignette: 0.32,
    saturation: 1.12,
    shadows: true,
    shadowRes: 2048,         // 1024 | 2048 | 4096
    ao: true,                // ambient occlusion (контактные тени)
    aoIntensity: 0.85,
    sunIntensity: 3.6,
    skyIntensity: 0.7,
    envIntensity: 0.45,      // отражения окружения

    sky: '#4fa8f0',
    horizon: '#cfe9ff',
    grass: '#3cc25a',
    cliff: '#6b8f4a',
    sand: '#f0d98a',
    tree: '#1fae5b',
    roundTree: '#58c23a',
    birch: '#a6d64a',
    rock: '#9a9282',
    conveyor: '#4f9ff0',
    conveyorStripe: '#a8d6ff',
    curb: '#f4e27a',
    gate: '#e5231d',
    bulbs: '#ffd23a',
    crane: '#f5b800',
    concrete: '#c9c4b8',
    truck: '#f7941d',
    truckCab: '#f4f1ea',
    money: '#59f05a',
    water: '#2c9df0',
    waterDeep: '#1662c4',
    foam: '#eaf7ff',
  },

  // Три линии конвейера: кора сырого бревна → цвет готовой древесины
  wood: [
    { bark: '#5a3b22', moss: '#6f9a2a', mossAmount: 0.25, wood: '#d9843a', cap: '#f5c27a' },
    { bark: '#4c5a2a', moss: '#86c935', mossAmount: 0.7, wood: '#ead3a8', cap: '#fff1d6' },
    { bark: '#4a3b52', moss: '#7c6a8c', mossAmount: 0.4, wood: '#8a6a52', cap: '#c4a283' },
  ],

  production: {
    conveyorSpeed: 5,        // м/с
    spawnInterval: 3.0,      // секунд между брёвнами на линии (чаще — бункер переполнится)
    sawPeriod: 1.4,          // период удара пилы
    sawMaxWait: 6,           // сек: сколько пила ждёт, пока под ней встанут все три пачки
    activeLanes: 3,          // сколько линий работает (в игре открываются по одной)
    beltOn: true,            // станции линии: выключенная держит брёвна перед собой (в игре включаются по очереди)
    debarkOn: true,
    splitOn: true,
    sawOn: true,
    cutShare: 1,             // доля распиленных брёвен, которые падают в бункер по физике (0..1)
    prefillRate: 30,         // брёвен/сек при прыжке на поздний шот (предзаполнение кучи)
  },

  physics: {
    gravity: -20,
    maxDynamic: 180,         // падающих брёвен одновременно; улёгшиеся в бункере «замораживаются»
    physicsStart: 6,         // сек: до этого распиленные брёвна не симулируются (бункер ещё не в кадре)
    throwSpeed: 13,          // м/с: с какой скоростью конвейер бросает брёвна в бункер (у каждого ±45%)
    settleTime: 1.5,         // сек: улёгшееся бревно становится неподвижным не раньше этого
    settleMax: 7,            // сек: дольше этого физика у бревна не работает
    heapNearBelt: 2.2,       // м: высота кучи под конвейером, выше брёвна сталкиваются вниз по склону
    maxLogs: 1400,           // всего брёвен на площадке (лишние убираются со дна кучи)
    friction: 0.7,
    restitution: 0.08,
    buoyancy: 1.7,           // плавучесть брёвен в реке
    truckBuoyancy: 0.9,      // < 1 — грузовик тонет (чем ближе к 1, тем медленнее)
    current: 2.6,            // течение реки, м/с
  },

  particles: {
    sparksPerCut: 80,
    sparkColor: '#ffb733',
    sparkGlow: 3.5,
    barkChips: 46,
    gateGlitter: 26,
    glitterColor: '#c6ff4a',
    sawdust: 44,
    splash: 70,
  },

  trucks: {
    count: 34,               // всего грузовиков в очереди/на погрузке
    speed: 9,
    spawnInterval: 1.6,
    craneSpeed: 1.6,         // скорость манипуляторов
    grabRadius: 6,           // м: из какого радиуса ковш затягивает брёвна
    activeCranes: 3,         // сколько кранов работает (в игре открываются по одному)
    bridgeSpeed: 8,
    bridgeConvoy: 5,         // сколько грузовиков подряд падает с моста
    bridgeGap: 11,           // дистанция между ними, м
  },

  world: { trees: 2600, farTrees: 5000, lodDistance: 110 },  // дальше lodDistance — упрощённые деревья и грузовики

  export: { fps: 30, mbps: 16 },

  audio: { enabled: true, master: 0.9, music: 0.45, sfx: 0.85 },

  // Шоты. type определяет, к какому месту мира относится шот.
  // cam: pos — позиция камеры, target — куда смотрит. blendIn — плавный переход из предыдущего шота (0 = склейка).
  shots: [
    {
      name: '1. Ошкуровка', type: 'debark', enabled: true, duration: 7, blendIn: 0, fov: 45,
      camStart: { pos: [-24, 13, 17], target: [-44, 1.8, -1] },
      camEnd:   { pos: [-29, 10, 13], target: [-42, 1.8, 0] },
    },
    {
      name: '2. Пила', type: 'saw', enabled: true, duration: 7, blendIn: 2, fov: 45,
      camStart: { pos: [16, 24, 8], target: [-5, -2, 1] },
      camEnd:   { pos: [12, 18, 6], target: [-5, -1, 1] },
    },
    {
      name: '3. Кран грузит', type: 'yard', enabled: true, duration: 12, blendIn: 2.5, fov: 45,
      camStart: { pos: [44, 17, 28], target: [17, -3, -1] },
      camEnd:   { pos: [37, 12, 18], target: [19, -3, -3] },
    },
    {
      name: '4. Очередь грузовиков', type: 'traffic', enabled: true, duration: 7, blendIn: 2.5, fov: 45,
      camStart: { pos: [33, 20, 4], target: [24, -4, 52] },
      camEnd:   { pos: [36, 32, -2], target: [24, -4, 72] },
    },
    {
      name: '5. Мост закрыт', type: 'bridge', enabled: true, duration: 14, blendIn: 0, fov: 45,
      camStart: { pos: [227, 15, 58], target: [220, -4, 8] },
      camEnd:   { pos: [231, 9, 20], target: [219, -5, -4] },
    },
  ],
};
