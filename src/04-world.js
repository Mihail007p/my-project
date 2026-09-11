/* =====================================================================
   Сборка мира: дорога, ограждения, фонари, тоннель, эстакады,
   развязки, реклама, город и дальний силуэт.
   Всё складывается в два меша: обычный и аддитивный (свечение).
   ===================================================================== */

const PAL = {
  asphalt:   [0.200, 0.205, 0.225],
  shoulder:  [0.430, 0.425, 0.415],
  gravel:    [0.330, 0.310, 0.280],
  barrier:   [0.620, 0.615, 0.590],
  barrierTop:[0.760, 0.755, 0.730],
  rail:      [0.660, 0.680, 0.710],
  post:      [0.520, 0.540, 0.570],
  grass:     [0.300, 0.400, 0.235],
  ground:    [0.400, 0.385, 0.360],
  concrete:  [0.580, 0.570, 0.545],
  concreteD: [0.330, 0.325, 0.315],
  facadeA:   [0.740, 0.720, 0.690],
  facadeB:   [0.610, 0.630, 0.670],
  facadeC:   [0.520, 0.400, 0.340],
  facadeD:   [0.430, 0.450, 0.470],
  glass:     [0.330, 0.460, 0.600],
  trunk:     [0.290, 0.225, 0.150],
  leaf:      [0.200, 0.400, 0.170],
  lamp:      [0.380, 0.390, 0.410],
  lampLens:  [1.000, 0.850, 0.600],
  signGreen: [0.100, 0.330, 0.200],
  signWhite: [0.900, 0.910, 0.900],
  black:     [0.055, 0.058, 0.065],
  deck:      [0.500, 0.495, 0.480],
  glowWarm:  [1.000, 0.780, 0.480],
  glowCool:  [0.550, 0.800, 1.000],
  neon:      [1.000, 0.300, 0.550]
};

const WORLD = {
  tunnelFrom: 0.21,       // доли длины кольца
  tunnelLen: 360,
  overpassAt: [0.085, 0.36, 0.62, 0.80],
  tunnel: null,
  buildings: 0,
  trees: 0
};

/* ------------------------------------------------------- коридор трассы */
function buildCorridor(mesh) {
  const S = path.samples;
  const step = 2;

  // Дорога: единая лента 16.8 м, u — поперечная координата в метрах
  mesh.extrude([{ o: -8.4, y: 0, u: -8.4 }, { o: 8.4, y: 0, u: 8.4 }], S, PAL.asphalt, MAT.ROAD,
               { step: step, vScale: 1 });

  // Обочины, кромка и откос. Профиль ВСЕГДА перечисляем по возрастанию o —
  // от этого зависит направление нормали (иначе грань отсекается как обратная).
  const sideStrips = (sgn) => {
    const inner = sgn * 8.4, outer = sgn * 10.6, edge = sgn * 11.4, far = sgn * 27;
    const asc = (a, b) => (a < b ? [a, b] : [b, a]);
    mesh.extrude(asc({ o: inner, y: 0, u: 0 }, { o: outer, y: 0, u: 2.2 }), S, PAL.shoulder, MAT.GENERIC,
                 { step: step });
    mesh.extrude(asc({ o: outer, y: 0, u: 0 }, { o: edge, y: -0.12, u: 0.8 }), S, PAL.gravel, MAT.GROUND,
                 { step: step });
    mesh.extrude(asc({ o: edge, y: -0.12, u: 0.8 }, { o: far, y: -PATH_CFG.apron, u: 16 }), S, PAL.grass, MAT.GROUND,
                 { step: step, colorFn: (i) => {
                   const n = fbm2(i * 0.12, 3.1, 2);
                   return [PAL.grass[0] * (0.85 + n * 0.35), PAL.grass[1] * (0.85 + n * 0.35), PAL.grass[2] * (0.85 + n * 0.35)];
                 } });
  };
  sideStrips(-1);
  sideStrips(1);

  /* ---------------------------------------------- осевое ограждение */
  const jersey = [
    { o: -0.72, y: 0.00, u: 0 }, { o: -0.66, y: 0.22, u: 0.3 },
    { o: -0.34, y: 0.82, u: 0.9 }, { o: 0.34, y: 0.82, u: 1.5 },
    { o: 0.66, y: 0.22, u: 2.1 }, { o: 0.72, y: 0.00, u: 2.4 }
  ];
  mesh.extrude(jersey, S, PAL.barrier, MAT.GENERIC, {
    step: 1,
    colorFn: (i, k) => (k === 2 ? PAL.barrierTop : (k < 2 ? PAL.barrier : PAL.barrier))
  });

  /* ------------------------------------- металлические ограждения */
  for (const sgn of [-1, 1]) {
    const base = sgn * 11.4;
    // для левой стороны ленту перечисляем сверху вниз, чтобы нормаль смотрела на дорогу
    const band = sgn > 0
      ? [{ o: base, y: 0.42, u: 0 }, { o: base, y: 0.50, u: 0.08 },
         { o: base, y: 0.62, u: 0.2 }, { o: base, y: 0.78, u: 0.36 }]
      : [{ o: base, y: 0.78, u: 0.36 }, { o: base, y: 0.62, u: 0.2 },
         { o: base, y: 0.50, u: 0.08 }, { o: base, y: 0.42, u: 0 }];
    mesh.extrude(band, S, PAL.rail, MAT.METAL, { step: 2, vScale: 1 });
    // столбики каждые 12 м
    const every = Math.max(1, Math.round(12 / (path.length / S.length)));
    for (let i = 0; i < S.length; i += every) {
      const s = S[i];
      const p = mesh.pt(s, { o: base, y: 0 });
      mesh.box(p[0], p[1] + 0.39, p[2], 0.14, 0.78, 0.14, PAL.post, MAT.METAL, { yaw: s.yaw });
    }
  }
}

