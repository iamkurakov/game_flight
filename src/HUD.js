/*
 * HUD.js — приборы и сообщения поверх 3D (DOM + два маленьких canvas: авиагоризонт и компасная лента).
 * Обновляются только изменившиеся тексты, чтобы не тратить кадры на layout.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const U = LA.Utils;
  const $ = (id) => document.getElementById(id);

  class HUD {
    constructor() {
      this.el = {
        root: $('hud'), spd: $('hSpd'), spdU: $('hSpdU'), alt: $('hAlt'), altU: $('hAltU'), vs: $('hVs'), vsU: $('hVsU'), hdg: $('hHdg'),
        thrBar: $('hThrBar'), thrTxt: $('hThrTxt'), status: $('hStatus'), warn: $('hWarn'), toasts: $('toasts'),
        mStep: $('mStep'), mDist: $('mDist'), mTime: $('mTime'), mProg: $('mProg'), mNextLbl: $('mNextLbl'),
        dbg: $('debugPanel'), horizon: $('hHorizon'), tape: $('hTape'), cam: $('hCam'), brk: $('hBrake'), assist: $('hAssist'),
      };
      this.cache = {};
      this.hctx = this.el.horizon.getContext('2d');
      this.tctx = this.el.tape.getContext('2d');
      this.units = 'imperial';
      this.dbgOn = false;
      this.toastQ = [];
    }

    _set(key, el, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.textContent = v; } }

    setVisible(v) { this.el.root.style.display = v ? 'block' : 'none'; }

    toast(text, kind) {
      const d = document.createElement('div');
      d.className = 'toast' + (kind ? ' ' + kind : '');
      d.textContent = text;
      this.el.toasts.appendChild(d);
      while (this.el.toasts.children.length > 3) this.el.toasts.removeChild(this.el.toasts.firstChild);
      setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 600); }, 3200);
    }
    clearToasts() { this.el.toasts.innerHTML = ''; }

    /** d — снимок состояния из FlightSimulator. */
    update(d) {
      const E = this.el, imp = this.units === 'imperial';
      const spd = imp ? d.airspeed * 1.94384 : d.airspeed * 3.6;
      this._set('spd', E.spd, String(Math.round(spd)));
      this._set('spdU', E.spdU, LA.t(imp ? 'u_kt' : 'u_kmh'));
      const alt = imp ? d.alt * 3.28084 : d.alt;
      this._set('alt', E.alt, String(Math.round(alt)));
      this._set('altU', E.altU, LA.t(imp ? 'u_ft' : 'u_m'));
      const vs = imp ? d.vsi * 196.85 : d.vsi;
      const vsr = imp ? Math.round(vs / 10) * 10 : Math.round(vs * 10) / 10;
      this._set('vs', E.vs, (vsr > 0 ? '+' : '') + (imp ? vsr : vsr.toFixed(1)));
      this._set('vsU', E.vsU, LA.t(imp ? 'u_fpm' : 'u_ms'));
      this._set('hdg', E.hdg, String(Math.round(d.heading) % 360).padStart(3, '0') + '°');
      this._set('thr', E.thrTxt, Math.round(d.throttle * 100) + '%');
      E.thrBar.style.transform = 'scaleY(' + d.throttle.toFixed(3) + ')';
      this._set('status', E.status, d.statusText);
      E.status.dataset.s = d.statusKey;
      this._set('warn', E.warn, d.warning || '');
      E.warn.style.visibility = d.warning ? 'visible' : 'hidden';
      this._set('cam', E.cam, d.cameraName);
      E.brk.style.opacity = d.brake ? 1 : 0.25;
      E.assist.textContent = 'ASSIST ' + (d.assist ? 'ON' : 'OFF');
      E.assist.style.opacity = d.assist ? 0.85 : 0.5;
      // миссия
      this._set('mStep', E.mStep, d.missionStep);
      this._set('mDist', E.mDist, d.missionDist);
      this._set('mTime', E.mTime, d.missionTime);
      this._set('mProg', E.mProg, d.missionProg);
      this._horizon(d.pitch, d.bank);
      this._tape(d.heading, d.targetBearing);
      if (this.dbgOn) E.dbg.textContent = d.debug;
    }

    setDebug(on) { this.dbgOn = on; this.el.dbg.style.display = on ? 'block' : 'none'; }

    _horizon(pitch, bank) {
      const c = this.hctx, W = 132, H = 132, r = 60;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
      c.save();
      c.translate(W / 2, H / 2);
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.clip();
      c.rotate((bank * Math.PI) / 180);
      const py = (pitch * 2.2);
      c.fillStyle = 'rgba(70,130,200,0.55)'; c.fillRect(-100, -200 + py, 200, 200);
      c.fillStyle = 'rgba(120,88,52,0.62)'; c.fillRect(-100, py, 200, 200);
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(-100, py); c.lineTo(100, py); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '9px sans-serif'; c.textAlign = 'center';
      for (let p = -30; p <= 30; p += 10) {
        if (p === 0) continue;
        const y = py - p * 2.2, w = p % 20 === 0 ? 22 : 12;
        c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke();
        if (p % 20 === 0) { c.fillText(String(Math.abs(p)), -w - 9, y + 3); c.fillText(String(Math.abs(p)), w + 9, y + 3); }
      }
      c.restore();
      c.save(); c.translate(W / 2, H / 2);
      c.strokeStyle = 'rgba(244,239,230,0.55)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
      // шкала крена
      c.rotate((bank * Math.PI) / 180);
      c.fillStyle = '#ffb02e';
      c.beginPath(); c.moveTo(0, -r + 1); c.lineTo(-5, -r + 10); c.lineTo(5, -r + 10); c.closePath(); c.fill();
      c.restore();
      // силуэт самолёта
      c.save(); c.translate(W / 2, H / 2);
      c.strokeStyle = '#ffb02e'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-28, 0); c.lineTo(-10, 0); c.lineTo(-6, 6); c.moveTo(28, 0); c.lineTo(10, 0); c.lineTo(6, 6); c.stroke();
      c.fillStyle = '#ffb02e'; c.fillRect(-2, -2, 4, 4);
      c.restore();
    }

    _tape(hdg, tgt) {
      const c = this.tctx, W = 520, H = 40, ppd = 4.2; // пикселей на градус
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, W, H);
      c.font = '600 13px "Bahnschrift","Oswald","Arial Narrow",sans-serif'; c.textAlign = 'center';
      c.fillStyle = 'rgba(244,239,230,0.9)'; c.strokeStyle = 'rgba(244,239,230,0.7)'; c.lineWidth = 1;
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      for (let a = Math.floor(hdg - 65); a <= Math.ceil(hdg + 65); a++) {
        if (a % 5 !== 0) continue;
        const x = W / 2 + (a - hdg) * ppd;
        const n = ((a % 360) + 360) % 360;
        const big = n % 10 === 0;
        c.beginPath(); c.moveTo(x, H - 4); c.lineTo(x, H - (big ? 14 : 9)); c.stroke();
        if (n % 30 === 0) c.fillText(names[n] !== undefined ? names[n] : String(n / 10).padStart(2, '0'), x, H - 20);
      }
      c.fillStyle = '#ffb02e';
      c.beginPath(); c.moveTo(W / 2, 3); c.lineTo(W / 2 - 6, -4); c.lineTo(W / 2 + 6, -4); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(W / 2, 4); c.lineTo(W / 2 - 6, 13); c.lineTo(W / 2 + 6, 13); c.closePath(); c.fill();
      if (tgt !== null && tgt !== undefined) {
        let d = ((tgt - hdg + 540) % 360) - 180;
        const lim = 62;
        const x = W / 2 + U.clamp(d, -lim, lim) * ppd;
        c.fillStyle = '#4be3ff';
        c.beginPath(); c.moveTo(x, H - 2); c.lineTo(x - 7, H - 14); c.lineTo(x, H - 22); c.lineTo(x + 7, H - 14); c.closePath(); c.fill();
      }
    }
  }
  LA.HUD = HUD;
})();
