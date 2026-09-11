/* =====================================================================
   Приложение: поэтапная генерация мира, камеры, ввод, HUD и главный цикл.
   ===================================================================== */

const canvas = document.getElementById('gl');
const elLoading = document.getElementById('loading');
const elBar = document.querySelector('#bar i');
const elErr = document.getElementById('err');
const UI = {
  fps: document.getElementById('sFps'), ms: document.getElementById('sMs'),
  tris: document.getElementById('sTris'), calls: document.getElementById('sCalls'),
  speed: document.getElementById('sSpeed'), km: document.getElementById('sKm'),
  time: document.getElementById('sTime'), mode: document.getElementById('mName'),
  hint: document.getElementById('mHint'), compass: document.getElementById('compass'),
  help: document.getElementById('help'), stats: document.getElementById('stats')
};

function fatal(e) {
  elErr.style.display = 'block';
  elErr.textContent = 'Ошибка: ' + (e && e.message ? e.message : e);
  console.error(e);
}
window.addEventListener('error', (e) => fatal(e.error || e.message));

/* ------------------------------------------------------------- камера */
const cam = {
  mode: 'fly',
  eye: [0, 30, 0], target: [0, 30, 1], fov: 68,
  drive: { dist: 0, speed: 0, lateral: -4.6, yawOff: 0, pitchOff: 0 },
  fly: { pos: [0, 40, 0], yaw: 0, pitch: -0.12, speed: 26 },
  orbit: { dist: 600, radius: 150, angle: 0.6, height: 45 }
};
const MODES = {
  drive: { name: 'ЕЗДА', hint: 'камера идёт по трассе' },
  fly: { name: 'ПОЛЁТ', hint: 'свободная камера' },
  orbit: { name: 'ОРБИТА', hint: 'облёт точки, колесо — радиус' }
};
function setMode(m) {
  if (!MODES[m]) return;
  cam.mode = m;
  UI.mode.textContent = MODES[m].name;
  UI.hint.textContent = MODES[m].hint;
  updateCamera(0);
}

/* -------------------------------------------------------------- ввод */
const keys = Object.create(null);
let dragging = false, lastPointer = [0, 0];
let timeT = 0.45;           // время суток: 0 день, 0.5 закат, 1 ночь
let fogOn = true, glowOn = true, hudOn = true;
let clock = 20;             // секунды для анимации неба

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'Digit1') setMode('drive');
  if (e.code === 'Digit2') setMode('fly');
  if (e.code === 'Digit3') setMode('orbit');
  if (e.code === 'KeyF') { fogOn = !fogOn; }
  if (e.code === 'KeyL') { glowOn = !glowOn; }
  if (e.code === 'KeyH') { hudOn = !hudOn; document.getElementById('hud').style.display = hudOn ? '' : 'none'; }
  if (e.code === 'KeyP') showGenStats();
  if (e.code === 'BracketLeft') timeT = clamp(timeT - 0.05, 0, 1);
  if (e.code === 'BracketRight') timeT = clamp(timeT + 0.05, 0, 1);
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

canvas.addEventListener('pointerdown', (e) => { dragging = true; lastPointer = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', (e) => { dragging = false; canvas.releasePointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastPointer[0], dy = e.clientY - lastPointer[1];
  lastPointer = [e.clientX, e.clientY];
  if (cam.mode === 'drive') {
    cam.drive.yawOff = clamp(cam.drive.yawOff - dx * 0.0026, -1.5, 1.5);
    cam.drive.pitchOff = clamp(cam.drive.pitchOff - dy * 0.0022, -0.7, 0.7);
  } else {
    cam.fly.yaw -= dx * 0.0028;
    cam.fly.pitch = clamp(cam.fly.pitch - dy * 0.0024, -1.45, 1.45);
  }
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (cam.mode === 'orbit') cam.orbit.radius = clamp(cam.orbit.radius * (1 + Math.sign(e.deltaY) * 0.12), 15, 900);
  else cam.fly.speed = clamp(cam.fly.speed * (1 - Math.sign(e.deltaY) * 0.15), 3, 400);
}, { passive: false });