/* --------------------------- мягкое пятно света, выровненное по трассе */
function glowPool(glow, s, x, y, z, halfW, halfL, col) {
  const rx = s.right[0], rz = s.right[2], hx = s.heading[0], hz = s.heading[2];
  glow.quadFlat(
    [x - rx * halfW - hx * halfL, y, z - rz * halfW - hz * halfL],
    [x + rx * halfW - hx * halfL, y, z + rz * halfW - hz * halfL],
    [x + rx * halfW + hx * halfL, y, z + rz * halfW + hz * halfL],
    [x - rx * halfW + hx * halfL, y, z - rz * halfW + hz * halfL],
    col, MAT.GLOW);
}

/* -------------------- внутри ли сэмпл в тоннеле (по индексу сэмпла) */
function inTunnelSpan(i) {
  const T = WORLD.tunnel;
  if (!T) return false;
  const N = path.samples.length;
  const a = T.i0 % N, b = T.i1 % N, x = i % N;
  return a <= b ? (x >= a && x <= b) : (x >= a || x <= b);
}

/* ---------------------- высота земли с учётом платформы над тоннелем */
function deckLocal(x, z) {
  const T = WORLD.tunnel;
  if (!T) return null;
  const dx = x - T.cx, dz = z - T.cz;
  const cs = Math.cos(-T.yaw), sn = Math.sin(-T.yaw);
  return { lx: dx * cs - dz * sn, lz: dx * sn + dz * cs, len: T.len, half: 33 };
}
function groundYAt(hf, x, z) {
  const t = terrainAt(hf, x, z);
  const L = deckLocal(x, z);
  if (L && Math.abs(L.lx) < L.half && Math.abs(L.lz) < L.len / 2 - 4) return Math.max(t, WORLD.tunnel.deckY + 0.9);
  return t;
}

/* ------------------------------------------------------------ фонари */
function buildLamps(mesh, glow) {
  const S = path.samples;
  const every = Math.max(1, Math.round(45 / (path.length / S.length)));
  for (let i = 0; i < S.length; i += every) {
    const s = S[i];
    for (const sgn of [-1, 1]) {
      const px = s.p[0] + s.right[0] * sgn * 12.3;
      const pz = s.p[2] + s.right[2] * sgn * 12.3;
      const py = s.p[1];
      // столб
      mesh.cylinder(px, py, pz, 0.17, 9.4, 6, PAL.lamp, MAT.METAL, { capTop: true });
      // кронштейн в сторону дороги
      const armLen = 3.0;
      const dirX = -s.right[0] * sgn, dirZ = -s.right[2] * sgn;
      const ax = px + dirX * armLen / 2, az = pz + dirZ * armLen / 2;
      mesh.box(ax, py + 9.35, az, armLen, 0.18, 0.18, PAL.lamp, MAT.METAL, { yaw: s.yaw });
      // плафон
      const hx = px + dirX * armLen, hz = pz + dirZ * armLen;
      mesh.box(hx, py + 9.16, hz, 0.85, 0.16, 0.42, PAL.lamp, MAT.METAL, { yaw: s.yaw });
      mesh.box(hx, py + 9.04, hz, 0.7, 0.1, 0.34, PAL.lampLens, MAT.EMISSIVE, { yaw: s.yaw });
      // световое пятно: вытянуто вдоль трассы, гаснет к краям (см. mat 8 в шейдере)
      const lx = px + dirX * 5.0, lz = pz + dirZ * 5.0;
      glowPool(glow, s, lx, py + 0.07, lz, 5.4, 10.5, [0.92, 0.74, 0.46]);
    }
  }
}

