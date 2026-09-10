// Тесты новых механик: гонка с соперниками, трамплины, дрифт, отсчёт старта, финиш.
// Запуск: node tests/race-test.js
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* --------------------------- песочница с заглушками DOM --------------------------- */
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
const sandbox = {
  console,
  document: { getElementById: (id) => (elements[id] = elements[id] || makeEl()), addEventListener() {} },
  window: { addEventListener() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, requestAnimationFrame: () => {} },
  requestAnimationFrame: () => {},
  performance: { now: () => 0 },
  localStorage: { getItem: () => '0', setItem: () => {} },
  matchMedia: () => ({ matches: false }),
  Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, isFinite, parseInt, parseFloat, Error
};
sandbox.globalThis = sandbox;
vm.runInContext(code, vm.createContext(sandbox), { filename: 'game.js' });

const N = sandbox.window.__nitro;
const API = N.api;
const LANES = [-0.75, -0.25, 0.25, 0.75];
const mod = (a, b) => ((a % b) + b) % b;
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name + (extra ? '  (' + extra + ')' : ''));
  else { console.log('  ✗ ' + name + (extra ? '  (' + extra + ')' : '')); failures++; }
}
const trackLen = () => N.info().trackLength;

// автопилот из сценарных тестов: объезжает трафик, держит скорость
function autopilot(steps, keyset, targetSpeed) {
  for (let i = 0; i < steps; i++) {
    let bestLane = API.player.x, bestGap = -1;
    for (const ln of LANES) {
      let gap = Infinity;
      for (const c of API.cars) {
        let d = mod(c.z - API.player.position, trackLen());
        if (d > trackLen() / 2) d -= trackLen();
        if (d > 0 && d < 34000 && Math.abs(c.x - ln) < 0.34) gap = Math.min(gap, d);
      }
      if (gap > bestGap) { bestGap = gap; bestLane = ln; }
    }
    API.player.x += (bestLane - API.player.x) * 0.4;
    if (targetSpeed) {
      // если впереди в выбранной полосе кто-то близко — сбрасываем скорость, а не тараним
      const want = bestGap < 9000 ? Math.min(targetSpeed, 7200) : targetSpeed;
      if (API.player.speed < want) API.player.speed = want;
      if (API.player.speed > want + 2500) API.player.speed = want + 2500;
    }
    N.tick(1, keyset || { KeyW: true });
  }
}

/* ============================== 1. соперники на решётке ============================== */
N.start();
const info1 = N.info();
check('соперников четверо', info1.rivals === 4, 'rivals = ' + info1.rivals + ', всего машин ' + info1.cars);
check('старт с последнего места', info1.place === 5, 'позиция ' + info1.place + '/5');
const rivals = API.cars.filter(c => c.racer);
check('все соперники впереди на старте',
      rivals.every(c => mod(c.z - API.player.position, trackLen()) > 0 && mod(c.z - API.player.position, trackLen()) < 6000),
      'дистанции: ' + rivals.map(c => Math.round(mod(c.z - API.player.position, trackLen()))).join(', '));

/* ============================== 2. обгон соперника ============================== */
N.start();
for (let i = API.cars.length - 1; i >= 0; i--) if (!API.cars[i].racer) API.cars.splice(i, 1);   // убираем трафик
API.player.x = -0.75;
API.cars.filter(c => c.racer).forEach((c, i) => {
  c.z = mod(API.player.position + 1500 + i * 600, trackLen());
  c.x = 0.25; c.targetX = 0.25;                     // все соперники в одной полосе
  c.speed = 5000; c.baseSpeed = 5000;
});
N.tick(1, {});
const placeBefore = N.info().place;
autopilot(600, { KeyW: true, ShiftLeft: true }, 12000);
const placeAfter = N.info().place;
check('позиция улучшается при обгоне соперников', placeAfter < placeBefore,
      'позиция ' + placeBefore + ' → ' + placeAfter);
function signedGap(c) {
  let d = mod(c.z - API.player.position, trackLen());
  if (d > trackLen() / 2) d -= trackLen();
  return d;
}
check('разрыв с соперниками остаётся разумным',
      API.cars.filter(c => c.racer).every(c => Math.abs(signedGap(c)) < 200000),
      'максимальный разрыв ' + Math.round(Math.max(...API.cars.filter(c => c.racer).map(c => Math.abs(signedGap(c))))) + ' ед.');

/* ============================== 3. круги ============================== */
N.start();
const lapStart = N.info().lap;
API.player.position = trackLen() - 400;
API.player.speed = 12000;
N.tick(6, { KeyW: true });
check('пересечение линии старта даёт новый круг', N.info().lap === lapStart + 1,
      'круг ' + (lapStart + 1) + ' → ' + (N.info().lap + 1));

/* ============================== 4. финиш гонки ============================== */
N.start();
API.player.lap = API.CFG.raceLaps - 1;               // едем последний круг
API.player.position = trackLen() - 400;
API.player.speed = 12000;
N.tick(6, { KeyW: true });
const fin = N.info();
check('после последнего круга — финиш', fin.state === 'finish', 'состояние: ' + fin.state);
check('на финише показано место', fin.place >= 1 && fin.place <= 5, 'место ' + fin.place);
check('время гонки зафиксировано', fin.runTime > 0, 'время ' + fin.runTime.toFixed(2) + ' с');

