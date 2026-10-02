/*
 * Landmarks.js — стилизованные ориентиры (упрощённая геометрия, не точные копии):
 *   небоскрёбы Даунтауна (US Bank Tower, Wilshire Grand, Aon Center, Gas Company Tower, City Hall),
 *   обсерватория Гриффита, надпись HOLLYWOOD, пирс Санта-Моники с колесом обозрения,
 *   аэропорт (ВПП с разметкой и огнями, терминалы, башня, «Theme Building», самолёты на перроне).
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const T = globalThis.THREE;
  const U = LA.Utils;
  const Geo = LA.Geo;

  const phong = (c, o) => new T.MeshPhongMaterial(Object.assign({ color: c, shininess: 40 }, o || {}));

  class Landmarks {
    constructor(world) {
      this.world = world;
      this.scene = world.scene;
      this.animated = [];
      const ft = world.facadeTex;
      this.glassMat = new T.MeshPhongMaterial({ map: ft, vertexColors: true, shininess: 80, specular: 0x7788aa });
      this.concreteMat = new T.MeshLambertMaterial({ map: ft, vertexColors: true });
      this.plainMat = new T.MeshLambertMaterial({ vertexColors: true });
      this.cylTex = ft.clone();
      this.cylTex.repeat.set(30, 60);
      this.cylTex.needsUpdate = true;
    }

    _mesh(gb, mat, shadow) {
      const m = new T.Mesh(gb.toGeometry(), mat);
      m.castShadow = shadow !== false; m.receiveShadow = true;
      this.scene.add(m);
      return m;
    }

    build() {
      this._towers();
      this._observatory();
      this._sign();
      this._pier();
      this._airport();
    }

    update(dt) {
      for (const a of this.animated) a(dt);
    }

    // ------------------------------------------------------------ Даунтаун
    _towers() {
      const gb = new LA.GeoBuilder();
      const cyl = (x, y, z, r0, r1, h, color, emissive) => {
        const m = new T.Mesh(new T.CylinderGeometry(r1, r0, h, 24), phong(color, { shininess: 90, specular: 0x99aabb, emissive: emissive || 0x000000 }));
        m.position.set(x, y + h / 2, z); m.castShadow = true;
        this.scene.add(m); return m;
      };
      for (const t of Geo.towers) {
        const b = t.base, h = t.h;
        if (t.kind === 'usbank') {
          const glass = [0.3, 0.44, 0.58];
          const h1 = h - 46;
          gb.addBox(t.x, b, t.z, 50, h1, 50, 0, glass, [0.5, 0.5, 0.52], { bay: 3.2, floor: 3.8 });
          gb.addBox(t.x, b, t.z, 50, h1, 50, Math.PI / 4, glass, [0.5, 0.5, 0.52], { bay: 3.2, floor: 3.8 });
          gb.addBox(t.x, b + h1, t.z, 40, 14, 40, 0, [0.38, 0.5, 0.62], [0.55, 0.55, 0.57], { bay: 3.2, floor: 3.8 });
          gb.addBox(t.x, b + h1, t.z, 40, 14, 40, Math.PI / 4, [0.38, 0.5, 0.62], [0.55, 0.55, 0.57], { bay: 3.2, floor: 3.8 });
          cyl(t.x, b + h1 + 14, t.z, 17, 17, 22, 0xaed0ee, 0x1b3040);
          cyl(t.x, b + h1 + 36, t.z, 10, 10, 10, 0xd8ecfa, 0x2a4256);
          cyl(t.x, b + h - 2, t.z, 0.8, 0.8, 18, 0xcccccc, 0x000000);
        } else if (t.kind === 'wilshire') {
          const glass = [0.34, 0.48, 0.62];
          gb.addBox(t.x, b, t.z, 62, h - 110, 44, 0, glass, [0.5, 0.5, 0.52], { bay: 3.2, floor: 3.8 });
          gb.addBox(t.x, b + h - 110, t.z, 54, 60, 38, 0, [0.4, 0.54, 0.66], [0.55, 0.55, 0.57], { bay: 3.2, floor: 3.8 });
          const y = b + h - 50, w1 = 50, d1 = 36, w2 = 18, d2 = 12;
          const crown = new T.Mesh(LA.hexaGeometry([
            [t.x - w1 / 2, y, t.z - d1 / 2], [t.x + w1 / 2, y, t.z - d1 / 2], [t.x + w1 / 2, y, t.z + d1 / 2], [t.x - w1 / 2, y, t.z + d1 / 2],
            [t.x - w2 / 2, y + 36, t.z - d2 / 2], [t.x + w2 / 2, y + 36, t.z - d2 / 2], [t.x + w2 / 2, y + 36, t.z + d2 / 2], [t.x - w2 / 2, y + 36, t.z + d2 / 2],
          ]), phong(0xbcd6ec, { shininess: 100, specular: 0xaabbcc, emissive: 0x16222e }));
          crown.castShadow = true; this.scene.add(crown);
          cyl(t.x, b + h - 14, t.z, 1.4, 1.0, 40, 0xdddddd);
        } else if (t.kind === 'aon') {
          gb.addBox(t.x, b, t.z, t.w, h, t.d, 0, [0.84, 0.85, 0.87], [0.7, 0.7, 0.72], { bay: 2.6, floor: 3.9 });
        } else if (t.kind === 'gas') {
          const m = new T.Mesh(new T.CylinderGeometry(25, 25, h - 40, 24), new T.MeshPhongMaterial({ map: this.cylTex, color: 0xb9c6d2, shininess: 70, specular: 0x667788 }));
          m.position.set(t.x, b + (h - 40) / 2, t.z); m.castShadow = true; this.scene.add(m);
          cyl(t.x, b + h - 40, t.z, 18, 18, 28, 0xc9d6e2, 0x1a2630);
          cyl(t.x, b + h - 12, t.z, 10, 10, 12, 0xdce8f2, 0x253640);
        } else if (t.kind === 'cityhall') {
          const wl = [0.93, 0.92, 0.88], rf = [0.82, 0.8, 0.76];
          gb.addBox(t.x, b, t.z, 62, 26, 44, 0, wl, rf, { bay: 5, floor: 4.5 });
          gb.addBox(t.x, b + 26, t.z, 30, 56, 30, 0, wl, rf, { bay: 4.5, floor: 4.5 });
          gb.addBox(t.x, b + 82, t.z, 20, 20, 20, 0, wl, rf, { bay: 4.5, floor: 4.5 });
          const py = new T.Mesh(new T.ConeGeometry(15, 26, 4), phong(0xe6e1d4));
          py.rotation.y = Math.PI / 4; py.position.set(t.x, b + 102 + 13, t.z); py.castShadow = true;
          this.scene.add(py);
        }
      }
      this._mesh(gb, this.glassMat);
    }

    // ------------------------------------------------------------ обсерватория Гриффита
    _observatory() {
      const o = Geo.observatory, b = o.base;
      const gb = new LA.GeoBuilder();
      const white = [0.95, 0.94, 0.9], roof = [0.8, 0.8, 0.78];
      gb.addBox(o.x, b - 4, o.z, 150, 6, 74, 0, [0.72, 0.7, 0.66], [0.7, 0.68, 0.64], { noWin: true });
      gb.addBox(o.x, b + 2, o.z, 112, 13, 28, 0, white, roof, { noWin: true });
      gb.addBox(o.x, b + 2, o.z, 44, 22, 34, 0, white, roof, { noWin: true });
      for (const sg of [-1, 1]) {
        gb.addBox(o.x + sg * 44, b + 2, o.z, 30, 12, 26, 0, white, roof, { noWin: true });
        gb.addBox(o.x + sg * 22, b + 2, o.z + 18, 4, 11, 4, 0, white, roof, { noWin: true });
        gb.addBox(o.x + sg * 8, b + 2, o.z + 18, 4, 11, 4, 0, white, roof, { noWin: true });
      }
      this._mesh(gb, this.plainMat);
      const copper = phong(0x6fb39a, { shininess: 100, specular: 0x99ccbb });
      const dome = (x, y, z, r) => {
        const m = new T.Mesh(new T.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), copper);
        m.position.set(x, y, z); m.castShadow = true; this.scene.add(m);
      };
      dome(o.x, b + 24, o.z, 16);
      dome(o.x - 44, b + 14, o.z, 8.5);
      dome(o.x + 44, b + 14, o.z, 8.5);
    }

    // ------------------------------------------------------------ HOLLYWOOD
    _sign() {
      const gb = new LA.GeoBuilder();
      const white = [0.97, 0.97, 0.96];
      const D = 5;
      const letters = Geo.sign.letters;
      for (const L of letters) {
        const w = L.w, h = L.h, t = 6;
        const bar = (u0, v0, u1, v1, th) => {
          const du = u1 - u0, dv = v1 - v0;
          const len = Math.hypot(du, dv), a = Math.atan2(dv, du);
          const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
          gb.addBoxBasis([L.x + cu, L.y + cv, L.z], [Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1], [len + (th * 0.5 * (Math.abs(du) < 0.01 || Math.abs(dv) < 0.01 ? 1 : 0)), th, D], white, white, { noWin: true });
        };
        const l = -w / 2, r = w / 2, bt = 0, tp = h, c = 0;
        switch (L.ch) {
          case 'H': bar(l + t / 2, bt, l + t / 2, tp, t); bar(r - t / 2, bt, r - t / 2, tp, t); bar(l, h / 2, r, h / 2, t - 1); break;
          case 'O': bar(l + t / 2, bt + 3, l + t / 2, tp - 3, t); bar(r - t / 2, bt + 3, r - t / 2, tp - 3, t); bar(l + 3, tp - t / 2, r - 3, tp - t / 2, t); bar(l + 3, bt + t / 2, r - 3, bt + t / 2, t); break;
          case 'L': bar(l + t / 2, bt, l + t / 2, tp, t); bar(l, bt + t / 2, r, bt + t / 2, t); break;
          case 'Y': bar(l + 3, tp, c, h * 0.5, t); bar(r - 3, tp, c, h * 0.5, t); bar(c, bt, c, h * 0.55, t); break;
          case 'W': bar(l + 2, tp, l + w * 0.27, bt + 2, t); bar(l + w * 0.27, bt + 2, c, h * 0.62, t); bar(c, h * 0.62, r - w * 0.27, bt + 2, t); bar(r - w * 0.27, bt + 2, r - 2, tp, t); break;
          case 'D': bar(l + t / 2, bt, l + t / 2, tp, t); bar(l, tp - t / 2, c + 2, tp - t / 2, t); bar(l, bt + t / 2, c + 2, bt + t / 2, t); bar(c + 2, tp - t / 2, r - t / 2, h * 0.7, t); bar(r - t / 2, h * 0.7, r - t / 2, h * 0.3, t); bar(r - t / 2, h * 0.3, c + 2, bt + t / 2, t); break;
        }
        // опорные «ножки» вниз, чтобы буквы стояли на склоне
        gb.addBox(L.x, L.y - 6, L.z, w * 0.7, 8, D, 0, [0.62, 0.6, 0.55], [0.62, 0.6, 0.55], { noWin: true });
      }
      const m = new T.Mesh(gb.toGeometry(), new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x303030 }));
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }

    // ------------------------------------------------------------ пирс Санта-Моники
    _pier() {
      const p = Geo.pier;
      const gb = new LA.GeoBuilder();
      const wood = [0.58, 0.42, 0.3];
      const len = p.x0 - p.x1;
      gb.addAABB(p.x1, p.x0, p.deck - 0.8, p.deck, p.z - p.width / 2, p.z + p.width / 2, wood, [0.62, 0.46, 0.33], { noWin: true });
      const cols = [[0.85, 0.3, 0.25], [0.2, 0.55, 0.75], [0.95, 0.75, 0.25], [0.9, 0.5, 0.65], [0.3, 0.7, 0.5]];
      for (let i = 0; i < 7; i++) {
        const x = p.x0 - 40 - i * 48 + (i % 2) * 4;
        if (Math.abs(x - p.wheelX) < 36) continue;
        gb.addBox(x, p.deck, p.z + (i % 2 ? 4 : -4) * 0.8, 20 + (i % 3) * 6, 7 + (i % 2) * 3, 8, 0, [0.92, 0.9, 0.84], cols[i % cols.length], { noWin: true });
      }
      this._mesh(gb, this.plainMat, true);
      // сваи
      const pil = new T.InstancedMesh(new T.CylinderGeometry(0.45, 0.45, 1, 6), phong(0x3b2f26), Math.floor(len / 12) * 2 + 2);
      let n = 0;
      const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3();
      for (let x = p.x0 - 2; x > p.x1; x -= 12)
        for (const dz of [-p.width / 2 + 1, p.width / 2 - 1]) {
          const hgt = p.deck + 7;
          m4.compose(ps.set(x, p.deck - 0.8 - hgt / 2 + 0.2, p.z + dz), q, sc.set(1, hgt, 1));
          pil.setMatrixAt(n++, m4);
        }
      pil.count = n; pil.frustumCulled = false;
      this.scene.add(pil);
      // колесо обозрения
      const wheel = new T.Group();
      const hubY = p.deck + p.wheelR + 5;
      wheel.position.set(p.wheelX, hubY, p.z);
      const steel = phong(0xdfe3e8, { shininess: 70 });
      for (const zz of [-2.5, 2.5]) {
        const ring = new T.Mesh(new T.TorusGeometry(p.wheelR, 0.55, 6, 48), steel);
        ring.position.z = zz; wheel.add(ring);
      }
      const spokeGeo = new T.CylinderGeometry(0.22, 0.22, p.wheelR * 2, 5);
      for (let i = 0; i < 8; i++) {
        const s = new T.Mesh(spokeGeo, steel);
        s.rotation.z = (i / 8) * Math.PI;
        wheel.add(s);
      }
      const cabins = [];
      const cabCols = [0xe84a3c, 0x2c9fd8, 0xf5c542, 0x37b36b, 0xf08ab0];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const c = new T.Mesh(new T.BoxGeometry(3, 2.4, 4), phong(cabCols[i % 5], { shininess: 30 }));
        c.position.set(Math.cos(a) * p.wheelR, Math.sin(a) * p.wheelR, 0);
        wheel.add(c); cabins.push(c);
      }
      this.scene.add(wheel);
      this.animated.push((dt) => {
        wheel.rotation.z += 0.09 * dt;
        for (const c of cabins) c.rotation.z = -wheel.rotation.z;
      });
      const legGeo = new T.BoxGeometry(1.6, 1, 1.6);
      for (const dz of [-6, 6]) {
        const leg = new T.Mesh(legGeo, steel);
        const l = Math.hypot(14, hubY - p.deck);
        leg.scale.y = l;
        leg.position.set(p.wheelX, (hubY + p.deck) / 2, p.z + dz);
        leg.rotation.x = 0; this.scene.add(leg);
      }
      // вывеска у входа
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = '#f7f0e0'; g.fillRect(0, 0, 512, 128);
      g.strokeStyle = '#d4452f'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 112);
      g.fillStyle = '#1b5f8c'; g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('SANTA MONICA', 256, 66);
      const tex = new T.CanvasTexture(cv);
      tex.anisotropy = 4;
      const sign = new T.Mesh(new T.PlaneGeometry(26, 6.5), new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
      sign.position.set(p.x0 - 14, p.deck + 10, p.z);
      sign.rotation.y = Math.PI / 2;
      this.scene.add(sign);
      for (const dz of [-12, 12]) {
        const post = new T.Mesh(new T.BoxGeometry(1.2, 11, 1.2), phong(0x8c6a4e));
        post.position.set(p.x0 - 14, p.deck + 5.5, p.z + dz); this.scene.add(post);
      }
    }

    // ------------------------------------------------------------ аэропорт
    _airport() {
      const R = Geo.runway;
      const y = R.elev;
      // --- полотно ВПП с разметкой
      const W = 4096, H = 104;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const ppm = W / R.length; // пикселей на метр
      g.fillStyle = '#2b2b2f'; g.fillRect(0, 0, W, H);
      const rnd = U.mulberry32(5);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '90,90,94' : '15,15,18'},${0.08 + rnd() * 0.12})`;
        g.fillRect(rnd() * W, rnd() * H, 20 + rnd() * 120, 2 + rnd() * 10);
      }
      g.fillStyle = 'rgba(8,8,10,0.35)'; g.fillRect(W * 0.12, H * 0.38, W * 0.76, H * 0.24); // резиновый след в зоне касания
      g.fillStyle = '#f2f2f0';
      g.fillRect(0, 2, W, 2.6); g.fillRect(0, H - 4.6, W, 2.6); // кромки
      for (let x = 60 * ppm; x < W - 60 * ppm; x += 50 * ppm) g.fillRect(x, H / 2 - 0.8 * ppm / 1.1, 30 * ppm, 1.0 * ppm); // осевая
      // «клавиши» порога: 2×8 полос по 1.8 м
      const key = (xEdge, dir) => {
        for (let i = 0; i < 8; i++)
          for (const sgn of [-1, 1]) {
            const yc = H / 2 + sgn * (3 + i * 3.3) * ppm;
            const x0 = dir > 0 ? xEdge + 6 * ppm : xEdge - 36 * ppm;
            g.fillRect(x0, yc - 0.9 * ppm, 30 * ppm, 1.8 * ppm);
          }
      };
      key(0, 1); key(W, -1);
      for (const d of [305, 150, 230, 380, 460]) {
        for (const x of [d * ppm, W - d * ppm]) {
          const lenm = d === 305 ? 45 : 22, wid = d === 305 ? 8 : 3;
          for (const sgn of [-1, 1]) g.fillRect(x - (lenm * ppm) / 2, H / 2 + sgn * (9 * ppm) - (wid * ppm) / 2, lenm * ppm, wid * ppm);
        }
      }
      const num = (txt, x, rot) => {
        g.save(); g.translate(x, H / 2); g.rotate(rot);
        g.font = `bold ${Math.round(12 * ppm * 1.15)}px Arial, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2f2f0';
        g.fillText(txt, 0, 0); g.restore();
      };
      num('09', 110 * ppm, Math.PI / 2); num('27', W - 110 * ppm, -Math.PI / 2);
      const tex = new T.CanvasTexture(cv);
      tex.anisotropy = this.world.maxAniso; tex.minFilter = T.LinearMipmapLinearFilter;
      const rw = new T.Mesh(new T.PlaneGeometry(R.length, R.width), new T.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      rw.rotation.x = -Math.PI / 2;
      rw.position.set(R.cx, y + 0.2, R.cz);
      rw.receiveShadow = true;
      this.scene.add(rw);

      // --- огни ВПП и подхода (InstancedMesh)
      const lights = [];
      for (let x = R.x0; x <= R.x1 + 0.1; x += 60) for (const dz of [-31, 31]) lights.push([x, y + 0.5, R.cz + dz, 0xfff4d8]);
      for (let i = 0; i < 10; i++) for (const x of [R.x0 - 2, R.x1 + 2]) lights.push([x, y + 0.5, R.cz - 30 + i * 6.7, x < R.cx ? 0x30ff60 : 0xff3030]);
      for (let x = R.x0 - 40; x > R.x0 - 1000; x -= 30) lights.push([x, Geo.groundHeight(x, R.cz) + 1.2, R.cz, 0xffffff]);
      const im = new T.InstancedMesh(new T.BoxGeometry(1.4, 1.0, 1.4), new T.MeshBasicMaterial({ color: 0xffffff }), lights.length);
      const m4 = new T.Matrix4(), col = new T.Color();
      lights.forEach((l, i) => { m4.setPosition(l[0], l[1], l[2]); im.setMatrixAt(i, m4); im.setColorAt(i, col.setHex(l[3])); });
      im.frustumCulled = false;
      this.scene.add(im);

      // --- здания аэропорта
      const gb = new LA.GeoBuilder();
      const A = Geo.airport;
      for (const t of A.terminals) {
        gb.addBox(t.x, y - 0.5, t.z, t.w, t.h + 0.5, t.d, 0, [0.62, 0.74, 0.84], [0.88, 0.88, 0.9], { bay: 6, floor: 5 });
        for (let i = -2; i <= 2; i++) gb.addBox(t.x + i * (t.w / 5), y, t.z + t.d / 2 + 10, 6, 6, 18, 0, [0.7, 0.72, 0.75], [0.8, 0.8, 0.8], { noWin: true }); // телетрапы
      }
      for (const t of A.garages) gb.addBox(t.x, y - 0.5, t.z, t.w, t.h, t.d, 0, [0.76, 0.75, 0.72], [0.62, 0.62, 0.62], { bay: 8, floor: 3.4 });
      const tw = A.tower;
      gb.addBox(tw.x, y - 0.5, tw.z, 11, tw.h - 8, 11, 0, [0.88, 0.88, 0.86], [0.8, 0.8, 0.8], { noWin: true });
      gb.addBox(tw.x, y + tw.h - 9, tw.z, 21, 9, 21, 0, [0.35, 0.5, 0.62], [0.8, 0.8, 0.8], { bay: 5, floor: 4 });
      this._mesh(gb, this.glassMat);
      // Theme Building: «блюдце» на наклонных опорах
      const th = A.theme;
      const tg = new LA.GeoBuilder();
      const limb = (a, b, w) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const len = Math.hypot(dx, dy, dz);
        const ey = [dx / len, dy / len, dz / len];
        let ex = [ey[2], 0, -ey[0]];
        const el = Math.hypot(ex[0], ex[1], ex[2]) || 1; ex = [ex[0] / el, 0, ex[2] / el];
        const ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
        tg.addBoxBasis([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ex, ey, ez, [w, len, w], [0.96, 0.96, 0.95], [0.96, 0.96, 0.95], { noWin: true });
      };
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) limb([th.x + sx * 22, y, th.z + sz * 22], [th.x + sx * 8, y + 25, th.z + sz * 8], 3.2);
      this._mesh(tg, this.plainMat);
      const saucer = new T.Mesh(new T.CylinderGeometry(21, 18, 5, 24), phong(0xf4f4f2));
      saucer.position.set(th.x, y + 26, th.z); saucer.castShadow = true; this.scene.add(saucer);
      const top = new T.Mesh(new T.CylinderGeometry(12, 14, 7, 24), phong(0x9fc3dc, { shininess: 90, transparent: true, opacity: 0.85 }));
      top.position.set(th.x, y + 31, th.z); this.scene.add(top);
      // --- самолёты на перроне
      const tails = [0xd33a2c, 0x1f6fb2, 0xf0a020, 0x2a9d6a, 0x7a4fb0, 0xd33a2c, 0x1f6fb2];
      const xs = [-7450, -7180, -6900, -6620, -6340, -6060, -5780];
      const airliner = this._makeAirliner(0xf2f2f0);
      xs.forEach((x, i) => {
        const a = airliner.clone();
        a.position.set(x, y + 0.2, R.cz - 300);
        a.rotation.y = 0; // нос на север (−Z)
        a.traverse((o) => { if (o.name === 'tail') o.material = phong(tails[i]); });
        this.scene.add(a);
        Geo.colliders.push({ x0: x - 17, x1: x + 17, z0: R.cz - 300 - 18, z1: R.cz - 300 + 18, y0: y, y1: y + 12 });
      });
    }

    _makeAirliner(color) {
      const g = new T.Group();
      const body = phong(color, { shininess: 60 });
      const f = new T.Mesh(new T.CylinderGeometry(2.1, 2.1, 30, 14), body);
      f.rotation.x = Math.PI / 2; f.position.set(0, 4.2, 0); f.castShadow = true; g.add(f);
      const nose = new T.Mesh(new T.SphereGeometry(2.1, 14, 10), body);
      nose.scale.set(1, 1, 1.9); nose.position.set(0, 4.2, -15); g.add(nose);
      const tailCone = new T.Mesh(new T.ConeGeometry(2.1, 8, 14), body);
      tailCone.rotation.x = -Math.PI / 2; tailCone.position.set(0, 4.8, 18.5); g.add(tailCone);
      for (const sg of [-1, 1]) {
        const w = new T.Mesh(LA.hexaGeometry([
          [sg * 1.5, 3.4, -2], [sg * 1.5, 3.4, 4], [sg * 17, 4.6, 7], [sg * 17, 4.6, 5.2],
          [sg * 1.5, 3.9, -2], [sg * 1.5, 3.9, 4], [sg * 17, 4.9, 7], [sg * 17, 4.9, 5.2],
        ]), body);
        w.castShadow = true; g.add(w);
        const eng = new T.Mesh(new T.CylinderGeometry(1.3, 1.2, 4.2, 10), phong(0xbfc3c8));
        eng.rotation.x = Math.PI / 2; eng.position.set(sg * 7, 2.6, 0.5); g.add(eng);
        const st = new T.Mesh(LA.hexaGeometry([
          [sg * 1, 4.8, 15.5], [sg * 1, 4.8, 19], [sg * 7, 5.2, 20.5], [sg * 7, 5.2, 19.2],
          [sg * 1, 5.1, 15.5], [sg * 1, 5.1, 19], [sg * 7, 5.4, 20.5], [sg * 7, 5.4, 19.2],
        ]), body);
        g.add(st);
      }
      const fin = new T.Mesh(LA.hexaGeometry([
        [-0.25, 5.5, 14], [0.25, 5.5, 14], [0.25, 5.5, 20.5], [-0.25, 5.5, 20.5],
        [-0.2, 13.5, 18], [0.2, 13.5, 18], [0.2, 13.5, 20.6], [-0.2, 13.5, 20.6],
      ]), phong(0xd33a2c));
      fin.name = 'tail'; fin.castShadow = true; g.add(fin);
      return g;
    }
  }
  LA.Landmarks = Landmarks;
})();
