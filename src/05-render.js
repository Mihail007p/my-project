/* =====================================================================
   Рендерер: инициализация WebGL, буферы, пресеты времени суток,
   отрисовка неба, основного меша и аддитивного свечения.
   ===================================================================== */

const GL = {
  ctx: null,
  progWorld: null, progSky: null,
  u: {}, sky: {}, skyBuf: null,
  mesh: null, glow: null,
  stats: { calls: 0, tris: 0 }
};

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Ошибка компиляции шейдера:\n' + gl.getShaderInfoLog(sh) +
      '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).slice(0, 40).join('\n'));
  }
  return sh;
}
function createProgram(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Ошибка линковки программы: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

function initGL(canvas) {
  const opts = { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' };
  const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) throw new Error('WebGL недоступен в этом браузере');
  GL.ctx = gl;

  GL.progWorld = createProgram(gl, VS_WORLD, FS_WORLD);
  GL.progSky = createProgram(gl, VS_SKY, FS_SKY);

  const wu = GL.u;
  for (const n of ['uProj', 'uView', 'uCamPos', 'uSunDir', 'uSunCol', 'uSkyCol', 'uGroundCol',
                   'uFogCol', 'uFogDensity', 'uNight', 'uLitRatio', 'uGlow', 'uTime']) {
    wu[n] = gl.getUniformLocation(GL.progWorld, n);
  }
  const su = GL.sky;
  for (const n of ['uInvViewProj', 'uCamPos', 'uSunDir', 'uSunCol', 'uSkyTop', 'uSkyMid',
                   'uSkyHorizon', 'uNight', 'uTime', 'uCloud']) {
    su[n] = gl.getUniformLocation(GL.progSky, n);
  }

  // полноэкранный четырёхугольник для неба
  GL.skyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, GL.skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  return gl;
}

/* ------------------------------------------------------- загрузка меша */
function uploadMesh(buffers) {
  const gl = GL.ctx;
  const mk = (data, name) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  };
  return {
    pos: mk(buffers.pos), nrm: mk(buffers.nrm), col: mk(buffers.col),
    uv: mk(buffers.uv), mat: mk(buffers.mat),
    verts: buffers.verts, tris: buffers.tris
  };
}

