/* =====================================================================
   Математика: векторы, матрицы 4x4, генераторы случайных чисел.
   Всё в мировых координатах: Y — вверх, дорога строится по X/Z.
   ===================================================================== */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, p) => a + (b - a) * p;
const smooth = (p) => p * p * (3 - 2 * p);
const mod = (a, b) => ((a % b) + b) % b;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RND = mulberry32(1);
let SEED = 1;
function seedRandom(s) { SEED = s >>> 0 || 1; RND = mulberry32(SEED); }
const rnd = () => RND();
const rand = (a, b) => a + RND() * (b - a);
const randInt = (a, b) => Math.floor(a + RND() * (b - a + 1 - 1e-9));
const pick = (arr) => arr[Math.floor(RND() * arr.length) % arr.length];

/* ----------------------------------------------------------- vec3 */
const v3 = {
  make: (x, y, z) => [x || 0, y || 0, z || 0],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  lerp: (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)]
};

/* ----------------------------------------------------------- mat4 */
const m4 = {
  identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; },
  multiply(a, b) {                       // a * b (столбцовый порядок, как в GL)
    const o = new Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        o[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] +
                       a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
      }
    }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,2 * far * near * nf,0];
  },
  lookAt(eye, center, up) {
    let z = v3.norm(v3.sub(eye, center));
    let x = v3.norm(v3.cross(up, z));
    let y = v3.cross(z, x);
    return [x[0],y[0],z[0],0,
            x[1],y[1],z[1],0,
            x[2],y[2],z[2],0,
            -v3.dot(x, eye), -v3.dot(y, eye), -v3.dot(z, eye), 1];
  },
  translation(t) { return [1,0,0,0, 0,1,0,0, 0,0,1,0, t[0],t[1],t[2],1]; },
  scaling(s) {
    const x = s[0], y = s[1] === undefined ? s[0] : s[1], z = s[2] === undefined ? s[0] : s[2];
    return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1];
  },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; },
  // произведение последовательных преобразований: first применяется первым
  compose(...ms) { return ms.reduce((acc, m) => m4.multiply(m, acc), m4.identity()); },
  invert(m) {
    const a00=m[0],a01=m[1],a02=m[2],a03=m[3], a10=m[4],a11=m[5],a12=m[6],a13=m[7],
          a20=m[8],a21=m[9],a22=m[10],a23=m[11], a30=m[12],a31=m[13],a32=m[14],a33=m[15];
    const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10, b03=a01*a12-a02*a11,
          b04=a01*a13-a03*a11, b05=a02*a13-a03*a12, b06=a20*a31-a21*a30, b07=a20*a32-a22*a30,
          b08=a20*a33-a23*a30, b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
    let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return m4.identity();
    det = 1 / det;
    return [
      (a11*b11-a12*b10+a13*b09)*det, (a02*b10-a01*b11-a03*b09)*det, (a31*b05-a32*b04+a33*b03)*det, (a22*b04-a21*b05-a23*b03)*det,
      (a12*b08-a10*b11-a13*b07)*det, (a00*b11-a02*b08+a03*b07)*det, (a32*b02-a30*b05-a33*b01)*det, (a20*b05-a22*b02+a23*b01)*det,
      (a10*b10-a11*b08+a13*b06)*det, (a01*b08-a00*b10-a03*b06)*det, (a30*b04-a31*b02+a33*b00)*det, (a21*b02-a20*b04-a23*b00)*det,
      (a11*b07-a10*b09-a12*b06)*det, (a00*b09-a01*b07+a02*b06)*det, (a31*b01-a30*b03-a32*b00)*det, (a20*b03-a21*b01+a22*b00)*det
    ];
  },
  xformPoint(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8]  * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9]  * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
    ];
  }
};

/* ------------------------------------------------------ шум 2D/3D */
// Дешёвый детерминированный шум для вариаций цвета и деталей
function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function valueNoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm2(x, y, oct) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 4); i++) { sum += amp * valueNoise2(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return sum;
}
