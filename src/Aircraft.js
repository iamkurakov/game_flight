/*
 * Aircraft.js — оригинальная 3D-модель лёгкого одномоторного самолёта (низкоплан),
 * целиком из процедурной геометрии. Ось «вперёд» модели = -Z, вправо = +X, вверх = +Y,
 * начало координат — центр масс. Состояние берётся из FlightPhysics.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const T = globalThis.THREE;
  const U = LA.Utils;

  /** Тело вращения вдоль оси Z: ring = {z, rx, ry, c:[r,g,b], y}. */
  function revolve(rings, seg) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i < rings.length; i++) {
      const R = rings[i];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        pos.push(Math.cos(a) * R.rx, (R.y || 0) + Math.sin(a) * R.ry, R.z);
        col.push(R.c[0], R.c[1], R.c[2]);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = (i + 1) * seg + k, d = (i + 1) * seg + ((k + 1) % seg);
        idx.push(a, b, c, b, d, c); // обход против часовой стрелки при взгляде снаружи
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  class AircraftModel {
    constructor() {
      const g = (this.group = new T.Group());
      g.name = 'aircraft';
      const white = [0.95, 0.95, 0.93], accent = [0.96, 0.58, 0.1], dark = [0.16, 0.17, 0.19], grey = [0.78, 0.8, 0.82];
      const paint = new T.MeshPhongMaterial({ color: 0xffffff, vertexColors: true, shininess: 70, specular: 0x555555 });
      const whiteMat = new T.MeshPhongMaterial({ color: 0xf2f2ee, shininess: 60, specular: 0x444444 });
      const accentMat = new T.MeshPhongMaterial({ color: 0xf59414, shininess: 50, specular: 0x333333 });
      const darkMat = new T.MeshPhongMaterial({ color: 0x2a2c30, shininess: 20 });
      this.parts = {};

      // ---- фюзеляж
      const fus = new T.Mesh(
        revolve([
          { z: -3.45, rx: 0.2, ry: 0.2, c: accent },
          { z: -3.3, rx: 0.42, ry: 0.42, c: accent },
          { z: -2.9, rx: 0.56, ry: 0.55, c: accent },
          { z: -2.4, rx: 0.62, ry: 0.62, c: white },
          { z: -1.0, rx: 0.66, ry: 0.72, y: 0.04, c: white },
          { z: 0.4, rx: 0.62, ry: 0.7, y: 0.06, c: white },
          { z: 1.8, rx: 0.46, ry: 0.5, y: 0.1, c: white },
          { z: 3.2, rx: 0.27, ry: 0.3, y: 0.14, c: accent },
          { z: 4.45, rx: 0.1, ry: 0.12, y: 0.2, c: white },
        ], 18),
        paint
      );
      fus.castShadow = true;
      g.add(fus);
      // кабина
      const glass = new T.MeshPhongMaterial({ color: 0x25384a, shininess: 140, specular: 0xaaccee, transparent: true, opacity: 0.62 });
      const canopy = new T.Mesh(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
      canopy.scale.set(0.58, 0.46, 1.5);
      canopy.position.set(0, 0.52, -0.35);
      g.add(canopy);
      this.parts.canopy = canopy;

      // ---- крылья (низкоплан)
      const wingGeo = (sgn) => LA.hexaGeometry([
        [sgn * 0.5, -0.46, -0.95], [sgn * 0.5, -0.46, 0.85], [sgn * 5.5, -0.2, 0.55], [sgn * 5.5, -0.2, -0.45],
        [sgn * 0.5, -0.24, -0.95], [sgn * 0.5, -0.24, 0.85], [sgn * 5.5, -0.12, 0.55], [sgn * 5.5, -0.12, -0.45],
      ]);
      for (const sg of [-1, 1]) {
        const w = new T.Mesh(wingGeo(sg), whiteMat);
        w.castShadow = true;
        g.add(w);
        // законцовка
        const tip = new T.Mesh(new T.BoxGeometry(0.1, 0.12, 1.0), accentMat);
        tip.position.set(sg * 5.52, -0.16, 0.05);
        g.add(tip);
      }
      // элероны (шарниры на задней кромке)
      this.parts.aileron = [];
      for (const sg of [-1, 1]) {
        const hinge = new T.Group();
        hinge.position.set(sg * 3.9, -0.3, 0.68);
        const surf = new T.Mesh(new T.BoxGeometry(2.3, 0.05, 0.34), accentMat);
        surf.position.set(0, 0, 0.15);
        hinge.add(surf);
        g.add(hinge);
        this.parts.aileron.push(hinge);
      }

      // ---- оперение
      const stabGeo = (sgn) => LA.hexaGeometry([
        [sgn * 0.3, -0.04, 3.55], [sgn * 0.3, -0.04, 4.55], [sgn * 2.0, -0.02, 4.4], [sgn * 2.0, -0.02, 3.95],
        [sgn * 0.3, 0.07, 3.55], [sgn * 0.3, 0.07, 4.55], [sgn * 2.0, 0.03, 4.4], [sgn * 2.0, 0.03, 3.95],
      ]);
      for (const sg of [-1, 1]) {
        const st = new T.Mesh(stabGeo(sg), whiteMat);
        st.position.y = 0.2; st.castShadow = true;
        g.add(st);
      }
      this.parts.elevator = new T.Group();
      this.parts.elevator.position.set(0, 0.26, 4.5);
      const elevSurf = new T.Mesh(new T.BoxGeometry(3.7, 0.04, 0.4), accentMat);
      elevSurf.position.set(0, 0, 0.18);
      this.parts.elevator.add(elevSurf);
      g.add(this.parts.elevator);
      const fin = new T.Mesh(LA.hexaGeometry([
        [-0.06, 0.25, 2.5], [0.06, 0.25, 2.5], [0.06, 0.25, 4.55], [-0.06, 0.25, 4.55],
        [-0.04, 1.75, 3.85], [0.04, 1.75, 3.85], [0.04, 1.75, 4.5], [-0.04, 1.75, 4.5],
      ]), whiteMat);
      fin.castShadow = true;
      g.add(fin);
      this.parts.rudder = new T.Group();
      this.parts.rudder.position.set(0, 0.3, 4.55);
      const rudSurf = new T.Mesh(new T.BoxGeometry(0.05, 1.4, 0.36), accentMat);
      rudSurf.position.set(0, 0.7, 0.14);
      this.parts.rudder.add(rudSurf);
      g.add(this.parts.rudder);

      // ---- шасси
      this.parts.wheels = [];
      const wheelGeo = new T.CylinderGeometry(0.23, 0.23, 0.16, 14);
      wheelGeo.rotateZ(Math.PI / 2);
      const strutGeo = new T.CylinderGeometry(0.045, 0.05, 1, 6);
      const mkWheel = (x, y, z) => {
        const w = new T.Mesh(wheelGeo, darkMat);
        w.position.set(x, y + 0.23, z);
        g.add(w);
        this.parts.wheels.push(w);
        const pant = new T.Mesh(new T.SphereGeometry(1, 10, 8), whiteMat);
        pant.scale.set(0.12, 0.3, 0.55);
        pant.position.set(x + Math.sign(x) * 0.09, y + 0.23, z);
        if (x !== 0) g.add(pant);
      };
      const strut = (x0, y0, z0, x1, y1, z1) => {
        const m = new T.Mesh(strutGeo, new T.MeshPhongMaterial({ color: 0x9a9da2, shininess: 40 }));
        const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
        const len = Math.hypot(dx, dy, dz);
        m.scale.set(1, len, 1);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx, dy, dz).normalize());
        g.add(m);
      };
      strut(0, -0.5, -1.9, 0, -1.25, -2.0); mkWheel(0, -1.45, -2.0);
      strut(-0.45, -0.5, 0.3, -1.45, -1.25, 0.35); mkWheel(-1.5, -1.45, 0.35);
      strut(0.45, -0.5, 0.3, 1.45, -1.25, 0.35); mkWheel(1.5, -1.45, 0.35);

      // ---- винт
      const prop = (this.parts.prop = new T.Group());
      prop.position.set(0, 0, -3.5);
      const spinner = new T.Mesh(new T.ConeGeometry(0.2, 0.5, 14), accentMat);
      spinner.rotation.x = -Math.PI / 2; // вершина вперёд (-Z)
      spinner.position.z = -0.2;
      prop.add(spinner);
      const bladeGeo = new T.BoxGeometry(0.16, 2.0, 0.035);
      for (let i = 0; i < 2; i++) {
        const b = new T.Mesh(bladeGeo, darkMat);
        b.rotation.z = i * Math.PI;
        prop.add(b);
      }
      this.parts.blades = prop.children.slice(1);
      g.add(prop);
      const blur = (this.parts.blur = new T.Mesh(
        new T.CircleGeometry(1.0, 28),
        new T.MeshBasicMaterial({ color: 0x20242a, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })
      ));
      blur.position.set(0, 0, -3.55);
      g.add(blur);

      // ---- навигационные огни
      const lightMat = (c) => new T.MeshBasicMaterial({ color: c });
      this.parts.navL = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), lightMat(0xff2020));
      this.parts.navL.position.set(-5.58, -0.14, 0.05);
      this.parts.navR = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), lightMat(0x20ff50));
      this.parts.navR.position.set(5.58, -0.14, 0.05);
      this.parts.strobe = new T.Mesh(new T.SphereGeometry(0.11, 8, 6), lightMat(0xffffff));
      this.parts.strobe.position.set(0, 1.78, 4.5);
      g.add(this.parts.navL, this.parts.navR, this.parts.strobe);

      // ---- интерьер (виден только из кабины)
      const cp = (this.cockpit = new T.Group());
      const dash = new T.Mesh(new T.BoxGeometry(0.9, 0.12, 0.4), darkMat);
      dash.position.set(0, 0.14, -0.95);
      dash.rotation.x = 0.12;
      const shield = new T.Mesh(new T.BoxGeometry(1.06, 0.035, 0.46), new T.MeshPhongMaterial({ color: 0x151618, shininess: 10 }));
      shield.position.set(0, 0.235, -1.12);
      cp.add(dash, shield);
      for (const sg of [-1, 1]) {
        const pillar = new T.Mesh(new T.BoxGeometry(0.03, 0.46, 0.04), darkMat);
        pillar.position.set(sg * 0.88, 0.52, -0.7);
        pillar.rotation.z = sg * 0.4; // верх стойки наклонён к центру
        pillar.rotation.x = 0.28;
        cp.add(pillar);
      }
      // штурвал
      const yoke = (this.parts.yoke = new T.Group());
      yoke.position.set(0, 0.2, -0.62);
      const col = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.42, 8), darkMat);
      col.rotation.x = Math.PI / 2; col.position.z = 0.2;
      const rim = new T.Mesh(new T.TorusGeometry(0.16, 0.022, 6, 16), darkMat);
      rim.position.z = 0.0;
      yoke.add(col, rim);
      cp.add(yoke);
      cp.visible = false;
      g.add(cp);
    }

    setCockpitView(on) {
      this.cockpitOn = on;
      this.cockpit.visible = on;
      this.parts.canopy.visible = !on;
    }

    /** Анимация по состоянию физики и сглаженным органам управления. */
    update(dt, phys, ctl, time) {
      const P = this.parts;
      const spin = (phys.rpm / 60) * 2 * Math.PI * 0.34; // замедлено визуально (стробоскоп 60 Гц)
      P.prop.rotation.z += spin * dt;
      const blurAmt = U.clamp((phys.rpm - 900) / 1300, 0, 1);
      P.blur.material.opacity = 0.28 * blurAmt;
      P.blur.scale.set(1.0, 1.0, 1.0);
      for (const b of P.blades) b.visible = !this.cockpitOn && (blurAmt < 0.85 || (Math.floor(time * 60) % 2 === 0));
      const wr = (phys.groundspeed / 0.23) * dt;
      for (const w of P.wheels) w.rotation.x -= wr;
      P.aileron[0].rotation.x = 0.45 * ctl.roll;
      P.aileron[1].rotation.x = -0.45 * ctl.roll;
      P.elevator.rotation.x = -0.4 * ctl.pitch;
      P.rudder.rotation.y = 0.45 * ctl.yaw;
      const blink = Math.floor(time * 1.1) % 2 === 0 && (time * 1.1) % 1 < 0.12;
      P.strobe.visible = blink;
      P.yoke.position.z = -0.62 + 0.05 * ctl.pitch;
      P.yoke.rotation.z = -ctl.roll * 0.7;
    }
  }
  LA.AircraftModel = AircraftModel;
})();