function bindWorldAttribs(mesh) {
  const gl = GL.ctx, p = GL.progWorld;
  const bind = (buf, name, size) => {
    const loc = gl.getAttribLocation(p, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  bind(mesh.pos, 'aPos', 3);
  bind(mesh.nrm, 'aNrm', 3);
  bind(mesh.col, 'aCol', 3);
  bind(mesh.uv, 'aUV', 2);
  bind(mesh.mat, 'aMat', 1);
}

/* -------------------------------------------------- время суток */
const SKY_PRESETS = [
  { t: 0.00, night: 0.00, elev: 56 * DEG, az: 205 * DEG, sun: [1.00, 0.95, 0.86], sunMul: 1.25,
    top: [0.20, 0.42, 0.80], mid: [0.46, 0.68, 0.94], hor: [0.78, 0.87, 0.96],
    fog: [0.74, 0.82, 0.90], amb: 0.36, lit: 0.03, glow: 0.0, fogD: 0.00030, cloud: 0.85 },
  { t: 0.50, night: 0.38, elev: 6 * DEG, az: 268 * DEG, sun: [1.00, 0.50, 0.24], sunMul: 1.6,
    top: [0.10, 0.12, 0.38], mid: [0.52, 0.26, 0.40], hor: [1.00, 0.54, 0.28],
    fog: [0.52, 0.36, 0.40], amb: 0.27, lit: 0.30, glow: 0.55, fogD: 0.00036, cloud: 0.75 },
  { t: 1.00, night: 1.00, elev: 40 * DEG, az: 40 * DEG, sun: [0.32, 0.40, 0.62], sunMul: 0.55,
    top: [0.015, 0.025, 0.060], mid: [0.045, 0.065, 0.135], hor: [0.10, 0.14, 0.24],
    fog: [0.06, 0.08, 0.14], amb: 0.14, lit: 0.55, glow: 1.0, fogD: 0.00044, cloud: 0.45 }
];

function presetAt(t) {
  t = clamp(t, 0, 1);
  let a = SKY_PRESETS[0], b = SKY_PRESETS[1], p = 0;
  if (t <= 0.5) { a = SKY_PRESETS[0]; b = SKY_PRESETS[1]; p = t / 0.5; }
  else { a = SKY_PRESETS[1]; b = SKY_PRESETS[2]; p = (t - 0.5) / 0.5; }
  p = smooth(p);
  const L = (x, y) => lerp(x, y, p);
  const L3 = (x, y) => [lerp(x[0], y[0], p), lerp(x[1], y[1], p), lerp(x[2], y[2], p)];
  const elev = L(a.elev, b.elev);
  const az = L(a.az, b.az);
  const sun = v3.norm([Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)]);
  const sunCol = v3.mul(L3(a.sun, b.sun), L(a.sunMul, b.sunMul));
  return {
    night: L(a.night, b.night),
    sunDir: sun,
    sunCol: sunCol,
    skyTop: L3(a.top, b.top),
    skyMid: L3(a.mid, b.mid),
    skyHor: L3(a.hor, b.hor),
    fog: L3(a.fog, b.fog),
    ambient: L(a.amb, b.amb),
    lit: L(a.lit, b.lit),
    glow: L(a.glow, b.glow),
    fogD: L(a.fogD, b.fogD),
    cloud: L(a.cloud, b.cloud)
  };
}

/* ---------------------------------------------------------- отрисовка */
function renderFrame(cam, preset, opts) {
  const gl = GL.ctx;
  opts = opts || {};
  const fogOn = opts.fog !== false;
  const glowOn = opts.glow !== false;

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(preset.fog[0], preset.fog[1], preset.fog[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  GL.stats.calls = 0; GL.stats.tris = 0;

  const proj = m4.perspective(cam.fov * DEG, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.35, 12000);
  const view = m4.lookAt(cam.eye, cam.target, [0, 1, 0]);
  const invViewProj = m4.invert(m4.multiply(proj, view));

  /* --- небо --- */
  gl.useProgram(GL.progSky);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.uniformMatrix4fv(GL.sky.uInvViewProj, false, new Float32Array(invViewProj));
  gl.uniform3fv(GL.sky.uCamPos, cam.eye);
  gl.uniform3fv(GL.sky.uSunDir, preset.sunDir);
  gl.uniform3fv(GL.sky.uSunCol, preset.sunCol);
  gl.uniform3fv(GL.sky.uSkyTop, preset.skyTop);
  gl.uniform3fv(GL.sky.uSkyMid, preset.skyMid);
  gl.uniform3fv(GL.sky.uSkyHorizon, preset.skyHor);
  gl.uniform1f(GL.sky.uNight, preset.night);
  gl.uniform1f(GL.sky.uTime, opts.time || 0);
  gl.uniform1f(GL.sky.uCloud, preset.cloud);
  const skyLoc = gl.getAttribLocation(GL.progSky, 'aPos');
  gl.bindBuffer(gl.ARRAY_BUFFER, GL.skyBuf);
  gl.enableVertexAttribArray(skyLoc);
  gl.vertexAttribPointer(skyLoc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  GL.stats.calls++; GL.stats.tris += 2;
  gl.disableVertexAttribArray(skyLoc);

  /* --- мир --- */
  gl.useProgram(GL.progWorld);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.uniformMatrix4fv(GL.u.uProj, false, new Float32Array(proj));
  gl.uniformMatrix4fv(GL.u.uView, false, new Float32Array(view));
  gl.uniform3fv(GL.u.uCamPos, cam.eye);
  gl.uniform3fv(GL.u.uSunDir, preset.sunDir);
  gl.uniform3fv(GL.u.uSunCol, preset.sunCol);
  gl.uniform3fv(GL.u.uSkyCol, v3.mul(preset.skyMid, preset.ambient));
  gl.uniform3fv(GL.u.uGroundCol, v3.mul([0.35, 0.33, 0.30], preset.ambient));
  gl.uniform3fv(GL.u.uFogCol, preset.fog);
  gl.uniform1f(GL.u.uFogDensity, fogOn ? preset.fogD : 0.00002);
  gl.uniform1f(GL.u.uNight, preset.night);
  gl.uniform1f(GL.u.uLitRatio, preset.lit);
  gl.uniform1f(GL.u.uGlow, glowOn ? preset.glow : 0.0);
  gl.uniform1f(GL.u.uTime, opts.time || 0);

  bindWorldAttribs(GL.mesh);
  gl.disable(gl.BLEND);
  gl.drawArrays(gl.TRIANGLES, 0, GL.mesh.verts);
  GL.stats.calls++; GL.stats.tris += GL.mesh.tris;

  /* --- свечение (аддитивно) --- */
  if (glowOn && preset.glow > 0.01 && GL.glow && GL.glow.verts > 0) {
    bindWorldAttribs(GL.glow);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, GL.glow.verts);
    GL.stats.calls++; GL.stats.tris += GL.glow.tris;
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
  }
}