/* ------------------------------------------------------------ земля */
function buildGround(mesh, hf) {
  const step = 40;
  const R = 1900;
  const n = Math.round(R * 2 / step);
  const grid = [];
  for (let j = 0; j <= n; j++) {
    grid[j] = [];
    for (let i = 0; i <= n; i++) {
      const x = -R + i * step, z = -R + j * step;
      grid[j][i] = [x, urbanGroundHeight(hf, x, z), z];
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
      const cx = (a[0] + c[0]) / 2, cz = (a[2] + c[2]) / 2;
      const near = nearestPath(cx, cz, 200);
      const dist = near ? near.distance : 999;
      const t = clamp(dist / 400, 0, 1);
      const shade = 0.86 + 0.28 * fbm2(cx * 0.01, cz * 0.01, 2);
      const col = [
        lerp(PAL.concrete[0], PAL.grass[0] * 0.9, t) * shade,
        lerp(PAL.concrete[1], PAL.grass[1] * 0.9, t) * shade,
        lerp(PAL.concrete[2], PAL.grass[2] * 0.9, t) * shade
      ];
      mesh.quad(a, d, c, b, col, MAT.GROUND,
                [a[0] * 0.5, a[2] * 0.5], [d[0] * 0.5, d[2] * 0.5],
                [c[0] * 0.5, c[2] * 0.5], [b[0] * 0.5, b[2] * 0.5]);
    }
  }
  // внешнее кольцо до горизонта (грубые плиты)
  const outer = [[-R, R], [R, 3800], [-3800, -R], [R, -R]];
  void outer;
  const stepO = 200, RO = 3600;
  const nO = Math.round(RO * 2 / stepO);
  for (let j = 0; j < nO; j++) {
    for (let i = 0; i < nO; i++) {
      const x0 = -RO + i * stepO, z0 = -RO + j * stepO;
      const x1 = x0 + stepO, z1 = z0 + stepO;
      if (x0 > -R - stepO && x1 < R + stepO && z0 > -R - stepO && z1 < R + stepO) continue;
      const h = (x, z) => hf(x, z);
      const a = [x0, h(x0, z0), z0], b = [x1, h(x1, z0), z0], c = [x1, h(x1, z1), z1], d = [x0, h(x0, z1), z1];
      mesh.quad(a, d, c, b, PAL.ground, MAT.GROUND, [x0 * 0.5, z0 * 0.5], [x0 * 0.5, z1 * 0.5],
                [x1 * 0.5, z1 * 0.5], [x1 * 0.5, z0 * 0.5]);
    }
  }
}

/* ------------------------------------------------------- тоннель */
function buildTunnel(mesh, glow, hf) {
  const D0 = path.length * WORLD.tunnelFrom;
  const D1 = D0 + WORLD.tunnelLen;
  const idxOf = (d) => Math.round(mod(d, path.length) / path.length * path.samples.length);
  const i0 = idxOf(D0), i1 = idxOf(D1);
  const N = path.samples.length;

  // профиль: стены + арка
  const prof = [{ o: -9.8, y: 0, u: 0 }, { o: -9.8, y: 3.4, u: 3.4 }];
  const segs = 12;
  for (let k = 0; k <= segs; k++) {
    const a = Math.PI - k / segs * Math.PI;
    prof.push({ o: Math.cos(a) * 9.8, y: 3.4 + Math.sin(a) * 6.1, u: 3.4 + Math.sin(a) * 6.1 });
  }
  prof.push({ o: 9.8, y: 3.4, u: 3.4 }, { o: 9.8, y: 0, u: 0 });

  const wrap = (arr, from, to) => {
    const out = [];
    for (let i = from; i <= to; i++) out.push(arr[i % N]);
    return out;
  };
  const sub = wrap(path.samples, i0, i1);
  mesh.extrude(prof, sub, PAL.concreteD, MAT.GENERIC, { step: 1, vScale: 0.25, doubleSided: true });

  // потолочные светильники + свет
  const every = Math.max(1, Math.round(14 / (path.length / N)));
  for (let i = 0; i < sub.length; i += every) {
    const s = sub[i];
    const c = mesh.pt(s, { o: 0, y: 9.2 });
    mesh.box(c[0], c[1], c[2], 0.9, 0.12, 2.4, PAL.signWhite, MAT.EMISSIVE, { yaw: s.yaw });
    const gl = mesh.pt(s, { o: 0, y: 0.07 });
    glowPool(glow, s, gl[0], gl[1], gl[2], 4.0, 6.6, [0.60, 0.63, 0.70]);
  }

  // порталы
  for (const end of [i0, i1]) {
    const s = path.samples[end % N];
    for (const sgn of [-1, 1]) {
      const p = mesh.pt(s, { o: sgn * 13.2, y: 9.0 });
      mesh.box(p[0], p[1], p[2], 6.8, 18, 2.4, PAL.concrete, MAT.GENERIC, { yaw: s.yaw });
      mesh.box(p[0], p[1] + 0.4, p[2], 7.4, 1.2, 2.9, PAL.concreteD, MAT.GENERIC, { yaw: s.yaw });
    }
    const top = mesh.pt(s, { o: 0, y: 16.6 });
    mesh.box(top[0], top[1], top[2], 34, 4.4, 2.4, PAL.concrete, MAT.GENERIC, { yaw: s.yaw });
  }

  // платформа над тоннелем: город стоит на ней
  const mid = path.samples[Math.round((i0 + i1) / 2) % N];
  const len = v3.len(v3.sub(sub[sub.length - 1].p, sub[0].p)) + 60;
  const deckY = mid.p[1] + 17.5;
  const cx = (sub[0].p[0] + sub[sub.length - 1].p[0]) / 2;
  const cz = (sub[0].p[2] + sub[sub.length - 1].p[2]) / 2;
  mesh.box(cx, deckY, cz, 70, 1.6, len, PAL.deck, MAT.GENERIC, { yaw: mid.yaw });
  // парапеты платформы
  for (const sgn of [-1, 1]) {
    const p = mesh.pt(mid, { o: sgn * 34, y: 18.6 });
    mesh.box(p[0], p[1], p[2], 1.0, 1.2, len, PAL.concrete, MAT.GENERIC, { yaw: mid.yaw });
  }
  WORLD.tunnel = { deckY: deckY, cx: cx, cz: cz, len: len, yaw: mid.yaw, i0: i0, i1: i1 };
  void hf;
}

