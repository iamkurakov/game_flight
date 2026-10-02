/*
 * TouchControls.js — управление на телефоне/планшете.
 * Наклон устройства (DeviceOrientation) → крен и тангаж; ползунок газа слева; кнопки тормоза, камеры, паузы и «выровнять».
 * Нейтраль по тангажу калибруется в момент старта (как держит игрок), нейтраль по крену — горизонт.
 * Если датчик наклона недоступен, работает запасной вариант: перетаскивание пальцем по экрану как джойстик.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const U = LA.Utils;
  const D2R = Math.PI / 180;
  const ROLL_FULL = 28, PITCH_FULL = 22, DEAD = 2.5; // градусы наклона для полного отклонения / мёртвая зона
  const $ = (id) => document.getElementById(id);

  class TouchControls {
    constructor(h) {
      this.h = h; // { throttle(v), camera(), pause() }
      this.enabled = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      this.pitch = 0; this.roll = 0; this.brake = false;
      this.tiltOk = false; this.raw = null; this.neutral = null;
      this.drag = null; // запасной «джойстик»
      if (!this.enabled) return;
      document.documentElement.classList.add('touch');
      window.addEventListener('deviceorientation', (e) => this._orient(e));
      const recal = () => { this.neutral = null; };
      if (screen.orientation) screen.orientation.addEventListener('change', recal);
      window.addEventListener('orientationchange', recal);
      this._bind();
    }

    /** Запрос разрешения на датчики (iOS 13+) — вызывать только из обработчика нажатия. */
    requestPermission() {
      const DO = window.DeviceOrientationEvent;
      if (DO && typeof DO.requestPermission === 'function') return DO.requestPermission().catch(() => 'denied');
      return Promise.resolve('granted');
    }

    /** Полноэкранный режим и альбомная ориентация (где браузер позволяет) — тоже из нажатия. */
    enterFullscreen() {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req || document.fullscreenElement) return;
      try {
        const p = req.call(el, { navigationUI: 'hide' });
        if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
      } catch (e) { /* не поддерживается */ }
    }

    calibrate() { this.neutral = null; }

    _orient(e) {
      if (e.beta == null || e.gamma == null) return;
      // «верх» (против гравитации) в осях устройства для углов beta/gamma (порядок Z-X'-Y'')
      const b = e.beta * D2R, g = e.gamma * D2R;
      const ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b), uz = Math.cos(b) * Math.cos(g);
      // поворот в оси экрана с учётом ориентации (0 / 90 / 180 / 270)
      const ang = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * D2R;
      const sx = ux * Math.cos(ang) - uy * Math.sin(ang);
      const sy = ux * Math.sin(ang) + uy * Math.cos(ang);
      const roll = Math.asin(U.clamp(-sx, -1, 1)) / D2R;        // наклон «как руль»: правый край вниз → вправо
      const pitch = Math.atan2(sy, uz) / D2R;                   // 90 — экран вертикально, 0 — лежит
      this.raw = { roll, pitch };
      if (this.neutral === null) this.neutral = pitch;
      this.tiltOk = true;
    }

    _bind() {
      // газ: вертикальный ползунок
      const track = $('tThrTrack');
      const setThr = (e) => {
        const r = track.getBoundingClientRect();
        this.h.throttle(U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1));
      };
      track.addEventListener('pointerdown', (e) => { track.setPointerCapture(e.pointerId); setThr(e); e.preventDefault(); });
      track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) setThr(e); });

      const brake = $('tBrake');
      const off = () => { this.brake = false; brake.classList.remove('on'); };
      brake.addEventListener('pointerdown', (e) => { this.brake = true; brake.classList.add('on'); brake.setPointerCapture(e.pointerId); e.preventDefault(); });
      brake.addEventListener('pointerup', off); brake.addEventListener('pointercancel', off);

      const tap = (id, fn) => $(id).addEventListener('click', (e) => { fn(); e.currentTarget.blur(); });
      tap('tCam', () => this.h.camera());
      tap('tPause', () => this.h.pause());
      tap('tCal', () => this.calibrate());

      // запасной джойстик: перетаскивание по 3D-сцене, если датчика наклона нет
      const gl = $('gl');
      gl.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; });
      gl.addEventListener('pointermove', (e) => { if (this.drag && this.drag.id === e.pointerId) { this.drag.x = e.clientX; this.drag.y = e.clientY; } });
      const end = (e) => { if (this.drag && this.drag.id === e.pointerId) this.drag = null; };
      gl.addEventListener('pointerup', end); gl.addEventListener('pointercancel', end);
    }

    /** Каждый кадр: пересчитать оси и отрисовать ползунок газа. */
    update(throttle) {
      if (!this.enabled) return;
      const shape = (deg, full) => {
        const a = Math.abs(deg);
        return a < DEAD ? 0 : Math.sign(deg) * U.clamp((a - DEAD) / (full - DEAD), 0, 1);
      };
      if (this.drag) {
        const k = Math.min(window.innerWidth, window.innerHeight) * 0.22;
        this.roll = U.clamp((this.drag.x - this.drag.x0) / k, -1, 1);
        this.pitch = U.clamp((this.drag.y - this.drag.y0) / k, -1, 1); // палец вниз — «на себя»
      } else if (this.tiltOk && this.raw) {
        this.roll = shape(this.raw.roll, ROLL_FULL);
        this.pitch = shape(this.raw.pitch - this.neutral, PITCH_FULL); // верх к себе — нос вверх
      } else { this.roll = 0; this.pitch = 0; }
      $('tThrFill').style.transform = `scaleY(${throttle})`;
      $('tThrTxt').textContent = Math.round(throttle * 100) + '%';
    }

    get active() { return this.enabled && (this.tiltOk || !!this.drag); }
    reset() { this.brake = false; this.drag = null; }
  }
  LA.TouchControls = TouchControls;
})();