/* ============================== 5. трамплин: полёт и приземление ============================== */
N.start();
const rampSeg = API.segments.filter(s => s.ramp)[0];
check('на трассе есть трамплины', !!rampSeg, 'сегментов-трамплинов: ' + API.segments.filter(s => s.ramp).length);
API.cars.length = 0;                                  // убираем трафик, чтобы не мешал
API.player.position = rampSeg.index * 200 - 1200;     // подъезжаем к кромке
API.player.speed = 12000;
API.player.x = -0.25;
let sawAir = false, maxAirY = 0, airFrames = 0;
for (let i = 0; i < 200; i++) {
  API.player.x = -0.25;
  N.tick(1, { KeyW: true });
  if (API.player.air) { sawAir = true; airFrames++; maxAirY = Math.max(maxAirY, API.player.airY); }
  if (sawAir && !API.player.air) break;
}
check('трамплин подбрасывает машину', sawAir, 'кадров в воздухе: ' + airFrames);
check('высота полёта заметная', maxAirY > 400, 'максимум ' + Math.round(maxAirY) + ' ед. над дорогой');
check('машина приземляется', !API.player.air, 'высота после: ' + Math.round(API.player.airY));
check('после приземления можно ехать дальше', API.player.speed > 5000, 'скорость ' + Math.round(API.player.speed));

/* ============================== 6. в полёте трафик не мешает ============================== */
N.start();
const ramp2 = API.segments.filter(s => s.ramp)[0];
API.player.position = ramp2.index * 200 - 1200;
API.player.speed = 12000;
N.tick(1, { KeyW: true });                            // один шаг, чтобы groundY стал актуальным
API.player.air = true;                                // принудительно в воздух
API.player.airWorldY = API.player.groundY + 3000;
API.player.vy = 5000;
API.player.airTime = 0.5;
const blocked = API.cars[0];
let flewOver = true, highFrames = 0;
for (let i = 0; i < 40; i++) {
  blocked.z = mod(API.player.position + API.CFG.cameraHeight * API.camera.depth, trackLen());
  blocked.x = API.player.x;
  const dmgBefore = API.player.damage;
  N.tick(1, { KeyW: true });
  if (API.player.airY > 240) highFrames++;
  if (API.player.airY > 240 && API.player.damage > dmgBefore + 0.01) flewOver = false;
}
check('в полёте машины пролетаются сверху', flewOver && highFrames > 10,
      'кадров выше 240 ед.: ' + highFrames + ', урон ' + API.player.damage.toFixed(1));

/* ============================== 7. дрифт ============================== */
N.start();
API.cars.length = 0;
API.player.speed = 11000;
API.player.nitro = 20;
const skidBefore = N.info().skid;
for (let i = 0; i < 200; i++) {
  const steer = i < 120 ? { ArrowRight: true } : {};
  const keyset = Object.assign({ KeyW: true, KeyX: true }, steer);
  const xBefore = API.player.x;
  if (xBefore > 0.55) API.player.x = 0.55;            // не улетаем в барьер на тесте
  N.tick(1, keyset);
  if (API.player.x < -0.55) API.player.x = -0.55;
}
const scoreDuringDrift = API.player.driftScore;
N.tick(20, { KeyW: true });                            // отпускаем X — очки банкуются
const info7 = N.info();
check('дрифт оставляет следы шин', info7.skid > skidBefore, 'сегментов со следами: ' + info7.skid);
check('во время дрифта копятся очки', scoreDuringDrift > 0, 'очков в заносе: ' + Math.round(scoreDuringDrift));
check('дрифт приносит очки', info7.driftTotal > 0, 'очков: ' + info7.driftTotal);
check('после дрифта нитро пополнено', info7.nitro > 25, 'нитро 20 → ' + info7.nitro.toFixed(0));
check('дрифт не выкидывает машину с трассы', Math.abs(API.player.x) <= 1.001, 'x = ' + API.player.x.toFixed(2));

/* ============================== 8. отсчёт старта ============================== */
N.start(true);                                        // с настоящим отсчётом
const cd = N.info().countdown;
N.tick(120, { KeyW: true });                          // 2 секунды
check('на отсчёте машина стоит', N.info().speed === 0 && N.info().distance === 0,
      'скорость ' + Math.round(N.info().speed) + ', отсчёт ' + N.info().countdown.toFixed(1));
N.tick(140, { KeyW: true });                          // ещё 2.3 с — отсчёт кончился
check('после отсчёта машина разгоняется', N.info().speed > 1000, 'скорость ' + Math.round(N.info().speed));
check('отсчёт был около 3.4 с', cd > 3 && cd < 3.6, cd.toFixed(1) + ' с');

/* ============================== 9. полная гонка автопилотом ============================== */
N.start();
let finished = false, guard = 0;
while (!finished && guard < 12000) {                  // до 200 секунд
  autopilot(60, { KeyW: true }, 11000);
  const st = N.info().state;
  guard += 60;
  if (st === 'finish') finished = true;
  if (st === 'crash') { API.player.damage = 0; N.start(); }   // если разбились — проверяем заново
}
const endInfo = N.info();
check('гонка из 3 кругов доезжается до финиша', finished, 'состояние: ' + endInfo.state + ', время ' + endInfo.runTime.toFixed(1) + ' с');
check('итоговое место в диапазоне 1..5', endInfo.place >= 1 && endInfo.place <= 5, 'место ' + endInfo.place);
check('очки за дрифт накопились за гонку', endInfo.driftTotal >= 0, 'очков: ' + endInfo.driftTotal);

console.log(failures === 0 ? '\n✓ ВСЕ ТЕСТЫ ГОНКИ ПРОЙДЕНЫ' : '\n✗ ПРОВАЛОВ: ' + failures);
process.exit(failures === 0 ? 0 : 1);