/* ------------------------------------------------- эстакады над дорогой */
function buildOverpasses(mesh, glow) {
  for (const frac of WORLD.overpassAt) {
    const s = sampleAt(path.length * frac);
    const py = s.p[1];
    const yawCross = s.yaw + Math.PI / 2;      // мост идёт поперёк трассы
    const cx = s.p[0], cz = s.p[2];

    // пролёт моста
    mesh.box(cx, py + 8.2, cz, 15, 1.8, 96, PAL.deck, MAT.GENERIC, { yaw: yawCross });
    // парапеты по краям пролёта
    for (const sgn of [-1, 1]) {
      const ex = cx + s.heading[0] * sgn * 7.0, ez = cz + s.heading[2] * sgn * 7.0;
      mesh.box(ex, py + 9.7, ez, 1.1, 1.2, 96, PAL.concrete, MAT.GENERIC, { yaw: yawCross });
    }
    // опоры до земли
    for (const la of [-32, -15, 15, 32]) {
      const x = cx + s.right[0] * la, z = cz + s.right[2] * la;
      const gy = terrainHeight(x, z);
      const height = Math.max(3, py + 8.2 - gy);
      mesh.box(x, gy + height / 2, z, 2.8, height, 2.8, PAL.concrete, MAT.GENERIC, { yaw: s.yaw });
    }
    // освещение на мосту
    for (const la of [-22, 22]) {
      for (const sgn of [-1, 1]) {
        const px = cx + s.heading[0] * la + s.right[0] * sgn * 7.5;
        const pz = cz + s.heading[2] * la + s.right[2] * sgn * 7.5;
        mesh.cylinder(px, py + 9.0, pz, 0.14, 6.0, 5, PAL.lamp, MAT.METAL, { capTop: true });
        mesh.box(px, py + 14.9, pz, 1.6, 0.16, 0.5, PAL.lampLens, MAT.EMISSIVE, { yaw: s.yaw });
        glowPool(glow, s, px, py + 0.07, pz, 5.0, 6.0, [0.88, 0.70, 0.44]);
      }
    }
  }
}

/* ------------------------------------------- знаки над дорогой и щиты */
function buildSigns(mesh, glow) {
  const S = path.samples;
  const gantryEvery = Math.max(1, Math.round(760 / (path.length / S.length)));
  for (let i = 40; i < S.length; i += gantryEvery) {
    const s = S[i];
    // ферма над дорогой
    for (const sgn of [-1, 1]) {
      const p = mesh.pt(s, { o: sgn * 11.6, y: 0 });
      mesh.box(p[0], p[1] + 3.8, p[2], 0.55, 7.6, 0.55, PAL.post, MAT.METAL, { yaw: s.yaw });
    }
    const b = mesh.pt(s, { o: 0, y: 7.4 });
    mesh.box(b[0], b[1], b[2], 24, 0.7, 0.7, PAL.post, MAT.METAL, { yaw: s.yaw });
    // щиты: зелёные с белыми строками
    for (const la of [-4.6, 4.6]) {
      const p = mesh.pt(s, { o: la, y: 6.6 });
      mesh.box(p[0], p[1], p[2], 8.4, 3.4, 0.22, PAL.signGreen, MAT.GENERIC, { yaw: s.yaw });
      for (let k = 0; k < 3; k++) {
        const t = mesh.pt(s, { o: la + (k - 1) * 2.3, y: 7.4 - k * 0.9 });
        mesh.box(t[0], t[1], t[2], 2.0, 0.42, 0.3, PAL.signWhite, MAT.EMISSIVE, { yaw: s.yaw });
      }
    }
    void glow;
  }

  // рекламные щиты вдоль дороги
  const billEvery = Math.max(1, Math.round(620 / (path.length / S.length)));
  for (let i = 90; i < S.length; i += billEvery) {
    const s = S[i];
    const sgn = (i / billEvery) % 2 ? 1 : -1;
    const p = mesh.pt(s, { o: sgn * 30, y: 0 });
    const gy = terrainHeight(p[0], p[2]);
    for (const dx of [-3.6, 3.6]) {
      const px = p[0] + s.heading[0] * dx, pz = p[2] + s.heading[2] * dx;
      mesh.cylinder(px, gy, pz, 0.3, 7.5, 6, PAL.post, MAT.METAL, { capTop: true });
    }
    const cy = gy + 7.5 + 2.6;
    const panelYaw = s.yaw + (sgn > 0 ? -0.35 : Math.PI + 0.35);
    mesh.box(p[0], cy, p[2], 13.5, 5.4, 0.3, [1, 1, 1], MAT.BILLBOARD, { yaw: panelYaw });
    mesh.box(p[0], cy + 2.9, p[2], 14.2, 0.35, 0.6, PAL.post, MAT.METAL, { yaw: panelYaw });
  }
}

