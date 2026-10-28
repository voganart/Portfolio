// Игровая версия: тот же мир и физика (main.js), поверх — экономика, улучшения, обучение, интерфейс и финал на мосту.
// main.js в игровом режиме не запускает режиссёра и редактор, а отдаёт всё нужное через window.__creative.
// Сюжет: копишь на дорогу в город → колонна срывается с недостроенного моста → достраиваешь 3 пролёта → колонна доезжает.
import * as THREE from 'three';

window.LUMBER_GAME = true;
await import('./main.js' + new URL(import.meta.url).search); // same ?v=<build> as game.js
const C = window.__creative;
const { cfg, camera, controls, trucks, moneyTiles, moneyMesh, hooks, sfx } = C;

// ───────────────────────── balance ─────────────────────────
const START_MONEY = 200;
// The factory starts switched off: each station is bought in turn, a station that is off holds the logs in front of it
const SETUP = [
  { key: 'beltOn', ico: '⚙️', name: 'Запустить конвейер', cost: 20, view: 'gate', toast: '⚙️ Конвейер везёт брёвна' },
  { key: 'debarkOn', ico: '🌀', name: 'Окорочная машина', cost: 30, view: 'gate', toast: '🌀 Кора снимается с брёвен' },
  { key: 'splitOn', ico: '🔪', name: 'Раскрой на брус', cost: 40, view: 'mill', toast: '🔪 Бревно распускается на пачку' },
  { key: 'sawOn', ico: '🪚', name: 'Торцовочная пила', cost: 50, view: 'saw', toast: '🪚 Пила режет пачки и бросает в бункер' },
  { key: 'crane', ico: '🏗️', name: 'Первый кран', cost: 60, view: 'yard', toast: '🏗️ Кран грузит грузовики' },
];
const START = { id: 'setup', ico: '' };
const GOAL_TRUCKS = 6;                 // trucks to send before the road to the city opens
const ROAD_COST = 300;                 // first attempt (ends in the river)
// Level 2 (after the convoy falls, money is lost with the trucks): each of the three spans needs
// timber trucks delivered since the previous span, and then money to build it
const SPAN_COSTS = [400, 600, 850];
const SPAN_TRUCKS = [4, 5, 6];
// Level 3 «Город растёт»: six houses of the new quarter, three stages each (foundation, walls, roof).
// Every stage needs one timber truck delivered since the previous stage, and money; a finished house pays rent.
const HOUSES = 6, CITY_STAGE_NAMES = ['фундамент', 'стены', 'крыша'];
const cityCost = (n) => Math.round(100 * 1.13 ** n / 10) * 10; // $100 … $800, about $6K for the quarter
const RENT = 30, RENT_PERIOD = 8;
// Level 4 «Сплав по реке»: every delivered truck rolls its logs down the chute into the river, the boom steers them into
// a barge. A full barge needs a tug (money) to leave; three barges finish the game. Now and then a fallen tree jams the river.
const BARGES = 3, TUG_COSTS = [400, 650, 900], LOGS_PER_TRUCK = 6;
const RIVER_LIMIT = { low: 45, medium: 70, high: 100 }; // floating logs simulated at once
// Levels 3–4: the town has incidents (a house on fire, a machine that breaks down) and the till pays a tax
// on what lies above TAX_FREE, so the money doesn't just pile up
const TAX_RATE = 0.06, TAX_FREE = 500;
const TURBO_K = 1.8, TURBO_DRAIN = 0.3, TURBO_REFILL = 0.1;
const pow = (base, k) => (l) => Math.round(base * k ** l);
const UPGRADES = [
  { id: 'crane', ico: '🏗️', name: 'Ещё кран', max: 2, cost: (l) => [120, 380][l] },
  { id: 'lane', ico: '🛤️', name: 'Новая линия', max: 2, cost: (l) => [160, 450][l] },
  { id: 'belt', ico: '⏩', name: 'Быстрый конвейер', max: 4, cost: pow(60, 1.75) },
  { id: 'saw', ico: '🪚', name: 'Острая пила', max: 4, cost: pow(80, 1.75) },
  { id: 'arm', ico: '🦾', name: 'Шустрые краны', max: 4, cost: pow(90, 1.75) },
  { id: 'truck', ico: '🚚', name: 'Быстрые грузовики', max: 4, cost: pow(70, 1.75) },
  { id: 'auto', ico: '🤖', name: 'Авто­сборщик', max: 2, cost: (l) => [150, 500][l] },
  { id: 'price', ico: '💰', name: 'Дороже лес', max: 4, cost: pow(140, 1.8) },
];
const FINAL = { id: 'city', ico: '🌉' };
// Wages: every PAY_PERIOD seconds the workers are paid, the bill grows with the factory.
// Not enough money → it is taken to zero, the rest becomes a debt and the workers strike (factory at half speed)
// until the debt is paid off from new income.
const PAY_PERIOD = 45, STRIKE_K = 0.5;
const wageBill = () => 15 + 12 * cfg.trucks.activeCranes + 12 * cfg.production.activeLanes + 4 * (lvl.belt + lvl.saw + lvl.arm + lvl.truck + lvl.price);
// "Дороже лес": each level is a more valuable wood species with its own colours (bundles, halves, truck loads)
const sp3 = (bark, moss, mossAmount, woods, caps) => woods.map((wood, i) => ({ bark: bark[i], moss, mossAmount, wood, cap: caps[i] }));
const SPECIES = [null,
  { name: 'Берёза', ico: '🤍', w: sp3(['#e9e5dc', '#dcd8cf', '#f0ece4'], '#24201d', 0.32, ['#f1dfb6', '#ead6a8', '#f5e6c4'], ['#fff4d9', '#fbeccc', '#fff8e8']) },
  { name: 'Вишня', ico: '🍒', w: sp3(['#6a2a24', '#5a221e', '#74302a'], '#a8443a', 0.22, ['#d4553c', '#c84a36', '#e06548'], ['#f5a585', '#f09a7a', '#ffb394']) },
  { name: 'Орех', ico: '🌰', w: sp3(['#2a1d15', '#231811', '#30221a'], '#4a3626', 0.3, ['#6e3c22', '#5f331d', '#7a4628'], ['#a8724a', '#9b6842', '#b67f55']) },
  { name: 'Золотой дуб', ico: '✨', w: sp3(['#6b4a12', '#5e4010', '#765318'], '#ffcc33', 0.5, ['#f2b23a', '#e8a12a', '#ffc24a'], ['#ffe390', '#ffdb7a', '#ffeaa6']) }];
const baseWood = structuredClone(cfg.wood), BASE_CURRENT = cfg.physics.current;
// every species is built (and uploaded to the GPU) while loading, so the upgrade switches instantly
C.preloadWood(0, baseWood);
SPECIES.forEach((sp, i) => { if (sp) C.preloadWood(i, sp.w); });
const cutValue = () => 10 + lvl.price * 5;        // per sawn bundle
const truckValue = () => 50 + lvl.price * 25;     // per loaded truck

// Fewer, slower logs than the creative: the bin stays readable and the cranes keep up
cfg.production.cutShare = 0.45;        // part of a sawn bundle that falls into the bin
cfg.physics.maxLogs = 650;             // extra logs are removed from the bottom of the heap
cfg.physics.maxDynamic = 160;
// lower graphics presets also simulate fewer logs and emit fewer particles (applied again when the preset changes)
const FX = { low: 0.5, medium: 0.75, high: 1 }, fxK = () => FX[C.QUALITY] ?? 1, baseSawdust = cfg.particles.sawdust;
function applyQualityLimits() {
  const q = C.QUALITY;
  cfg.physics.maxLogs = { low: 450, medium: 550, high: 650 }[q] ?? 650;
  cfg.physics.maxDynamic = { low: 90, medium: 120, high: 160 }[q] ?? 160;
  cfg.particles.sawdust = Math.round(baseSawdust * fxK());
}
applyQualityLimits();
cfg.trucks.solo = true;                // a loaded truck leaves at once if no truck stands in front of it (no overtaking)
cfg.trucks.partialAfter = 6;           // a truck whose crane brought nothing for 6 s leaves with the full ones (paid for what it carries)

// ───────────────────────── state ─────────────────────────
const lvl = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
// stage: grow → (road bought) fall → build (spans) → cross → win
const game = { money: 0, shown: 0, delivered: 0, bought: 0, turbo: 1, turboOn: false, stage: 'grow', started: false, cinematic: false };
const $ = (id) => document.getElementById(id);
window.__game = { game, lvl, get timers() { return timers; }, // debug access from the console
  view(name) { const v = viewPose(VIEWS[name]); fly = null; controls.target.copy(v.t); camera.position.copy(v.p); } };

// stats from upgrade levels (+ turbo), written into the shared config every frame
function applyStats() {
  const k = (game.turboOn ? TURBO_K : 1) * (game.debt > 0 ? STRIKE_K : 1);
  cfg.production.conveyorSpeed = (4 + lvl.belt * 1.0) * k;
  cfg.production.spawnInterval = (4.4 - lvl.belt * 0.45) / k;
  cfg.production.sawPeriod = (1.7 - lvl.saw * 0.22) / k;
  cfg.trucks.craneSpeed = (1.5 + lvl.arm * 0.35) * k;
  cfg.trucks.speed = (9 + lvl.truck * 3) * k;
}

