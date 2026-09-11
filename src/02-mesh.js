/* =====================================================================
   Построитель геометрии: копим вершины в плоские массивы, потом
   отправляем всё в один буфер. Примитивы — боксы, цилиндры, сферы,
   а также выдавливание профиля вдоль трассы (дорога, барьеры, откосы).
   ===================================================================== */

const MAT = {
  GENERIC: 0, ROAD: 1, FACADE: 2, GLASS: 3, METAL: 4,
  EMISSIVE: 5, FOLIAGE: 6, GROUND: 7, GLOW: 8, BILLBOARD: 9
};

class Mesh {
  constructor() {
    this.pos = []; this.nrm = []; this.col = []; this.uv = []; this.mat = [];
    this.tris = 0;
  }
  get count() { return this.pos.length / 3; }

  vert(p, n, c, uv, mat) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    this.mat.push(mat);
  }
  tri(a, b, c, col, mat, uvA, uvB, uvC) {
    const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    const cc = col.length === 3 ? col : [col[0], col[1], col[2]];
    this.vert(a, n, cc, uvA, mat);
    this.vert(b, n, cc, uvB, mat);
    this.vert(c, n, cc, uvC, mat);
    this.tris++;
  }
  quad(a, b, c, d, col, mat, uvA, uvB, uvC, uvD) {
    this.tri(a, b, c, col, mat, uvA, uvB, uvC);
    this.tri(a, c, d, col, mat, uvA, uvC, uvD);
  }
  triCol(a, b, c, ca, cb, cc, mat, uvA, uvB, uvC) {
    const n = v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    this.vert(a, n, ca, uvA, mat);
    this.vert(b, n, cb, uvB, mat);
    this.vert(c, n, cc, uvC, mat);
    this.tris++;
  }

  /* ------------------------------------------------------------- бокс
     uv задаются в метрах по грани, чтобы фасадные окна не растягивались */
  box(cx, cy, cz, sx, sy, sz, col, mat, opts) {
    opts = opts || {};
    const yaw = opts.yaw || 0;
    const uvScale = opts.uvScale === undefined ? 1 : opts.uvScale;
    const uvOff = opts.uvOff || [0, 0];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (x, y, z) => [cx + x * cs - z * sn, cy + y, cz + x * sn + z * cs];

    // список граней: [4 вершины по часовой от внешней стороны, направление нормали]
    const faces = [
      [[-hx,-hy, hz], [ hx,-hy, hz], [ hx, hy, hz], [-hx, hy, hz]],   // +Z
      [[ hx,-hy,-hz], [-hx,-hy,-hz], [-hx, hy,-hz], [ hx, hy,-hz]],   // -Z
      [[ hx,-hy, hz], [ hx,-hy,-hz], [ hx, hy,-hz], [ hx, hy, hz]],   // +X
      [[-hx,-hy,-hz], [-hx,-hy, hz], [-hx, hy, hz], [-hx, hy,-hz]],   // -X
      [[-hx, hy, hz], [ hx, hy, hz], [ hx, hy,-hz], [-hx, hy,-hz]],   // +Y
      [[-hx,-hy,-hz], [ hx,-hy,-hz], [ hx,-hy, hz], [-hx,-hy, hz]]    // -Y
    ];
    const uvs = [
      d => [d[0] * uvScale + uvOff[0],      d[1] * uvScale + uvOff[1]],
      d => [d[0] * uvScale + uvOff[0],      d[1] * uvScale + uvOff[1]],
      d => [d[2] * uvScale + uvOff[0],      d[1] * uvScale + uvOff[1]],
      d => [d[2] * uvScale + uvOff[0],      d[1] * uvScale + uvOff[1]],
      d => [d[0] * uvScale + uvOff[0],      d[2] * uvScale + uvOff[1]],
      d => [d[0] * uvScale + uvOff[0],      d[2] * uvScale + uvOff[1]]
    ];
    for (let f = 0; f < 6; f++) {
      const q = faces[f];
      const c = opts.perFace ? opts.perFace[f] : col;
      this.quad(P(...q[0]), P(...q[1]), P(...q[2]), P(...q[3]), c, mat,
                uvs[f](q[0]), uvs[f](q[1]), uvs[f](q[2]), uvs[f](q[3]));
    }
  }

  /* ---------------------------------------------------------- цилиндр */
  cylinder(x, y, z, r, h, segs, col, mat, opts) {
    opts = opts || {};
    const y0 = opts.y0 === undefined ? 0 : opts.y0;
    const r2 = opts.rTop === undefined ? r : opts.rTop;
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p0 = [x + c0 * r,  y + y0,     z + s0 * r];
      const p1 = [x + c1 * r,  y + y0,     z + s1 * r];
      const p2 = [x + c1 * r2, y + y0 + h, z + s1 * r2];
      const p3 = [x + c0 * r2, y + y0 + h, z + s0 * r2];
      const u0 = [i / segs * TAU * r, 0], u1 = [(i + 1) / segs * TAU * r, 0];
      const u2 = [(i + 1) / segs * TAU * r, h], u3 = [i / segs * TAU * r, h];
      this.quad(p0, p1, p2, p3, col, mat, u0, u1, u2, u3);
      if (opts.capTop && r2 > 0.01) this.tri([x, y + y0 + h, z], p3, p2, col, mat);
      if (opts.capBottom) this.tri([x, y + y0, z], p1, p0, col, mat);
    }
  }

  /* ----------------------------------------------------------- сфера */
  sphere(x, y, z, r, segs, rings, col, mat, squash) {
    squash = squash || 1;
    for (let j = 0; j < rings; j++) {
      const t0 = j / rings * Math.PI, t1 = (j + 1) / rings * Math.PI;
      for (let i = 0; i < segs; i++) {
        const a0 = i / segs * TAU, a1 = (i + 1) / segs * TAU;
        const P = (t, a) => [x + r * Math.sin(t) * Math.cos(a),
                             y + r * Math.cos(t) * squash,
                             z + r * Math.sin(t) * Math.sin(a)];
        this.quad(P(t1, a0), P(t1, a1), P(t0, a1), P(t0, a0), col, mat,
                  [i / segs * 4, j / rings * 3], [(i + 1) / segs * 4, j / rings * 3],
                  [(i + 1) / segs * 4, (j + 1) / rings * 3], [i / segs * 4, (j + 1) / rings * 3]);
      }
    }
  }

  /* ---------------------------- выдавливание профиля вдоль трассы ----
     profile: [{o, y, u}] — смещение вправо, вверх и координата u
     samples: [{p, right, up, dist}]                                        */
  extrude(profile, samples, col, mat, opts) {
    opts = opts || {};
    const vScale = opts.vScale === undefined ? 1 : opts.vScale;
    const vOff = opts.vOff || 0;
    const from = opts.from === undefined ? 0 : opts.from;
    const to = opts.to === undefined ? samples.length - 1 : opts.to;
    const step = opts.step || 1;
    const colorFn = opts.colorFn;
    for (let s = from; s < to; s += step) {
      const A = samples[s], B = samples[Math.min(s + step, to)];
      for (let k = 0; k < profile.length - 1; k++) {
        const a = profile[k], b = profile[k + 1];
        const pA0 = this.pt(A, a), pA1 = this.pt(A, b);
        const pB0 = this.pt(B, a), pB1 = this.pt(B, b);
        const v0 = A.dist * vScale + vOff, v1 = B.dist * vScale + vOff;
        const c = colorFn ? colorFn(s, k) : col;
        if (opts.doubleSided) {
          const n = v3.norm(v3.cross(v3.sub(pB0, pA0), v3.sub(pA1, pA0)));
          this.triCol(pA0, pB0, pB1, c, c, c, mat, [a.u, v0], [a.u, v1], [b.u, v1]);
          this.triCol(pA0, pB1, pA1, c, c, c, mat, [a.u, v0], [b.u, v1], [b.u, v0]);
          this.triCol(pA0, pB1, pB0, c, c, c, mat, [a.u, v0], [b.u, v1], [a.u, v1]);
          this.triCol(pA0, pA1, pB1, c, c, c, mat, [a.u, v0], [b.u, v0], [b.u, v1]);
          void n;
        } else {
          this.quad(pA0, pB0, pB1, pA1, c, mat, [a.u, v0], [a.u, v1], [b.u, v1], [b.u, v0]);
        }
      }
    }
  }
  pt(sample, pr) {
    return [
      sample.p[0] + sample.right[0] * pr.o + sample.up[0] * pr.y,
      sample.p[1] + sample.right[1] * pr.o + sample.up[1] * pr.y,
      sample.p[2] + sample.right[2] * pr.o + sample.up[2] * pr.y
    ];
  }

  /* ------------------------------------------- произвольный четырёхугольник */
  quadFlat(a, b, c, d, col, mat, uv) {
    const u0 = uv || [0, 0], u1 = uv ? [uv[0] + v3.len(v3.sub(b, a)), uv[1]] : [1, 0];
    const u2 = uv ? [uv[0] + v3.len(v3.sub(b, a)), uv[1] + v3.len(v3.sub(d, a))] : [1, 1];
    const u3 = uv ? [uv[0], uv[1] + v3.len(v3.sub(d, a))] : [0, 1];
    this.quad(a, b, c, d, col, mat, u0, u1, u2, u3);
  }

  /** Освободить исходные массивы после загрузки в GPU (экономит память). */
  free() {
    this.pos = []; this.nrm = []; this.col = []; this.uv = []; this.mat = [];
  }

  toBuffers() {
    return {
      pos: new Float32Array(this.pos),
      nrm: new Float32Array(this.nrm),
      col: new Float32Array(this.col),
      uv: new Float32Array(this.uv),
      mat: new Float32Array(this.mat),
      verts: this.count,
      tris: this.tris
    };
  }
}