/* ------------------------------------------------------------- город */
function buildCity(mesh, hf) {
  const block = 130, street = 22;
  const R = 2400;
  const n = Math.round(R * 2 / (block + street));
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const bx = i * (block + street), bz = j * (block + street);
      const cx = bx + block / 2, cz = bz + block / 2;
      const dCenter = Math.hypot(cx, cz);
      if (dCenter > R) continue;
      const near = nearestPath(cx, cz, 260);
      const L = deckLocal(cx, cz);
      const onDeck = !!(L && Math.abs(L.lx) < L.half && Math.abs(L.lz) < L.len / 2 - 6);
      if (!onDeck && near && near.distance < 150) continue;     // первую линию строит buildFrontage

      // парки и пустыри: часть кварталов без зданий
      const park = fbm2(cx * 0.004 + 3.0, cz * 0.004 + 7.0, 3);
      const isPark = park > 0.58;
      if (isPark) {
        buildPark(mesh, hf, bx, bz, block);
        continue;
      }

      const perSide = randInt(2, 3);
      const cellW = (block - 6) / perSide;
      for (let a = 0; a < perSide; a++) {
        for (let b = 0; b < perSide; b++) {
          if (rnd() < 0.18) continue;
          const px = bx + 3 + cellW * a + cellW / 2 + rand(-3, 3);
          const pz = bz + 3 + cellW * b + cellW / 2 + rand(-3, 3);
          const w = Math.min(cellW * rand(0.6, 0.9), 46);
          const d = Math.min(cellW * rand(0.6, 0.9), 46);
          const bd = deckLocal(px, pz);
          const bOnDeck = !!(bd && Math.abs(bd.lx) < bd.half - 2 && Math.abs(bd.lz) < bd.len / 2 - 8);
          if (!bOnDeck) {
            const dNear = nearestPath(px, pz, 140);
            if (dNear && dNear.distance < 46) continue;          // здание не выходит на трассу
          }
          const gy = groundYAt(hf, px, pz);
          const centerBoost = clamp(1 - dCenter / 1900, 0, 1);
          let h = rand(11, 30) + centerBoost * rand(10, 120);
          if (rnd() < 0.10) h *= rand(1.4, 2.1);
          h = clamp(h, 9, 230);
          buildBuilding(mesh, px, pz, w, d, h, gy, dCenter, hf);
          WORLD.buildings++;
        }
      }
    }
  }
}

/* Застройка «первой линии»: кварталы вдоль трассы, а не только сетка.
   Так вдоль дороги возникает настоящий городской фронт. */
function buildFrontage(mesh, hf) {
  const S = path.samples;
  const per = path.length / S.length;
  const stepIdx = Math.max(1, Math.round(24 / per));
  for (let i = 0; i < S.length; i += stepIdx) {
    if (inTunnelSpan(i)) continue;
    const s = S[i];
    for (const sgn of [-1, 1]) {
      if (rnd() < 0.2) continue;                            // разрывы: парковки, скверы
      const base = 50 + fbm2(i * 0.05, sgn * 3.7, 2) * 28;  // 50…78 м от оси
      const off = sgn * (base + rand(-3, 3));
      const px = s.p[0] + s.right[0] * off, pz = s.p[2] + s.right[2] * off;
      const near = nearestPath(px, pz, 200);
      if (near && near.distance < 45) continue;
      const w = rand(15, 33);                               // вдоль дороги
      const d = rand(20, 44);                               // в глубину
      const gy = groundYAt(hf, px, pz);
      const dCenter = Math.hypot(px, pz);
      let h = rand(13, 32) + clamp(1 - dCenter / 1800, 0, 1) * rand(6, 74);
      if (rnd() < 0.12) h *= rand(1.35, 2.0);
      h = clamp(h, 12, 190);
      buildBuilding(mesh, px, pz, w, d, h, gy, dCenter, hf, s.yaw + rand(-0.14, 0.14));
      WORLD.buildings++;
    }
  }
}

