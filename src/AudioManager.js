/*
 * AudioManager.js — процедурный звук на Web Audio API (никаких файлов):
 * двигатель (зависит от оборотов), ветер (от скорости), сигнал срыва, звон контрольной точки, касание, авария.
 * Контекст создаётся только после клика (требование автоплея). Если звук недоступен — игра работает молча.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  class AudioManager {
    constructor() {
      this.ctx = null; this.ok = false; this.muted = false; this.master = null;
    }

    /** Вызывать из обработчика пользовательского жеста. */
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = (this.ctx = new AC());
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.8;
        this.master.connect(ctx.destination);
        // двигатель: два пилообразных осциллятора + низкий
        this.eng = ctx.createGain(); this.eng.gain.value = 0.0;
        this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
        this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
        this.o2 = ctx.createOscillator(); this.o2.type = 'sawtooth';
        this.o3 = ctx.createOscillator(); this.o3.type = 'square';
        const g3 = ctx.createGain(); g3.gain.value = 0.35;
        this.o1.connect(this.engFilter); this.o2.connect(this.engFilter); this.o3.connect(g3); g3.connect(this.engFilter);
        this.engFilter.connect(this.eng); this.eng.connect(this.master);
        this.o1.start(); this.o2.start(); this.o3.start();
        // ветер: шум через полосовой фильтр
        const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this.wind = ctx.createBufferSource(); this.wind.buffer = buf; this.wind.loop = true;
        this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 600; this.windF.Q.value = 0.6;
        this.windG = ctx.createGain(); this.windG.gain.value = 0;
        this.wind.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
        this.wind.start();
        // сигнал срыва
        this.horn = ctx.createOscillator(); this.horn.type = 'square'; this.horn.frequency.value = 820;
        this.hornG = ctx.createGain(); this.hornG.gain.value = 0;
        this.horn.connect(this.hornG); this.hornG.connect(this.master); this.horn.start();
        this.ok = true;
      } catch (e) { this.ok = false; }
    }

    setMuted(m) {
      this.muted = m;
      if (this.ok) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
    }

    suspend(s) {
      if (!this.ok) return;
      if (s) this.ctx.suspend(); else this.ctx.resume();
    }

    /** rpm 700..2700, speed м/с, warn — срыв рядом, active — звук включён */
    update(rpm, speed, stallWarn, active) {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      const f = (rpm / 60) * 3; // 6-цилиндровый 4-тактный
      this.o1.frequency.setTargetAtTime(f, t, 0.05);
      this.o2.frequency.setTargetAtTime(f * 1.007, t, 0.05);
      this.o3.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.engFilter.frequency.setTargetAtTime(380 + (rpm - 700) * 0.55, t, 0.08);
      this.eng.gain.setTargetAtTime(active ? 0.11 + (rpm - 700) / 2000 * 0.12 : 0, t, 0.1);
      const w = Math.min(speed / 90, 1);
      this.windG.gain.setTargetAtTime(active ? w * w * 0.38 : 0, t, 0.12);
      this.windF.frequency.setTargetAtTime(300 + w * 1700, t, 0.12);
      const beep = stallWarn && active && Math.floor(t * 5) % 2 === 0;
      this.hornG.gain.setTargetAtTime(beep ? 0.05 : 0, t, 0.01);
    }

    _tone(freq, start, dur, type, gain) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(gain, start + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g); g.connect(this.master); o.start(start); o.stop(start + dur + 0.05);
    }

    checkpoint() {
      if (!this.ok) return;
      const t = this.ctx.currentTime;
      this._tone(660, t, 0.28, 'sine', 0.22); this._tone(880, t + 0.1, 0.3, 'sine', 0.2); this._tone(1320, t + 0.2, 0.45, 'sine', 0.16);
    }

    _noiseBurst(dur, freq, gain, sweepTo) {
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + dur + 0.05);
    }

    touchdown(hard) {
      if (!this.ok) return;
      this._noiseBurst(0.18 + (hard ? 0.12 : 0), 900, hard ? 0.7 : 0.4, 120);
      const t = this.ctx.currentTime;
      this._tone(hard ? 70 : 90, t, 0.18, 'sine', hard ? 0.5 : 0.3);
    }

    crash() {
      if (!this.ok) return;
      this._noiseBurst(1.6, 2400, 1.0, 80);
      const t = this.ctx.currentTime;
      this._tone(55, t, 1.2, 'sine', 0.6);
      this._tone(38, t + 0.05, 1.5, 'sawtooth', 0.25);
    }
  }
  LA.AudioManager = AudioManager;
})();