/* ------------------------------------------------- обновление камеры */
const _dir = [0, 0, 1];
function updateCamera(dt) {
  if (cam.mode === 'drive') {
    const d = cam.drive;
    const boost = keys.ShiftLeft || keys.ShiftRight;
    const brake = keys.Space;
    const target = boost ? 78 : (brake ? 0 : 58);
    const rate = brake ? 34 : (d.speed < target ? (boost ? 22 : 11) : 6);
    d.speed += clamp(target - d.speed, -rate * dt, rate * dt);
    d.speed = Math.max(0, d.speed);
    d.dist = mod(d.dist + d.speed * dt, path.length);

    let steer = 0;
    if (keys.KeyA || keys.ArrowLeft) steer -= 1;
    if (keys.KeyD || keys.ArrowRight) steer += 1;
    d.lateral = clamp(d.lateral + steer * dt * 9, -9.6, 9.6);
    d.lateral *= (1 - dt * 0.35);

    const s = sampleAt(d.dist);
    cam.eye = [s.p[0] + s.right[0] * d.lateral, s.p[1] + 1.62, s.p[2] + s.right[2] * d.lateral];
    const yaw = s.yaw + d.yawOff;
    _dir[0] = Math.sin(yaw) * Math.cos(d.pitchOff);
    _dir[1] = Math.sin(d.pitchOff) - 0.04;
    _dir[2] = Math.cos(yaw) * Math.cos(d.pitchOff);
    cam.target = v3.add(cam.eye, v3.norm(_dir));
    cam.fov = 66 + clamp(d.speed / 78, 0, 1) * 12;
  } else if (cam.mode === 'fly') {
    const f = cam.fly;
    const sp = f.speed * ((keys.ShiftLeft || keys.ShiftRight) ? 4 : 1) * dt;
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw);
    const rx = Math.sin(f.yaw + Math.PI / 2), rz = Math.cos(f.yaw + Math.PI / 2);
    if (keys.KeyW || keys.ArrowUp) { f.pos[0] += fx * sp; f.pos[2] += fz * sp; }
    if (keys.KeyS || keys.ArrowDown) { f.pos[0] -= fx * sp; f.pos[2] -= fz * sp; }
    if (keys.KeyA || keys.ArrowLeft) { f.pos[0] -= rx * sp; f.pos[2] -= rz * sp; }
    if (keys.KeyD || keys.ArrowRight) { f.pos[0] += rx * sp; f.pos[2] += rz * sp; }
    if (keys.KeyR || keys.Space) f.pos[1] += sp;
    if (keys.KeyC || keys.ControlLeft) f.pos[1] -= sp;
    const gy = terrainAt(HEIGHT_FIELD(), f.pos[0], f.pos[2]) + 1.4;
    if (f.pos[1] < gy) f.pos[1] = gy;
    cam.eye = f.pos.slice();
    const p = f.pitch;
    _dir[0] = fx * Math.cos(p); _dir[1] = Math.sin(p); _dir[2] = fz * Math.cos(p);
    cam.target = v3.add(cam.eye, v3.norm(_dir));
    cam.fov = 70;
  } else {
    const o = cam.orbit;
    o.angle += dt * 0.06;
    const c = pointAt(o.dist, 0, 4);
    cam.eye = [c[0] + Math.cos(o.angle) * o.radius, c[1] + o.height, c[2] + Math.sin(o.angle) * o.radius];
    cam.target = c;
    cam.fov = 60;
  }
}

/* -------------------------------------------------------- генерация */
const meshSolid = new Mesh();
const meshGlow = new Mesh();
let hf = null;
let genMs = 0;
const GEN = { buildings: 0, trees: 0 };

function HEIGHT_FIELD() { return hf; }

const STAGES = () => [
  ['трасса', () => { buildPath(); }],
  ['рельеф', () => { hf = buildHeightField(200); }]
].concat(worldStageList(meshSolid, meshGlow, () => hf).map(([name, fn]) => [name, fn]));

function generate(done) {
  const t0 = performance.now();
  let i = 0;
  const list = STAGES();
  const step = () => {
    if (i >= list.length) {
      genMs = performance.now() - t0;
      done();
      return;
    }
    const [name, fn] = list[i++];
    try {
      fn();
    } catch (e) { fatal(e); return; }
    elBar.style.width = (i / list.length * 100).toFixed(0) + '%';
    elBar.parentElement.parentElement.querySelector('p').textContent = 'ГЕНЕРАЦИЯ: ' + name.toUpperCase();
    setTimeout(step, 0);
  };
  step();
}

function showGenStats() {
  const s = 'Генерация мира (' + genMs.toFixed(0) + ' мс)\n' +
    'Вершин: ' + (meshSolid.count + meshGlow.count).toLocaleString('ru-RU') + '\n' +
    'Треугольников: ' + (meshSolid.tris + meshGlow.tris).toLocaleString('ru-RU') + '\n' +
    'Зданий: ' + GEN.buildings + '\n' +
    'Деревьев: ' + GEN.trees + '\n' +
    'Длина трассы: ' + (path.length / 1000).toFixed(2) + ' км\n' +
    'Вызовов отрисовки: ' + GL.stats.calls;
  elErr.style.display = 'block';
  elErr.textContent = s;
  setTimeout(() => { elErr.style.display = 'none'; }, 7000);
}

/* ---------------------------------------------------------- запуск */
let last = 0, hudTimer = 0, fps = 0, frameMs = 0;
let fpsFrames = 0, fpsSince = 0, hudSince = 0;

function loop(now) {
  requestAnimationFrame(loop);
  if (!GL.mesh) return;
  const wall = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.05);
  clock += dt;

  updateCamera(dt);
  const preset = presetAt(timeT);
  renderFrame(cam, preset, { time: clock, fog: fogOn, glow: glowOn });

  frameMs = performance.now() - wall;
  fpsFrames++;
  if (wall - fpsSince > 500) {                       // честный fps: кадры на реальное время
    fps = fpsFrames * 1000 / (wall - fpsSince);
    fpsFrames = 0; fpsSince = wall;
  }
  hudTimer += dt;
  if (wall - hudSince > 200) {                       // HUD обновляем по реальному времени
    hudSince = wall; hudTimer = 0;
    updateHUD(preset);
  }
}