function buildBuilding(mesh, x, z, w, d, h, gy, dCenter, hf, yawIn) {
  const tower = h > 70;
  const r = rnd();
  let col = PAL.facadeA;
  if (r < 0.30) col = PAL.facadeB;
  else if (r < 0.44) col = PAL.facadeC;
  else if (r < 0.56) col = PAL.facadeD;
  const mat = (tower && rnd() < 0.55) ? MAT.GLASS : MAT.FACADE;
  const yaw = yawIn !== undefined ? yawIn
            : (rnd() < 0.25 ? Math.round(rnd() * 4) * Math.PI / 8 : 0);

  // ВАЖНО: один общий множитель яркости — иначе каждый канал «плывёт»
  // и город становится разноцветным (зелёные, сиреневые, розовые дома).
  const lum0 = (col[0] + col[1] + col[2]) / 3;
  const br = 0.80 + rnd() * 0.36;
  const base = [lerp(col[0], lum0, 0.20) * br, lerp(col[1], lum0, 0.20) * br, lerp(col[2], lum0, 0.20) * br];

  // дальние здания — простые коробки: бережём треугольники
  const simple = dCenter > 1350;
  if (simple) {
    mesh.box(x, gy + h / 2, z, w, h, d, base, mat, { yaw: yaw, uvScale: 1, uvOff: [Math.abs(x) % 3.3, (gy + h / 2) % 3.7] });
    return;
  }

  // подиум для зданий у дороги
  if (dCenter > 900 && h < 40 && rnd() < 0.5) {
    mesh.box(x, gy + 2.6, z, w + 3.4, 5.2, d + 3.4, [base[0] * 0.8, base[1] * 0.8, base[2] * 0.8], MAT.GENERIC,
             { yaw: yaw, uvScale: 0.25, uvOff: [x % 12, z % 12] });
    gy += 5.2;
  }

  mesh.box(x, gy + h / 2, z, w, h, d, base, mat,
           { yaw: yaw, uvScale: 1, uvOff: [Math.abs(x) % 3.3, (gy + h / 2) % 3.7] });

  // уступ у высоких башен
  if (tower && rnd() < 0.6) {
    const h2 = h * rand(0.25, 0.5);
    mesh.box(x, gy + h + h2 / 2, z, w * 0.62, h2, d * 0.62, base, mat,
             { yaw: yaw, uvScale: 1, uvOff: [Math.abs(x) % 3.3, (gy + h) % 3.7] });
  }

  // кровля: плоская плита (прячет «окна» на торце бокса), парапет, вентиляция
  const top = gy + h;
  const roofCol = [base[0] * 0.5 + 0.12, base[1] * 0.5 + 0.12, base[2] * 0.5 + 0.13];
  mesh.box(x, top + 0.06, z, w * 0.995, 0.14, d * 0.995, roofCol, MAT.GENERIC, { yaw: yaw, uvScale: 0.2 });
  const pw = w * 0.98, pd = d * 0.98;
  for (const [ox, oz, sw, sd] of [[0, -pd / 2, pw, 0.5], [0, pd / 2, pw, 0.5],
                                  [-pw / 2, 0, 0.5, pd], [pw / 2, 0, 0.5, pd]]) {
    const rx = x + ox * Math.cos(yaw) - oz * Math.sin(yaw);
    const rz = z + ox * Math.sin(yaw) + oz * Math.cos(yaw);
    mesh.box(rx, top + 0.55, rz, sw, 1.1, sd, [base[0] * 0.85, base[1] * 0.85, base[2] * 0.85],
             MAT.GENERIC, { yaw: yaw, uvScale: 0.3 });
  }
  if (w > 14 && d > 14) {
    const nBox = randInt(1, 3);
    for (let k = 0; k < nBox; k++) {
      mesh.box(x + rand(-w / 3, w / 3), top + 1.4, z + rand(-d / 3, d / 3),
               rand(2, 5), rand(1.6, 3), rand(2, 5), PAL.concreteD, MAT.METAL, { yaw: rand(0, 1) });
    }
  }
  if (h > 60 && rnd() < 0.5) {
    mesh.cylinder(x, top + 1, z, 0.16, rand(6, 18), 4, PAL.post, MAT.METAL, { capTop: true });
    mesh.box(x, top + 1 + rand(6, 18), z, 0.7, 0.12, 0.7, PAL.neon, MAT.EMISSIVE);
  }
  void hf;
}

function buildPark(mesh, hf, bx, bz, block) {
  const n = randInt(3, 6);
  for (let k = 0; k < n; k++) {
    const x = bx + rand(6, block - 6), z = bz + rand(6, block - 6);
    const gy = terrainAt(hf, x, z);
    buildTree(mesh, x, gy, z, rand(0.85, 1.5));
    WORLD.trees++;
  }
}

