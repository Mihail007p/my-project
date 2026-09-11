/* =====================================================================
   Шейдеры. Один «убер-шейдер» разбирает материалы по коду aMat,
   поэтому вся статика мира рисуется парой вызовов отрисовки.
   Материалы:
     0 общий окрашенный   1 асфальт с разметкой   2 фасад с окнами
     3 стекло             4 металл                5 светящееся
     6 листва             7 земля/газон           9 рекламный щит
     (код 8 — аддитивное свечение, рисуется вторым проходом)
   ===================================================================== */

const GLSL_COMMON = `
precision highp float;

float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 x){
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0,0.0)), u.x),
             mix(hash12(i + vec2(0.0,1.0)), hash12(i + vec2(1.0,1.0)), u.x), u.y);
}
float fbm(vec2 x){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(x); x *= 2.03; a *= 0.5; }
  return s;
}
`;

const VS_WORLD = GLSL_COMMON + `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec3 aCol;
attribute vec2 aUV;
attribute float aMat;

uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;

varying vec3 vWorld;
varying vec3 vNrm;
varying vec3 vCol;
varying vec2 vUV;
varying float vMat;
varying float vDist;
varying float vDepth;

void main() {
  vWorld = aPos;
  vNrm = aNrm;
  vCol = aCol;
  vUV = aUV;
  vMat = aMat;
  vec3 d = aPos - uCamPos;
  vDist = length(d);
  gl_Position = uProj * uView * vec4(aPos, 1.0);
  vDepth = gl_Position.w;
}
`;

