/*
 * Effects.js — лёгкие частицы: огонь/дым при аварии, обломки (InstancedMesh), пыль при касании.
 * Пул фиксированного размера — никаких аллокаций в кадре. Без графических подробностей.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const T = globalThis.THREE;
  const N = 260, ND = 36;

  class Effects {
    constructor(scene) {
      this.scene = scene;
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const tex = new T.CanvasTexture(cv);
      this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
      this.life = new Float32Array(N); this.maxLife = new Float32Array(N);
      this.size = new Float32Array(N); this.alpha = new Float32Array(N); this.col = new Float32Array(N * 3);
      this.kind = new Uint8Array(N); // 0 огонь, 1 дым, 2 пыль
      this.geo = new T.BufferGeometry();
      this.geo.setAttribute('position', new T.BufferAttribute(this.pos, 3));
      this.geo.setAttribute('aSize', new T.BufferAttribute(this.size, 1));
      this.geo.setAttribute('aAlpha', new T.BufferAttribute(this.alpha, 1));
      this.geo.setAttribute('aColor', new T.BufferAttribute(this.col, 3));
      const mat = new T.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { map: { value: tex }, scale: { value: 600 } },
        vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float scale; varying float vA; varying vec3 vC;
          void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * scale / max(-mv.z, 1.0); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
          void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, vA * t.a); }`,
      });
      this.points = new T.Points(this.geo, mat);
      this.points.frustumCulled = false;
      scene.add(this.points);
      this.cursor = 0;
      // обломки
      this.deb = new T.InstancedMesh(new T.BoxGeometry(1, 0.35, 0.6), new T.MeshLambertMaterial({ color: 0xffffff }), ND);
      this.deb.frustumCulled = false; this.deb.visible = false;
      this.dpos = new Float32Array(ND * 3); this.dvel = new Float32Array(ND * 3); this.drot = new Float32Array(ND * 3); this.dspin = new Float32Array(ND * 3); this.dsc = new Float32Array(ND);
      const cols = [0xf2f2ee, 0xf59414, 0x3a3d42, 0xc7cbd0];
      const c = new T.Color();
      for (let i = 0; i < ND; i++) this.deb.setColorAt(i, c.setHex(cols[i % cols.length]));
      scene.add(this.deb);
      this.m = new T.Matrix4(); this.q = new T.Quaternion(); this.e = new T.Euler(); this.s = new T.Vector3(); this.p = new T.Vector3();
      this.debrisT = 0;
      this.fireT = 0; this.fireOn = false; this.firePos = new T.Vector3();
      this.clear();
    }

    clear() {
      this.life.fill(0); this.alpha.fill(0); this.size.fill(0);
      this.deb.visible = false; this.debrisT = 0; this.fireOn = false;
      this.geo.attributes.aAlpha.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
    }

    _emit(kind, x, y, z, vx, vy, vz, life, size, r, g, b) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % N;
      this.kind[i] = kind; this.life[i] = life; this.maxLife[i] = life; this.size[i] = size;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    }

    crash(p, vel) {
      for (let i = 0; i < 46; i++) this._emit(0, p.x + (Math.random() - 0.5) * 4, p.y + 1 + Math.random() * 2, p.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 14 + vel.x * 0.1, 4 + Math.random() * 12, (Math.random() - 0.5) * 14 + vel.z * 0.1, 0.9 + Math.random() * 0.9, 20 + Math.random() * 18, 1, 0.55 + Math.random() * 0.3, 0.12);
      this.fireOn = true; this.fireT = 0; this.firePos.copy(p);
      this.deb.visible = true; this.debrisT = 0;
      for (let i = 0; i < ND; i++) {
        this.dpos[i * 3] = p.x; this.dpos[i * 3 + 1] = p.y + 1; this.dpos[i * 3 + 2] = p.z;
        this.dvel[i * 3] = (Math.random() - 0.5) * 30 + vel.x * 0.15; this.dvel[i * 3 + 1] = 5 + Math.random() * 18; this.dvel[i * 3 + 2] = (Math.random() - 0.5) * 30 + vel.z * 0.15;
        this.drot[i * 3] = Math.random() * 6; this.drot[i * 3 + 1] = Math.random() * 6; this.drot[i * 3 + 2] = Math.random() * 6;
        this.dspin[i * 3] = (Math.random() - 0.5) * 12; this.dspin[i * 3 + 1] = (Math.random() - 0.5) * 12; this.dspin[i * 3 + 2] = (Math.random() - 0.5) * 12;
        this.dsc[i] = 0.5 + Math.random() * 1.6;
      }
    }

    puff(p, strength) {
      const n = strength > 1 ? 14 : 8;
      for (let i = 0; i < n; i++) this._emit(2, p.x + (Math.random() - 0.5) * 3, p.y - 1.2, p.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6, 0.8 + Math.random() * 2, (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.6, 7 + Math.random() * 6, 0.82, 0.8, 0.76);
    }

    update(dt) {
      if (this.fireOn) {
        this.fireT += dt;
        if (this.fireT < 14) {
          const k = this.fireT < 3 ? 2 : 1;
          for (let i = 0; i < k; i++) this._emit(1, this.firePos.x + (Math.random() - 0.5) * 5, this.firePos.y + 2, this.firePos.z + (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 2 + 1.5, 6 + Math.random() * 4, (Math.random() - 0.5) * 2, 3 + Math.random() * 2, 16 + Math.random() * 14, 0.12, 0.12, 0.13);
          if (this.fireT < 6 && Math.random() < 0.6) this._emit(0, this.firePos.x + (Math.random() - 0.5) * 4, this.firePos.y + 1, this.firePos.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, 5 + Math.random() * 5, (Math.random() - 0.5) * 3, 0.7 + Math.random() * 0.5, 14 + Math.random() * 10, 1, 0.5 + Math.random() * 0.3, 0.1);
        } else this.fireOn = false;
      }
      for (let i = 0; i < N; i++) {
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        this.life[i] -= dt;
        const t = 1 - this.life[i] / this.maxLife[i];
        const k = this.kind[i];
        this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.vel[i * 3 + 1] += (k === 0 ? 2 : k === 1 ? 1.2 : 0.2) * dt;
        this.size[i] *= 1 + (k === 2 ? 0.6 : 0.4) * dt;
        if (k === 0) { this.alpha[i] = (1 - t) * 0.9; this.col[i * 3 + 1] = Math.max(0.1, this.col[i * 3 + 1] - 0.5 * dt); }
        else if (k === 1) this.alpha[i] = Math.sin(Math.min(t, 1) * Math.PI) * 0.5;
        else this.alpha[i] = (1 - t) * 0.45;
      }
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true;
      if (this.deb.visible) {
        this.debrisT += dt;
        for (let i = 0; i < ND; i++) {
          const gh = LA.Geo.groundHeight(this.dpos[i * 3], this.dpos[i * 3 + 2]) + 0.2;
          if (this.dpos[i * 3 + 1] > gh) {
            this.dvel[i * 3 + 1] -= 9.81 * dt;
            for (let k = 0; k < 3; k++) { this.dpos[i * 3 + k] += this.dvel[i * 3 + k] * dt; this.drot[i * 3 + k] += this.dspin[i * 3 + k] * dt; }
          } else { this.dpos[i * 3 + 1] = gh; this.dvel[i * 3] *= 0.9; this.dvel[i * 3 + 2] *= 0.9; this.dpos[i * 3] += this.dvel[i * 3] * dt; this.dpos[i * 3 + 2] += this.dvel[i * 3 + 2] * dt; this.dvel[i * 3 + 1] = 0; }
          this.q.setFromEuler(this.e.set(this.drot[i * 3], this.drot[i * 3 + 1], this.drot[i * 3 + 2]));
          this.m.compose(this.p.set(this.dpos[i * 3], this.dpos[i * 3 + 1], this.dpos[i * 3 + 2]), this.q, this.s.setScalar(this.dsc[i]));
          this.deb.setMatrixAt(i, this.m);
        }
        this.deb.instanceMatrix.needsUpdate = true;
      }
    }
  }
  LA.Effects = Effects;
})();