function buildTree(mesh, x, y, z, s) {
  const trunkH = 3.0 * s;
  mesh.cylinder(x, y, z, 0.22 * s, trunkH, 5, PAL.trunk, MAT.GENERIC, { capTop: false });
  const crownY = y + trunkH + 1.5 * s;
  mesh.sphere(x, crownY, z, 2.3 * s, 7, 4, PAL.leaf, MAT.FOLIAGE, 0.82);
  if (s > 1.1) mesh.sphere(x + 0.9 * s, crownY + 0.9 * s, z - 0.6 * s, 1.5 * s, 6, 3, PAL.leaf, MAT.FOLIAGE, 0.8);
}

/* ------------------------------------------ шумозащитные экраны */
function buildNoiseBarriers(mesh, hf) {
  const S = path.samples;
  const per = path.length / S.length;                 // метров на сэмпл
  let i = 0;
  while (i < S.length - 4) {
    const s = S[i];
    const on = fbm2(s.p[0] * 0.0016 + 11.0, s.p[2] * 0.0016 + 5.0, 3);
    if (on < 0.50) { i += 3; continue; }
    const runLen = 10 + Math.round(rnd() * 22);
    const sgn = rnd() < 0.5 ? -1 : 1;
    for (let k = 0; k < runLen && i + k < S.length; k++) {
      const ii = (i + k) % S.length;
      if (inTunnelSpan(ii)) continue;
      const sp = S[ii];
      const off = sgn * 28.5;
      const px = sp.p[0] + sp.right[0] * off, pz = sp.p[2] + sp.right[2] * off;
      const gy = terrainAt(hf, px, pz);
      const h = 3.4 + (k % 4 === 0 ? 0.5 : 0);
      const tint = fbm2(px * 0.05, pz * 0.05, 2);
      const col = [PAL.concrete[0] * (0.82 + tint * 0.28), PAL.concrete[1] * (0.82 + tint * 0.28), PAL.concrete[2] * (0.82 + tint * 0.28)];
      mesh.box(px, gy + 0.35 + h / 2, pz, 0.26, h, per * 1.2, col, MAT.GENERIC, { yaw: sp.yaw, uvScale: 0.25 });
      if (k % 3 === 0) {
        mesh.box(px, gy + 0.3 + h / 2, pz, 0.44, h + 0.34, 0.44, PAL.post, MAT.METAL, { yaw: sp.yaw });
      }
    }
    i += runLen + 5 + Math.round(rnd() * 12);
  }
}

/* ---------------------------------------- деревья вдоль обочин */
function buildRoadside(mesh, hf) {
  const S = path.samples;
  const every = Math.max(1, Math.round(17 / (path.length / S.length)));
  for (let i = 0; i < S.length; i += every) {
    if (inTunnelSpan(i)) continue;
    const s = S[i];
    for (const sgn of [-1, 1]) {
      if (rnd() < 0.45) continue;
      const off = sgn * rand(31, 45);
      const px = s.p[0] + s.right[0] * off + rand(-4, 4);
      const pz = s.p[2] + s.right[2] * off + rand(-4, 4);
      const near = nearestPath(px, pz, 60);
      if (near && near.distance < 30) continue;
      buildTree(mesh, px, terrainAt(hf, px, pz), pz, rand(0.7, 1.35));
      WORLD.trees++;
    }
  }
}