const FS_WORLD = GLSL_COMMON + `
varying vec3 vWorld;
varying vec3 vNrm;
varying vec3 vCol;
varying vec2 vUV;
varying float vMat;
varying float vDist;
varying float vDepth;

uniform vec3 uCamPos;
uniform vec3 uSunDir;      // от поверхности к солнцу
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform vec3 uFogCol;
uniform float uFogDensity;
uniform float uNight;      // 0 день … 1 ночь
uniform float uLitRatio;   // доля светящихся окон
uniform float uGlow;       // сила аддитивного свечения (ночь)
uniform float uTime;

vec3 skyAmbient(vec3 n) { return mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5); }

vec3 lambert(vec3 albedo, vec3 n) {
  float ndl = max(dot(n, uSunDir), 0.0);
  return albedo * (skyAmbient(n) + uSunCol * ndl);
}

vec3 specular(vec3 n, float power, float strength) {
  vec3 V = normalize(uCamPos - vWorld);
  vec3 H = normalize(V + uSunDir);
  float s = pow(max(dot(n, H), 0.0), power);
  return uSunCol * s * strength;
}

// разметка полос на асфальте: vUV.x — поперёк (метры), vUV.y — вдоль (метры)
vec3 roadSurface(vec3 base, vec3 n) {
  float u = vUV.x;                 // поперёк дороги, 0 в осевой линии
  float v = vUV.y;                 // вдоль дороги
  float au = abs(u);

  // неоднородность покрытия и заплатки
  float bump = fbm(vec2(u * 0.35, v * 0.35));
  vec3 col = base * (0.90 + 0.18 * bump);
  float patch = smoothstep(0.62, 0.72, fbm(vec2(u * 0.09 + 11.0, v * 0.06)));
  col = mix(col, base * 1.16, patch * 0.5);

  // колеи от колёс: по две на полосу
  float wear = 0.0;
  for (int i = 0; i < 2; i++) {
    float c = i == 0 ? 2.825 : 6.55;
    wear += smoothstep(0.62, 0.10, abs(au - (c - 0.78)));
    wear += smoothstep(0.62, 0.10, abs(au - (c + 0.78)));
  }
  col = mix(col, base * 0.72, clamp(wear, 0.0, 1.0) * 0.55);

  // трещины
  float crack = smoothstep(0.86, 1.0, fbm(vec2(u * 1.6, v * 0.6)));
  col *= 1.0 - crack * 0.25;

  // сплошные белые линии у осевой и по краям, прерывистая между полосами
  float mark = 0.0;
  mark += smoothstep(0.10, 0.02, abs(au - 1.08));
  mark += smoothstep(0.10, 0.02, abs(au - 8.12));
  float dash = step(mod(v, 14.0), 7.0);
  mark += smoothstep(0.09, 0.02, abs(au - 4.50)) * dash;
  float faded = 0.72 + 0.28 * fbm(vec2(u * 2.0, v * 0.5));
  // ночью разметка «светится» — световозвращение под фарами и фонарями
  vec3 markCol = vec3(0.88, 0.89, 0.86) * faded * (1.0 + 1.15 * uNight);
  col = mix(col, markCol, clamp(mark, 0.0, 1.0) * 0.92);

  // мокрые пятна бликуют сильнее
  float wet = smoothstep(0.66, 0.80, fbm(vec2(u * 0.5 + 4.0, v * 0.2)));
  float spec = pow(max(0.0, dot(reflect(-uSunDir, n), normalize(uCamPos - vWorld)) * 0.65 + 0.35), 42.0);
  col += uSunCol * spec * (0.25 + wet * 0.9);
  return col;
}

// фасад здания: сетка окон, часть горит
vec3 facade(vec3 base) {
  float colW = 3.3, rowH = 3.7;
  vec2 cell = vec2(floor(vUV.x / colW), floor(vUV.y / rowH));
  vec2 f = vec2(fract(vUV.x / colW), fract(vUV.y / rowH));

  // межэтажные пояса и простенки
  float slab = smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y);
  vec3 col = base * (0.86 + 0.20 * hash12(cell));

  float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.24, f.y) * step(f.y, 0.88);
  float r = hash12(cell * 1.37);
  float lit = step(1.0 - uLitRatio, r);
  vec3 glass = vec3(0.085, 0.100, 0.130);
  vec3 warm = mix(vec3(1.0, 0.82, 0.55), vec3(0.75, 0.87, 1.0), step(0.6, hash12(cell + 3.1)));
  vec3 winCol = mix(glass, warm * (0.7 + 0.6 * hash12(cell + 7.7)), lit * (0.35 + 0.65 * uNight));
  col = mix(col, winCol, win * 0.86);

  // рамы и тени под окнами
  col *= mix(1.0, 0.78, slab * 0.35);
  return col;
}

void main() {
  vec3 n = normalize(vNrm);
  vec3 col;
  float emissive = 0.0;

  int m = int(vMat + 0.5);

  // аддитивный проход: световые пятна, ореолы, подсветка (код 8)
  if (m == 8) {
    float fg = 1.0 - exp(-pow(vDist * uFogDensity, 2.0));
    // радиальное затухание от центра пятна: мягкий круг вместо резкого прямоугольника
    float r = length(vUV - vec2(0.5)) * 2.0;
    float fall = clamp(1.0 - r, 0.0, 1.0);
    fall = fall * fall * (3.0 - 2.0 * fall);
    fall = fall * fall;
    gl_FragColor = vec4(vCol * uGlow * fall * (1.0 - fg * 0.9), 1.0);
    return;
  }
  if (m == 1) {
    col = roadSurface(vCol, n);
    col = lambert(col, n) * 0.92 + specular(n, 60.0, 0.10) * 0.4;
  } else if (m == 2) {
    col = lambert(facade(vCol), n);
    float u = vUV.x, v = vUV.y;
    vec2 cell = vec2(floor(u / 3.3), floor(v / 3.7));
    vec2 f = vec2(fract(u / 3.3), fract(v / 3.7));
    float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.24, f.y) * step(f.y, 0.88);
    float lit = step(1.0 - uLitRatio, hash12(cell * 1.37));
    emissive = win * lit * uNight * 0.55;
  } else if (m == 3) {
    // стеклянный фасад: отражает небо, бликует
    float mullion = step(0.94, fract(vUV.x / 1.9)) + step(0.94, fract(vUV.y / 3.6));
    mullion = clamp(mullion, 0.0, 1.0);
    vec3 glass = mix(uSkyCol * 1.4, vCol * 1.2, 0.35 + 0.35 * n.y);
    float fres = pow(1.0 - max(dot(n, normalize(uCamPos - vWorld)), 0.0), 3.0);
    col = mix(glass, uSkyCol * 2.1, fres * 0.7);
    col = mix(col, vCol * 0.6, mullion * 0.85);
    col = lambert(col * 0.9, n) + specular(n, 90.0, 0.55);
    float litRooms = step(1.0 - uLitRatio * 0.5, hash12(floor(vUV / vec2(1.9, 3.6))));
    emissive = litRooms * uNight * 0.22;
  } else if (m == 4) {
    col = lambert(vCol, n) + specular(n, 46.0, 0.5);
  } else if (m == 5) {
    col = vCol * (0.55 + 1.9 * uNight);
    emissive = 1.0;
  } else if (m == 6) {
    float mott = fbm(vUV * 0.7);
    vec3 leaf = vCol * (0.72 + 0.55 * mott);
    col = lambert(leaf, n) + uSunCol * max(0.0, dot(-n, uSunDir)) * 0.18;
  } else if (m == 7) {
    // земля: газон, грунт, бетонные площадки
    float grass = smoothstep(0.35, 0.55, fbm(vUV * 0.06));
    float dirt = smoothstep(0.55, 0.75, fbm(vUV * 0.16 + 5.0));
    vec3 c = mix(vCol, vec3(0.20, 0.30, 0.15), grass * 0.75);
    c = mix(c, vec3(0.28, 0.24, 0.18), dirt * 0.35);
    c *= 0.9 + 0.2 * fbm(vUV * 0.45);
    col = lambert(c, n);
  } else if (m == 9) {
    // рекламный щит: абстрактный плакат, ночью подсвечен
    float u = vUV.x, v = vUV.y;
    float band = floor(v * 3.0);
    vec3 a = vec3(0.06, 0.10, 0.20), b = vec3(0.95, 0.35, 0.35), c2 = vec3(0.20, 0.65, 0.95);
    vec3 bg = mix(a, b, step(1.0, band));
    bg = mix(bg, c2, step(2.0, band));
    float bar = smoothstep(0.55, 0.45, abs(u - 0.32));
    float circle = smoothstep(0.14, 0.11, length(vec2(u - 0.76, v - 0.55)));
    vec3 art = mix(bg * 1.15, vec3(1.0), bar * 0.9);
    art = mix(art, vec3(1.0, 0.92, 0.35), circle);
    float frame = step(0.03, u) * step(u, 0.97) * step(0.04, v) * step(v, 0.96);
    col = mix(vec3(0.05), art, frame);
    col *= 0.9 + 0.7 * uNight;
    emissive = uNight * 0.75 * frame;
  } else {
    col = lambert(vCol, n) + specular(n, 24.0, 0.12);
  }

  // дымка: экспоненциальная по расстоянию + чуть плотнее у земли
  float f = 1.0 - exp(-pow(vDist * uFogDensity, 2.0));
  float ground = 1.0 - exp(-max(0.0, 45.0 - vWorld.y) * 0.012);
  f = clamp(f + ground * 0.16 * (1.0 - f), 0.0, 1.0);
  col = mix(col, uFogCol, f);

  // ночью воздух "подсвечен" городом, слегка приподнимаем тени
  col = mix(col, col * 1.0 + uFogCol * 0.06, uNight);

  col += vCol * emissive * 0.9;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ------------------------------------------------------------------ небо
const VS_SKY = `
attribute vec2 aPos;
uniform mat4 uInvViewProj;
varying vec3 vRay;
varying vec2 vNdc;
void main() {
  vNdc = aPos;
  vec4 p = uInvViewProj * vec4(aPos, 1.0, 1.0);
  vRay = p.xyz / p.w;
  gl_Position = vec4(aPos, 0.9999, 1.0);
}
`;

const FS_SKY = GLSL_COMMON + `
varying vec3 vRay;
varying vec2 vNdc;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyHorizon;
uniform float uNight;
uniform float uTime;
uniform float uCloud;

