// Сценарные тесты игры «Нитро-Шоссе»: столкновения, обгоны, барьеры, трафик, нитро.
// Запуск: node tests/scenario-test.js
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* ----------------------------- песочница с заглушками ----------------------------- */
const grad = { addColorStop() {} };
const makeCtx = () => new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
    if (k === 'measureText') return () => ({ width: 10 });
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; }
});
const makeEl = () => ({
  style: {}, textContent: '', innerHTML: '',
  classList: { add() {}, remove() {}, contains: () => false },
  addEventListener() {},
  getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0 }),
  getContext: () => makeCtx(), width: 0, height: 0
});
const elements = {};
let rafQueue = [], tNow = 0;
const sandbox = {
  console,
  document: { getElementById: (id) => (elements[id] = elements[id] || makeEl()), addEventListener() {} },
  window: {
    addEventListener() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    requestAnimationFrame: (cb) => rafQueue.push(cb)
  },
  requestAnimationFrame: (cb) => rafQueue.push(cb),
  performance: { now: () => tNow },
  localStorage: { getItem: () => '0', setItem: () => {} },
  matchMedia: () => ({ matches: false }),
  Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Error
};
sandbox.globalThis = sandbox;
vm.runInContext(code, vm.createContext(sandbox), { filename: 'game.js' });

const N = sandbox.window.__nitro;
const API = N.api;
const LANES = [-0.75, -0.25, 0.25, 0.75];
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name + (extra ? '  (' + extra + ')' : ''));
  else { console.log('  ✗ ' + name + (extra ? '  (' + extra + ')' : '')); failures++; }
}
const mod = (a, b) => ((a % b) + b) % b;
function signedGapTo(car) {
  const L = N.info().trackLength;
  let d = mod(car.z - API.player.position, L);
  if (d > L / 2) d -= L;
  return d;                                        // > 0 — машина впереди
}
// автопилот: выбирает свободную полосу и объезжает трафик (имитация живого игрока)
function autopilot(steps, keyset, targetSpeed) {
  for (let i = 0; i < steps; i++) {
    let bestLane = API.player.x, bestGap = -1;
    for (const ln of LANES) {
      let gap = Infinity;
      for (const c of API.cars) {
        const d = signedGapTo(c);
        if (d > 0 && d < 22000 && Math.abs(c.x - ln) < 0.30) gap = Math.min(gap, d);
      }
      if (gap > bestGap) { bestGap = gap; bestLane = ln; }
    }
    API.player.x += (bestLane - API.player.x) * 0.22;
    if (targetSpeed && API.player.speed < targetSpeed) API.player.speed = targetSpeed;
    N.tick(1, keyset || { KeyW: true });
  }
}

/* ----------------------------------- 1. удар ----------------------------------- */
N.start();
API.player.speed = 9000;
API.player.position = 50000;
const pz = API.CFG.cameraHeight * API.camera.depth;
const victim = API.cars[0];
victim.z = 50000 + pz;
victim.x = API.player.x;
victim.speed = 5000;
victim.baseSpeed = 5000;
const dmg0 = API.player.damage, spd0 = API.player.speed;
N.tick(1, { KeyW: true });
check('столкновение с трафиком наносит урон', API.player.damage > dmg0, 'урон ' + API.player.damage.toFixed(1));
check('столкновение сбрасывает скорость', API.player.speed < spd0 * 0.6, 'скорость ' + Math.round(API.player.speed));
check('удар не убивает мгновенно', API.player.damage < 40, 'урон ' + API.player.damage.toFixed(1));

/* ---------------------------------- 2. обгоны ---------------------------------- */
N.start();
const trackLen = N.info().trackLength;
API.cars.length = 6;
for (let i = 0; i < 6; i++) {
  API.cars[i].z = (API.player.position + 1500 + i * 700) % trackLen;
  API.cars[i].x = -0.75; API.cars[i].targetX = -0.75;
  API.cars[i].speed = 2000; API.cars[i].baseSpeed = 2000;
}
API.player.x = 0.75;
const passed0 = N.info().passed;
for (let i = 0; i < 300; i++) { API.player.x = 0.75; if (API.player.speed < 11000) API.player.speed = 11000; N.tick(1, { KeyW: true }); }
check('обгоны считаются', N.info().passed - passed0 >= 5, 'обгонов за 5 с: ' + (N.info().passed - passed0));

/* ------------------------- 2b. трафик не исчезает и не дублируется ------------------------- */
N.start();
API.cars.length = 3;
for (let i = 0; i < 3; i++) API.cars[i].z = (API.player.position + 60000 + i * 5000) % trackLen;
const zBefore = API.cars.map(c => c.z);
autopilot(120);
const stayed = API.cars.filter((c, i) => Math.abs(mod(c.z - zBefore[i], trackLen)) < 20000).length;
check('далёкий трафик не перерождается', stayed === 3, 'машин на месте: ' + stayed + ' из 3');
check('число машин постоянно', API.cars.length === 3, 'машин: ' + API.cars.length);

