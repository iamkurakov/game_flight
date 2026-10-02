/*
 * LosAngeles.js — «география» игры: стилизованная (НЕ точная) карта бассейна Лос-Анджелеса.
 *
 * Система координат (метры):
 *   X — на восток, Z — на юг (север = -Z), Y — вверх (высота над уровнем моря).
 *   Курс 0° = север (-Z), 90° = восток (+X).
 * Расстояния сжаты (~0.6 от реальных), чтобы маршрут проходился за 8–12 минут.
 *
 * Модуль не зависит от Three.js — поэтому его можно тестировать в Node.
 *   Geo   — рельеф (сетка высот), береговая линия, дороги, аэропорт, ориентиры.
 *   City  — детерминированная генерация зданий (данные, без графики).
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const U = LA.Utils;
  const Geo = (LA.Geo = {});
  const B = (Geo.bounds = { xmin: -13000, xmax: 13000, zmin: -11000, zmax: 11000 });
  const noise = U.makeNoise(1984);
  const sstep = U.smoothstep;

  // ---------------------------------------------------------------- ключевые точки
  Geo.pt = {
    downtown: { x: 3500, z: -500 },
    griffith: { x: -250, z: -4900 },
    sign: { x: -3050, z: -5900 },
    pierRoot: { x: -8860, z: -2400 },
    centuryCity: { x: -5300, z: -1750 },
    hollywood: { x: -1100, z: -3800 },
    westwood: { x: -6000, z: -1500 },
  };

  // Взлётно-посадочная полоса (вдоль оси X: курс 090 / 270)
  const RW = (Geo.runway = { cx: -6600, cz: 5600, length: 2400, width: 60, elev: 6 });
  RW.x0 = RW.cx - RW.length / 2; // западный порог (со стороны океана)
  RW.x1 = RW.cx + RW.length / 2;
  // Плоская площадка аэропорта (рельеф выравнивается до RW.elev)
  const PAD = { x0: -8150, x1: -5050, z0: 4750, z1: 5950, blend: 380 };
  Geo.airportPad = PAD;

  // ---------------------------------------------------------------- береговая линия
  function coast(z) {
    const zs = Math.max(z, -3000);
    const base = -8800 + 380 * Math.sin(zs / 1900 + 1.0);
    return z > -3000 ? base : base - (-3000 - z) * 1.05; // к северу берег уходит на запад (Малибу)
  }
  Geo.coastX = coast;

  // Хребет Санта-Моники / Голливудских холмов / Гриффит-парка (ломаная вдоль оси X)
  const SP_X = [-12500, -10000, -8000, -6000, -4000, -2000, 0, 2000, 4500, 7000, 9500, 13000];
  const SP_Z = [-5800, -6600, -6900, -6600, -6400, -6200, -6100, -6300, -6800, -7600, -8200, -8800];
  const SP_H = [450, 620, 560, 520, 480, 500, 520, 430, 420, 520, 700, 900];
  function spine(x) {
    let i = 0;
    while (i < SP_X.length - 2 && x > SP_X[i + 1]) i++;
    const t = U.clamp((x - SP_X[i]) / (SP_X[i + 1] - SP_X[i]), 0, 1);
    return [U.lerp(SP_Z[i], SP_Z[i + 1], t), U.lerp(SP_H[i], SP_H[i + 1], t)];
  }
  const gauss = (x, z, cx, cz, r) => Math.exp(-(((x - cx) * (x - cx) + (z - cz) * (z - cz)) / (r * r)));

  /** «Сырая» высота рельефа (до площадок). */
  function rawHeight(x, z) {
    const t = x - coast(z); // расстояние вглубь суши
    let h;
    if (t < 0) {
      h = t > -150 ? 1.5 + t * 0.03 : -3 + (t + 150) * 0.04; // пляж → шельф → дно
      if (h < -120) h = -120;
    } else {
      h = 1.5 + 2.5 * sstep(0, 300, t) + 0.0052 * Math.max(0, t - 300);
    }
    const landMask = sstep(-100, 150, t);
    const n1 = noise.fbm(x / 2600 + 11.3, z / 2600 + 5.7, 4); // 0..1

    // горы
    let m = 0;
    const [zc, hs] = spine(x);
    const d = z - zc;
    const prof = d > 0 ? Math.exp(-((d / 1500) * (d / 1500))) : Math.exp(-((d / 1100) * (d / 1100)));
    m += hs * prof * (0.82 + 0.36 * n1);
    m += 60 * gauss(x, z, -3050, -6200, 800); // г. Ли
    m += 50 * gauss(x, z, -250, -5950, 900); // г. Голливуд
    m += 230 * sstep(-6900, -8400, z); // долина Сан-Фернандо (за хребтом)
    m += 950 * Math.pow(sstep(-9500, -11000, z), 1.3); // северная стена
    m += 1500 * Math.pow(sstep(7000, 13000, x), 1.5) * sstep(4500, -1500, z); // Сан-Габриэль
    m += 380 * sstep(10500, 13000, x); // восточный край
    m += 520 * Math.pow(sstep(8200, 11000, z), 1.2); // южный край
    m += 360 * gauss(x, z, -7600, 8500, 1700); // Палос-Вердес
    m += 95 * gauss(x, z, -2400, 3400, 1000); // холмы Болдуин
    m += 250 * gauss(x, z, 8500, 4800, 1700); // холмы Пуэнте
    m += 16 * (n1 - 0.5) * 2 * (1 + prof * 3);
    m = 1700 * Math.tanh(m / 1700); // мягкий потолок высоты гор
    h += m * landMask;
    return h;
  }

  // Выравнивание под аэропорт и обсерваторию
  let obsH = 0;
  function padWeight(x, z) {
    const dx = Math.max(PAD.x0 - x, 0, x - PAD.x1);
    const dz = Math.max(PAD.z0 - z, 0, z - PAD.z1);
    const d = Math.sqrt(dx * dx + dz * dz);
    return 1 - sstep(0, PAD.blend, d);
  }
  function height(x, z) {
    let h = rawHeight(x, z);
    const w = padWeight(x, z);
    if (w > 0) h = U.lerp(h, RW.elev, w);
    const dxo = x - Geo.pt.griffith.x, dzo = z - Geo.pt.griffith.z;
    const ro = Math.sqrt(dxo * dxo + dzo * dzo);
    if (ro < 260) h = U.lerp(h, obsH, 1 - sstep(95, 260, ro));
    return h;
  }
  obsH = rawHeight(Geo.pt.griffith.x, Geo.pt.griffith.z) - 4;

  // ---------------------------------------------------------------- сетка высот
  const NX = 341, NZ = 291;
  const grid = (Geo.grid = {
    nx: NX, nz: NZ,
    dx: (B.xmax - B.xmin) / (NX - 1),
    dz: (B.zmax - B.zmin) / (NZ - 1),
    data: null,
  });
  /** Строит сетку высот один раз; меш рельефа и коллизии используют ТЕ ЖЕ данные. */
  Geo.buildGrid = function () {
    if (grid.data) return;
    grid.data = new Float32Array(NX * NZ);
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NX; i++)
        grid.data[j * NX + i] = height(B.xmin + i * grid.dx, B.zmin + j * grid.dz);
  };
  /** Высота рельефа (билинейно по сетке). */
  Geo.height = function (x, z) {
    const gx = U.clamp((x - B.xmin) / grid.dx, 0, NX - 1.001);
    const gz = U.clamp((z - B.zmin) / grid.dz, 0, NZ - 1.001);
    const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j;
    const d = grid.data, k = j * NX + i;
    const a = d[k], b = d[k + 1], c = d[k + NX], e = d[k + NX + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + e) * fx * fz;
  };
  /** Высота поверхности для самолёта: вода = 0. */
  Geo.groundHeight = function (x, z) {
    const h = Geo.height(x, z);
    return h > 0 ? h : 0;
  };
  /** Нормаль рельефа (записывает в out = {x,y,z}). */
  Geo.normal = function (x, z, out) {
    const s = 40;
    const hx = Geo.groundHeight(x + s, z) - Geo.groundHeight(x - s, z);
    const hz = Geo.groundHeight(x, z + s) - Geo.groundHeight(x, z - s);
    const nx = -hx / (2 * s), nz = -hz / (2 * s);
    const l = Math.sqrt(nx * nx + 1 + nz * nz);
    out.x = nx / l; out.y = 1 / l; out.z = nz / l;
    return out;
  };

  // ---------------------------------------------------------------- аэропорт
  const TAXI_Z = RW.cz - 120;
  Geo.apron = { x0: -7750, x1: -5450, z0: RW.cz - 470, z1: RW.cz - 135 };
  Geo.onRunway = (x, z) => Math.abs(z - RW.cz) <= RW.width / 2 + 2 && x >= RW.x0 - 30 && x <= RW.x1 + 30;
  /** Любое твёрдое покрытие аэропорта: ВПП, РД, перроны. */
  Geo.isPaved = (x, z) => {
    if (Geo.onRunway(x, z)) return true;
    if (Math.abs(z - TAXI_Z) <= 14 && x >= RW.x0 - 30 && x <= RW.x1 + 30) return true;
    for (const cx of [-7500, -6600, -5700]) if (Math.abs(x - cx) <= 14 && z >= TAXI_Z && z <= RW.cz) return true;
    const a = Geo.apron;
    return x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1;
  };
  /** Тип поверхности: 0 вода, 1 покрытие аэропорта, 2 пляж, 3 суша. */
  Geo.surfaceAt = function (x, z) {
    if (Geo.height(x, z) <= 0.05) return 0;
    if (Geo.isPaved(x, z)) return 1;
    if (x - coast(z) < 140) return 2;
    return 3;
  };

  // ---------------------------------------------------------------- дороги (схематичные)
  const fw = (name, w, pts) => ({ name, type: 'freeway', width: w, pts });
  const ar = (name, w, pts) => ({ name, type: 'arterial', width: w, pts });
  const coastRoad = [];
  for (let z = -3000; z <= 9400; z += 400) coastRoad.push([coast(z) + 300, z]);
  Geo.roads = [
    fw('I-10', 38, [[-8700, -2350], [-7000, -2100], [-5000, -1500], [-3000, -1000], [-500, -450], [2000, -200], [3500, -120], [6000, 0], [10000, -200], [13000, -100]]),
    fw('I-405', 38, [[-5800, -7600], [-5500, -5500], [-5600, -3000], [-5200, -1000], [-5300, 1500], [-5100, 3500], [-5000, 5000], [-5000, 8000], [-4400, 11000]]),
    fw('US-101', 36, [[3300, -600], [2000, -1600], [500, -3000], [-1000, -4500], [-1900, -5900], [-3500, -8000], [-6500, -9500]]),
    fw('I-110', 36, [[3300, -800], [3600, 1500], [3800, 4000], [3900, 7000], [4100, 11000]]),
    fw('I-110N', 32, [[3300, -800], [4200, -2700], [5800, -4800], [7500, -6500]]),
    fw('I-5', 36, [[3900, -100], [6000, 1200], [8500, 3000], [13000, 5000]]),
    fw('I-5N', 36, [[4000, -1500], [5500, -3500], [8000, -6000], [10000, -8800]]),
    fw('I-105', 36, [[-5400, 5800], [-2000, 5900], [2000, 5800], [6000, 5700], [13000, 5400]]),
    ar('Wilshire', 20, [[-8300, -2000], [-5200, -1700], [-2000, -1500], [1500, -800], [3300, -480]]),
    ar('Sunset', 18, [[-8200, -3800], [-5000, -3900], [-1500, -4000], [1500, -3000], [3300, -1500]]),
    ar('Santa Monica Blvd', 18, [[-8500, -2800], [-5000, -2800], [-1000, -2600], [2500, -2400]]),
    ar('Olympic', 18, [[-8500, -1400], [-4000, -1200], [0, -700], [3000, -350]]),
    ar('Venice', 18, [[-8200, 400], [-3000, 400], [2000, 600], [3500, 500]]),
    ar('Century', 22, [[-8000, 5300], [-5200, 5300], [-3000, 5000]]),
    ar('Sepulveda', 18, [[-5400, 3000], [-5400, 8000]]),
    ar('La Cienega', 18, [[-3500, -4000], [-3500, 8000]]),
    ar('Crenshaw', 18, [[-1500, -3600], [-1500, 8000]]),
    ar('Vermont', 18, [[500, -3200], [500, 8000]]),
    ar('PCH', 22, coastRoad),
  ];
  /** Расстояние до ближайшего «значимого» полотна (за вычетом полуширины). */
  Geo.roadDist = function (x, z) {
    let best = 1e9;
    for (const r of Geo.roads) {
      const p = r.pts, hw = r.width / 2;
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        if (x < Math.min(a[0], b[0]) - 400 || x > Math.max(a[0], b[0]) + 400) continue;
        if (z < Math.min(a[1], b[1]) - 400 || z > Math.max(a[1], b[1]) + 400) continue;
        const d = U.distToSegment(x, z, a[0], a[1], b[0], b[1]) - hw;
        if (d < best) best = d;
      }
    }
    return best;
  };

  // ---------------------------------------------------------------- парки (для текстуры земли и запрета застройки)
  Geo.parks = [
    { x: 3300, z: 1300, w: 520, d: 700, kind: 'park' },
    { x: -4300, z: -2300, w: 1000, d: 800, kind: 'golf' },
    { x: -1500, z: 2400, w: 800, d: 560, kind: 'golf' },
    { x: -6200, z: -900, w: 360, d: 360, kind: 'park' },
    { x: 1200, z: -1200, w: 440, d: 440, kind: 'park' },
    { x: 5200, z: -2200, w: 700, d: 600, kind: 'park' },
  ];
  const inPark = (x, z) => Geo.parks.some((p) => Math.abs(x - p.x) < p.w / 2 + 40 && Math.abs(z - p.z) < p.d / 2 + 40);

  // ---------------------------------------------------------------- ориентиры (данные + коллайдеры)
  Geo.towers = [
    { kind: 'usbank', name: 'US Bank Tower', x: 3380, z: -560, w: 55, d: 55, h: 310 },
    { kind: 'wilshire', name: 'Wilshire Grand Center', x: 3250, z: -330, w: 62, d: 44, h: 335 },
    { kind: 'aon', name: 'Aon Center', x: 3500, z: -400, w: 56, d: 56, h: 262 },
    { kind: 'gas', name: 'Gas Company Tower', x: 3290, z: -470, w: 52, d: 52, h: 228 },
    { kind: 'cityhall', name: 'City Hall', x: 3680, z: -700, w: 42, d: 42, h: 138 },
  ];
  Geo.observatory = { x: Geo.pt.griffith.x, z: Geo.pt.griffith.z, w: 112, d: 34, h: 18, domeR: 15 };
  Geo.pier = {
    x0: Geo.pt.pierRoot.x, x1: Geo.pt.pierRoot.x - 440, z: Geo.pt.pierRoot.z, width: 16, deck: 8,
    wheelX: Geo.pt.pierRoot.x - 330, wheelR: 24,
  };
  Geo.airport = {
    tower: { x: -6250, z: RW.cz - 560, h: 62 },
    theme: { x: -6250, z: RW.cz - 640 },
    terminals: [
      { x: -7000, z: RW.cz - 400, w: 300, d: 38, h: 20 },
      { x: -6350, z: RW.cz - 400, w: 300, d: 38, h: 20 },
      { x: -5750, z: RW.cz - 400, w: 220, d: 38, h: 20 },
    ],
    garages: [
      { x: -7000, z: RW.cz - 520, w: 240, d: 60, h: 24 },
      { x: -5750, z: RW.cz - 520, w: 200, d: 60, h: 24 },
    ],
  };
  Geo.sign = { letters: [], text: 'HOLLYWOOD' };
  /** Прямоугольники, где процедурная застройка не создаётся. */
  Geo.exclusions = [];
  /** AABB для столкновений: {x0,x1,y0,y1,z0,z1}. */
  Geo.colliders = [];

  Geo.buildLandmarkData = function () {
    const box = (x, z, w, d, y0, y1) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1 });
    Geo.exclusions.length = 0; Geo.colliders.length = 0;
    for (const t of Geo.towers) {
      const g = Geo.height(t.x, t.z);
      t.base = g - 2;
      Geo.colliders.push(box(t.x, t.z, t.w, t.d, t.base, t.base + t.h + 2));
      Geo.exclusions.push({ x0: t.x - t.w / 2 - 22, x1: t.x + t.w / 2 + 22, z0: t.z - t.d / 2 - 22, z1: t.z + t.d / 2 + 22 });
    }
    const o = Geo.observatory;
    o.base = height(o.x, o.z);
    Geo.colliders.push(box(o.x, o.z, o.w, o.d, o.base - 2, o.base + o.h + o.domeR));
    Geo.exclusions.push({ x0: o.x - 160, x1: o.x + 160, z0: o.z - 160, z1: o.z + 160 });
    // Пирс
    const p = Geo.pier;
    Geo.colliders.push({ x0: p.x1, x1: p.x0, z0: p.z - p.width / 2, z1: p.z + p.width / 2, y0: p.deck - 1.5, y1: p.deck + 0.4 });
    Geo.colliders.push({ x0: p.wheelX - 4, x1: p.wheelX + 4, z0: p.z - 20, z1: p.z + 20, y0: p.deck, y1: p.deck + p.wheelR * 2 + 6 });
    Geo.exclusions.push({ x0: p.x1 - 30, x1: p.x0 + 120, z0: p.z - 90, z1: p.z + 90 });
    // Аэропорт
    for (const t of Geo.airport.terminals.concat(Geo.airport.garages))
      Geo.colliders.push(box(t.x, t.z, t.w, t.d, RW.elev - 1, RW.elev + t.h));
    const tw = Geo.airport.tower;
    Geo.colliders.push(box(tw.x, tw.z, 14, 14, RW.elev - 1, RW.elev + tw.h));
    const th = Geo.airport.theme;
    Geo.colliders.push(box(th.x, th.z, 46, 46, RW.elev - 1, RW.elev + 34));
    // Надпись HOLLYWOOD: буквы стоят на склоне, лицом на юг
    const letterW = 26, gap = 9, letterH = 36;
    const n = Geo.sign.text.length;
    const total = n * letterW + (n - 1) * gap;
    Geo.sign.letters.length = 0;
    for (let i = 0; i < n; i++) {
      const x = Geo.pt.sign.x - total / 2 + letterW / 2 + i * (letterW + gap);
      const z = Geo.pt.sign.z;
      let gMin = 1e9;
      for (let k = -1; k <= 1; k += 2) gMin = Math.min(gMin, Geo.height(x + k * letterW / 2, z));
      gMin = Math.min(gMin, Geo.height(x, z));
      const L = { ch: Geo.sign.text[i], x, z, w: letterW, h: letterH, y: gMin - 3 };
      Geo.sign.letters.push(L);
      Geo.colliders.push(box(x, z, letterW, 6, L.y, L.y + letterH + 3));
    }
  };

  // ---------------------------------------------------------------- зонирование города
  const dist = (x, z, p) => Math.hypot(x - p.x, z - p.z);
  function roadNear(name, x, z) {
    const r = Geo.roads.find((q) => q.name === name);
    let best = 1e9;
    for (let i = 0; i < r.pts.length - 1; i++)
      best = Math.min(best, U.distToSegment(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]));
    return best;
  }
  const cityNoise = U.makeNoise(4242);

  /** Тип застройки в точке: null | {kind, hLo, hHi}. */
  Geo.zoneAt = function (x, z) {
    const t = x - coast(z);
    if (t < 230) return null;
    const h = Geo.height(x, z);
    if (h > 240 || h < 3) return null;
    if (x > PAD.x0 - 160 && x < PAD.x1 + 160 && z > PAD.z0 - 160 && z < PAD.z1 + 160) return null;
    if (inPark(x, z)) return null;
    const slope = Math.abs(Geo.height(x + 90, z) - Geo.height(x - 90, z)) + Math.abs(Geo.height(x, z + 90) - Geo.height(x, z - 90));
    if (slope > 95) return null;
    const dDT = dist(x, z, Geo.pt.downtown);
    if (dDT < 1000) return { kind: 'core', hLo: 70, hHi: 235 * (1 - 0.45 * (dDT / 1000)) };
    if (dist(x, z, Geo.pt.centuryCity) < 480) return { kind: 'high', hLo: 80, hHi: 190 };
    if (dDT < 2300) return { kind: 'high', hLo: 30, hHi: 105 };
    if (dist(x, z, Geo.pt.hollywood) < 700) return { kind: 'mid', hLo: 16, hHi: 48 };
    if (dist(x, z, Geo.pt.pierRoot) < 750) return { kind: 'mid', hLo: 10, hHi: 26 };
    if (dist(x, z, Geo.pt.westwood) < 600 && x > -6700) return { kind: 'mid', hLo: 22, hHi: 70 };
    if (x > -8200 && x < 3000 && roadNear('Wilshire', x, z) < 260) return { kind: 'mid', hLo: 22, hHi: 62 };
    if (dDT < 3500 && cityNoise.noise2(x / 900, z / 900) > 0.42) return { kind: 'mid', hLo: 14, hHi: 38 };
    if (z < 4750 && x > -6000 && x < -3600 && z > 3900 && roadNear('Century', x, z) < 320) return { kind: 'mid', hLo: 22, hHi: 44 };
    if (z > 3000 && x > -1500 && x < 9000 && cityNoise.noise2(x / 1500 + 9, z / 1500) > 0.5) return { kind: 'industrial', hLo: 8, hHi: 15 };
    return { kind: 'suburb', hLo: 4.5, hHi: 8.5 };
  };
})();