void main() {
  vec3 dir = normalize(vRay - uCamPos);

  float h = clamp(dir.y, -1.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyMid, smoothstep(-0.02, 0.30, h));
  sky = mix(sky, uSkyTop, smoothstep(0.25, 0.9, h));

  // солнце с ореолом
  float sd = max(dot(dir, uSunDir), 0.0);
  sky += uSunCol * pow(sd, 900.0) * 12.0;
  sky += uSunCol * pow(sd, 24.0) * 0.35;
  sky += uSunCol * pow(sd, 5.0) * 0.09;

  // облака: плоский слой, спроецированный на небо
  if (h > 0.02) {
    vec2 p = dir.xz / (h + 0.12) * 0.55 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(p * 1.6);
    float c2 = fbm(p * 3.4 + 4.0);
    float cover = smoothstep(0.48, 0.78, c * 0.75 + c2 * 0.45) * uCloud;
    float fade = smoothstep(0.02, 0.35, h);
    vec3 cloudCol = mix(vec3(0.75, 0.78, 0.85), uSunCol * 1.2, 0.35);
    cloudCol = mix(cloudCol * 0.55, cloudCol, uNight < 0.5 ? 1.0 : 0.45);
    sky = mix(sky, cloudCol, cover * fade * (0.85 - 0.35 * uNight));
  }

  // звёзды
  if (uNight > 0.35 && h > 0.03) {
    vec3 q = floor(dir * 340.0);
    float star = hash12(q.xy + q.z * 7.3);
    float bright = step(0.9975, star);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + star * 40.0);
    sky += vec3(bright * tw) * (uNight - 0.35) / 0.65 * smoothstep(0.03, 0.25, h) * 1.2;
  }

  gl_FragColor = vec4(sky, 1.0);
}
`;