/* ------------------------------- 3. барьер (без трафика) ------------------------------- */
N.start();
API.cars.length = 0;
API.player.speed = 8000;
N.tick(300, { KeyW: true, ArrowLeft: true });            // 5 с давим влево
const speedAtWall = API.player.speed;
check('барьер не обнуляет скорость навсегда', speedAtWall > 1000, 'скорость у барьера ' + Math.round(speedAtWall));
check('барьер наносит урон', API.player.damage > 0, 'урон ' + API.player.damage.toFixed(1));
check('игрок не проваливается сквозь барьер', Math.abs(API.player.x) <= 1.001, 'x = ' + API.player.x.toFixed(3));
N.tick(60, { KeyW: true, ArrowRight: true });
check('машина отъезжает от барьера', API.player.x > -0.98, 'x = ' + API.player.x.toFixed(2));
for (let i = 0; i < 180; i++) { API.player.x = -0.25; N.tick(1, { KeyW: true }); }
check('скорость восстанавливается', API.player.speed > 9000, 'скорость ' + Math.round(API.player.speed));
check('урон от барьера умеренный', API.player.damage < 40, 'урон ' + API.player.damage.toFixed(1));

/* ----------------------------- 4. минута езды автопилотом ----------------------------- */
N.start();
autopilot(3600, { KeyW: true }, 10500);                  // 60 секунд
const info4 = N.info();
check('опытный водитель не разбивается за минуту', info4.state === 'play', 'состояние: ' + info4.state);
check('урон у аккуратного водителя умеренный', info4.damage < 60, 'урон ' + info4.damage.toFixed(1));
check('скорость держится высокой', info4.speed > 9000, 'скорость ' + Math.round(info4.speed));
check('дистанция набегает', info4.distance > 4000, 'дистанция ' + Math.round(info4.distance) + ' м');
check('обгоны идут', info4.passed > 5, 'обгонов ' + info4.passed);
let ahead = 0;
for (const c of API.cars) { const d = signedGapTo(c); if (d > 0 && d < 34000) ahead++; }
check('впереди есть трафик, но это не пробка', ahead >= 2 && ahead <= 8,
      'машин в видимой зоне: ' + ahead + ' из ' + API.cars.length);

/* -------------------------------- 5. нитро и буст -------------------------------- */
N.start();
API.player.nitro = 0;
autopilot(600, { KeyW: true }, 9000);
check('нитро восстанавливается само', API.player.nitro > 50, 'нитро ' + API.player.nitro.toFixed(0));
API.player.nitro = 100;
autopilot(180, { KeyW: true, ShiftLeft: true }, 9000);
check('нитро расходуется при бусте', API.player.nitro < 25, 'нитро ' + API.player.nitro.toFixed(0));
check('буст разгоняет выше обычного максимума', API.player.speed > API.CFG.maxSpeed,
      'скорость ' + Math.round(API.player.speed) + ' при максимуме ' + API.CFG.maxSpeed);

/* --------------------------- 6. сбор баллонов нитро --------------------------- */
N.start();
API.player.nitro = 0;
let collected = 0;
for (let i = 0; i < 3000; i++) {
  // наводимся на ближайший баллон
  let tgt = null, bestD = Infinity;
  for (const p of API.pickups) {
    let d = mod(p.z - API.player.position, trackLen);
    if (d > trackLen / 2) d -= trackLen;
    if (d > 0 && d < bestD) { bestD = d; tgt = p; }
  }
  if (tgt) API.player.x += (tgt.x - API.player.x) * 0.25;
  if (API.player.speed < 9000) API.player.speed = 9000;
  const before = API.player.nitro;
  N.tick(1, { KeyW: true });
  if (API.player.nitro > before + 20) collected++;
}
check('баллоны нитро подбираются', collected > 0, 'подобрано: ' + collected);

/* ---------------------------- 7. перезапуск после аварии ---------------------------- */
N.start();
API.player.damage = 100;
const crashCar = API.cars[0];
crashCar.z = (API.player.position + pz) % trackLen;
crashCar.x = API.player.x;
N.tick(1, { KeyW: true });
check('при полном уроне наступает авария', N.info().state === 'crash', 'состояние: ' + N.info().state);
N.start();
check('после перезапуска игра снова идёт', N.info().state === 'play' && N.info().damage === 0, 'состояние: ' + N.info().state);

console.log(failures === 0 ? '\n✓ ВСЕ ' + 0 + ' СЦЕНАРИЕВ ПРОЙДЕНЫ' : '\n✗ ПРОВАЛОВ: ' + failures);
process.exit(failures === 0 ? 0 : 1);