function updateHUD(preset) {
  UI.fps.textContent = fps.toFixed(0);
  UI.ms.textContent = frameMs.toFixed(1) + ' мс';
  UI.tris.textContent = (GL.stats.tris / 1000).toFixed(0) + ' тыс.';
  UI.calls.textContent = String(GL.stats.calls);
  UI.speed.textContent = cam.mode === 'drive'
    ? (cam.drive.speed * 3.6).toFixed(0) + ' км/ч'
    : (cam.fly.speed * 3.6).toFixed(0) + ' км/ч (полёт)';
  const d = cam.mode === 'drive' ? cam.drive.dist : cam.orbit.dist;
  UI.km.textContent = (mod(d, path.length) / 1000).toFixed(2) + ' / ' + (path.length / 1000).toFixed(2) + ' км';
  const label = timeT < 0.18 ? 'день' : timeT < 0.42 ? 'к закату' : timeT < 0.66 ? 'закат' :
                timeT < 0.86 ? 'сумерки' : 'ночь';
  UI.time.textContent = label + ' (' + timeT.toFixed(2) + ')';

  // компас: отметки направлений
  const heading = cam.mode === 'drive' ? sampleAt(cam.drive.dist).yaw : cam.fly.yaw;
  let html = '';
  for (let a = 0; a < 360; a += 15) {
    const rel = mod(a * DEG - heading, TAU);
    const x = mod(rel + Math.PI, TAU) / TAU * 280;
    const isCardinal = a % 90 === 0;
    html += '<i style="left:' + x.toFixed(1) + 'px;' +
      (isCardinal ? 'background:rgba(255,220,120,.9);width:2px' : '') + '"></i>';
    if (isCardinal) {
      const name = ['С', 'В', 'Ю', 'З'][a / 90];
      html += '<span style="left:' + x.toFixed(1) + 'px">' + name + '</span>';
    }
  }
  UI.compass.innerHTML = html;
}

/* --------------------------------------------------- тестовый хук */
window.__world = {
  ready: false,
  info: () => ({
    ready: window.__world.ready,
    mode: cam.mode,
    buildings: GEN.buildings,
    trees: GEN.trees,
    verts: meshSolid.count + meshGlow.count,
    tris: meshSolid.tris + meshGlow.tris,
    genMs: Math.round(genMs),
    trackKm: +(path.length / 1000).toFixed(2),
    fps: Math.round(fps),
    frameMs: +frameMs.toFixed(2),
    drawCalls: GL.stats.calls,
    timeOfDay: timeT,
    camera: cam.eye.map(v => +v.toFixed(1))
  }),
  setMode: (m) => setMode(m),
  keys: keys,
  cam: cam,
  tunnelAt: () => path.length * WORLD.tunnelFrom,
  /** Синхронно прокрутить n кадров по dt секунд — для детерминированных снимков. */
  step: (n, dt) => {
    n = n || 1; dt = dt || 1 / 60;
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      clock += dt;
      updateCamera(dt);
      renderFrame(cam, presetAt(timeT), { time: clock, fog: fogOn, glow: glowOn });
    }
    const wall = performance.now() - t0;
    fps = wall > 0.5 ? Math.min(999, n * 1000 / wall) : fps;
    updateHUD(presetAt(timeT));
    return { fps: Math.round(fps), ms: +(wall / n).toFixed(2), eye: cam.eye.map((v) => +v.toFixed(1)) };
  },
  setTime: (t) => { timeT = clamp(t, 0, 1); },
  teleport: (dist, lateral) => {
    cam.mode = 'drive';
    cam.drive.dist = mod(dist, path.length);
    cam.drive.lateral = lateral === undefined ? -4.6 : lateral;
    setMode('drive');
  }
};

/* ------------------------------------------------------------ старт */
function boot() {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      const w = Math.max(320, canvas.clientWidth || window.innerWidth);
      const h = Math.max(240, canvas.clientHeight || window.innerHeight);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    };
    window.addEventListener('resize', resize);
    resize();

    initGL(canvas);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      elErr.style.display = 'block';
      elErr.textContent = 'Контекст WebGL потерян. Перезагрузите страницу (F5).';
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());

    generate(() => {
      // в меш пробрасываем статистику по городу
      GEN.buildings = WORLD.buildings;
      GEN.trees = WORLD.trees;
      GL.mesh = uploadMesh(meshSolid.toBuffers());
      meshSolid.free();
      GL.glow = uploadMesh(meshGlow.toBuffers());
      meshGlow.free();

      const s0 = sampleAt(120);
      cam.fly.pos = [s0.p[0] - s0.heading[0] * 30, s0.p[1] + 26, s0.p[2] - s0.heading[2] * 30];
      cam.fly.yaw = s0.yaw;
      cam.drive.dist = 120;
      setMode('fly');

      elLoading.classList.add('done');
      window.__world.ready = true;
      requestAnimationFrame(loop);
    });
  } catch (e) {
    fatal(e);
  }
}
boot();
