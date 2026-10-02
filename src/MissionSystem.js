/*
 * MissionSystem.js — «Обзорный полёт над Лос-Анджелесом»:
 *   взлёт → Даунтаун → Обсерватория Гриффита → знак Hollywood → пирс Санта-Моники →
 *   береговая линия → заход на посадку → посадка на полосу.
 * Контрольная точка — большое кольцо. Пролёт засчитывается, когда траектория самолёта пересекает
 * плоскость кольца внутри радиуса (с запасом), так что точность «до пикселя» не нужна.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const T = globalThis.THREE;
  const Geo = LA.Geo;

  const RING_R = 115;
  // x, z — координаты, y — абсолютная высота (м над уровнем моря)
  const DEFS = [
    { id: 'downtown', key: 's_downtown', x: 3450, y: 540, z: -520 },
    { id: 'griffith', key: 's_griffith', x: -250, y: 640, z: -4900 },
    { id: 'sign', key: 's_sign', x: -3050, y: 650, z: -5650 },
    { id: 'pier', key: 's_pier', x: -9150, y: 230, z: -2400 },
    { id: 'coast', key: 's_coast', x: -9900, y: 270, z: 2000 },
    { id: 'final', key: 's_final', x: -11300, y: 205, z: 5600, normal: [1, 0, 0] },
  ];

  class MissionSystem {
    constructor(scene) {
      this.scene = scene;
      this.rings = [];
      this.n = DEFS.length;
      const start = new T.Vector3(Geo.runway.x0, 10, Geo.runway.cz);
      const end = new T.Vector3(Geo.runway.x0 + 200, 10, Geo.runway.cz);
      for (let i = 0; i < DEFS.length; i++) {
        const d = DEFS[i];
        const c = new T.Vector3(d.x, d.y, d.z);
        const prev = i === 0 ? start : new T.Vector3(DEFS[i - 1].x, DEFS[i - 1].y, DEFS[i - 1].z);
        const next = i === DEFS.length - 1 ? end : new T.Vector3(DEFS[i + 1].x, DEFS[i + 1].y, DEFS[i + 1].z);
        const nrm = d.normal ? new T.Vector3().fromArray(d.normal) : new T.Vector3().subVectors(c, prev).normalize().add(new T.Vector3().subVectors(next, c).normalize()).normalize();
        if (nrm.lengthSq() < 0.01) nrm.set(0, 0, 1);
        this.rings.push(this._makeRing(c, nrm, d));
      }
      this.reset();
    }

    _makeRing(center, normal, def) {
      const g = new T.Group();
      g.position.copy(center);
      g.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
      const mat = new T.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.35, depthWrite: false, fog: true });
      const ring = new T.Mesh(new T.TorusGeometry(RING_R, 5, 10, 64), mat);
      const discMat = new T.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false, fog: true });
      const disc = new T.Mesh(new T.CircleGeometry(RING_R, 48), discMat);
      g.add(ring, disc);
      // маяк: вертикальный луч, виден издалека
      const beamMat = new T.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.16, depthWrite: false, blending: T.AdditiveBlending, fog: true });
      const beam = new T.Mesh(new T.CylinderGeometry(14, 14, 2400, 12, 1, true), beamMat);
      beam.position.copy(center); beam.position.y += 1200;
      this.scene.add(g, beam);
      return { group: g, ring, disc, beam, mat, discMat, beamMat, center: center.clone(), normal: normal.clone(), def, state: 'wait', flash: 0 };
    }

    reset() {
      this.index = 0; // 0 = взлёт, 1..n = кольца, n+1 = посадка
      this.elapsed = 0; this.finished = false; this.completed = 0; this.prev = null; this.landingResult = null;
      this.events = [];
      this.rings.forEach((r, i) => { r.state = 'wait'; r.flash = 0; this._style(r); r.group.visible = false; r.beam.visible = false; });
    }

    get stepCount() { return this.n + 2; }
    get landStep() { return this.n + 1; }

    stepKey() {
      if (this.index === 0) return 's_takeoff';
      if (this.index <= this.n) return DEFS[this.index - 1].key;
      return 's_land';
    }

    activeRing() { return this.index >= 1 && this.index <= this.n ? this.rings[this.index - 1] : null; }

    /** Точка для указателя направления (кольцо или торец полосы). */
    targetPoint(out) {
      const r = this.activeRing();
      if (r) return out.copy(r.center);
      if (this.index === this.landStep) return out.set(Geo.runway.cx, Geo.runway.elev, Geo.runway.cz);
      return out.set(Geo.runway.x1, Geo.runway.elev, Geo.runway.cz);
    }

    _style(r) {
      const col = r.state === 'done' ? 0x4be39a : r.state === 'active' ? 0xffb02e : 0x9fd2ff;
      r.mat.color.setHex(col); r.discMat.color.setHex(col); r.beamMat.color.setHex(col);
      r.mat.opacity = r.state === 'active' ? 0.95 : r.state === 'done' ? 0.4 : 0.28;
      r.discMat.opacity = r.state === 'active' ? 0.1 : 0.03;
      r.beamMat.opacity = r.state === 'active' ? 0.2 : 0;
      r.beam.visible = r.state === 'active';
    }

    _activate() {
      this.rings.forEach((r, i) => {
        const idx = i + 1;
        r.state = idx < this.index ? 'done' : idx === this.index ? 'active' : 'wait';
        r.group.visible = idx >= this.index - 1 && idx <= this.index + 1; // видны предыдущее, текущее, следующее
        this._style(r);
      });
    }

    /** @returns массив событий: {type:'takeoff'|'checkpoint'|'missed'|'ready_to_land', index} */
    update(dt, pos, phys, running) {
      const ev = this.events; ev.length = 0;
      if (running && !this.finished) this.elapsed += dt;
      // анимация колец
      for (const r of this.rings) {
        if (!r.group.visible) continue;
        if (r.state === 'active') { const s = 1 + 0.025 * Math.sin(performance.now() * 0.004); r.ring.scale.setScalar(s); r.discMat.opacity = 0.08 + 0.05 * Math.sin(performance.now() * 0.004); }
        else r.ring.scale.setScalar(1);
        if (r.flash > 0) { r.flash -= dt; r.mat.opacity = 0.4 + Math.max(0, r.flash) * 0.6; }
      }
      if (this.finished) { this.prev = pos.clone(); return ev; }

      if (this.index === 0) {
        if (phys.hasFlown && !phys.grounded && phys.agl > 12) { this.index = 1; this._activate(); ev.push({ type: 'takeoff' }); }
      } else if (this.index <= this.n) {
        const r = this.rings[this.index - 1];
        if (this.prev) {
          const dPrev = this.prev.clone().sub(r.center).dot(r.normal);
          const dNow = pos.clone().sub(r.center).dot(r.normal);
          if (dPrev * dNow <= 0 && Math.abs(dPrev - dNow) < 300) {
            const t = dPrev === dNow ? 0 : dPrev / (dPrev - dNow);
            const p = this.prev.clone().lerp(pos, t).sub(r.center);
            p.addScaledVector(r.normal, -p.dot(r.normal));
            const rad = p.length();
            if (rad <= RING_R + 14) {
              r.state = 'done'; r.flash = 1.2;
              this.completed++; this.index++;
              this._activate();
              ev.push({ type: 'checkpoint', index: this.completed, key: DEFS[this.completed - 1].key });
              if (this.index === this.landStep) ev.push({ type: 'ready_to_land' });
            } else if (rad < RING_R * 2.4) ev.push({ type: 'missed' });
          }
        }
      }
      this.prev = pos.clone();
      return ev;
    }

    distanceTo(pos) {
      const tmp = this._d || (this._d = new T.Vector3());
      this.targetPoint(tmp);
      const dx = tmp.x - pos.x, dy = tmp.y - pos.y, dz = tmp.z - pos.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /** Посадка завершена. ok = на покрытии аэропорта. */
    landed(ok) {
      if (ok && this.index === this.landStep) { this.finished = true; return true; }
      return false;
    }
  }
  LA.MissionSystem = MissionSystem;
})();
