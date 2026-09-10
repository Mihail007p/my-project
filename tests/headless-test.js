// Headless-тест логики игры: подменяем DOM и canvas заглушками,
// крутим кадры и физику, ловим исключения.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(require('path').resolve(__dirname, '../index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('СКРИПТ НЕ НАЙДЕН'); process.exit(1); }
const code = m[1];
fs.writeFileSync('/tmp/game.js', code);

// ---- заглушки ----
const listeners = {};
function makeEl(id) {
  return {
    id, style: {}, textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener(type, fn) { (listeners[id + ':' + type] = listeners[id + ':' + type] || []).push(fn); },
    getBoundingClientRect() { return { width: 1280, height: 720, left: 0, top: 0 }; },
    getContext() { return makeCtx(); },
    width: 0, height: 0
  };
}
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

const elements = {};
const document = {
  getElementById(id) { return (elements[id] = elements[id] || makeEl(id)); },
  addEventListener() {}
};
let rafQueue = [];
const window = {
  addEventListener(type, fn) { (listeners['window:' + type] = listeners['window:' + type] || []).push(fn); },
  devicePixelRatio: 1,
  innerWidth: 1280, innerHeight: 720,
  AudioContext: undefined, webkitAudioContext: undefined,
  requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; }
};
const sandbox = {
  window, document, console,
  requestAnimationFrame: (cb) => window.requestAnimationFrame(cb),
  performance: { now: () => tNow },
  localStorage: { getItem: () => '0', setItem: () => {} },
  matchMedia: () => ({ matches: false }),
  Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat, Error
};
sandbox.globalThis = sandbox;

let tNow = 0;
const ctxVm = vm.createContext(sandbox);

try {
  vm.runInContext(code, ctxVm, { filename: 'game.js' });
} catch (e) {
  console.error('ОШИБКА ПРИ ЗАГРУЗКЕ:', e.stack);
  process.exit(1);
}
console.log('✓ скрипт загрузился, трек собран');

// ---- прогон кадров меню ----
function runFrames(n) {
  for (let i = 0; i < n; i++) {
    tNow += 16.7;
    const q = rafQueue; rafQueue = [];
    q.forEach((cb) => cb(tNow));
  }
}
runFrames(20);
console.log('✓ 20 кадров меню без ошибок');

const N = ctxVm.window.__nitro;
if (!N) { console.error('нет тестового хука __nitro'); process.exit(1); }

// ---- старт и длинная симуляция ----
N.start();
console.log('после старта:', JSON.stringify(N.info()));

try {
  // 60 секунд игры: 15 с прямо, потом руль влево, нитро, торможение и т.д.
  for (let block = 0; block < 12; block++) {
    const keysets = [
      { KeyW: true },
      { KeyW: true, ArrowLeft: true },
      { KeyW: true, ShiftLeft: true },
      { KeyW: true, ArrowRight: true },
      { KeyW: true, ArrowLeft: true, ShiftLeft: true },
      { ArrowDown: true },
      { KeyW: true, ArrowRight: true },
      { KeyW: true, ArrowLeft: true },
      { KeyW: true },
      { KeyW: true, ArrowRight: true, ShiftLeft: true },
      { KeyW: true },
      { ArrowUp: true }
    ];
    N.tick(300, keysets[block]);          // 5 секунд на блок
    runFrames(2);                          // проверяем и рендер
    const info = N.info();
    console.log('блок', block, '| скорость', Math.round(info.speed),
                '| дистанция', Math.round(info.distance),
                '| урон', info.damage.toFixed(1),
                '| нитро', info.nitro.toFixed(0),
                '| обгоны', info.passed,
                '| состояние', info.state);
    if (info.state === 'crash') { console.log('  → авария (это нормально: урон достиг 100)'); N.start(); }
  }
} catch (e) {
  console.error('ОШИБКА В СИМУЛЯЦИИ:', e.stack);
  process.exit(1);
}

// ---- проверка производительности рендера ----
const t0 = Date.now();
runFrames(240);
const dtMs = Date.now() - t0;
console.log('✓ 240 кадров рендера (заглушка ctx), мс:', dtMs);

const info = N.info();
console.log('ИТОГ:', JSON.stringify(info));
if (info.segments < 200) { console.error('подозрительно короткий трек'); process.exit(1); }
console.log('✓ ВСЕ ТЕСТЫ ПРОЙДЕНЫ');
