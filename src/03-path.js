/* =====================================================================
   Трасса и рельеф.

   Дорога — замкнутое кольцо вокруг центра города. Кольцо задаётся
   периодической функцией радиуса и высоты, поэтому петля сходится
   идеально (без стыка) и не требует «склейки» концов.

     R(θ) = R0 + a·cos(3θ) + b·sin(2θ+1.1) + c·cos(5θ+0.5)
     y(θ) = e1·sin(2θ+0.7) + e2·sin(3θ+2.1) + e3·cos(4θ)

   Изгибы получаются сами: где R меняется быстро — там поворот.
   ===================================================================== */

const PATH_CFG = {
  N: 1500,            // сэмплов по кольцу (шаг ≈ 5 м)
  R0: 1150,           // базовый радиус кольца
  a: 320, b: 230, c: 110,
  e1: 13, e2: 8, e3: 5,
  halfWidth: 24,      // докуда считаем «коридором трассы»
  apron: 7            // на сколько ниже дороги лежит земля рядом с ней
};

const path = {
  samples: [],
  length: 0,
  grid: null,
  cell: 60,
  min: [0, 0], count: [0, 0]
};

function pathRadius(t) {
  return PATH_CFG.R0
    + PATH_CFG.a * Math.cos(3 * t)
    + PATH_CFG.b * Math.sin(2 * t + 1.1)
    + PATH_CFG.c * Math.cos(5 * t + 0.5);
}
function pathHeight(t) {
  return PATH_CFG.e1 * Math.sin(2 * t + 0.7)
       + PATH_CFG.e2 * Math.sin(3 * t + 2.1)
       + PATH_CFG.e3 * Math.cos(4 * t);
}
function pathPoint(t) {
  const r = pathRadius(t);
  return [r * Math.cos(t), pathHeight(t), r * Math.sin(t)];
}

function buildPath() {
  const N = PATH_CFG.N;
  const pts = [];
  for (let i = 0; i < N; i++) pts.push(pathPoint(i / N * TAU));

  const samples = [];
  let dist = 0;
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const pPrev = pts[(i - 1 + N) % N];
    const pNext = pts[(i + 1) % N];
    const heading = v3.norm(v3.sub(pNext, pPrev));
    const right = v3.norm(v3.cross([0, 1, 0], heading));
    if (i > 0) dist += v3.len(v3.sub(p, pts[i - 1]));
    samples.push({ p, heading, right, up: [0, 1, 0], dist, yaw: Math.atan2(heading[0], heading[2]) });
  }
  path.samples = samples;
  path.length = dist + v3.len(v3.sub(pts[0], pts[N - 1]));

  // пространственная сетка для быстрого поиска ближайшего сэмпла
  let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
  for (const s of samples) {
    minX = Math.min(minX, s.p[0]); maxX = Math.max(maxX, s.p[0]);
    minZ = Math.min(minZ, s.p[2]); maxZ = Math.max(maxZ, s.p[2]);
  }
  const c = path.cell;
  const cw = Math.ceil((maxX - minX) / c) + 2, ch = Math.ceil((maxZ - minZ) / c) + 2;
  const grid = new Array(cw * ch).fill(null);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const gx = Math.floor((s.p[0] - minX + c) / c), gz = Math.floor((s.p[2] - minZ + c) / c);
    const k = gz * cw + gx;
    if (!grid[k]) grid[k] = [];
    grid[k].push(i);
  }
  path.grid = grid; path.min = [minX - c, minZ - c]; path.count = [cw, ch];
  return path;
}

// ближайшая точка трассы: возвращает {dist, y, index, lateral}
function nearestPath(x, z, maxR) {
  const c = path.cell, cw = path.count[0], ch = path.count[1];
  const gx = Math.floor((x - path.min[0]) / c), gz = Math.floor((z - path.min[1]) / c);
  const r = Math.ceil((maxR || 140) / c);
  let best = null, bestD2 = Infinity, bestIdx = -1;
  for (let j = gz - r; j <= gz + r; j++) {
    if (j < 0 || j >= ch) continue;
    for (let i = gx - r; i <= gx + r; i++) {
      if (i < 0 || i >= cw) continue;
      const bucket = path.grid[j * cw + i];
      if (!bucket) continue;
      for (let k = 0; k < bucket.length; k++) {
        const s = path.samples[bucket[k]];
        const dx = s.p[0] - x, dz = s.p[2] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = s; bestIdx = bucket[k]; }
      }
    }
  }
  if (!best) return null;
  const lateral = v3.dot(v3.sub([x, 0, z], [best.p[0], 0, best.p[2]]), best.right);
  return { dist: best.dist, y: best.p[1], index: bestIdx, lateral, sample: best, distance: Math.sqrt(bestD2) };
}

/* ------------------------------------------------------------- рельеф */
// Высота земли: рядом с трассой — ровная площадка чуть ниже дороги,
// дальше плавно уходит в собственный рельеф города.
function terrainHeight(x, z) {
  const near = nearestPath(x, z, 260);
  const base = 2.6 * Math.sin(x / 520) * Math.cos(z / 470)
             + 3.4 * (fbm2(x / 900, z / 900, 3) - 0.5)
             - 1.2;
  if (!near) return base;
  const apron = near.y - PATH_CFG.apron;
  const t = smooth(clamp((near.distance - 70) / 170, 0, 1));
  return lerp(apron, base, t);
}

/* --------------------------------------------- поиск точки на трассе */
function sampleAt(dist) {
  const N = path.samples.length;
  const d = mod(dist, path.length);
  const idx = clamp(Math.floor(d / path.length * N), 0, N - 1);
  return path.samples[idx];
}
function pointAt(dist, lateral, height) {
  const s = sampleAt(dist);
  return [
    s.p[0] + s.right[0] * (lateral || 0),
    s.p[1] + (height || 0),
    s.p[2] + s.right[2] * (lateral || 0)
  ];
}
function yawAt(dist) { return sampleAt(dist).yaw; }
