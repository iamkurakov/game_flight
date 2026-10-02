/*
 * Input.js — клавиатура. Оси управления сглаживаются (плавно нарастают и возвращаются в ноль),
 * чтобы игра не была «дёрганой». Разовые действия (камера, пауза, ...) отдаются через колбэки.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const U = LA.Utils;
  // клавиши, для которых отключаем стандартное поведение браузера
  const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Tab', 'F3',
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyC', 'KeyR', 'KeyP', 'KeyX', 'KeyZ', 'KeyM', 'KeyT', 'KeyU', 'KeyG', 'KeyL', 'KeyI', 'Escape']);

  class Input {
    constructor(handlers, isGameActive) {
      this.keys = new Set();
      this.axes = { pitch: 0, roll: 0, yaw: 0 };
      this.throttleRate = 0; // -1..1 за секунду
      this.brake = false;
      this.invertPitch = false;
      this.h = handlers;
      this.active = isGameActive;
      window.addEventListener('keydown', (e) => this._down(e));
      window.addEventListener('keyup', (e) => { this.keys.delete(e.code); if (this.active() && BLOCK.has(e.code)) e.preventDefault(); });
      window.addEventListener('blur', () => this.keys.clear());
    }

    _down(e) {
      const c = e.code;
      if (this.active() && BLOCK.has(c)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(c);
      const h = this.h;
      switch (c) {
        case 'KeyC': h.camera && h.camera(); break;
        case 'KeyR': h.restart && h.restart(); break;
        case 'KeyP': case 'Escape': h.pause && h.pause(); break;
        case 'F3': h.debug && h.debug(); break;
        case 'KeyM': h.mute && h.mute(); break;
        case 'KeyT': h.assist && h.assist(); break;
        case 'KeyU': h.units && h.units(); break;
        case 'KeyG': h.shadows && h.shadows(); break;
        case 'KeyL': h.lang && h.lang(); break;
        case 'KeyI': h.invert && h.invert(); break;
      }
    }

    has(...codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }

    /** Вызывается каждый кадр. */
    update(dt, enabled) {
      let p = 0, r = 0, y = 0, th = 0;
      if (enabled) {
        // S / ↓ = на себя (нос вверх), W / ↑ = от себя (нос вниз)
        p = (this.has('KeyS', 'ArrowDown') ? 1 : 0) - (this.has('KeyW', 'ArrowUp') ? 1 : 0);
        if (this.invertPitch) p = -p;
        r = (this.has('KeyD', 'ArrowRight') ? 1 : 0) - (this.has('KeyA', 'ArrowLeft') ? 1 : 0);
        y = (this.has('KeyE') ? 1 : 0) - (this.has('KeyQ') ? 1 : 0);
        th = (this.has('ShiftLeft', 'ShiftRight', 'KeyX', 'PageUp') ? 1 : 0) - (this.has('ControlLeft', 'ControlRight', 'KeyZ', 'PageDown') ? 1 : 0);
        this.brake = this.has('Space');
      } else this.brake = false;
      const a = this.axes;
      const move = (v, t, up, down) => {
        const rate = t === 0 || Math.sign(t) !== Math.sign(v) && v !== 0 ? down : up;
        return v + U.clamp(t - v, -rate * dt, rate * dt);
      };
      a.pitch = move(a.pitch, p, 2.6, 6);
      a.roll = move(a.roll, r, 3.2, 6);
      a.yaw = move(a.yaw, y, 3.5, 7);
      this.throttleRate = th;
    }

    reset() { this.axes.pitch = this.axes.roll = this.axes.yaw = 0; this.throttleRate = 0; this.brake = false; }
  }
  LA.Input = Input;
})();
