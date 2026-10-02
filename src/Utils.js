/*
 * Utils.js — общие математические помощники.
 * Все модули игры живут в глобальном пространстве имён LA (без ES-модулей),
 * поэтому проект работает и по file://, и через `python -m http.server`.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const U = (LA.Utils = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (e0, e1, x) => {
    const t = U.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  /** Экспоненциальное сглаживание, не зависящее от частоты кадров. */
  U.damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
  U.wrap360 = (a) => ((a % 360) + 360) % 360;
  U.wrapPi = (a) => {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
  };
  U.DEG = Math.PI / 180;

  /** Детерминированный ГСЧ (mulberry32): город не меняется между перезапусками. */
  U.mulberry32 = (seed) => {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Value-noise с квинтической интерполяцией + fbm. Возвращает значения в [0,1]. */
  U.makeNoise = (seed) => {
    const rnd = U.mulberry32(seed);
    const size = 256;
    const perm = new Uint8Array(size * 2);
    const vals = new Float32Array(size);
    for (let i = 0; i < size; i++) { perm[i] = i; vals[i] = rnd(); }
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < size; i++) perm[i + size] = perm[i];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const h = (x, y) => vals[perm[perm[x & 255] + (y & 255)]];
    function noise2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = fade(xf), v = fade(yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, oct) {
      let amp = 0.5, f = 1, sum = 0, norm = 0;
      for (let i = 0; i < oct; i++) {
        sum += amp * noise2(x * f, y * f);
        norm += amp; amp *= 0.5; f *= 2.03;
      }
      return sum / norm;
    }
    return { noise2, fbm };
  };

  /** Расстояние от точки до отрезка в плоскости XZ. */
  U.distToSegment = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + t * dx - px, cz = az + t * dz - pz;
    return Math.sqrt(cx * cx + cz * cz);
  };

  U.hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  U.mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  U.pad2 = (n) => (n < 10 ? '0' : '') + n;
  U.formatTime = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    return U.pad2(Math.floor(sec / 60)) + ':' + U.pad2(sec % 60);
  };
})();
