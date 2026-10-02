/*
 * GeoBuilder.js — склейка множества параллелепипедов в одну BufferGeometry.
 * Нужен для города (десятки тысяч зданий в нескольких десятках draw-call'ов),
 * ориентиров и надписи HOLLYWOOD. UV считаются в «окнах»: tile = (bay × floor) метров.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const T = globalThis.THREE;

  class GeoBuilder {
    constructor() {
      this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
      this.count = 0;
    }

    _quad(p0, p1, p2, p3, n, c, u0, v0, u1, v1) {
      // проверяем порядок обхода: лицевая сторона должна смотреть вдоль n
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
      const b = this.count;
      const pts = [p0, p1, p2, p3];
      const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      for (let i = 0; i < 4; i++) {
        this.pos.push(pts[i][0], pts[i][1], pts[i][2]);
        this.nor.push(n[0], n[1], n[2]);
        this.uv.push(uvs[i][0], uvs[i][1]);
        this.col.push(c[0], c[1], c[2]);
      }
      if (!flip) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      this.count += 4;
    }

    /**
     * Параллелепипед по базису.
     * @param c центр [x,y,z]; ex/ey/ez — единичные оси; s = [sx,sy,sz] размеры.
     * opts: bay, floor (размер ячейки окна, м), noWin, bottom
     */
    addBoxBasis(c, ex, ey, ez, s, wall, roof, opts) {
      opts = opts || {};
      const bay = opts.bay || 4, floor = opts.floor || 3.5;
      const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
      const noWin = !!opts.noWin;
      const P = (a, b, d) => [
        c[0] + ex[0] * a + ey[0] * b + ez[0] * d,
        c[1] + ex[1] * a + ey[1] * b + ez[1] * d,
        c[2] + ex[2] * a + ey[2] * b + ez[2] * d,
      ];
      const neg = (v) => [-v[0], -v[1], -v[2]];
      const uvw = (w, h) => (noWin ? [0.04, 0.04, 0.04, 0.04] : [0, 0, w / bay, h / floor]);
      // ±X
      for (const sg of [1, -1]) {
        const n = sg > 0 ? ex : neg(ex);
        const u = uvw(s[2], s[1]);
        this._quad(P(sg * hx, -hy, -hz), P(sg * hx, -hy, hz), P(sg * hx, hy, hz), P(sg * hx, hy, -hz), n, wall, u[0], u[1], u[2], u[3]);
      }
      // ±Z
      for (const sg of [1, -1]) {
        const n = sg > 0 ? ez : neg(ez);
        const u = uvw(s[0], s[1]);
        this._quad(P(-hx, -hy, sg * hz), P(hx, -hy, sg * hz), P(hx, hy, sg * hz), P(-hx, hy, sg * hz), n, wall, u[0], u[1], u[2], u[3]);
      }
      // крыша
      this._quad(P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz), ey, roof || wall, 0.04, 0.04, 0.04, 0.04);
      if (opts.bottom) this._quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), neg(ey), wall, 0.04, 0.04, 0.04, 0.04);
    }

    /** Коробка, выровненная по осям (с поворотом вокруг Y). cx,cz — центр, y0..y1 — низ/верх. */
    addBox(cx, y0, cz, sx, sy, sz, rotY, wall, roof, opts) {
      const co = Math.cos(rotY || 0), si = Math.sin(rotY || 0);
      this.addBoxBasis([cx, y0 + sy / 2, cz], [co, 0, -si], [0, 1, 0], [si, 0, co], [sx, sy, sz], wall, roof, opts);
    }

    /** Коробка из x0..x1, y0..y1, z0..z1. */
    addAABB(x0, x1, y0, y1, z0, z1, wall, roof, opts) {
      this.addBoxBasis([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], [x1 - x0, y1 - y0, z1 - z0], wall, roof, opts);
    }

    get empty() { return this.count === 0; }

    toGeometry() {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
      const big = this.count > 65535;
      g.setIndex(new T.BufferAttribute(big ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    }
  }
  LA.GeoBuilder = GeoBuilder;

  /** Простой выпуклый шестигранник по 8 точкам (низ 0-3 по кругу, верх 4-7) — крылья, оперение. */
  LA.hexaGeometry = function (p) {
    const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
    const pos = [];
    const cen = [0, 0, 0];
    for (const q of p) { cen[0] += q[0] / 8; cen[1] += q[1] / 8; cen[2] += q[2] / 8; }
    for (const f of faces) {
      const a = p[f[0]], b = p[f[1]], c = p[f[2]], d = p[f[3]];
      // ориентация наружу (от центра)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const out = nx * (a[0] - cen[0]) + ny * (a[1] - cen[1]) + nz * (a[2] - cen[2]) > 0;
      const tri = out ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
      for (const q of tri) pos.push(q[0], q[1], q[2]);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
})();