// =====================================================================================
// City — процедурная застройка (только данные).
// =====================================================================================
(function () {
  const U = LA.Utils;
  const Geo = LA.Geo;
  const City = (LA.City = {});

  City.BLOCK = 200; // шаг сетки кварталов, м
  City.STREET = 14; // ширина улицы, м

  const WALLS = {
    house: [[0.93, 0.89, 0.8], [0.9, 0.84, 0.72], [0.88, 0.88, 0.85], [0.93, 0.82, 0.72], [0.82, 0.86, 0.88], [0.95, 0.93, 0.85], [0.86, 0.78, 0.7]],
    roof: [[0.55, 0.3, 0.24], [0.4, 0.38, 0.38], [0.35, 0.28, 0.24], [0.5, 0.36, 0.3], [0.3, 0.32, 0.36]],
    glass: [[0.4, 0.55, 0.68], [0.3, 0.42, 0.55], [0.5, 0.62, 0.72], [0.24, 0.32, 0.4], [0.55, 0.66, 0.72]],
    concrete: [[0.84, 0.82, 0.78], [0.72, 0.7, 0.66], [0.78, 0.74, 0.66], [0.9, 0.9, 0.88]],
    industrial: [[0.8, 0.8, 0.78], [0.7, 0.74, 0.78], [0.82, 0.76, 0.66]],
  };
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  const jit = (c, r, a) => [c[0] + (r() - 0.5) * a, c[1] + (r() - 0.5) * a, c[2] + (r() - 0.5) * a];

  /**
   * @returns {{buildings: Array, blocks: Array}}
   * building: {x0,x1,z0,z1,y0,y1,wall,roof,windows,bay,major}
   */
  City.generate = function () {
    const S = City.BLOCK, ST = City.STREET;
    const rnd = U.mulberry32(777);
    const buildings = [];
    const blocks = [];
    const ex = Geo.exclusions;

    function tryAdd(cx, cz, w, d, hgt, wall, roof, windows, major) {
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      for (const e of ex) if (x1 > e.x0 && x0 < e.x1 && z1 > e.z0 && z0 < e.z1) return false;
      const rd = Geo.roadDist(cx, cz);
      if (rd < Math.max(w, d) * 0.5 + 3) return false;
      let gmin = 1e9, gmax = -1e9;
      const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]];
      for (const p of pts) {
        const g = Geo.height(p[0], p[1]);
        if (g < gmin) gmin = g;
        if (g > gmax) gmax = g;
      }
      if (gmin < 2.5 || gmax - gmin > 7) return false;
      buildings.push({ x0, x1, z0, z1, y0: gmin - 1.5, y1: gmax + hgt, wall, roof, windows, bay: 4, major: !!major });
      return true;
    }

    const bx0 = Math.floor(Geo.bounds.xmin / S), bx1 = Math.ceil(Geo.bounds.xmax / S);
    const bz0 = Math.floor(Geo.bounds.zmin / S), bz1 = Math.ceil(Geo.bounds.zmax / S);
    for (let bz = bz0; bz < bz1; bz++) {
      for (let bx = bx0; bx < bx1; bx++) {
        const cx = bx * S + S / 2, cz = bz * S + S / 2;
        const zone = Geo.zoneAt(cx, cz);
        if (!zone) continue;
        const kind = zone.kind;
        const inner = S - ST; // 186
        const bx0m = cx - inner / 2, bz0m = cz - inner / 2;
        blocks.push({ x0: bx0m, z0: bz0m, x1: bx0m + inner, z1: bz0m + inner, kind });

        if (kind === 'suburb') {
          const g = Geo.height(cx, cz);
          const skip = 0.1 + (g / 240) * 0.45;
          if (rnd() < 0.05) continue; // пустырь
          if (rnd() < 0.14 && g < 120) { // малоэтажный жилой дом
            const wl = pick(WALLS.concrete, rnd);
            tryAdd(cx, cz, 60 + rnd() * 30, 36 + rnd() * 16, 9 + rnd() * 4, jit(wl, rnd, 0.05), [0.45, 0.45, 0.46], true, true);
            continue;
          }
          for (let row = -1; row <= 1; row++) {
            for (let col = -1.5; col <= 1.5; col += 1) {
              if (rnd() < skip) continue;
              const x = cx + col * 46 + (rnd() - 0.5) * 8;
              const z = cz + row * 62 + (rnd() - 0.5) * 8;
              const w = 15 + rnd() * 10, d = 13 + rnd() * 8, h = 4.5 + rnd() * (zone.hHi - zone.hLo);
              tryAdd(x, z, w, d, h, jit(pick(WALLS.house, rnd), rnd, 0.06), jit(pick(WALLS.roof, rnd), rnd, 0.06), true, false);
            }
          }
        } else if (kind === 'industrial') {
          const n = 1 + (rnd() < 0.5 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const w = 60 + rnd() * 60, d = 40 + rnd() * 50, h = zone.hLo + rnd() * (zone.hHi - zone.hLo);
            const x = cx + (n === 2 ? (i ? 1 : -1) * 45 : 0) + (rnd() - 0.5) * 10;
            const z = cz + (rnd() - 0.5) * 40;
            tryAdd(x, z, Math.min(w, n === 2 ? 80 : 150), d, h, jit(pick(WALLS.industrial, rnd), rnd, 0.05), [0.66, 0.66, 0.68], false, true);
          }
        } else {
          // mid / high / core: 2x2 ячейки
          const occ = kind === 'core' ? 1 : kind === 'high' ? 0.92 : 0.8;
          for (let sz = 0; sz < 2; sz++) {
            for (let sx = 0; sx < 2; sx++) {
              if (rnd() > occ) continue;
              const ccx = cx + (sx - 0.5) * (inner / 2), ccz = cz + (sz - 0.5) * (inner / 2);
              const w = (kind === 'mid' ? 48 : 52) + rnd() * 32, d = (kind === 'mid' ? 44 : 50) + rnd() * 32;
              let h;
              if (kind === 'core') {
                const r = rnd();
                h = zone.hLo + (zone.hHi - zone.hLo) * (r < 0.25 ? 0.8 + 0.2 * rnd() : Math.pow(rnd(), 1.4));
              } else {
                h = zone.hLo + (zone.hHi - zone.hLo) * Math.pow(rnd(), 1.3);
              }
              const glass = kind !== 'mid' || rnd() < 0.4;
              const wl = glass ? pick(WALLS.glass, rnd) : pick(WALLS.concrete, rnd);
              tryAdd(ccx, ccz, w, d, h, jit(wl, rnd, 0.05), [0.5, 0.5, 0.52], true, h > 22);
            }
          }
        }
      }
    }
    return { buildings, blocks };
  };
})();
