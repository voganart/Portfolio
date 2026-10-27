// Игровая версия: тот же мир и физика (main.js), поверх — экономика, улучшения, обучение, интерфейс и финал на мосту.
// main.js в игровом режиме не запускает режиссёра и редактор, а отдаёт всё нужное через window.__creative.
// Сюжет: копишь на дорогу в город → колонна срывается с недостроенного моста → достраиваешь 3 пролёта → колонна доезжает.
import * as THREE from 'three';

window.LUMBER_GAME = true;
await import('./main.js');
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
const TURBO_K = 1.8, TURBO_DRAIN = 0.3, TURBO_REFILL = 0.1;
const pow = (base, k) => (l) => Math.round(base * k ** l);
const UPGRADES = [
  { id: 'crane', ico: '🏗️', name: 'Ещё кран', max: 2, cost: (l) => [120, 380][l] },
  { id: 'lane', ico: '🛤️', name: 'Новая линия', max: 2, cost: (l) => [160, 450][l] },
  { id: 'belt', ico: '⏩', name: 'Быстрый конвейер', max: 4, cost: pow(60, 1.75) },
  { id: 'saw', ico: '🪚', name: 'Острая пила', max: 4, cost: pow(80, 1.75) },
  { id: 'arm', ico: '🦾', name: 'Шустрые краны', max: 4, cost: pow(90, 1.75) },
  { id: 'truck', ico: '🚚', name: 'Быстрые грузовики', max: 4, cost: pow(70, 1.75) },
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
const baseWood = structuredClone(cfg.wood);
// every species is built (and uploaded to the GPU) while loading, so the upgrade switches instantly
C.preloadWood(0, baseWood);
SPECIES.forEach((sp, i) => { if (sp) C.preloadWood(i, sp.w); });
const cutValue = () => 10 + lvl.price * 5;        // per sawn bundle
const truckValue = () => 50 + lvl.price * 25;     // per loaded truck

// Fewer, slower logs than the creative: the bin stays readable and the cranes keep up
cfg.production.cutShare = 0.45;        // part of a sawn bundle that falls into the bin
cfg.physics.maxLogs = 650;             // extra logs are removed from the bottom of the heap
cfg.physics.maxDynamic = 160;
cfg.trucks.solo = true;                // a loaded truck leaves at once if no truck stands in front of it (no overtaking)
cfg.trucks.partialAfter = 6;           // a truck whose crane brought nothing for 6 s leaves with the full ones (paid for what it carries)

// ───────────────────────── state ─────────────────────────
const lvl = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
// stage: grow → (road bought) fall → build (spans) → cross → win
const game = { money: 0, shown: 0, delivered: 0, bought: 0, turbo: 1, turboOn: false, stage: 'grow', started: false, cinematic: false };
const $ = (id) => document.getElementById(id);
window.__game = { game, lvl, get timers() { return timers; } }; // debug access from the console

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
  bridge: { target: [C.BRIDGE_X, -4, -4], dir: [0.55, 0.5, 0.67], dist: 34 },
  convoy: { target: [C.BRIDGE_X, -4, 4], dir: [0.17, 0.27, 0.95], dist: 54 },
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
    const t = controls.target, maxX = game.stage === 'grow' ? 45 : C.BRIDGE_X + 15;
    const x = THREE.MathUtils.clamp(t.x, -60, maxX), z = THREE.MathUtils.clamp(t.z, -30, 75);
    if (x !== t.x || z !== t.z) { camera.position.x += x - t.x; camera.position.z += z - t.z; t.x = x; t.z = z; }
  }
}
{ const v = viewPose(VIEWS.yard); controls.target.copy(v.t); camera.position.copy(v.p); }
for (const b of document.querySelectorAll('#views button')) b.onclick = () => setView(b.dataset.view);
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
  const bill = wageBill(), m = Math.max(0, Math.ceil(game.payT)), el = $('wage');
  el.textContent = game.debt > 0 ? `⚠️ Забастовка! Долг $${fmt(game.debt)} — завод работает вполсилы` : `💼 Зарплата $${fmt(bill)} через ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  el.classList.toggle('strike', game.debt > 0); el.classList.toggle('soon', game.debt <= 0 && m <= 5);
  if (game.payT > 0) return;
  game.payT = PAY_PERIOD;
  const paid = Math.min(bill, game.money);
  game.money -= paid; game.debt += bill - paid;
  const s = $('money').getBoundingClientRect(), f = document.createElement('div');
  f.className = 'float minus'; f.textContent = '−$' + fmt(bill); f.style.left = s.left + s.width / 2 + 'px'; f.style.top = s.bottom + 18 + 'px';
  document.body.appendChild(f); setTimeout(() => f.remove(), 1200);
  sfx('coins', 'fail', { vol: game.debt > 0 ? 0.5 : 0.2, rate: 1.3 });
  toast(game.debt > 0 ? `⚠️ Не хватило на зарплату — забастовка, пока не вернёшь $${fmt(game.debt)}` : `💼 Зарплата рабочим −$${fmt(bill)}`);
  applyStats();
}

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
  game.delivered += list.filter((t) => t.fill >= C.FULL * 0.5).length;
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
    // nobody tapped: collected automatically (later while the tutorial waits for the first tap)
    if (p.time > (tut.step?.id === 'collect' ? 25 : 9)) collect(p, true);
  }
}

// taps (a short press without dragging) collect cash pads
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
C.renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
C.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 450) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
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
  return { name: 'В пути…', cost: 0, locked: true, label: '🚚' };
}
const setupDone = () => game.setup >= SETUP.length;
const spanGot = () => Math.min(SPAN_TRUCKS[C.bridgeState.built] ?? 0, game.delivered - (game.spanFrom ?? 0));
// the shop wraps into rows on narrow screens: turbo and the camera chips sit above it
new ResizeObserver(() => document.documentElement.style.setProperty('--shop-h', $('shop').offsetHeight + 'px')).observe($('shop'));
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
  upgradeFx(u.id);
  applyStats(); refreshShop();
}
// what each upgrade looks like: the thing it improves celebrates and visibly changes
function applyGrades() {
  cfg.production.beltArrows = [2, 3, 4, 6, 8][lvl.belt]; C.drawBelt();               // more arrows = faster belt
  C.bladeMat.color.set('#d8dde3').lerp(new THREE.Color('#ffcf4a'), lvl.saw / 4);     // blades turn gold and glow,
  C.bladeMat.emissive.set('#ff7a00'); C.bladeMat.emissiveIntensity = lvl.saw * 0.5;
  C.setSawGrade(lvl.saw);                                                             // the gantry is repainted, blades grow and spin faster
  cfg.particles.sparksPerCut = 80 + lvl.saw * 45;
  C.setCraneGrade(lvl.arm);                                                           // hoses, rams, beacon, counterweight
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
$('fix').onclick = () => {
  $('fail').classList.add('hidden');
  game.stage = 'build'; cinematic(false);
  game.spanFrom = game.delivered; game.payT = PAY_PERIOD; game.money = game.shown = 0; // level 2 starts from an empty till
  $('views').querySelector('[data-view="bridge"]').classList.remove('hidden');
  $('level').textContent = 'Уровень 2 · Ремонт моста';
  setView('yard', 1.4); updateGoal(); refreshShop();
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
    game.stage = 'win';
    $('win-text').textContent = `Ты отправил ${game.delivered} грузовиков и построил мост. Город получил лес!`;
    $('win').classList.remove('hidden');
    sfx('coins', 'coins', { vol: 0.8 });
  });
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
$('m-restart').onclick = () => location.reload();
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
  game.payT = PAY_PERIOD; game.debt = 0; game.raked = 0; game.spanFrom = 0;
  applyGrades();
  applyStats();
  C.resetWorld(0);
  trucks.stage();
  for (const p of pads) { p.cash = 0; p.label?.remove(); p.label = null; }
  updateGoal();
}
newGame();
$('start').classList.remove('hidden');
$('play').onclick = () => {
  $('start').classList.add('hidden');
  for (const id of ['hud', 'views', 'shop', 'menu-btn']) $(id).classList.remove('hidden'); // turbo appears once the factory runs
  newGame(); game.started = true;
  buildShop();
  C.sound.unlocked = true;
  C.sound.unlock().then(() => { applyPrefs(); C.sound.playMusic(0); });
  // short intro: from the saw to the yard
  { const v = viewPose(VIEWS.mill); controls.target.copy(v.t); camera.position.copy(v.p); }
  setView('yard', 2.5);
};

// ───────────────────────── loop ─────────────────────────
let last = performance.now(), shopT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!game.paused) { updateTimers(dt); updateCamera(dt); }
  if (game.started && !game.paused) {
    updateTurbo(dt); applyStats(); updatePads(dt); updateTutorial(dt); updateWages(dt);
    game.shown += (game.money - game.shown) * Math.min(1, dt * 10);
    if ((shopT += dt) > 0.2) { shopT = 0; refreshShop(); updateGoal(); }
  }
  if (game.started) $('money').textContent = fmt(Math.round(game.shown));
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