/* ------------------------------- городская земля: улицы, тротуары, дворы */
function buildCityGround(mesh, hf) {
  const block = 130, street = 22, cell = block + street;
  const R = 2400;
  const n = Math.ceil(R / cell);
  const streetCol = [0.190, 0.193, 0.202];
  const curbCol = [0.600, 0.596, 0.580];
  const paveCol = [0.400, 0.395, 0.380];
  const yardCol = [0.330, 0.348, 0.318];
  const grassCol = [0.245, 0.330, 0.196];
  const lift = 0.18;
  const H = (x, z) => groundYAt(hf, x, z) + lift;
  const quad = (ax, az, bx, bz, cx, cz, dx, dz, col, mat) => {
    mesh.quad([ax, H(ax, az), az], [bx, H(bx, bz), bz], [cx, H(cx, cz), cz], [dx, H(dx, dz), dz],
              col, mat, [0, 0], [1, 0], [1, 1], [0, 1]);
  };
  const L = (t) => t;   // для читаемости
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const x0 = i * cell, z0 = j * cell, x1 = x0 + cell, z1 = z0 + cell;
      const bc = block;
      const cx = x0 + cell / 2, cz = z0 + cell / 2;
      if (Math.hypot(cx, cz) > R) continue;
      const near = nearestPath(cx, cz, 220);
      if (near && near.distance < 34) continue;              // полоса отвода трассы

      // асфальт улиц (Г-образно, без наложений)
      quad(x0 + bc, z0, x1, z0, x1, z0 + bc, x0 + bc, z0 + bc, streetCol, MAT.GENERIC);
      quad(x0, z0 + bc, x1, z0 + bc, x1, z1, x0, z1, streetCol, MAT.GENERIC);

      // тротуарная рамка квартала и внутренность
      const pad = 3.0, ix0 = x0 + pad, iz0 = z0 + pad, ix1 = x0 + bc - pad, iz1 = z0 + bc - pad;
      quad(x0, z0, ix0, z0, ix0, iz0, x0, iz0, curbCol, MAT.GENERIC);                 // угол
      quad(x0, iz0, ix0, iz0, ix0, iz1, x0, iz1, curbCol, MAT.GENERIC);
      quad(x0, iz1, ix0, iz1, ix0, z1, x0, z1, curbCol, MAT.GENERIC);
      quad(ix0, z0, x1, z0, x1, iz0, ix0, iz0, curbCol, MAT.GENERIC);
      quad(ix0, iz1, x1, iz1, x1, z1, ix0, z1, curbCol, MAT.GENERIC);
      quad(ix1, z0, x1, z0, x1, iz1, ix1, iz1, curbCol, MAT.GENERIC);
      quad(ix1, iz0, x1, iz0, x1, iz1, ix1, iz1, curbCol, MAT.GENERIC);
      const park = fbm2(cx * 0.004 + 3.0, cz * 0.004 + 7.0, 3) > 0.58;
      const inner = fbm2(cx * 0.02, cz * 0.02, 2);
      const shade = 0.80 + fbm2(cx * 0.09, cz * 0.09, 2) * 0.42;   // разнотон кварталов
      const tint = (c) => [c[0] * shade, c[1] * shade, c[2] * shade];
      quad(ix0, iz0, ix1, iz0, ix1, iz1, ix0, iz1,
           park ? tint(grassCol) : (inner < 0.42 ? tint(yardCol) : tint(paveCol)),
           park ? MAT.GROUND : MAT.GENERIC);
    }
  }
  void L;
}

/* ------------------------------------------- дальний силуэт города */
function buildSkyline(mesh, hf) {
  for (let i = 0; i < 420; i++) {
    const a = rnd() * TAU;
    const r = rand(2500, 3500);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const gy = hf(x, z);
    const w = rand(18, 55), d = rand(18, 55);
    const h = rand(20, 150) * (r > 3000 ? 1.25 : 1);
    const shade = 0.5 + 0.3 * rnd();
    mesh.box(x, gy + h / 2, z, w, h, d, [shade * 0.6, shade * 0.65, shade * 0.75], MAT.FACADE,
             { yaw: rand(0, 1), uvScale: 1 });
  }
}

/* ------------------------------------------------------------- сборка
   Единый список этапов: им пользуются и браузер (по кадрам, с прогрессом),
   и node-проверка tools/world-stats.js. Порядок важен: тоннель задаёт
   платформу, на которую потом встаёт город. */
function worldStageList(meshSolid, meshGlow, hf) {
  return [
    ['земля', () => buildGround(meshSolid, hf)],
    ['дорога', () => buildCorridor(meshSolid)],
    ['фонари', () => buildLamps(meshSolid, meshGlow)],
    ['тоннель', () => buildTunnel(meshSolid, meshGlow, hf)],
    ['эстакады', () => buildOverpasses(meshSolid, meshGlow)],
    ['знаки', () => buildSigns(meshSolid, meshGlow)],
    ['экраны', () => buildNoiseBarriers(meshSolid, hf)],
    ['обочины', () => buildRoadside(meshSolid, hf)],
    ['улицы', () => buildCityGround(meshSolid, hf)],
    ['первая линия', () => buildFrontage(meshSolid, hf)],
    ['город', () => buildCity(meshSolid, hf)],
    ['силуэт', () => buildSkyline(meshSolid, hf)]
  ];
}

function buildWorld(meshSolid, meshGlow) {
  const hf = buildHeightField(200);
  for (const [, fn] of worldStageList(meshSolid, meshGlow, hf)) fn();
  return hf;
}

/* --------------------------------------- грубое поле высот для города */
function buildHeightField(step) {
  const R = 3800;
  const n = Math.round(R * 2 / step);
  const data = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -R + i * step, z = -R + j * step;
      data[j * (n + 1) + i] = terrainHeight(x, z);
    }
  }
  const f = (x, z) => {
    const fi = clamp((x + R) / step, 0, n - 0.001), fj = clamp((z + R) / step, 0, n - 0.001);
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    const tx = fi - i0, tz = fj - j0;
    const a = data[j0 * (n + 1) + i0], b = data[j0 * (n + 1) + i0 + 1];
    const c = data[(j0 + 1) * (n + 1) + i0], d = data[(j0 + 1) * (n + 1) + i0 + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  };
  f.step = step;
  return f;
}
function terrainAt(hf, x, z) {
  const near = nearestPath(x, z, 120);
  if (near && near.distance < 90) return near.y - PATH_CFG.apron;
  return hf(x, z);
}
function urbanGroundHeight(hf, x, z) { return terrainAt(hf, x, z); }
