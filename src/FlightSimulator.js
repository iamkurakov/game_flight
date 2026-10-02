/*
 * FlightSimulator.js — главный класс: сцена, цикл, состояния игры, события, интерфейс.
 *
 * Состояния: LOADING → MENU → FLYING ⇄ PAUSED;  FLYING → CRASHED | LANDED (→ FLYING при «Свободный полёт»).
 * Физика идёт с фиксированным шагом 1/120 с (накопитель, не больше 8 шагов за кадр);
 * dt кадра ограничен 0.05 с — после переключения вкладки симуляция не «взрывается».
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const T = globalThis.THREE;
  const U = LA.Utils;
  const Geo = LA.Geo;
  const STEP = 1 / 120;
  const $ = (id) => document.getElementById(id);

  const CONTROLS = [
    [['W', 'S'], 'c_pitch'], [['A', 'D'], 'c_roll'], [['Q', 'E'], 'c_yaw'], [['Shift', 'Ctrl'], 'c_throttle'],
    [['Space'], 'c_brake'], [['C'], 'c_cam'], [['R'], 'c_restart'], [['P', 'Esc'], 'c_pause'], [['M', 'T', 'U', 'G', 'L', 'I'], 'c_more'],
  ];

  class FlightSimulator {
    constructor(canvas) {
      this.canvas = canvas;
      this.state = 'LOADING';
      this.time = 0;
      this.acc = 0;
      this.throttle = 0.1;
      this.fps = 60; this.lowFpsT = 0; this.perfStage = 0;
      this.pending = null; this.stopT = 0; this.liftoffT = null; this.prevGrounded = true;
      this.missT = 0; this.resultTimer = null; this.ready = false;
      this.settings = { lang: LA.I18N.detect(), units: null, assist: true, shadows: true, sound: true, invert: false };
      this._loadSettings();
      if (!this.settings.units) this.settings.units = this.settings.lang === 'ru' ? 'metric' : 'imperial';
      this.ctl = { pitch: 0, roll: 0, yaw: 0, throttle: 0.1, brake: false, assist: true };
      this.last = performance.now();
    }

    // ------------------------------------------------------------ инициализация
    async init() {
      const loadFill = $('loadFill'), loadText = $('loadText');
      LA.I18N.setLang(this.settings.lang);
      this._buildControlLists();
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
        if (!renderer.getContext()) throw new Error('no gl');
      } catch (e) { this.fatal('err_gl', 'err_gl_hint'); throw e; }
      this.renderer = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 1.2, 60000);
      this.scene.add(this.camera);

      this.world = new LA.World(this.scene, renderer);
      await this.world.build((stage, pct) => {
        loadFill.style.width = Math.round(pct * 100) + '%';
        loadText.textContent = LA.t('ld_' + stage);
      });
      this.collision = new LA.CollisionSystem(this.world.city.buildings.concat(Geo.colliders));
      this.phys = new LA.FlightPhysics(Geo, this.collision);
      this.aircraft = new LA.AircraftModel();
      this.scene.add(this.aircraft.group);
      this.mission = new LA.MissionSystem(this.scene);
      this.effects = new LA.Effects(this.scene);
      this.audio = new LA.AudioManager();
      this.hud = new LA.HUD();
      this.camCtl = new LA.CameraController(this.camera);
      this.input = new LA.Input({
        camera: () => this.cycleCamera(), restart: () => this.restart(), pause: () => this.togglePause(), debug: () => this.toggleDebug(),
        mute: () => this.toggleSetting('sound'), assist: () => this.toggleSetting('assist'), units: () => this.toggleSetting('units'),
        shadows: () => this.toggleSetting('shadows'), lang: () => this.toggleSetting('lang'), invert: () => this.toggleSetting('invert'),
      }, () => this.state === 'FLYING' || this.state === 'PAUSED' || this.state === 'CRASHED' || this.state === 'LANDED');
      this.touch = new LA.TouchControls({
        throttle: (v) => { this.throttle = v; }, camera: () => this.cycleCamera(), pause: () => this.togglePause(),
      });
      this.input.touch = this.touch;

      this._bindUI();
      this._applySettings(true);
      window.addEventListener('resize', () => this._resize());
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'FLYING') this.pause(); });
      window.addEventListener('blur', () => { if (!document.hasFocus() && this.state === 'FLYING') this.pause(); });
      // защита от случайного закрытия вкладки (Ctrl+W при управлении газом клавишей Ctrl)
      window.addEventListener('beforeunload', (e) => { if (this.state === 'FLYING' || this.state === 'PAUSED') { e.preventDefault(); e.returnValue = ''; } });

      this.phys.reset();
      this.camCtl.override = 'menu';
      this.camCtl.update(0.016, this.phys, 0);
      this._syncAircraft(0.016);
      this.world.update(0.016, this.camera, this.phys.pos);
      renderer.render(this.scene, this.camera); // «прогрев»: компиляция шейдеров до показа меню
      $('screen-loading').classList.remove('show');
      this.ready = true;
      this.setState('MENU');
      requestAnimationFrame((t) => this._frame(t));
    }

    fatal(titleKey, hintKey) {
      $('errTitle').textContent = LA.t(titleKey); $('errText').textContent = LA.t(hintKey);
      $('screen-loading').classList.remove('show');
      $('screen-error').classList.add('show');
      this.fatalShown = true;
    }

    _resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    // ------------------------------------------------------------ настройки
    _loadSettings() {
      try {
        const s = JSON.parse(localStorage.getItem('la-flight-settings') || 'null');
        if (s && typeof s === 'object') for (const k of Object.keys(this.settings)) if (k in s) this.settings[k] = s[k];
      } catch (e) { /* хранилище недоступно — не страшно */ }
    }
    _saveSettings() { try { localStorage.setItem('la-flight-settings', JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }

    toggleSetting(k) {
      const s = this.settings;
      if (k === 'units') s.units = s.units === 'metric' ? 'imperial' : 'metric';
      else if (k === 'lang') s.lang = s.lang === 'en' ? 'ru' : 'en';
      else s[k] = !s[k];
      this._applySettings(false);
      if (k === 'sound' && s.sound) this.audio.init();
    }

    _applySettings(first) {
      const s = this.settings;
      LA.I18N.setLang(s.lang);
      this.hud.units = s.units;
      this.input.invertPitch = s.invert;
      this.audio.setMuted(!s.sound);
      if (first || this.world.shadowsOn !== s.shadows) this.world.setShadows(s.shadows);
      const on = (b) => LA.t(b ? 'on' : 'off');
      const set = (id, text, pressed) => { const el = $(id); el.textContent = text; if (pressed !== undefined) el.setAttribute('aria-pressed', String(pressed)); };
      set('setSound', on(s.sound), s.sound); set('setAssist', on(s.assist), s.assist); set('setShadows', on(s.shadows), s.shadows);
      set('setInvert', on(s.invert), s.invert); set('setUnits', LA.t(s.units)); set('setLang', s.lang === 'ru' ? 'Русский' : 'English');
      this._saveSettings();
    }

    // ------------------------------------------------------------ UI
    _buildControlLists() {
      const html = CONTROLS.map(([keys, label]) => `<div class="keys">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</div><span data-i18n="${label}"></span>`).join('');
      $('ctlList1').innerHTML = html; $('ctlList2').innerHTML = html;
      LA.I18N.apply(document);
    }

    _bindUI() {
      const click = (id, fn) => $(id).addEventListener('click', (e) => { fn(); e.currentTarget.blur(); });
      click('btnStart', () => {
        if (!this.touch.enabled) { this.startFlight(); return; }
        // на мобильных: полный экран, разрешение на датчик наклона (iOS), затем старт
        this.audio.init();
        this.touch.enterFullscreen();
        this.touch.requestPermission().then(() => { this.startFlight(); this.touch.calibrate(); });
      });
      click('btnLang0', () => this.toggleSetting('lang'));
      click('btnResume', () => this.resume());
      click('btnRestartP', () => this.restart());
      click('setSound', () => this.toggleSetting('sound'));
      click('setAssist', () => this.toggleSetting('assist'));
      click('setUnits', () => this.toggleSetting('units'));
      click('setShadows', () => this.toggleSetting('shadows'));
      click('setInvert', () => this.toggleSetting('invert'));
      click('setLang', () => this.toggleSetting('lang'));
      $('rBtn1').addEventListener('click', (e) => { this._resultActions[0](); e.currentTarget.blur(); });
      $('rBtn2').addEventListener('click', (e) => { this._resultActions[1](); e.currentTarget.blur(); });
      this._resultActions = [() => {}, () => {}];
    }

    _screen(name, on) { $('screen-' + name).classList.toggle('show', on); }

    _showResult(kind, title, note, rows, b1, b2) {
      const box = $('resultBox');
      box.dataset.kind = kind;
      $('rTitle').textContent = title;
      $('rNote').textContent = note || '';
      $('rNote').style.display = note ? 'block' : 'none';
      $('rList').innerHTML = rows.map((r) => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('');
      $('rBtn1').textContent = b1.label; $('rBtn1').className = 'btn primary';
      this._resultActions[0] = b1.fn;
      if (b2) { $('rBtn2').style.display = ''; $('rBtn2').textContent = b2.label; this._resultActions[1] = b2.fn; } else $('rBtn2').style.display = 'none';
      $('rHint').textContent = LA.t('r_hint');
      this._screen('result', true);
    }

    // ------------------------------------------------------------ состояния
    setState(s) {
      this.state = s;
      const hudVisible = s === 'FLYING' || s === 'PAUSED' || s === 'CRASHED' || s === 'LANDED';
      this.hud && this.hud.setVisible(hudVisible);
      this._screen('start', s === 'MENU');
      this._screen('pause', s === 'PAUSED');
      if (s !== 'CRASHED' && s !== 'LANDED') this._screen('result', false);
      if (s === 'MENU') { this.camCtl.override = 'menu'; $('btnStart').focus({ preventScroll: true }); }
    }

    startFlight() {
      this.audio.init();
      this.restart(true);
    }

    restart(force) {
      if (!this.ready) return;
      if (this.state === 'MENU' && !force) return;
      clearTimeout(this.resultTimer);
      this.phys.reset();
      this.throttle = this.phys.throttle;
      this.mission.reset();
      this.effects.clear();
      this.aircraft.group.visible = true;
      this.camCtl.override = null;
      this.camCtl.reset();
      this.input.reset();
      this.touch.reset();
      this.touch.calibrate();
      this.hud.clearToasts();
      this.pending = null; this.stopT = 0; this.liftoffT = null; this.prevGrounded = true; this.acc = 0; this.landedFree = false;
      this.audio.suspend(false);
      this.setState('FLYING');
      this._syncAircraft(0.016);
    }

    pause() { if (this.state === 'FLYING') { this.setState('PAUSED'); this.audio.suspend(true); this.input.reset(); } }
    resume() { if (this.state === 'PAUSED') { this.touch.calibrate(); this.setState('FLYING'); this.audio.suspend(false); this.last = performance.now(); } }
    togglePause() { if (this.state === 'FLYING') this.pause(); else if (this.state === 'PAUSED') this.resume(); }
    toggleDebug() { if (!this.hud) return; this.hud.setDebug(!this.hud.dbgOn); }
    cycleCamera() {
      if (this.state === 'MENU' || this.state === 'LOADING') return;
      const m = this.camCtl.cycle();
      this.aircraft.setCockpitView(m === 'cockpit');
    }

    // ------------------------------------------------------------ события физики
    _onTouchdown(td) {
      this.audio.touchdown(td.vn > 2.8);
      this.effects.puff(this.phys.pos, td.vn > 1.5 ? 2 : 1);
      if (!this.phys.crashed) this.pending = td;
    }

    _onCrash(reason) {
      if (this.state === 'CRASHED') return;
      const p = this.phys;
      this.setState('CRASHED');
      this.audio.crash();
      this.effects.crash(p.pos, p.vel);
      this.aircraft.group.visible = false;
      this.camCtl.crashPoint.copy(p.pos);
      this.camCtl.override = 'crash';
      this.mission.activeRing();
      const rows = [[LA.t('f_cps'), `${this.mission.completed} / ${this.mission.n}`], [LA.t('m_time'), U.formatTime(this.mission.elapsed)]];
      clearTimeout(this.resultTimer);
      this.resultTimer = setTimeout(() => {
        if (this.state !== 'CRASHED') return;
        this._showResult('crashed', LA.t('r_crashed'), LA.t('cr_' + reason), rows, { label: LA.t('r_restart'), fn: () => this.restart() });
      }, 1500);
    }

    _ratingKey(vn) { return vn < 1.0 ? 'l_smooth' : vn < 2.2 ? 'l_good' : vn < 3.8 ? 'l_firm' : 'l_hard'; }

    _onLanded() {
      const p = this.phys, td = this.pending || p.lastTouchdown || { vn: 0 };
      const paved = p.onPaved;
      const complete = this.mission.landed(paved);
      this.setState('LANDED');
      this.audio.checkpoint();
      const imp = this.settings.units === 'imperial';
      const vs = imp ? Math.round(td.vn * 196.85) + ' ' + LA.t('u_fpm') : td.vn.toFixed(1) + ' ' + LA.t('u_ms');
      const rating = LA.t(this._ratingKey(td.vn));
      const cont = { label: LA.t('l_continue'), fn: () => this.continueFlight() };
      const again = { label: LA.t('l_again'), fn: () => this.restart() };
      if (complete) {
        this._showResult('complete', LA.t('f_title'), '', [
          [LA.t('f_time'), U.formatTime(this.mission.elapsed)], [LA.t('f_cps'), `${this.mission.completed} / ${this.mission.n}`], [LA.t('f_landing'), rating + ' · ' + vs],
        ], again, cont);
      } else {
        this._showResult('landed', LA.t('l_title'), paved ? rating : LA.t('t_land_away'), [
          [LA.t('l_vs'), vs], [LA.t('l_runway'), LA.t(paved ? 'l_runway' : 'l_offrunway')],
        ], cont, again);
      }
    }

    continueFlight() {
      if (this.state !== 'LANDED') return;
      this.pending = null; this.stopT = 0; this.landedFree = true;
      this.setState('FLYING');
      this.last = performance.now();
    }

    // ------------------------------------------------------------ цикл
    _syncAircraft(dt) {
      const p = this.phys, a = this.aircraft;
      a.group.position.copy(p.pos);
      a.group.quaternion.copy(p.quat);
      a.update(dt, p, this.input ? this.input.axes : { pitch: 0, roll: 0, yaw: 0 }, this.time);
    }

    _status() {
      const p = this.phys;
      if (p.crashed) return 'crashed';
      if (this.state === 'LANDED') return 'landed';
      if (p.stalled && !p.grounded) return 'stall';
      if (p.grounded) return !p.hasFlown && p.groundspeed > 12 && p.throttle > 0.5 ? 'takeoff' : 'ground';
      if (this.liftoffT !== null && this.time - this.liftoffT < 14 && p.agl < 150) return 'takeoff';
      return 'flying';
    }

    _warning() {
      const p = this.phys;
      if (p.crashed || p.grounded) return '';
      if (p.stalled) return LA.t('w_stall');
      const B = Geo.bounds;
      const dOut = Math.max(B.xmin - p.pos.x, p.pos.x - B.xmax, B.zmin - p.pos.z, p.pos.z - B.zmax, 0);
      if (dOut > 0) return LA.t('w_range');
      if (p.airspeed > 25) {
        const R = Geo.runway;
        const nearAirport = Math.hypot(p.pos.x - R.cx, p.pos.z - R.cz) < 3200 && p.agl < 220;
        if (!nearAirport) {
          for (const t of [2, 4, 6]) {
            const gh = Geo.groundHeight(p.pos.x + p.vel.x * t, p.pos.z + p.vel.z * t);
            if (p.pos.y + p.vel.y * t < gh + (t < 5 ? 14 : 8)) return LA.t('w_pull');
          }
        }
      }
      if (p.stallWarn) return LA.t('w_stallwarn');
      return '';
    }

    _fmtDist(m) {
      if (this.settings.units === 'imperial') return (m / 1852).toFixed(1) + ' nm';
      return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
    }

    _hudData() {
      const p = this.phys, m = this.mission;
      const stKey = this._status();
      const tgt = new T.Vector3();
      m.targetPoint(tgt);
      const bearing = U.wrap360((Math.atan2(tgt.x - p.pos.x, -(tgt.z - p.pos.z)) * 180) / Math.PI);
      const n = m.n;
      let prog = '';
      for (let i = 0; i < n; i++) prog += i < m.completed ? '●' : '○';
      const cname = { chase: 'cam_chase', cockpit: 'cam_cockpit', cinematic: 'cam_cine' }[this.camCtl.mode];
      const dbg = this.hud.dbgOn ? [
        `FPS ${this.fps.toFixed(0)}  state ${this.state}  ground ${p.grounded}  stall ${p.stalled}  crash ${p.crashed ? p.crashReason : 'no'}`,
        `pos  ${p.pos.x.toFixed(0)}, ${p.pos.y.toFixed(0)}, ${p.pos.z.toFixed(0)}  agl ${p.agl.toFixed(0)}`,
        `vel  ${p.vel.x.toFixed(1)}, ${p.vel.y.toFixed(1)}, ${p.vel.z.toFixed(1)}`,
        `IAS ${p.airspeed.toFixed(1)} m/s  GS ${p.groundspeed.toFixed(1)}  VS ${p.vsi.toFixed(1)}`,
        `pitch ${p.pitchDeg.toFixed(1)}  roll ${p.bankDeg.toFixed(1)}  hdg ${p.headingDeg.toFixed(0)}`,
        `AoA ${(p.alpha / U.DEG).toFixed(1)}°  beta ${(p.beta / U.DEG).toFixed(1)}°  target ${(p.alphaTarget / U.DEG).toFixed(1)}°`,
        `lift ${(p.lift / 1000).toFixed(1)} kN  drag ${(p.drag / 1000).toFixed(2)} kN  thrust ${(p.thrust / 1000).toFixed(2)} kN  g ${p.gLoad.toFixed(2)}`,
        `throttle ${(p.throttle * 100).toFixed(0)}%  rpm ${p.rpm.toFixed(0)}  surface ${p.surface}  col ${p.collisionState}`,
        `buildings ${this.world.buildingCount}  calls ${this.renderer.info.render.calls}  tris ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k  nan ${p.nanRecoveries}`,
      ].join('\n') : '';
      return {
        airspeed: p.airspeed, alt: p.pos.y, vsi: p.vsi, heading: p.headingDeg, throttle: p.throttle,
        pitch: p.pitchDeg, bank: p.bankDeg, statusKey: stKey, statusText: LA.t('st_' + stKey === 'st_ground' ? 'st_ground' : 'st_' + stKey),
        warning: this._warning(), cameraName: LA.t(cname), brake: this.input.brake, assist: this.settings.assist,
        missionStep: m.finished ? LA.t('m_done') : LA.t(m.stepKey()), missionDist: m.finished ? '—' : this._fmtDist(m.distanceTo(p.pos)),
        missionTime: U.formatTime(m.elapsed), missionProg: prog, targetBearing: m.finished ? null : bearing, debug: dbg,
      };
    }

    _frame(now) {
      requestAnimationFrame((t) => this._frame(t));
      let raw = (now - this.last) / 1000;
      this.last = now;
      if (!Number.isFinite(raw) || raw < 0) raw = 0.016;
      const dt = Math.min(raw, 0.05);
      this.time += dt;
      this.fps = this.fps * 0.93 + (1 / Math.max(raw, 0.0005)) * 0.07;
      const st = this.state;
      const p = this.phys;

      if (st === 'FLYING') {
        this.touch.update(this.throttle);
        this.input.update(dt, true);
        this.throttle = U.clamp(this.throttle + this.input.throttleRate * 0.45 * dt, 0, 1);
        const c = this.ctl;
        c.pitch = this.input.axes.pitch; c.roll = this.input.axes.roll; c.yaw = this.input.axes.yaw;
        c.throttle = this.throttle; c.brake = this.input.brake; c.assist = this.settings.assist;
        this.acc += dt;
        let n = 0;
        while (this.acc >= STEP && n < 8) {
          p.step(STEP, c);
          this.acc -= STEP; n++;
          if (p.events.length) {
            for (const e of p.events) { if (e.type === 'touchdown') this._onTouchdown(e); else if (e.type === 'crash') this._onCrash(e.reason); }
            p.events.length = 0;
          }
          if (p.crashed) break;
        }
        if (n >= 8) this.acc = 0;
        // вылет за зону полёта
        const B = Geo.bounds;
        if (!p.crashed && Math.max(B.xmin - p.pos.x, p.pos.x - B.xmax, B.zmin - p.pos.z, p.pos.z - B.zmax) > 4200) { p._crash('range'); this._onCrash('range'); }
        // взлёт / касание
        if (this.prevGrounded && !p.grounded && p.hasFlown) this.liftoffT = this.time;
        this.prevGrounded = p.grounded;
        // завершение посадки: стоим на земле почти неподвижно
        if (!p.crashed && this.state === 'FLYING' && this.pending) {
          if (p.grounded && p.groundspeed < 2.2) { this.stopT += dt; if (this.stopT > 1.0) this._onLanded(); }
          else { this.stopT = 0; if (!p.grounded && p.airTime > 0.6) this.pending = null; }
        }
        // миссия
        if (this.state === 'FLYING') {
          for (const e of this.mission.update(dt, p.pos, p, true)) {
            if (e.type === 'takeoff') this.hud.toast(LA.t('t_airborne'), 'good');
            else if (e.type === 'checkpoint') { this.hud.toast(`${LA.t('t_cp')} ${e.index}/${this.mission.n} — ${LA.t(e.key)}`, 'good'); this.audio.checkpoint(); }
            else if (e.type === 'missed' && this.time - this.missT > 4) { this.missT = this.time; this.hud.toast(LA.t('t_missed'), 'warn'); }
          }
        }
      } else if (st === 'MENU') {
        this.mission.update(dt, p.pos, p, false);
      } else if (st === 'CRASHED') {
        this.mission.update(dt, p.pos, p, false);
      }

      // камера, мир, анимации
      if (st !== 'PAUSED' && st !== 'LOADING') {
        const fov = U.clamp((p.airspeed - 40) / 50, 0, 1) * 5;
        this.camCtl.update(dt, p, fov);
        this._syncAircraft(dt);
        if (this.camCtl.mode === 'chase' && p.rpm > 1000 && this.camCtl.override === null && st === 'FLYING') this.aircraft.group.position.y += (Math.random() - 0.5) * 0.025;
        this.world.update(dt, this.camera, p.pos);
        this.effects.update(dt);
        this.audio.update(p.rpm, p.airspeed, p.stallWarn && st === 'FLYING', st === 'FLYING');
      }
      if (st === 'FLYING' || st === 'PAUSED' || st === 'CRASHED' || st === 'LANDED') this.hud.update(this._hudData());

      this.renderer.render(this.scene, this.camera);
      this._adaptQuality(raw, st);
    }

    /** Если FPS стабильно низкий — сначала выключаем тени, затем снижаем разрешение. */
    _adaptQuality(raw, st) {
      if (window.__LA_NOADAPT || st !== 'FLYING') { this.lowFpsT = 0; return; }
      if (this.fps < 32) this.lowFpsT += raw; else this.lowFpsT = Math.max(0, this.lowFpsT - raw);
      if (this.lowFpsT > 4) {
        this.lowFpsT = 0;
        if (this.perfStage === 0 && this.settings.shadows) { this.perfStage = 1; this.settings.shadows = false; this._applySettings(false); this.hud.toast(LA.t('perf_shadows'), 'warn'); }
        else if (this.perfStage <= 1) { this.perfStage = 2; this.renderer.setPixelRatio(Math.max(0.75, (this.renderer.getPixelRatio() || 1) * 0.75)); this.hud.toast(LA.t('perf_res'), 'warn'); }
      }
    }
  }

  LA.FlightSimulator = FlightSimulator;
})();