// frame-timed scheduler (keeps cinematics in sync with what is drawn, even on a slow machine)
const timers = [];
const after = (sec, fn) => timers.push({ t: sec, fn });
function updateTimers(dt) {
  for (const tm of [...timers]) if ((tm.t -= dt) <= 0) { timers.splice(timers.indexOf(tm), 1); tm.fn(); }
}

// ───────────────────────── camera ─────────────────────────
controls.enabled = true;
controls.screenSpacePanning = false;
controls.minDistance = 22; controls.maxDistance = 120;
controls.minPolarAngle = 0.5; controls.maxPolarAngle = 1.2;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
const VIEWS = {
  yard: { target: [10, -2, 0], dir: [0.62, 0.62, 0.48], dist: 62 },
  mill: { target: [-24, 1, 0], dir: [0.3, 0.62, 0.72], dist: 46 },
  gate: { target: [-44, 1, 0], dir: [0.35, 0.6, 0.72], dist: 34 },
  saw: { target: [-2, -1, 0], dir: [0.55, 0.65, 0.52], dist: 42 },
  road: { target: [27, -4, 40], dir: [0.55, 0.62, -0.55], dist: 58 },
  pad: { target: [34, -3, 3], dir: [0.45, 0.62, 0.64], dist: 30 }, // the cash pad and the auto collector
  bridge: { target: [C.BRIDGE_X, -4, -4], dir: [0.55, 0.5, 0.67], dist: 34 },
  convoy: { target: [C.BRIDGE_X, -4, 4], dir: [0.17, 0.27, 0.95], dist: 54 },
  city: { target: [340, -4, -42], dir: [0.22, 0.66, 0.72], dist: 84 },
  river: { target: [224, -5, 9], dir: [-0.3, 0.7, 0.65], dist: 108 },
};
let fly = null;
function viewPose(v) {
  const portrait = innerWidth < innerHeight ? 1.35 : 1;
  const t = new THREE.Vector3(...v.target);
  return { t, p: new THREE.Vector3(...v.dir).normalize().multiplyScalar(v.dist * portrait).add(t) };
}
function setView(name, dur = 1) {
  const pose = viewPose(VIEWS[name]);
  fly = { t0: controls.target.clone(), p0: camera.position.clone(), t1: pose.t, p1: pose.p, k: 0, dur };
  for (const b of document.querySelectorAll('#views button')) b.classList.toggle('on', b.dataset.view === name);
}
function updateCamera(dt) {
  if (fly) {
    fly.k = Math.min(1, fly.k + dt / fly.dur);
    const e = fly.k < 0.5 ? 4 * fly.k ** 3 : 1 - (-2 * fly.k + 2) ** 3 / 2;
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    if (fly.k >= 1) fly = null;
  } else if (!game.cinematic) { // keep the player over the factory (and the bridge, once it matters)
    const t = controls.target, maxX = game.stage === 'grow' ? 45 : lateStage() ? 400 : C.BRIDGE_X + 15;
    const x = THREE.MathUtils.clamp(t.x, -60, maxX), z = THREE.MathUtils.clamp(t.z, lateStage() ? -60 : -30, 75);
    if (x !== t.x || z !== t.z) { camera.position.x += x - t.x; camera.position.z += z - t.z; t.x = x; t.z = z; }
  }
}
{ const v = viewPose(VIEWS.yard); controls.target.copy(v.t); camera.position.copy(v.p); }
for (const b of document.querySelectorAll('#views button')) b.onclick = () => { homeTok++; setView(b.dataset.view); };
// after an upgrade is shown the camera flies back to the yard (the player's own camera moves cancel it)
let homeTok = 0;
function goHome(delay = 3) {
  const tok = ++homeTok;
  after(delay, () => { if (tok === homeTok && !game.cinematic) setView('yard', 1.2); });
}
C.renderer.domElement.addEventListener('pointerdown', () => { homeTok++; });
function cinematic(on) {
  game.cinematic = on; controls.enabled = !on; game.turboOn = false;
  for (const id of ['shop', 'turbo', 'views']) $(id).classList.toggle('hidden', on || (id === 'turbo' && !setupDone()));
}

