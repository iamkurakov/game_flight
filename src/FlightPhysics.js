/*
 * FlightPhysics.js — упрощённая, но «честная» модель полёта лёгкого одномоторного самолёта.
 *
 * СОГЛАШЕНИЯ
 *   Мир:   +X восток, +Y вверх, -Z север. Метры, секунды, кг, Н.
 *   Тело:  вперёд = -Z, вправо = +X, вверх = +Y (как у камеры в Three.js).
 *   Ориентация — кватернион q (тело → мир). Углы Эйлера только для HUD.
 *   Курс 0° = север, 90° = восток.  Положительный крен = правое крыло вниз.
 *
 * МОДЕЛЬ
 *   Силы (в мировых осях):  подъёмная, лобовое сопротивление, боковая, тяга винта, вес.
 *     q∞ = ½ρV²;  L = q∞·S·CL(α);  D = q∞·S·(CD0 + k·CL² + CDстолл)
 *     CL(α) линеен до критического угла атаки, затем плавно падает (срыв).
 *   Вращение — командное: стик задаёт желаемую перегрузку/угол атаки (тангаж), угловую
 *     скорость (крен) и руль направления. Эффективность управления ∝ скорости потока,
 *     поэтому на малой скорости самолёт «ватный», а при срыве рули теряют силу.
 *   «Помощник» (assist): держит угол траектории (1g-триммирование), выравнивает крылья,
 *     компенсирует потерю подъёмной силы в вираже. Без него — классическая устойчивость.
 *   Земля — три точки шасси: пружинить не нужно, достаточно ограничения по высоте,
 *     трения качения/тормозов и жёсткой проверки условий касания.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const U = LA.Utils;
  const THREE_ = globalThis.THREE;

  /** Параметры самолёта (общие для физики и 3D-модели). */
  const P = (LA.AircraftParams = {
    mass: 1350,
    wingArea: 16.2,
    span: 11,
    g: 9.81,
    cl0: 0.28, clAlpha: 5.0, alphaStall: 0.28, alphaNegStall: 0.24,
    cd0: 0.027, kInd: 0.058,
    maxPower: 255e3, propEff: 0.8, staticThrust: 5200,
    gearHeight: 1.45,
    maxGroundPitch: 13 * U.DEG,
    crashVn: 5.0, // м/с — вертикальная скорость касания, при которой самолёт разрушается
    pitchRateMax: 1.0, rollRate: 1.15, yawRate: 0.5, pathRateMax: 0.16,
    nMaxPull: 3.6, nMaxPush: -1.2,
    // точки шасси в осях тела
    gear: [[0, -1.45, -2.0], [-1.5, -1.45, 0.35], [1.5, -1.45, 0.35]],
    // точки, касание которых землёй = авария
    hardPoints: [[-5.5, -0.35, 0.1], [5.5, -0.35, 0.1], [0, -0.15, 4.4], [0, -1.0, -3.3], [0, -0.95, 0.4]],
    // точки для проверки столкновений со зданиями
    bodyPoints: [[0, 0, 0], [0, -0.2, -3.9], [0, 0.4, 4.4], [-5.5, -0.2, 0], [5.5, -0.2, 0], [0, 1.1, 0], [0, 1.0, -3.3], [-2.8, -0.2, 0], [2.8, -0.2, 0]],
  });

  const sstep = U.smoothstep, clamp = U.clamp;

  /** Коэффициент подъёмной силы с плавным срывом. */
  function liftCoef(a) {
    const as = P.alphaStall, an = P.alphaNegStall;
    if (a >= -an && a <= as) return P.cl0 + P.clAlpha * a;
    if (a > as) {
      const clMax = P.cl0 + P.clAlpha * as;
      const post = 0.95 * Math.sin(2 * Math.min(a, 1.5));
      return U.lerp(clMax, post, sstep(0, 0.22, a - as));
    }
    const clMin = P.cl0 - P.clAlpha * an;
    const post = 0.95 * Math.sin(2 * Math.max(a, -1.5));
    return U.lerp(clMin, post, sstep(0, 0.22, -an - a));
  }

  class FlightPhysics {
    constructor(geo, collision) {
      this.geo = geo;
      this.collision = collision;
      this.pos = new THREE_.Vector3();
      this.vel = new THREE_.Vector3();
      this.quat = new THREE_.Quaternion();
      this.rates = { pitch: 0, roll: 0, yaw: 0 };
      this.events = [];
      this._f = new THREE_.Vector3(); this._r = new THREE_.Vector3(); this._u = new THREE_.Vector3();
      this._tmp = new THREE_.Vector3(); this._tmp2 = new THREE_.Vector3(); this._F = new THREE_.Vector3();
      this._m = new THREE_.Matrix4(); this._q2 = new THREE_.Quaternion();
      this._n = { x: 0, y: 1, z: 0 };
      this._good = null;
      this.nanRecoveries = 0;
      this.reset();
    }

    spawnPoint() {
      const R = this.geo.runway;
      return { x: R.x0 + 90, z: R.cz, heading: 90 };
    }

    reset(spawn) {
      const sp = spawn || this.spawnPoint();
      const gh = this.geo.groundHeight(sp.x, sp.z);
      this.pos.set(sp.x, gh + P.gearHeight, sp.z);
      this.vel.set(0, 0, 0);
      this.quat.setFromAxisAngle(this._tmp.set(0, 1, 0), -sp.heading * U.DEG);
      this.rates.pitch = this.rates.roll = this.rates.yaw = 0;
      this.throttle = 0.1; this.engine = 0.1; this.rpm = 800;
      this.grounded = true; this.airTime = 0; this.hasFlown = false;
      this.crashed = false; this.crashReason = '';
      this.stalled = false; this.stallWarn = false; this.stallBreak = 0;
      this.alpha = 0; this.beta = 0; this.airspeed = 0; this.groundspeed = 0;
      this.lift = 0; this.drag = 0; this.thrust = 0; this.gLoad = 1;
      this.alphaTrim = 0.02; this.alphaTarget = 0;
      this.pitchDeg = 0; this.bankDeg = 0; this.headingDeg = sp.heading; this.vsi = 0; this.agl = P.gearHeight;
      this.wingDrop = 1; this.onPaved = true; this.surface = 1; this.brakeOn = false;
      this.lastTouchdown = null; this.collisionState = 'none';
      this.events.length = 0;
      this._updateAxes();
      this._good = null;
    }

    _updateAxes() {
      this._f.set(0, 0, -1).applyQuaternion(this.quat);
      this._r.set(1, 0, 0).applyQuaternion(this.quat);
      this._u.set(0, 1, 0).applyQuaternion(this.quat);
    }

    _updateAngles() {
      const f = this._f, r = this._r;
      this.pitchDeg = Math.asin(clamp(f.y, -1, 1)) / U.DEG;
      this.bankDeg = Math.asin(clamp(-r.y, -1, 1)) / U.DEG;
      if (Math.hypot(f.x, f.z) > 0.05) this.headingDeg = U.wrap360(Math.atan2(f.x, -f.z) / U.DEG);
      this.vsi = this.vel.y;
      this.groundspeed = Math.hypot(this.vel.x, this.vel.z);
      this.agl = this.pos.y - this.geo.groundHeight(this.pos.x, this.pos.z);
    }

    /** Поворот в осях тела (pitch вверх +, yaw вправо +, roll вправо +). */
    _rotateBody(pitch, yaw, roll) {
      const x = pitch, y = -yaw, z = -roll;
      const ang = Math.sqrt(x * x + y * y + z * z);
      if (ang < 1e-9) return;
      this._tmp.set(x / ang, y / ang, z / ang);
      this._q2.setFromAxisAngle(this._tmp, ang);
      this.quat.multiply(this._q2).normalize();
    }

    _crash(reason) {
      if (this.crashed) return;
      this.crashed = true; this.crashReason = reason;
      this.events.push({ type: 'crash', reason, speed: this.airspeed, vn: 0 });
    }

    /**
     * Один фиксированный шаг физики.
     * @param {number} dt шаг, c (обычно 1/120)
     * @param {{pitch:number, roll:number, yaw:number, throttle:number, brake:boolean, assist:boolean}} inp
     */
    step(dt, inp) {
      if (this.crashed) return;
      const s = this, pos = s.pos, vel = s.vel;
      if (!s._good) s._good = { p: pos.clone(), v: vel.clone(), q: s.quat.clone() };

      s.throttle = clamp(inp.throttle, 0, 1);
      s.engine = U.damp(s.engine, s.throttle, 1 / 0.55, dt);
      s._updateAxes();
      const f = s._f, r = s._r, u = s._u;

      // ---------- аэродинамика
      const rho = 1.225 * Math.exp(-Math.max(pos.y, 0) / 9000);
      const sigma = rho / 1.225;
      const V = vel.length();
      s.airspeed = V;
      let alpha = 0, beta = 0;
      if (V > 0.5) {
        const vf = vel.dot(f), vr = vel.dot(r), vu = vel.dot(u);
        alpha = vf > 0.3 ? Math.atan2(-vu, vf) : 0;
        beta = vf > 0.3 ? Math.atan2(vr, Math.hypot(vf, vu)) : 0;
      }
      alpha = clamp(alpha, -1.6, 1.6);
      s.alpha = alpha; s.beta = beta;

      const qBar = 0.5 * rho * V * V;
      const qS = qBar * P.wingArea;
      const cl = liftCoef(alpha);
      const stallDrag = 1.2 * Math.sin(alpha) * Math.sin(alpha) * sstep(P.alphaStall * 0.85, P.alphaStall + 0.15, Math.abs(alpha));
      const cd = P.cd0 + P.kInd * cl * cl + stallDrag + 0.7 * Math.sin(beta) * Math.sin(beta);
      const lift = qS * cl, drag = qS * cd, side = -qS * 0.45 * beta;
      s.lift = lift; s.drag = drag;

      const thrFrac = clamp((s.engine - 0.08) / 0.92, 0, 1);
      const thrust = thrFrac * Math.min(P.staticThrust * Math.pow(sigma, 0.7), (P.propEff * P.maxPower * Math.pow(sigma, 0.8)) / Math.max(V, 8));
      s.thrust = thrust;
      s.rpm = 750 + 1850 * s.engine + 120 * Math.min(V / 90, 1);

      const F = s._F.set(0, -P.mass * P.g, 0);
      if (V > 1) {
        // направление подъёмной силы: r × V̂  (перпендикулярно потоку, в плоскости симметрии)
        const vh = s._tmp.copy(vel).multiplyScalar(1 / V);
        const L = s._tmp2.crossVectors(r, vh);
        const ll = L.length();
        if (ll > 0.05) F.addScaledVector(L, lift / ll);
        F.addScaledVector(vh, -drag);
        F.addScaledVector(r, side);
      }
      F.addScaledVector(f, thrust);
      s.gLoad = V > 1 ? (lift * Math.cos(alpha) + thrust * Math.sin(alpha)) / (P.mass * P.g) : 1;

      // ---------- вращение
      const stallEdge = P.alphaStall;
      s.stallBreak = sstep(stallEdge - 0.005, stallEdge + 0.06, alpha);
      const wasStalled = s.stalled;
      s.stalled = !s.grounded && (alpha > stallEdge * (wasStalled ? 0.96 : 1.0) || alpha < -P.alphaNegStall);
      s.stallWarn = !s.grounded && alpha > stallEdge * 0.86;
      if (s.stalled && !wasStalled) s.wingDrop = beta !== 0 ? Math.sign(beta) : (Math.random() < 0.5 ? -1 : 1);

      const auth = clamp((V * V) / 2500, 0.1, 1.4);
      const stab = clamp((V * V) / 2025, 0.15, 1.6);
      const cosPitch = Math.sqrt(Math.max(0, 1 - f.y * f.y));

      s._updateAngles();
      const bank = s.bankDeg * U.DEG;
      const e = inp.pitch;

      // --- тангаж: стик → желаемый угол атаки (с ограничителем перегрузки)
      let aT;
      if (s.grounded) {
        aT = e > 0 ? e * 0.30 : e * 0.1;
        s.alphaTrim = 0.03;
      } else if (inp.assist) {
        const cosB = Math.max(Math.cos(bank), 0.42);
        // стик задаёт СКОРОСТЬ изменения угла траектории: n = 1 + γ̇·V/g  (интуитивно для клавиатуры)
        const nCmd = clamp(1 + e * P.pathRateMax * V / P.g, P.nMaxPush, P.nMaxPull);
        const clReq = (nCmd * P.mass * P.g * Math.max(cosPitch, 0.2)) / (Math.max(qS, 1) * cosB);
        const aReq = (clReq - P.cl0) / P.clAlpha;
        s.alphaTrim = U.damp(s.alphaTrim, clamp(aReq, -0.12, 0.4), 6, dt);
        aT = s.alphaTrim;
      } else {
        s.alphaTrim = 0.035;
        aT = s.alphaTrim + (e >= 0 ? e * 0.24 : e * 0.16);
      }
      // ограничитель перегрузки: |n| не выше nMax
      const aCapPos = (P.nMaxPull * 1.15 * P.mass * P.g / Math.max(qS, 1) - P.cl0) / P.clAlpha;
      const aCapNeg = (P.nMaxPush * 1.1 * P.mass * P.g / Math.max(qS, 1) - P.cl0) / P.clAlpha;
      aT = clamp(aT, Math.max(aCapNeg, -0.2), Math.min(aCapPos, P.alphaStall + 0.06));
      s.alphaTarget = aT;
      // упреждение: чтобы нос следовал за траекторией в вираже (ψ̇·sinφ) и при командах стика
      let ff = 0;
      if (!s.grounded && V > 15) {
        ff = (P.g * Math.tan(clamp(bank, -1.1, 1.1)) * Math.sin(clamp(bank, -1.1, 1.1))) / V;
        if (inp.assist) ff += e * P.pathRateMax;
      }
      let pitchTarget = 4.2 * auth * (aT - alpha) + ff;
      // срыв: «клевок» носом вниз (слабее, пока пилот тянет штурвал на себя)
      pitchTarget -= 0.9 * s.stallBreak * (1 - 0.6 * Math.max(e, 0));
      pitchTarget = clamp(pitchTarget, -P.pitchRateMax, P.pitchRateMax);
      s.rates.pitch += (pitchTarget - s.rates.pitch) * (1 - Math.exp(-dt / 0.09));

      // --- крен
      const authR = clamp(V / 50, 0.12, 1.2) * (1 - 0.55 * s.stallBreak);
      let rollTarget = inp.roll * P.rollRate * authR - 0.5 * beta * stab;
      if (inp.assist && Math.abs(inp.roll) < 0.05 && Math.abs(s.bankDeg) < 80) rollTarget -= 1.1 * bank;
      rollTarget += s.wingDrop * 0.55 * s.stallBreak;
      s.rates.roll += (rollTarget - s.rates.roll) * (1 - Math.exp(-dt / 0.17));

      // --- рыскание
      let yawTarget;
      if (s.grounded) {
        const steer = 0.3 + 0.7 * Math.min(1, s.groundspeed / 6);
        yawTarget = inp.yaw * 0.75 * steer / (1 + s.groundspeed / 40);
      } else {
        yawTarget = inp.yaw * P.yawRate * auth * (1 - 0.5 * s.stallBreak) + 2.5 * stab * beta;
      }
      s.rates.yaw += (yawTarget - s.rates.yaw) * (1 - Math.exp(-dt / 0.2));

      s._rotateBody(s.rates.pitch * dt, s.rates.yaw * dt, s.rates.roll * dt);

      // ---------- интегрирование
      vel.addScaledVector(F, dt / P.mass);
      pos.addScaledVector(vel, dt);
      s._updateAxes();

      // ---------- земля, столкновения
      s._groundContact(dt, inp, qS);
      if (!s.crashed) s._hardPoints();
      if (!s.crashed) s._obstacles();
      s._updateAngles();
      if (!s.grounded) {
        s.airTime += dt;
        if (s.agl > 4) s.hasFlown = true;
      }
      s._sanity();
    }

    _groundContact(dt, inp, qS) {
      const s = this, geo = s.geo, pos = s.pos, vel = s.vel;
      s._m.makeRotationFromQuaternion(s.quat);
      const e = s._m.elements;
      let need = -1e9, worstWater = false;
      const g = P.gear;
      for (let i = 0; i < 3; i++) {
        const lx = g[i][0], ly = g[i][1], lz = g[i][2];
        const wx = e[0] * lx + e[4] * ly + e[8] * lz;
        const wy = e[1] * lx + e[5] * ly + e[9] * lz;
        const wz = e[2] * lx + e[6] * ly + e[10] * lz;
        const px = pos.x + wx, pz = pos.z + wz;
        const gh = geo.groundHeight(px, pz);
        const req = gh - wy;
        if (req > need) { need = req; worstWater = geo.height(px, pz) <= 0.05; }
      }
      const pen = need - pos.y;
      s.surface = geo.surfaceAt(pos.x, pos.z);
      s.onPaved = s.surface === 1;

      if (pen > -0.02) {
        if (worstWater) { s.pos.y = need; s._crash('water'); return; }
        const n = geo.normal(pos.x, pos.z, s._n);
        const vn = -(vel.x * n.x + vel.y * n.y + vel.z * n.z); // скорость «в землю»
        const first = !s.grounded;
        if (first && s.airTime > 0.25 && s.hasFlown) {
          // ---- касание: проверяем условия посадки (вертикальная скорость, крен, тангаж, скорость, снос)
          const lateral = Math.abs(vel.x * s._r.x + vel.z * s._r.z);
          const td = { type: 'touchdown', vn: Math.max(0, vn), bank: s.bankDeg, pitch: s.pitchDeg, speed: s.groundspeed, lateral, paved: s.onPaved, surface: s.surface };
          let reason = '';
          if (vn > P.crashVn) reason = s.onPaved ? 'hard' : 'terrain'; // вне аэродрома это не «посадка», а удар о землю
          else if (Math.abs(s.bankDeg) > 12) reason = 'bank';
          else if (s.pitchDeg > 18 || s.pitchDeg < -7) reason = 'attitude';
          else if (s.groundspeed > 66) reason = 'speed';
          else if (lateral > 7) reason = 'drift';
          s.lastTouchdown = td;
          s.events.push(td);
          if (reason) { s.pos.y = need; s._crash(reason); return; }
        }
        pos.y = Math.max(pos.y, need);
        if (vn > 0) {
          const bounce = vn > 1.6 ? 0.2 : 0;
          vel.x += n.x * vn * (1 + bounce); vel.y += n.y * vn * (1 + bounce); vel.z += n.z * vn * (1 + bounce);
        }
        s.grounded = vn <= 1.6;
        if (s.grounded) {
          s.airTime = 0;
          // трение качения / тормоза / боковое сцепление шин
          const fl = Math.hypot(s._f.x, s._f.z) || 1;
          const hx = s._f.x / fl, hz = s._f.z / fl; // горизонтальное «вперёд»
          const rx = -hz, rz = hx; // горизонтальное «вправо»
          const vF = vel.x * hx + vel.z * hz;
          const vL = vel.x * rx + vel.z * rz;
          const Lift = qS * liftCoef(s.alpha) * Math.max(fl, 0.5);
          const N = Math.max(0, P.mass * P.g - Lift);
          const rolling = s.surface === 1 ? 0.022 : s.surface === 2 ? 0.12 : 0.07;
          const brake = inp.brake ? (s.surface === 1 ? 0.55 : 0.35) : 0;
          s.brakeOn = !!inp.brake;
          const dec = (((rolling + brake) * N) / P.mass) * dt;
          const nvF = Math.abs(vF) <= dec ? 0 : vF - Math.sign(vF) * dec;
          const nvL = vL * Math.exp(-9 * dt);
          vel.x += (nvF - vF) * hx + (nvL - vL) * rx;
          vel.z += (nvF - vF) * hz + (nvL - vL) * rz;
          s._groundAttitude(dt);
        }
      } else if (pen < -0.12) {
        s.grounded = false;
      }
    }

    /** Ограничения ориентации, пока колёса на земле. */
    _groundAttitude(dt) {
      const s = this;
      s._updateAxes();
      s._updateAngles();
      const k = 1 - Math.exp(-12 * dt);
      // крен → 0
      const bank = s.bankDeg * U.DEG;
      s._rotateBody(0, 0, -bank * k);
      s.rates.roll *= 0.5;
      // тангаж: не ниже линии земли, не выше «касания хвостом»
      s._updateAxes(); s._updateAngles();
      const th = s.pitchDeg * U.DEG;
      const hx = Math.sin(s.headingDeg * U.DEG), hz = -Math.cos(s.headingDeg * U.DEG);
      const slope = Math.atan2(s.geo.groundHeight(s.pos.x + hx * 25, s.pos.z + hz * 25) - s.geo.groundHeight(s.pos.x - hx * 25, s.pos.z - hz * 25), 50);
      if (th < slope - 0.002) { s._rotateBody(slope - th, 0, 0); if (s.rates.pitch < 0) s.rates.pitch = 0; }
      else if (th > P.maxGroundPitch) { s._rotateBody(P.maxGroundPitch - th, 0, 0); if (s.rates.pitch > 0) s.rates.pitch = 0; }
      s._updateAxes();
    }

    _hardPoints() {
      const s = this, geo = s.geo, pos = s.pos;
      s._m.makeRotationFromQuaternion(s.quat);
      const e = s._m.elements;
      for (const hp of P.hardPoints) {
        const lx = hp[0], ly = hp[1], lz = hp[2];
        const wx = pos.x + e[0] * lx + e[4] * ly + e[8] * lz;
        const wy = pos.y + e[1] * lx + e[5] * ly + e[9] * lz;
        const wz = pos.z + e[2] * lx + e[6] * ly + e[10] * lz;
        const gh = geo.groundHeight(wx, wz);
        if (wy < gh - 0.05) {
          s.collisionState = 'terrain';
          s._crash(geo.height(wx, wz) <= 0.05 ? 'water' : 'terrain');
          return;
        }
      }
    }

    _obstacles() {
      const s = this, pos = s.pos;
      if (!s.collision) return;
      s._m.makeRotationFromQuaternion(s.quat);
      const e = s._m.elements;
      for (const bp of P.bodyPoints) {
        const lx = bp[0], ly = bp[1], lz = bp[2];
        const wx = pos.x + e[0] * lx + e[4] * ly + e[8] * lz;
        const wy = pos.y + e[1] * lx + e[5] * ly + e[9] * lz;
        const wz = pos.z + e[2] * lx + e[6] * ly + e[10] * lz;
        if (s.collision.hit(wx, wy, wz)) { s.collisionState = 'building'; s._crash('building'); return; }
      }
    }

    /** Защита от NaN/Infinity: откат к последнему корректному состоянию. */
    _sanity() {
      const s = this, p = s.pos, v = s.vel, q = s.quat;
      const ok = Number.isFinite(p.x + p.y + p.z + v.x + v.y + v.z + q.x + q.y + q.z + q.w) && v.length() < 400 && Math.abs(p.y) < 20000;
      if (ok) {
        s._good.p.copy(p); s._good.v.copy(v); s._good.q.copy(q);
      } else {
        p.copy(s._good.p); v.copy(s._good.v).multiplyScalar(0.5); q.copy(s._good.q);
        s.rates.pitch = s.rates.roll = s.rates.yaw = 0;
        s.nanRecoveries++;
      }
      if (!Number.isFinite(s.rates.pitch + s.rates.roll + s.rates.yaw)) s.rates.pitch = s.rates.roll = s.rates.yaw = 0;
      if (!Number.isFinite(s.engine)) s.engine = 0.1;
    }
  }

  LA.FlightPhysics = FlightPhysics;
  LA.liftCoef = liftCoef;
})();