// ───────────────────────── money / floating texts ─────────────────────────
const _v = new THREE.Vector3();
function toScreen(x, y, z) {
  _v.set(x, y, z).project(camera);
  return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight, visible: _v.z < 1 };
}
function floatText(text, x, y, z, big = false) {
  const s = toScreen(x, y, z);
  if (!s.visible) return;
  const el = document.createElement('div');
  el.className = 'float' + (big ? ' big' : '');
  el.textContent = text; el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
function toast(text) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
  const prev = [...document.querySelectorAll('.toast')].pop(); // several at once stack instead of overlapping
  if (prev) el.style.top = prev.getBoundingClientRect().bottom + 8 + 'px';
  document.body.appendChild(el); setTimeout(() => el.remove(), 2300);
}
const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'K' : Math.floor(n).toLocaleString('ru-RU'));
function earn(n) {
  if (game.debt > 0) { // on strike: income pays the debt first
    const pay = Math.min(n, game.debt); game.debt -= pay; n -= pay;
    if (game.debt <= 0) { game.debt = 0; toast('✅ Долг погашен — рабочие вернулись'); applyStats(); }
  }
  game.money += n; $('money').classList.remove('bump'); void $('money').offsetWidth; $('money').classList.add('bump');
}
function updateWages(dt) {
  if (!setupDone() || game.cinematic || game.stage === 'win') return;
  game.payT -= dt;
  const bill = wageBill(), tax = taxBill(), m = Math.max(0, Math.ceil(game.payT)), el = $('wage');
  el.textContent = game.debt > 0 ? `⚠️ Забастовка! Долг $${fmt(game.debt)} — завод работает вполсилы`
    : `💼 Зарплата $${fmt(bill)}${tax ? ` + налог $${fmt(tax)}` : ''} через ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  el.classList.toggle('strike', game.debt > 0); el.classList.toggle('soon', game.debt <= 0 && m <= 5);
  if (game.payT > 0) return;
  game.payT = PAY_PERIOD;
  charge(bill + tax);
  sfx('coins', 'fail', { vol: game.debt > 0 ? 0.5 : 0.2, rate: 1.3 });
  toast(game.debt > 0 ? `⚠️ Не хватило на зарплату — забастовка, пока не вернёшь $${fmt(game.debt)}`
    : tax ? `💼 Зарплата −$${fmt(bill)} · 🏛 налог −$${fmt(tax)}` : `💼 Зарплата рабочим −$${fmt(bill)}`);
}
// a bill that has to be paid: what the till can't cover becomes a debt (the workers strike until it is paid off)
function charge(n) {
  const paid = Math.min(n, game.money);
  game.money -= paid; game.debt += n - paid;
  moneyFloat('−$' + fmt(n));
  applyStats();
}
function lateStage() { return game.stage === 'city' || game.stage === 'river'; }
function taxBill() { return lateStage() ? Math.round(TAX_RATE * Math.max(0, game.money - TAX_FREE)) : 0; }

// sawn bundle → a little money right at the saw
hooks.cut = (lane) => {
  if (!game.started) return;
  earn(cutValue()); game.cuts = (game.cuts || 0) + 1;
  floatText('+$' + cutValue(), C.SAW_X, 5, lane.z);
  sfx('coins', 'popup', { vol: 0.35, rate: 1.1 + Math.random() * 0.2, throttle: 0.15 });
};
hooks.popMoney = () => {}; // the game shows its own amounts instead of the creative's "+$200" sprites

// loaded convoy leaves → its pay lands on a cash pad next to the road, tap the pad to collect
const pads = moneyTiles.filter((t) => t.x > 30).sort((a, b) => Math.abs(a.z) - Math.abs(b.z));
hooks.convoy = (list) => {
  if (!game.started) return;
  const load = list.reduce((a, t) => a + Math.min(1, t.fill / C.FULL), 0); // a partly loaded truck pays for its share
  if (load <= 0) return;
  const full = list.filter((t) => t.fill >= C.FULL * 0.5).length;
  game.delivered += full;
  if (game.stage === 'river') game.launchQ = (game.launchQ || 0) + full * LOGS_PER_TRUCK;
  const pad = pads.find((p) => !p.cash) || pads[0];
  pad.cash = (pad.cash || 0) + Math.round(load * truckValue());
  pad.time = 0;
  if (!pad.label) { pad.label = document.createElement('div'); pad.label.className = 'cash'; document.body.appendChild(pad.label); }
  pad.label.textContent = '$' + fmt(pad.cash);
  sfx('coins', 'upgrade', { vol: 0.4 });
  updateGoal();
};
function collect(pad, auto = false) {
  if (!pad.cash) return;
  earn(pad.cash);
  floatText('+$' + fmt(pad.cash), pad.x, C.YARD_Y + 1.5, pad.z, true);
  sfx('coins', 'coins', { vol: auto ? 0.3 : 0.6, dur: 0.9 });
  pad.cash = 0; pad.label?.remove(); pad.label = null;
  if (!auto) game.collected = (game.collected || 0) + 1;
}
function updatePads(dt) {
  for (const p of pads) {
    if (!p.cash) continue;
    p.time += dt;
    p.pulse = 0.55 + 0.3 * Math.sin(performance.now() / 160); // bouncing glowing pad
    const s = toScreen(p.x, C.YARD_Y + 1.4, p.z);
    p.label.style.left = s.x + 'px'; p.label.style.top = s.y + 'px'; p.label.style.display = s.visible && !game.cinematic ? '' : 'none';
    // the cash waits for a tap or the auto collector (the tutorial brings it in by itself while it waits for the first tap)
    if (tut.step?.id === 'collect' && p.time > 25) collect(p, true);
    else if (!lvl.auto && tut.done && p.time > 20 && !game.robotHint) { game.robotHint = true; toast('🤖 Деньги ждут на площадке — купи «Автосборщик»'); }
  }
}

// auto collector: a little robot next to the cash pad presses it as soon as money lands there (grade 2 is gold and quick)
const robot = (() => {
  const pad = pads[0], g = new THREE.Group(); g.position.set(pad.x + 4.4, C.YARD_Y, pad.z); g.visible = false; C.scene.add(g);
  const body = new THREE.MeshStandardMaterial({ color: 0xffc93a, roughness: 0.45, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6, metalness: 0.4 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff4d3d, roughness: 0.4 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x9ff7ff, emissive: 0x39e8ff, emissiveIntensity: 2 });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.BoxGeometry(2, 0.5, 2), dark, 0, 0.25, 0);
  add(new THREE.CylinderGeometry(0.35, 0.45, 3.6, 12), body, 0, 2.3, 0);
  const head = new THREE.Group(); head.position.y = 4.4; g.add(head);
  add(new THREE.BoxGeometry(1.4, 1, 1.3), body, 0, 0, 0, head);
  for (const z of [-0.3, 0.3]) add(new THREE.SphereGeometry(0.17, 10, 8), eye, -0.7, 0.1, z, head); // it looks at the pad
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), dark, 0, 0.9, 0, head);
  add(new THREE.SphereGeometry(0.16, 10, 8), red, 0, 1.3, 0, head);
  add(new THREE.BoxGeometry(4.4, 0.35, 0.35), dark, -2.2, 3.9, 0); // the arm reaches over the pad
  const piston = new THREE.Group(); piston.position.set(-4.4, 3.9, 0); g.add(piston);
  add(new THREE.CylinderGeometry(0.15, 0.15, 2, 8), dark, 0, -1, 0, piston);
  add(new THREE.CylinderGeometry(0.8, 0.8, 0.4, 20), red, 0, -2.1, 0, piston);
  return { g, head, piston, body, eye, press: -1, wait: 0, pop: 0, level: 0 };
})();
function setRobot(level) {
  if (level && !robot.level) robot.pop = 1;
  robot.level = level; robot.g.visible = level > 0;
  robot.body.color.set(level > 1 ? '#ffd84a' : '#ffc93a'); robot.body.metalness = level > 1 ? 0.75 : 0.2; robot.body.roughness = level > 1 ? 0.25 : 0.45;
}
function updateRobot(dt) {
  if (!robot.level) return;
  const pad = pads[0];
  if (robot.pop) { robot.pop = Math.max(0, robot.pop - dt * 1.8); const k = 1 - robot.pop; robot.g.scale.setScalar(Math.max(0.01, 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2)); }
  robot.head.rotation.y = Math.sin(performance.now() / 600) * 0.25;
  if (robot.press < 0) {
    if (pad.cash && (robot.wait += dt) > (robot.level > 1 ? 0.3 : 1.5)) { robot.press = 0; robot.wait = 0; }
    robot.eye.emissiveIntensity = 2;
    return;
  }
  // press: the head goes down onto the pad, the cash is taken at the bottom
  const was = robot.press; robot.press += dt / (robot.level > 1 ? 0.35 : 0.55);
  if (was < 0.5 && robot.press >= 0.5 && pad.cash) { collect(pad, true); sfx('coins', 'popup', { vol: 0.35, rate: 0.8 }); pad.pulse = 1; }
  robot.piston.position.y = 3.9 - Math.sin(Math.PI * Math.min(1, robot.press)) * 1.25;
  robot.eye.emissiveIntensity = 2 + 4 * Math.sin(Math.PI * Math.min(1, robot.press));
  if (robot.press >= 1) { robot.press = -1; robot.piston.position.y = 3.9; }
}

// taps (a short press without dragging) collect cash pads
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -C.WATER_Y);
let down = null;
C.renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
C.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 450) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (game.jam != null && ray.ray.intersectPlane(waterPlane, _hit) && Math.abs(_hit.x - game.jam) < 10 && Math.abs(_hit.z) < 16) return breakJam();
  const hit = ray.intersectObject(moneyMesh)[0];
  if (hit) {
    const tile = moneyTiles[hit.instanceId];
    const pad = tile.cash ? tile : pads.filter((p) => p.cash).sort((a, b) => Math.hypot(a.x - tile.x, a.z - tile.z) - Math.hypot(b.x - tile.x, b.z - tile.z))[0];
    if (pad && Math.hypot(pad.x - tile.x, pad.z - tile.z) < 8) collect(pad);
  }
});

// press inside the bin and drag: the logs under the finger are pushed along (camera panning is off while raking)
const binPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(C.YARD_Y + 0.6)), _hit = new THREE.Vector3();
const rakeRing = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 8, 40).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.8, depthTest: false, toneMapped: false }));
rakeRing.visible = false; rakeRing.renderOrder = 5; C.scene.add(rakeRing);
let rake = null;
function binPoint(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(binPlane, _hit)) return null;
  const B = C.BIN;
  return _hit.x > B.x0 + 0.6 && _hit.x < B.x1 + 1 && _hit.z > B.z0 - 0.5 && _hit.z < B.z1 + 0.5 ? _hit.clone() : null;
}
C.renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!game.started || game.cinematic || game.paused || !setupDone() || !e.isPrimary) return;
  const p = binPoint(e);
  if (!p) return;
  rake = { p, t: performance.now(), id: e.pointerId };
  controls.enabled = false; // runs before OrbitControls (capture), so the drag rakes instead of panning
  rakeRing.position.copy(p); rakeRing.visible = true;
}, { capture: true });
addEventListener('pointermove', (e) => {
  if (!rake || e.pointerId !== rake.id) return;
  const p = binPoint(e), now = performance.now();
  if (!p) return;
  const dt = Math.max(0.016, (now - rake.t) / 1000), vx = (p.x - rake.p.x) / dt, vz = (p.z - rake.p.z) / dt;
  if (Math.hypot(vx, vz) > 1.5 && C.rakeLogs(p.x, p.z, vx * 0.9, vz * 0.9)) { game.raked = (game.raked || 0) + dt; sfx('logs', 'logs_scatter', { vol: 0.12, rate: 1.4, throttle: 0.35 }); }
  rake.p = p; rake.t = now; rakeRing.position.copy(p);
});
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => {
  if (!rake) return;
  rake = null; rakeRing.visible = false; controls.enabled = !game.cinematic;
});

// ───────────────────────── shop ─────────────────────────
// the last card changes with the story: road to the city → bridge spans → send the convoy
function finalCard() {
  const built = C.bridgeState.built;
  if (game.stage === 'grow') {
    const locked = game.delivered < GOAL_TRUCKS;
    return { name: 'Дорога в город', cost: ROAD_COST, locked, label: locked ? `🔒 ${game.delivered}/${GOAL_TRUCKS} 🚚` : undefined };
  }
  if (game.stage === 'build' && built < C.SPAN_N) {
    const got = spanGot(), need = SPAN_TRUCKS[built], locked = got < need;
    return { name: `Пролёт моста ${built + 1}/${C.SPAN_N}`, cost: SPAN_COSTS[built], locked, label: locked ? `🔒 ${got}/${need} 🚚` : undefined };
  }
  if (game.stage === 'build') return { name: 'Колонна в город!', cost: 0, label: 'ВПЕРЁД!' };
  if (game.stage === 'city') {
    const n = C.city.built, locked = cityGot() < 1;
    return { name: `Дом ${Math.floor(n / C.CITY_STAGES) + 1}/${HOUSES}: ${CITY_STAGE_NAMES[n % C.CITY_STAGES]}`, cost: cityCost(n), locked, label: locked ? '🔒 0/1 🚚' : undefined };
  }
  if (game.stage === 'river') {
    const full = game.fill >= C.RAFT.CAP;
    return { name: `Буксир: баржа ${game.barges + 1}/${BARGES}`, cost: TUG_COSTS[game.barges] ?? 0, locked: !full || game.sailing,
      label: game.sailing ? '🛳' : !full ? `🔒 ${game.fill}/${C.RAFT.CAP} 🪵` : undefined };
  }
  return { name: 'В пути…', cost: 0, locked: true, label: '🚚' };
}
const setupDone = () => game.setup >= SETUP.length;
const cityGot = () => Math.min(1, game.delivered - (game.cityFrom ?? 0));
const housesDone = () => Math.floor(C.city.built / C.CITY_STAGES);
const spanGot = () => Math.min(SPAN_TRUCKS[C.bridgeState.built] ?? 0, game.delivered - (game.spanFrom ?? 0));
// the shop wraps into rows on narrow screens: turbo and the camera chips sit above it
new ResizeObserver(() => document.documentElement.style.setProperty('--shop-h', $('shop').offsetHeight + 'px')).observe($('shop'));
// the camera chips sit under the goal panel, which grows with the level name and the wage line
new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', $('hud').offsetHeight + 'px')).observe($('hud'));
function buildShop() {
  const shop = $('shop'); shop.innerHTML = '';
  for (const u of [START, ...UPGRADES, FINAL]) {
    const el = document.createElement('div');
    el.className = 'card' + (u === FINAL ? ' final' : u === START ? ' final setup' : '');
    el.innerHTML = `<div class="ico">${u.ico}</div><div class="name">${u.name || ''}</div>` +
      (u.max ? `<div class="lvl">${'<i></i>'.repeat(u.max)}</div>` : '<div class="lvl"></div>') + '<button></button>';
    el.querySelector('button').onclick = () => buy(u);
    u.el = el; shop.appendChild(el);
  }
  refreshShop();
}
function refreshShop() {
  let hinted = false;
  for (const u of [START, ...UPGRADES, FINAL]) {
    u.el.style.display = (u === START) !== setupDone() ? '' : 'none'; // while setting up, only the next station is on sale
    const btn = u.el.querySelector('button');
    let cost, max = false, locked = false, label;
    if (u === START) {
      const st = SETUP[Math.min(game.setup, SETUP.length - 1)]; cost = st.cost;
      u.el.querySelector('.ico').textContent = st.ico; u.el.querySelector('.name').textContent = st.name;
    } else if (u === FINAL) {
      const f = finalCard(); cost = f.cost; locked = !!f.locked; label = f.label;
      u.el.querySelector('.name').textContent = f.name;
    } else {
      const l = lvl[u.id]; max = l >= u.max; cost = max ? 0 : u.cost(l);
      u.el.querySelectorAll('.lvl i').forEach((i, k) => i.classList.toggle('on', k < l));
    }
    btn.textContent = max ? 'МАКС' : label ?? (locked ? '🔒' : '$' + fmt(cost));
    btn.disabled = max || locked || game.money < cost;
    u.el.classList.toggle('max', max);
    // after the tutorial a gentle glow shows what can be bought
    const hint = tut.done && !hinted && !btn.disabled && (u === FINAL || game.bought < 6);
    u.el.classList.toggle('hint', hint); if (hint) hinted = true;
  }
}
function buy(u) {
  if (u === FINAL) return buyFinal();
  if (u === START) return buySetup();
  const l = lvl[u.id], cost = u.cost(l);
  if (game.money < cost || l >= u.max) return;
  game.money -= cost; game.bought++;
  sfx('coins', 'upgrade', { vol: 0.6 });
  lvl[u.id] = l + 1;
  upgradeFx(u.id); goHome();
  applyStats(); refreshShop();
}
// what each upgrade looks like: the thing it improves celebrates and visibly changes
function applyGrades() {
  cfg.production.beltArrows = [2, 3, 4, 6, 8][lvl.belt]; C.drawBelt();               // more arrows = faster belt
  C.bladeMat.color.set('#d8dde3').lerp(new THREE.Color('#ffcf4a'), lvl.saw / 4);     // blades turn gold and glow,
  C.bladeMat.emissive.set('#ff7a00'); C.bladeMat.emissiveIntensity = lvl.saw * 0.5;
  C.setSawGrade(lvl.saw);                                                             // the gantry is repainted, blades grow and spin faster
  cfg.particles.sparksPerCut = Math.round((80 + lvl.saw * 45) * fxK());
  C.setCraneGrade(lvl.arm);                                                           // hoses, rams, beacon, counterweight
  setRobot(lvl.auto);                                                                 // the auto collector by the cash pad
  if (game.species !== lvl.price) {                                                   // wood species: bark, moss, wood, cut
    game.species = lvl.price;
    const sp = SPECIES[lvl.price];
    cfg.wood.forEach((w, i) => Object.assign(w, sp ? sp.w[i] : baseWood[i]));
    C.setWoodPalette(lvl.price);
  }
}
function upgradeFx(id) {
  applyGrades();
  if (id === 'crane') { C.setActiveCranes(1 + lvl.crane, true); toast('🏗️ Новый кран работает!'); setView('yard'); }
  if (id === 'lane') {
    C.setActiveLanes(1 + lvl.lane); toast('🛤️ Открыта новая линия!'); setView('mill');
    C.celebrate(C.GATE_X - 8, 2, C.LANE_Z[[1, 0, 2][lvl.lane]], 1.4); C.flashMaterial(C.beltMat, '#9fd8ff', 1);
  }
  if (id === 'belt') { setView('gate'); C.flashMaterial(C.beltMat, '#9fd8ff', 1.4); for (const x of [-60, -45, -30]) C.celebrate(x, 1, 0, 0.8); toast('⏩ Конвейер быстрее'); }
  if (id === 'saw') {
    setView('saw'); C.flashMaterial(C.bladeMat, '#ffb000', 3); C.celebrate(C.SAW_X, 4, 0, 1.6); C.celebrate(C.SPLIT_X, 3, 0, 1);
    for (const z of C.LANE_Z) C.celebrate(C.SAW_X, 6, z, 0.7);
    toast(['', '🪚 Пила: оранжевая серия', '🪚 Пила: стальная синяя', '🪚 Пила: турбо-диски', '🪚 Пила: золотая'][lvl.saw]);
  }
  if (id === 'truck') {
    setView('road'); toast(['', '🚚 Грузовики быстрее', '🚚 Грузовики: форсированный мотор', '🚚 Грузовики: турбо', '🚚 Грузовики: гоночные'][lvl.truck]);
    for (const z of [-6, 0, 6]) C.celebrate(C.LANE_X, C.YARD_Y + 3, z, 1);
  }
  if (id === 'arm') {
    setView('yard'); toast(['', '🦾 Краны: гидравлика', '🦾 Краны: усиленные стрелы', '🦾 Краны: фары и маячок', '🦾 Краны: золотая серия'][lvl.arm]);
    C.BAYS.forEach((z, b) => { if (C.craneOn(b)) { C.celebrate(C.CRANE_X, C.YARD_Y + 3, z, 1.2); C.cranes[b].appear(); } });
  }
  if (id === 'auto') {
    setView('pad'); C.celebrate(pads[0].x + 4.4, C.YARD_Y + 3, pads[0].z, 1.3);
    toast(lvl.auto > 1 ? '🤖 Автосборщик: золотая турбо-рука' : '🤖 Автосборщик сам забирает деньги с площадки');
  }
  if (id === 'price') {
    setView('mill'); C.celebrate(8, C.YARD_Y + 3, 0, 1.6); C.celebrate(C.SAW_X, 3, 0, 1); C.celebrate(C.GATE_X - 10, 2, 0, 1.2);
    const sp = SPECIES[lvl.price]; toast(`${sp.ico} Новая порода: ${sp.name} — $${cutValue()} за пачку`);
  }
}
function buySetup() {
  const st = SETUP[game.setup];
  if (!st || game.money < st.cost) return;
  game.money -= st.cost; game.setup++;
  sfx('coins', 'upgrade', { vol: 0.6 });
  if (st.key === 'crane') C.setActiveCranes(1, true); else cfg.production[st.key] = true;
  const at = { beltOn: [-55, 1, 0], debarkOn: [C.GATE_X, 2, 0], splitOn: [C.SPLIT_X, 2.5, 0], sawOn: [C.SAW_X, 3, 0] }[st.key];
  if (at) C.celebrate(...at, 1.4);
  if (st.key === 'beltOn') C.flashMaterial(C.beltMat, '#9fd8ff', 1.2);
  if (st.key === 'debarkOn') C.flashMaterial(C.M.gate, '#ff6040', 1.5);
  if (st.key === 'splitOn' || st.key === 'sawOn') C.flashMaterial(C.bladeMat, '#ffb000', 2);
  toast(st.toast); setView(st.view, 1.2);
  if (setupDone()) $('turbo').classList.remove('hidden');
  refreshShop();
}
function buyFinal() {
  const f = finalCard();
  if (f.locked || game.money < f.cost) return;
  game.money -= f.cost; game.bought++;
  sfx('coins', 'upgrade', { vol: 0.6 });
  if (game.stage === 'grow') return roadAttempt();
  if (game.stage === 'city') return buildCity();
  if (game.stage === 'river') return sendBarge();
  if (C.bridgeState.built < C.SPAN_N) return buildSpan();
  return sendConvoy();
}
function updateGoal() {
  const bar = $('goal').querySelector('.bar i'), text = $('goal-text');
  if (game.stage === 'grow') {
    const k = Math.min(1, game.delivered / GOAL_TRUCKS);
    bar.style.width = k * 100 + '%';
    text.textContent = k < 1 ? `Отправь ${GOAL_TRUCKS} грузовиков: ${game.delivered}/${GOAL_TRUCKS}` : '🌉 Открой дорогу в город!';
    if (k >= 1 && !game.goalShown) { game.goalShown = true; toast('🌉 Дорога в город доступна!'); }
  } else if (game.stage === 'build') {
    const n = C.bridgeState.built, need = SPAN_TRUCKS[n], got = spanGot();
    bar.style.width = (n + (n < C.SPAN_N ? 0.5 * got / need : 0)) / C.SPAN_N * 100 + '%';
    text.textContent = n >= C.SPAN_N ? '🚚 Отправь колонну в город!'
      : got < need ? `🔨 Пролёт ${n + 1}/${C.SPAN_N}: вези лес ${got}/${need} 🚚` : `🔨 Пролёт ${n + 1}/${C.SPAN_N}: копи $${fmt(SPAN_COSTS[n])}`;
  } else if (game.stage === 'city') {
    const n = C.city.built, total = HOUSES * C.CITY_STAGES;
    bar.style.width = n / total * 100 + '%';
    text.textContent = n >= total ? '🌆 Квартал построен!'
      : `🏙 Домов ${housesDone()}/${HOUSES} · ${cityGot() < 1 ? 'вези лес 🚚' : `${CITY_STAGE_NAMES[n % C.CITY_STAGES]} $${fmt(cityCost(n))}`}`;
  } else if (game.stage === 'river') {
    const cap = C.RAFT.CAP;
    bar.style.width = Math.min(1, (game.barges + Math.min(1, game.fill / cap)) / BARGES) * 100 + '%';
    text.textContent = game.jam != null ? '⚠️ Затор на реке! Тапни по нему' : game.sailing ? '🛳 Баржа уходит в город…'
      : game.fill >= cap ? `🛳 Баржа ${game.barges + 1}/${BARGES} полна — вызови буксир` : `🌊 Баржа ${game.barges + 1}/${BARGES}: ${game.fill}/${cap} 🪵`;
  }
}

// ───────────────────────── story ─────────────────────────
function moneyFloat(text) {
  const s = $('money').getBoundingClientRect(), f = document.createElement('div');
  f.className = 'float minus'; f.textContent = text; f.style.left = s.left + s.width / 2 + 'px'; f.style.top = s.bottom + 18 + 'px';
  document.body.appendChild(f); setTimeout(() => f.remove(), 1200);
}
function roadAttempt() { // the convoy drives off the unfinished bridge, like in the ad
  game.stage = 'fall'; cinematic(true);
  $('goal-text').textContent = '🚚 Колонна едет в город…';
  setView('convoy', 2.2);
  after(1.8, () => C.bridge.start(false));
  // every truck lost in the river costs its share of all the money (lost timber + salvage), the last one takes it to zero
  const n = cfg.trucks.bridgeConvoy;
  game.lost = 0;
  for (let k = 0; k < n; k++) after(5.2 + k * 0.9, () => {
    const loss = k === n - 1 ? game.money : Math.ceil(game.money / (n - k));
    game.money -= loss; game.lost += loss;
    moneyFloat('🚚💦 −$' + fmt(loss)); sfx('coins', 'fail', { vol: 0.35, rate: 1.1 + k * 0.05 });
  });
  after(13, () => {
    game.money = 0; game.debt = 0;
    $('fail-text').textContent = `Колонна сорвалась в реку: ${n} грузовиков с лесом утонули, убыток $${fmt(game.lost)}. Касса пуста — начинаем ремонт моста.`;
    $('fail').classList.remove('hidden');
  });
}
// restore = coming back from a saved game: its counters are kept
function enterBuild(restore = false) {
  for (const id of ['fail', 'level-done', 'win']) $(id).classList.add('hidden');
  game.stage = 'build'; cinematic(false);
  if (!restore) { game.spanFrom = game.delivered; game.payT = PAY_PERIOD; }
  $('views').querySelector('[data-view="bridge"]').classList.remove('hidden');
  $('level').textContent = 'Уровень 2 · Ремонт моста';
  updateGoal(); refreshShop();
}
$('fix').onclick = () => {
  game.money = game.shown = 0; // level 2 starts from an empty till
  enterBuild(); setView('yard', 1.4);
  toast('🔨 Уровень 2: вози лес на мост и строй пролёты');
};
function buildSpan() {
  cinematic(true);
  setView('bridge', 1.6);
  after(1.4, () => { C.setBridgeBuilt(C.bridgeState.built + 1, true); game.spanFrom = game.delivered; updateGoal(); });
  after(1.95, () => C.celebrate(C.BRIDGE_X, -3.5, -4.3 - 2.95 * (C.bridgeState.built - 0.5), 1.2));
  after(3.4, () => {
    const done = C.bridgeState.built >= C.SPAN_N;
    toast(done ? '🌉 Мост готов! Отправляй колонну' : `🔨 Пролёт ${C.bridgeState.built}/${C.SPAN_N} готов`);
    cinematic(false); setView('yard', 1.4); refreshShop();
  });
}
function sendConvoy() {
  game.stage = 'cross'; cinematic(true);
  $('goal-text').textContent = '🚚 Колонна едет в город…';
  setView('convoy', 2.2);
  after(1.8, () => C.bridge.start(true));
  after(6, () => sfx('bridge', 'upgrade', { vol: 0.7 }));
  after(12.5, () => {
    game.stage = 'cross-done';
    $('level-done').classList.remove('hidden');
    sfx('coins', 'coins', { vol: 0.8 });
  });
}
function enterCity(restore = false) {
  for (const id of ['fail', 'level-done', 'win']) $(id).classList.add('hidden');
  game.stage = 'city'; cinematic(false);
  if (!restore) { game.cityFrom = game.delivered; game.rentT = RENT_PERIOD; }
  game.incT = 35; C.setRaftActive(false); C.setCurrent(BASE_CURRENT);
  C.setCityActive(true);
  for (const v of ['bridge', 'city']) $('views').querySelector(`[data-view="${v}"]`).classList.remove('hidden');
  $('level').textContent = 'Уровень 3 · Город растёт';
  updateGoal(); refreshShop();
}
$('to-city').onclick = () => {
  enterCity(); setView('city', 2);
  toast('🏙 Уровень 3: вози лес в город и строй новый квартал');
};
const plotAt = (i, y = 4) => { const g = C.city.plots[i].g.position; return [g.x, g.y + y, g.z]; };
function buildCity() {
  const n = C.city.built, plot = Math.floor(n / C.CITY_STAGES), roof = n % C.CITY_STAGES === 2;
  game.cityFrom = game.delivered;
  if (!C.bridge.trucks.length) C.bridge.start(true); // a timber convoy rolls over the bridge into town
  setView('city', 1.2);
  after(0.5, () => {
    C.setCityBuilt(n + 1, true);
    C.celebrate(...plotAt(plot, roof ? 9 : 3), roof ? 1.6 : 1);
    sfx('bridge', 'box_crash', { vol: 0.5, delay: 0.2 });
    if (roof) toast(`🏠 Дом ${plot + 1}/${HOUSES} готов — платит аренду $${RENT}`);
    updateGoal(); refreshShop();
    if (n + 1 >= HOUSES * C.CITY_STAGES) cityFinale();
  });
}
// finished houses pay rent from time to time
function updateRent(dt) {
  if (!lateStage() || !housesDone()) return;
  if ((game.rentT -= dt) > 0) return;
  game.rentT = RENT_PERIOD;
  const paying = [...Array(housesDone()).keys()].filter((i) => !incidents.some((inc) => inc.house === i)); // a burning house pays nothing
  if (!paying.length) return;
  for (const i of paying) floatText('+$' + RENT, ...plotAt(i, 12));
  earn(RENT * paying.length);
  sfx('coins', 'popup', { vol: 0.3, rate: 1.2, throttle: 0.3 });
}
// the quarter is done: evening falls, every window lights up, fireworks, then the win screen
function cityFinale() {
  game.stage = 'city-end'; cinematic(true); C.setCityActive(false); clearIncidents();
  setView('city', 1.5);
  let k = 0;
  const dusk = (dt) => { k = Math.min(1, k + dt / 3.5); C.setEvening(k); return k < 1; };
  after(1.2, () => { game.dusk = dusk; });
  for (let i = 0; i < 10; i++) after(3 + i * 0.45, () => C.celebrate(320 + Math.random() * 60, 14 + Math.random() * 8, -30 - Math.random() * 25, 1.4));
  after(8.5, () => {
    saveGame();
    $('city-done').classList.remove('hidden');
    sfx('coins', 'coins', { vol: 0.8 });
  });
}

// ───────────────────────── level 4: timber rafting ─────────────────────────
function enterRiver(restore = false) {
  for (const id of ['fail', 'level-done', 'city-done', 'win']) $(id).classList.add('hidden');
  game.stage = 'river'; cinematic(false); game.dusk = null;
  C.setEvening(0); C.setBridgeBuilt(C.SPAN_N); C.setCityBuilt(HOUSES * C.CITY_STAGES); C.setCityActive(false);
  if (!restore) { game.barges = 0; game.fill = 0; game.launchQ = 0; }
  game.barges ??= 0; game.fill ??= 0; game.launchQ ??= 0;
  Object.assign(game, { jam: null, jamT: 18, sailing: false, boat: null, launchT: 0, incT: 35 });
  C.bridge.clear(); C.pools().riverPool.removeAll();
  C.setRaftActive(true); C.setBargeFill(game.fill); C.raft.boat.position.x = C.RAFT.BARGE_X; C.setCurrent(3.6);
  for (const v of ['bridge', 'city', 'river']) $('views').querySelector(`[data-view="${v}"]`).classList.remove('hidden');
  $('level').textContent = 'Уровень 4 · Сплав по реке';
  updateGoal(); refreshShop();
}
$('to-river').onclick = () => {
  enterRiver(); setView('river', 2);
  toast('🌊 Уровень 4: грузовики сбрасывают лес в реку — заполни 3 баржи');
};
// a button over the jam (the water around it can be tapped too)
const jamEl = document.createElement('button'); jamEl.className = 'jam-tap hidden'; jamEl.textContent = '💥 Затор! Тапни';
jamEl.onclick = () => breakJam(); document.body.appendChild(jamEl);
function breakJam() {
  if (game.jam == null) return;
  C.clearJam(); game.jam = null; game.jamT = 25 + Math.random() * 20; jamEl.classList.add('hidden');
  sfx('coins', 'upgrade', { vol: 0.4 }); toast('💥 Затор разобран — брёвна поплыли дальше'); updateGoal();
}
function sendBarge() {
  game.sailing = true; game.boat = { t: 0, out: true };
  setView('river', 1.2);
  sfx('bridge', 'truck', { vol: 0.5, dur: 2.5, fadeOut: 0.8 });
  C.celebrate(C.RAFT.BARGE_X, -2, C.RAFT.BARGE_Z, 1.4);
  toast(`🛳 Баржа ${game.barges + 1}/${BARGES} ушла в город!`);
  updateGoal(); refreshShop();
}
function updateRiver(dt) {
  if (game.stage !== 'river') return;
  const pool = C.pools().riverPool, R = C.RAFT;
  // the logs of delivered trucks roll down the chute one after another
  if (game.launchQ > 0 && (game.launchT -= dt) <= 0) {
    game.launchT = 0.45; game.launchQ--;
    C.raftLaunch(RIVER_LIMIT[C.QUALITY] ?? 100);
    sfx('logs', 'logs_scatter', { vol: 0.15, rate: 1.2, throttle: 0.4 });
  }
  // the boom: logs go into the docked barge, or wait at the boom while it is full or away
  const docked = !game.sailing && game.fill < R.CAP;
  for (const it of [...pool.items]) {
    const p = it.body.translation();
    if (p.x < R.BARGE_X - 10) continue;
    if (docked && game.fill < R.CAP) {
      pool.remove(it); game.fill++; C.setBargeFill(game.fill);
      sfx('coins', 'popup', { vol: 0.2, rate: 1.4, throttle: 0.15 });
      if (game.fill >= R.CAP) { toast('🛳 Баржа полна! Вызови буксир'); refreshShop(); updateGoal(); }
    } else {
      const v = it.body.linvel();
      if (v.x > 0) it.body.setLinvel({ x: -0.3, y: v.y, z: v.z * 0.9 }, true);
    }
  }
  // the barge sails off with the tug, an empty one comes back to the boom
  const B = game.boat, boat = C.raft.boat;
  if (B) {
    B.t += dt;
    if (B.out) {
      boat.position.x = R.BARGE_X + B.t * B.t * 2.2;
      if (B.t > 6) {
        game.barges++; game.fill = 0; C.setBargeFill(0);
        if (game.barges >= BARGES) { game.boat = null; riverFinale(); return; }
        B.out = false; B.t = 0;
      }
    } else {
      const k = Math.min(1, B.t / 5);
      boat.position.x = R.BARGE_X + (1 - k) ** 3 * 70;
      if (k >= 1) { game.boat = null; game.sailing = false; toast('🛳 Пустая баржа у причала'); updateGoal(); refreshShop(); }
    }
  }
  // now and then a tree falls across the river
  if (game.jam == null && (game.jamT -= dt) <= 0) {
    game.jam = [192, 200, 236, 242][Math.floor(Math.random() * 4)];
    C.setJam(game.jam);
    toast('🌲 Дерево упало в реку — затор! Тапни по нему'); updateGoal();
  }
  if (game.jam != null) {
    const s = toScreen(game.jam, C.WATER_Y + 4, 0);
    jamEl.style.left = THREE.MathUtils.clamp(s.x, 100, innerWidth - 100) + 'px'; jamEl.style.top = s.y + 'px';
    jamEl.classList.toggle('hidden', !s.visible || game.cinematic);
  }
}
// three barges are gone: fireworks over the river, then the win screen
function riverFinale() {
  game.stage = 'win'; cinematic(true); clearIncidents(); jamEl.classList.add('hidden');
  setView('river', 1.5);
  for (let i = 0; i < 12; i++) after(1 + i * 0.4, () => C.celebrate(240 + Math.random() * 70, 6 + Math.random() * 8, -10 + Math.random() * 20, 1.4));
  after(6.5, () => {
    clearSave();
    $('win-text').textContent = `Мост, целый квартал и три баржи леса: ${game.delivered} грузовиков доставлено. Город растёт благодаря тебе!`;
    $('win').classList.remove('hidden');
    sfx('coins', 'coins', { vol: 0.8 });
  });
}

// ───────────────────────── incidents (levels 3–4) ─────────────────────────
// A house catches fire: pay the firemen, or after a while the burnt house costs twice as much (into debt if needed).
// A machine breaks down: it stays off (the factory stops there) until the repair is paid.
const STATIONS = [
  { key: 'sawOn', name: 'Пила', view: 'saw', at: () => [C.SAW_X, 4, 0] },
  { key: 'splitOn', name: 'Раскрой', view: 'mill', at: () => [C.SPLIT_X, 3.5, 0] },
  { key: 'debarkOn', name: 'Окорочная машина', view: 'gate', at: () => [C.GATE_X, 3, 0] },
  { key: 'beltOn', name: 'Конвейер', view: 'gate', at: () => [-55, 2, 0] },
];
const FIRE_TIME = 25;
const incidents = [];
const round10 = (n) => Math.round(n / 10) * 10;
const fxTex = (c) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(0.45, `rgba(${c},0.6)`); gr.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
};
// flames are drawn opaque-ish (additive light vanishes against the bright daytime town), every other one is yellow
const flameMats = [fxTex('255,120,20'), fxTex('255,210,60')].map((map) => new THREE.SpriteMaterial({ map, depthWrite: false, transparent: true, toneMapped: false }));
const smokeMat = new THREE.SpriteMaterial({ map: fxTex('45,42,40'), depthWrite: false, transparent: true });
// flames rise from `h` (the roof line), smoke drifts up and away
function makeFx(x, y, z, w, h, flames, smokes) {
  const g = new THREE.Group(); g.position.set(x, y, z); C.scene.add(g);
  for (let i = 0; i < flames + smokes; i++) {
    const smoke = i >= flames, sp = new THREE.Sprite((smoke ? smokeMat : flameMats[i % 2]).clone());
    sp.renderOrder = smoke ? 2 : 3;
    sp.userData = { smoke, ox: (Math.random() - 0.5) * w, oz: (Math.random() - 0.5) * w * 0.5, ph: Math.random(), h };
    g.add(sp);
  }
  C.refreshAO();
  return g;
}
function animFx(g, dt) {
  for (const sp of g.children) {
    const u = sp.userData, k = u.ph = (u.ph + dt * (u.smoke ? 0.3 : 1.4)) % 1;
    if (u.smoke) { sp.position.set(u.ox + k * 4, u.h + 2 + k * 16, u.oz); sp.scale.setScalar(3 + k * 9); sp.material.opacity = 0.8 * Math.sin(Math.PI * k); }
    else { sp.position.set(u.ox, u.h + k * 7, u.oz); sp.scale.setScalar(6.5 * (1 - k * 0.6)); sp.material.opacity = Math.sin(Math.PI * Math.min(1, k * 1.3)); }
  }
}
function addIncident(inc) {
  const el = inc.el = document.createElement('div'); el.className = 'inc';
  el.innerHTML = '<span></span><button></button>';
  el.querySelector('span').onclick = () => setView(inc.view, 1.2);
  el.querySelector('button').onclick = () => resolveIncident(inc, true);
  $('incidents').appendChild(el); incidents.push(inc); refreshIncident(inc);
  sfx('coins', 'fail', { vol: 0.45, rate: 0.9 });
}
function refreshIncident(inc) {
  const t = inc.title(), b = inc.el.querySelector('button');
  if (inc.el.firstChild.textContent !== t) inc.el.firstChild.textContent = t;
  b.textContent = inc.btn; b.disabled = game.money < inc.cost;
}
function resolveIncident(inc, paid, quiet = false) {
  if (paid) { if (game.money < inc.cost) return; game.money -= inc.cost; moneyFloat('−$' + fmt(inc.cost)); sfx('coins', 'upgrade', { vol: 0.5 }); }
  incidents.splice(incidents.indexOf(inc), 1); inc.el.remove();
  for (const sp of inc.fx.children) sp.material.dispose();
  inc.fx.removeFromParent(); C.refreshAO();
  if (inc.type === 'break') {
    cfg.production[inc.station.key] = true;
    if (!quiet) { C.celebrate(...inc.station.at(), 1.2); toast(`🔧 ${inc.station.name}: снова работает`); }
  }
  if (inc.type === 'fire' && paid) { C.celebrate(...plotAt(inc.house, 8), 1.2); toast('🚒 Пожар потушен'); }
}
function clearIncidents() { for (const inc of [...incidents]) resolveIncident(inc, false, true); }
function startFire() {
  const free = [...Array(housesDone()).keys()].filter((i) => !incidents.some((inc) => inc.house === i));
  if (!free.length) return false;
  const house = free[Math.floor(Math.random() * free.length)], plot = C.city.plots[house].g.position;
  const cost = round10(Math.max(150, game.money * 0.12));
  const inc = { type: 'fire', house, cost, t: FIRE_TIME, view: 'city', fx: makeFx(plot.x, plot.y, plot.z, 14, C.city.plots[house].h + 1.5, 20, 10),
    title: () => `🔥 Пожар: дом ${house + 1} · ${Math.max(0, Math.ceil(inc.t))} с`, btn: `🚒 $${fmt(cost)}` };
  addIncident(inc);
  toast(`🔥 Пожар в доме ${house + 1}! Вызови пожарных, пока не сгорел`);
  return true;
}
function startBreakdown() {
  const ok = STATIONS.filter((st) => cfg.production[st.key] && !incidents.some((inc) => inc.station === st));
  if (!ok.length) return false;
  const st = ok[Math.floor(Math.random() * ok.length)], [x, y, z] = st.at();
  cfg.production[st.key] = false;
  const cost = round10(Math.max(120, game.money * 0.08));
  addIncident({ type: 'break', station: st, cost, t: Infinity, view: st.view, fx: makeFx(x, y, z, 3, 0, 3, 7),
    title: () => `🔧 Сломалась: ${st.name}`, btn: `🔧 $${fmt(cost)}` });
  toast(`🔧 ${st.name} сломалась — завод встал, нужен ремонт`);
  return true;
}
function updateIncidents(dt) {
  for (const inc of incidents) animFx(inc.fx, dt);
  if (!lateStage() || game.cinematic) return;
  for (const inc of [...incidents]) {
    if ((inc.t -= dt) <= 0) { // the house burnt down: the repair is paid anyway, and dearer
      const loss = inc.cost * 2;
      resolveIncident(inc, false); charge(loss);
      toast(`🔥 Дом ${inc.house + 1} сгорел — ремонт −$${fmt(loss)}`);
    } else refreshIncident(inc);
  }
  if ((game.incT -= dt) > 0) return;
  game.incT = 40 + Math.random() * 30;
  if (incidents.length >= 2) return;
  if (Math.random() < 0.55) startFire() || startBreakdown(); else startBreakdown() || startFire();
}
$('again').onclick = () => location.reload();

// ───────────────────────── tutorial ─────────────────────────
// Short tips at the top, one at a time; each waits until it has happened. A tip about a button makes that button glow.
const setupTip = (k, text) => ({ text, el: () => START.el, done: () => game.setup > k });
const TUT = [
  setupTip(0, 'Завод стоит. Запусти конвейер — кнопка внизу'),
  setupTip(1, 'Брёвна упёрлись в окорочную машину. Включи её, чтобы снять кору'),
  setupTip(2, 'Чистое бревно ждёт раскроя. Включи раскрой — бревно распустится на пачку'),
  setupTip(3, 'Пачки ждут пилу. Включи её — она режет пачки пополам и бросает в бункер'),
  setupTip(4, 'Бункер наполняется. Купи кран — он грузит брёвна в грузовики'),
  { text: 'Пила режет брёвна — за каждую пачку ты получаешь деньги', done: () => (game.cuts || 0) >= 2 },
  { text: 'Кран грузит грузовик. Полный грузовик уезжает и платит', done: () => game.delivered > 0 },
  { id: 'collect', text: 'Тапни по зелёной площадке с деньгами, чтобы забрать их', done: () => (game.collected || 0) > 0 || game.money >= 120 },
  { text: () => (game.money >= 120 ? 'Купи «Ещё кран» внизу — грузовики будут грузиться быстрее' : `Копим на второй кран: $${fmt(game.money)} / $120`),
    el: () => (game.money >= 120 ? UPGRADES[0].el : null), done: () => lvl.crane > 0 },
  { text: 'Зажми ⚡ ТУРБО — весь завод ускорится', el: () => $('turbo'), done: () => (game.turboTime || 0) > 0.8 },
  { text: 'Проведи пальцем по бункеру — сгреби брёвна поближе к кранам', done: () => (game.raked || 0) > 0.6 || tut.t > 14 },
  { text: `Отправь ${GOAL_TRUCKS} грузовиков, чтобы открыть дорогу в город`, done: () => tut.t > 4 },
];
const tut = { i: 0, t: 0, step: null, done: false, focus: null };
function focusEl(el) {
  if (tut.focus === el) return;
  tut.focus?.classList.remove('tut-focus'); el?.classList.add('tut-focus'); tut.focus = el;
}
function updateTutorial(dt) {
  if (tut.done || game.cinematic) { $('tut').classList.add('hidden'); focusEl(null); return; }
  const step = tut.step = TUT[tut.i];
  tut.t += dt;
  if (step.done()) {
    tut.i++; tut.t = 0;
    if (tut.i >= TUT.length) { tut.done = true; focusEl(null); refreshShop(); }
    sfx('coins', 'popup', { vol: 0.4 });
    return;
  }
  const text = typeof step.text === 'function' ? step.text() : step.text;
  if ($('tut-text').textContent !== text) $('tut-text').textContent = text;
  $('tut').classList.remove('hidden');
  focusEl(step.el?.() || null);
}

// ───────────────────────── quick menu ─────────────────────────
// music / sounds on-off (remembered in the browser), pause, restart
const PREFS_KEY = 'lumber-game-prefs-v2';
const prefs = { music: true, sfx: true };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch { /* no storage */ }
const baseVol = { music: cfg.audio.music, sfx: cfg.audio.sfx };
function applyPrefs() {
  cfg.audio.music = prefs.music ? baseVol.music : 0;
  cfg.audio.sfx = prefs.sfx ? baseVol.sfx : 0;
  C.sound.applyVolumes();
  $('m-music').textContent = prefs.music ? '🎵 Музыка: вкл' : '🎵 Музыка: выкл';
  $('m-sfx').textContent = prefs.sfx ? '🔊 Звуки: вкл' : '🔈 Звуки: выкл';
  $('m-music').classList.toggle('off', !prefs.music); $('m-sfx').classList.toggle('off', !prefs.sfx);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* no storage */ }
}
function setPaused(p) {
  game.paused = p;
  C.state.playing = !p; if (C.sound.unlocked) C.sound.setPaused(p);
  $('menu').classList.toggle('hidden', !p);
}
$('menu-btn').onclick = () => setPaused(!game.paused);
$('m-resume').onclick = () => setPaused(false);
$('m-music').onclick = () => { prefs.music = !prefs.music; applyPrefs(); };
$('m-sfx').onclick = () => { prefs.sfx = !prefs.sfx; applyPrefs(); };
$('m-restart').onclick = () => { game.started = false; clearSave(); location.reload(); }; // no save on the way out
// graphics presets: switched live, the game goes on (remembered for the next visit)
function markQuality() { for (const b of $('m-quality').querySelectorAll('button')) b.classList.toggle('on', b.dataset.q === C.QUALITY); }
for (const b of $('m-quality').querySelectorAll('button')) b.onclick = () => {
  C.setQuality(b.dataset.q); applyQualityLimits(); applyGrades(); markQuality();
  try { localStorage.setItem(C.QUALITY_KEY, b.dataset.q); } catch { /* no storage */ }
};
markQuality();
// cheats for testing: only with ?dev in the address or Ctrl+Shift+F12, nothing is remembered, players never see them
try { localStorage.removeItem('lumber-game-cheats'); } catch { /* no storage */ } // the old switch was remembered
function showCheats() { $('cheats').classList.remove('hidden'); }
if (new URLSearchParams(location.search).has('dev')) showCheats();
addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.code === 'F12') { e.preventDefault(); showCheats(); toast('🧪 Читы включены'); } });
// skip the start-up chain: every station runs, the bought cranes work
function finishSetup() { game.setup = SETUP.length; applySetup(); }
const CHEATS = {
  money: () => { earn(10000); toast('💰 +$10 000'); },
  trucks: () => { game.delivered += 5; toast('🚚 +5 доставленных грузовиков'); },
  upgrades: () => {
    for (const u of UPGRADES) lvl[u.id] = u.max;
    finishSetup(); applyGrades(); applyStats(); toast('⭐ Все улучшения');
  },
  lvl2: () => {
    finishSetup(); clearIncidents(); C.setRaftActive(false); C.setBridgeBuilt(0); C.setCityBuilt(0); C.setCityActive(false);
    game.delivered = Math.max(game.delivered, GOAL_TRUCKS); enterBuild(); setView('yard', 1.2); toast('🔨 Уровень 2: ремонт моста');
  },
  lvl3: () => {
    finishSetup(); clearIncidents(); C.setBridgeBuilt(C.SPAN_N); C.setCityBuilt(0);
    game.delivered = Math.max(game.delivered, GOAL_TRUCKS); enterCity(); setView('city', 1.2); toast('🏙 Уровень 3: город');
  },
  lvl4: () => { finishSetup(); clearIncidents(); enterRiver(); setView('river', 1.2); toast('🌊 Уровень 4: сплав'); },
  fire: () => {
    if (!lateStage()) return toast('Пожары — на уровнях 3–4');
    if (!housesDone()) C.setCityBuilt(C.CITY_STAGES);
    startFire();
  },
  breakdown: () => { if (!startBreakdown()) toast('Нечему ломаться'); },
  jam: () => { if (game.stage === 'river' && game.jam == null) game.jamT = 0; },
  barge: () => { if (game.stage === 'river' && !game.sailing) { game.fill = C.RAFT.CAP; C.setBargeFill(game.fill); } },
};
for (const b of $('cheats').querySelectorAll('button')) b.onclick = () => { CHEATS[b.dataset.cheat](); setPaused(false); updateGoal(); refreshShop(); saveGame(); };
// on the portfolio site the game lives in <site>/content/games/…: the links lead back to the site's home page
if (location.pathname.includes('/content/games/')) {
  const home = location.pathname.split('/content/games/')[0] + '/';
  for (const a of document.querySelectorAll('.home-link')) { a.href = home; a.classList.remove('hidden'); }
}
applyPrefs();

// ───────────────────────── turbo (hold) ─────────────────────────
const turbo = $('turbo');
turbo.addEventListener('pointerdown', (e) => { e.preventDefault(); if (game.turbo > 0.05) game.turboOn = true; });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) turbo.addEventListener(ev, () => { game.turboOn = false; });
function updateTurbo(dt) {
  if (game.turboOn) { game.turbo -= TURBO_DRAIN * dt; game.turboTime = (game.turboTime || 0) + dt; if (game.turbo <= 0) { game.turbo = 0; game.turboOn = false; } }
  else game.turbo = Math.min(1, game.turbo + TURBO_REFILL * dt);
  turbo.classList.toggle('active', game.turboOn);
  turbo.classList.toggle('empty', game.turbo < 0.05);
  $('turbo-ring').setAttribute('stroke-dashoffset', String(283 * (1 - game.turbo)));
}

// ───────────────────────── start ─────────────────────────
function newGame() {
  for (const u of UPGRADES) lvl[u.id] = 0;
  Object.assign(game, { money: START_MONEY, shown: START_MONEY, delivered: 0, bought: 0, turbo: 1, turboOn: false, stage: 'grow',
    cinematic: false, goalShown: false, cuts: 0, collected: 0, turboTime: 0 });
  cfg.production.activeLanes = 1; C.setActiveCranes(0);
  Object.assign(cfg.production, { beltOn: false, debarkOn: false, splitOn: false, sawOn: false, prefillRate: 0, prefillUpTo: C.GATE_X - C.HALF - 0.5 });
  game.setup = 0;
  C.setBridgeBuilt(0);
  game.payT = PAY_PERIOD; game.debt = 0; game.raked = 0; game.spanFrom = 0; game.cityFrom = 0; game.rentT = RENT_PERIOD;
  C.setCityBuilt(0); C.setCityActive(false); C.setRaftActive(false); C.setEvening(0); C.setCurrent(BASE_CURRENT);
  Object.assign(game, { barges: 0, fill: 0, launchQ: 0, jam: null, sailing: false, boat: null, incT: 35, robotHint: false });
  clearIncidents();
  applyGrades();
  applyStats();
  C.resetWorld(0);
  trucks.stage();
  for (const p of pads) { p.cash = 0; p.label?.remove(); p.label = null; }
  updateGoal();
}
// ───────────────────────── save / continue ─────────────────────────
// The game saves itself every few seconds and when the page is hidden; the start screen offers to continue.
// The world (logs, trucks) starts fresh, everything bought and built comes back.
const SAVE_KEY = 'lumber-game-save-v1';
const SAVED = ['money', 'debt', 'payT', 'delivered', 'bought', 'setup', 'spanFrom', 'cityFrom', 'rentT', 'goalShown', 'cuts', 'collected', 'turboTime', 'raked',
  'barges', 'fill', 'launchQ', 'robotHint'];
function saveGame() {
  if (!game.started || game.stage === 'win') return;
  const g = Object.fromEntries(SAVED.map((k) => [k, game[k]]));
  g.money += pads.reduce((a, p) => a + (p.cash || 0), 0); // uncollected cash isn't lost
  // cinematics are saved as the level they lead to
  let stage = game.stage;
  if (stage === 'fall') { stage = 'build'; g.money = 0; g.spanFrom = game.delivered; }
  if (stage === 'cross' || stage === 'cross-done') { stage = 'city'; g.cityFrom = game.delivered; }
  if (stage === 'city-end') { stage = 'river'; g.barges = 0; g.fill = 0; g.launchQ = 0; }
  // a barge on its way counts as delivered (the last one waits full at the boom); incidents aren't saved
  if (stage === 'river' && game.sailing) { if (g.barges < BARGES - 1) { g.barges++; g.fill = 0; } else g.fill = C.RAFT.CAP; }
  const data = { v: 1, stage, game: g, lvl: { ...lvl }, bridge: C.bridgeState.built, city: C.city.built, tut: { i: tut.i, done: tut.done } };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* no storage */ }
}
function loadSave() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d && d.v === 1 ? d : null; } catch { return null; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* no storage */ } }
addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
// stations of the start-up chain: switched on (k < n), the crane station brings the cranes bought so far
function applySetup() {
  SETUP.forEach((st, k) => { if (st.key !== 'crane') cfg.production[st.key] = k < game.setup; });
  C.setActiveCranes(setupDone() ? 1 + lvl.crane : 0);
  C.setActiveLanes(1 + lvl.lane);
  $('turbo').classList.toggle('hidden', !setupDone());
}
function restoreGame(d) {
  Object.assign(lvl, d.lvl); Object.assign(game, d.game); game.shown = game.money;
  applySetup(); applyGrades(); applyStats();
  C.setBridgeBuilt(d.bridge); C.setCityBuilt(d.city);
  tut.i = Math.min(d.tut.i, TUT.length - 1); tut.done = d.tut.done;
  if (d.stage === 'build') enterBuild(true);
  else if (d.stage === 'city') enterCity(true);
  else if (d.stage === 'river') enterRiver(true);
  updateGoal(); refreshShop();
}
newGame();
$('start').classList.remove('hidden');
const save = loadSave();
if (save) { $('play').textContent = '▶ Продолжить'; $('new-game').classList.remove('hidden'); }
$('new-game').onclick = () => { clearSave(); startGame(null); };
$('play').onclick = () => startGame(save);
function startGame(from) {
  $('start').classList.add('hidden');
  for (const id of ['hud', 'views', 'shop', 'menu-btn']) $(id).classList.remove('hidden'); // turbo appears once the factory runs
  newGame(); game.started = true;
  buildShop();
  if (from) restoreGame(from);
  C.sound.unlocked = true;
  Promise.all([C.sound.unlock(), C.soundsReady]).then(() => { applyPrefs(); C.sound.playMusic(0); }); // music may still be decoding
  // short intro: from the saw to the yard
  { const v = viewPose(VIEWS.mill); controls.target.copy(v.t); camera.position.copy(v.p); }
  setView({ city: 'city', river: 'river' }[game.stage] ?? 'yard', 2.5);
}

// ───────────────────────── loop ─────────────────────────
let last = performance.now(), shopT = 0, saveT = 0;
// phones render at 30 fps to stay cool, and at 60 while the player touches the screen or the camera flies
let touching = 0, touchT = 0;
addEventListener('pointerdown', () => { touching++; touchT = 0.6; });
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { touching = Math.max(0, touching - 1); });
function updateFrameCap(dt) {
  touchT = Math.max(0, touchT - dt);
  C.state.maxFps = !C.LOW || touching || touchT > 0 || fly || game.cinematic ? 60 : 30;
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt);
  requestAnimationFrame(loop);
}
// debug: run the game for `sec` seconds at once (C.advance steps the world), e.g. __game.step(30)
window.__game.step = (sec) => { for (let i = 0; i < sec * 20; i++) { C.advance(0.05); update(0.05); } };
// title screen: the camera slowly circles the factory behind the logo
let attractA = 0.7;
function attract(dt) {
  attractA += dt * 0.07;
  controls.target.set(-8, -1, 0);
  camera.position.set(-8 + Math.cos(attractA) * 70, 36, Math.sin(attractA) * 70);
}
function update(dt) {
  updateFrameCap(dt);
  if (!game.started) attract(dt);
  if (!game.paused) { updateTimers(dt); updateCamera(dt); }
  if (game.started && !game.paused) {
    updateTurbo(dt); applyStats(); updatePads(dt); updateRobot(dt); updateTutorial(dt); updateWages(dt); updateRent(dt);
    updateIncidents(dt); updateRiver(dt);
    if (game.dusk && !game.dusk(dt)) game.dusk = null;
    game.shown += (game.money - game.shown) * Math.min(1, dt * 10);
    if ((shopT += dt) > 0.2) { shopT = 0; refreshShop(); updateGoal(); }
    if ((saveT += dt) > 3) { saveT = 0; saveGame(); }
  }
  if (game.started) $('money').textContent = fmt(Math.round(game.shown));
}
requestAnimationFrame(loop);
