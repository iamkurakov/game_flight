/*
 * World.js — строит 3D-сцену: небо, свет, рельеф с процедурной текстурой земли
 * (улицы, кварталы, парки, фривеи), океан, город кусками (chunks) с LOD, облака.
 * Ориентиры и аэропорт строятся в Landmarks.js.
 *
 * ПРОИЗВОДИТЕЛЬНОСТЬ
 *   • Здания склеены в чанки 1600×1600 м: ~240 чанков вместо десятков тысяч объектов.
 *   • У каждого чанка два уровня детализации: все здания (ближе 3.6 км) и только крупные (дальше).
 *   • Экспоненциальный туман прячет дальнюю дистанцию; тень — только вокруг самолёта.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const T = globalThis.THREE;
  const U = LA.Utils;
  const Geo = LA.Geo;

  const FOG_COLOR = 0xc4d7e8;
  const SUN_DIR = new T.Vector3(-0.58, 0.58, 0.36).normalize(); // солнце с запада-юго-запада, ~35° над горизонтом

  const sleep = () => new Promise((r) => setTimeout(r, 0));

  class World {
    constructor(scene, renderer) {
      this.scene = scene;
      this.renderer = renderer;
      this.chunks = [];
      this.sunDir = SUN_DIR.clone();
      this.time = 0;
      this.shadowsOn = true;
      this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
      this.maxTex = renderer.capabilities.maxTextureSize || 2048;
      this.animated = []; // объекты с update(dt)
    }

    async build(progress) {
      const P = progress || (() => {});
      P('terrain', 0.05);
      await sleep();
      Geo.buildGrid();
      Geo.buildLandmarkData();
      this._buildLights();
      this._buildSky();
      P('terrain', 0.15);
      await sleep();
      this.city = LA.City.generate();
      P('ground', 0.3);
      await sleep();
      this._buildGroundTexture();
      this._buildTerrain();
      this._buildOcean();
      P('city', 0.55);
      await sleep();
      this._buildFacadeTexture();
      this._buildCity();
      P('landmarks', 0.8);
      await sleep();
      this.landmarks = new LA.Landmarks(this);
      this.landmarks.build();
      this._buildClouds();
      P('done', 1);
    }

    // ------------------------------------------------------------ свет и небо
    _buildLights() {
      const s = this.scene;
      s.fog = new T.FogExp2(FOG_COLOR, 0.000092);
      this.hemi = new T.HemisphereLight(0xd6e8ff, 0x8f8368, 0.92);
      s.add(this.hemi);
      const sun = (this.sun = new T.DirectionalLight(0xfff0d8, 0.95));
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -420; c.right = 420; c.top = 420; c.bottom = -420; c.near = 10; c.far = 3200;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.6;
      s.add(sun, sun.target);
    }

    _buildSky() {
      const mat = new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false,
        uniforms: { sunDir: { value: SUN_DIR.clone() } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec3 vDir; uniform vec3 sunDir;
          void main(){
            vec3 d = normalize(vDir);
            float h = max(d.y, 0.0);
            vec3 horizon = vec3(0.77, 0.85, 0.92);
            vec3 mid = vec3(0.42, 0.64, 0.90);
            vec3 zenith = vec3(0.16, 0.38, 0.78);
            vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
            col = mix(col, zenith, smoothstep(0.18, 0.85, h));
            float s = max(dot(d, normalize(sunDir)), 0.0);
            col += vec3(1.0, 0.82, 0.55) * pow(s, 9.0) * 0.28;
            col += vec3(1.0, 0.95, 0.8) * pow(s, 900.0) * 2.0;
            col = mix(col, vec3(0.77,0.85,0.92), smoothstep(0.0, -0.06, d.y));
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      this.sky = new T.Mesh(new T.SphereGeometry(30000, 32, 16), mat);
      this.sky.renderOrder = -10;
      this.sky.frustumCulled = false;
      this.scene.add(this.sky);
    }

    _buildClouds() {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      const tex = new T.CanvasTexture(c);
      const rnd = U.mulberry32(99);
      const group = new T.Group();
      for (let i = 0; i < 34; i++) {
        const cx = (rnd() - 0.5) * 30000, cz = (rnd() - 0.5) * 26000, cy = 1500 + rnd() * 800;
        const n = 4 + Math.floor(rnd() * 5);
        for (let k = 0; k < n; k++) {
          const m = new T.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, fog: true });
          const sp = new T.Sprite(m);
          const sc = 700 + rnd() * 900;
          sp.scale.set(sc * 1.6, sc * 0.7, 1);
          sp.position.set(cx + (rnd() - 0.5) * 1400, cy + (rnd() - 0.5) * 120, cz + (rnd() - 0.5) * 900);
          group.add(sp);
        }
      }
      this.clouds = group;
      this.scene.add(group);
    }

    // ------------------------------------------------------------ текстуры
    _buildFacadeTexture() {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
      const grd = g.createLinearGradient(0, 14, 0, 50);
      grd.addColorStop(0, '#3d5875'); grd.addColorStop(1, '#6d8aa6');
      g.fillStyle = grd; g.fillRect(11, 14, 42, 34);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(11, 14, 42, 3);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(11, 48, 42, 2);
      const tex = new T.CanvasTexture(c);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.anisotropy = this.maxAniso;
      tex.minFilter = T.LinearMipmapLinearFilter;
      this.facadeTex = tex;
    }

    _buildGroundTexture() {
      const B = Geo.bounds;
      const W = this.maxTex >= 4096 ? 4096 : 2048;
      const WW = B.xmax - B.xmin, HH = B.zmax - B.zmin;
      const H = Math.round((W * HH) / WW);
      const pxm = WW / W; // метров на пиксель
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');

      // 1) грубая раскраска по высоте/уклону/расстоянию до берега
      const cw = 1024, ch = Math.round((cw * HH) / WW);
      const small = document.createElement('canvas');
      small.width = cw; small.height = ch;
      const sg = small.getContext('2d');
      const img = sg.createImageData(cw, ch);
      const nz = U.makeNoise(555);
      const sx = WW / cw, sz = HH / ch;
      const col = [0, 0, 0];
      for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) {
          const x = B.xmin + (i + 0.5) * sx, z = B.zmin + (j + 0.5) * sz;
          const h = Geo.height(x, z);
          const t = x - Geo.coastX(z);
          const n = nz.fbm(x / 700, z / 700, 3);
          const slope = (Math.abs(Geo.height(x + 60, z) - Geo.height(x - 60, z)) + Math.abs(Geo.height(x, z + 60) - Geo.height(x, z - 60))) / 120;
          let c;
          if (h <= 0.05) {
            const d = -h;
            c = d < 4 ? U.mixRGB([0.62, 0.78, 0.74], [0.25, 0.58, 0.66], d / 4)
              : d < 45 ? U.mixRGB([0.25, 0.58, 0.66], [0.1, 0.34, 0.5], (d - 4) / 41)
              : U.mixRGB([0.1, 0.34, 0.5], [0.04, 0.16, 0.3], Math.min(1, (d - 45) / 80));
          } else {
            let low = U.mixRGB([0.63, 0.6, 0.45], [0.55, 0.57, 0.4], n);
            let mid = U.mixRGB([0.52, 0.47, 0.31], [0.45, 0.46, 0.3], n);
            let high = U.mixRGB([0.56, 0.5, 0.42], [0.62, 0.59, 0.54], n);
            c = U.mixRGB(low, mid, U.smoothstep(60, 320, h));
            c = U.mixRGB(c, high, U.smoothstep(500, 1100, h));
            c = U.mixRGB(c, [0.5, 0.45, 0.38], U.smoothstep(0.25, 0.6, slope));
            if (t < 150) c = U.mixRGB([0.9, 0.82, 0.62], c, U.smoothstep(40, 150, t));
          }
          const k = (j * cw + i) * 4;
          const v = 0.93 + 0.14 * n;
          img.data[k] = Math.min(255, c[0] * v * 255);
          img.data[k + 1] = Math.min(255, c[1] * v * 255);
          img.data[k + 2] = Math.min(255, c[2] * v * 255);
          img.data[k + 3] = 255;
        }
      }
      sg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(small, 0, 0, W, H);

      const mx = (x) => (x - B.xmin) / pxm, mz = (z) => (z - B.zmin) / pxm;
      const rgb = (c, v) => `rgb(${Math.round(c[0] * 255 * v)},${Math.round(c[1] * 255 * v)},${Math.round(c[2] * 255 * v)})`;
      const rnd = U.mulberry32(31337);

      // 2) кварталы: «улица» (асфальт) + лот
      const ST = LA.City.STREET, S = LA.City.BLOCK;
      const streetCol = [0.33, 0.33, 0.35];
      const lot = {
        suburb: [[0.68, 0.64, 0.53], [0.6, 0.63, 0.46], [0.71, 0.67, 0.58], [0.64, 0.6, 0.5]],
        industrial: [[0.63, 0.63, 0.61], [0.58, 0.6, 0.62]],
        mid: [[0.66, 0.65, 0.62], [0.6, 0.6, 0.6]],
        high: [[0.62, 0.62, 0.62], [0.56, 0.57, 0.58]],
        core: [[0.58, 0.58, 0.6], [0.52, 0.53, 0.55]],
      };
      for (const b of this.city.blocks) {
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
        g.fillStyle = rgb(streetCol, 1);
        g.fillRect(mx(cx - S / 2), mz(cz - S / 2), S / pxm + 0.6, S / pxm + 0.6);
        const pal = lot[b.kind];
        g.fillStyle = rgb(pal[Math.floor(rnd() * pal.length)], 0.95 + rnd() * 0.1);
        g.fillRect(mx(b.x0), mz(b.z0), (b.x1 - b.x0) / pxm, (b.z1 - b.z0) / pxm);
      }
      // 3) парки и поля для гольфа
      for (const p of Geo.parks) {
        g.fillStyle = p.kind === 'golf' ? 'rgb(86,150,70)' : 'rgb(96,146,78)';
        g.fillRect(mx(p.x - p.w / 2), mz(p.z - p.d / 2), p.w / pxm, p.d / pxm);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(52,104,48,${0.35 + rnd() * 0.3})`;
          g.beginPath();
          g.arc(mx(p.x + (rnd() - 0.5) * p.w), mz(p.z + (rnd() - 0.5) * p.d), (5 + rnd() * 9) / pxm * 3, 0, 6.3);
          g.fill();
        }
      }
      // 4) аэропорт: площадка, рулёжки, перрон
      const pad = Geo.airportPad, R = Geo.runway;
      g.fillStyle = 'rgb(128,142,100)';
      g.fillRect(mx(pad.x0), mz(pad.z0), (pad.x1 - pad.x0) / pxm, (pad.z1 - pad.z0) / pxm);
      g.fillStyle = 'rgb(112,112,114)';
      const a = Geo.apron;
      g.fillRect(mx(a.x0), mz(a.z0), (a.x1 - a.x0) / pxm, (a.z1 - a.z0) / pxm);
      g.fillStyle = 'rgb(86,86,90)';
      g.fillRect(mx(R.x0 - 30), mz(R.cz - 120 - 14), (R.length + 60) / pxm, 28 / pxm);
      for (const cx of [-7500, -6600, -5700]) g.fillRect(mx(cx - 14), mz(R.cz - 120), 28 / pxm, 120 / pxm);
      g.strokeStyle = 'rgba(230,200,60,0.9)'; g.lineWidth = Math.max(1, 1.2 / pxm);
      g.beginPath(); g.moveTo(mx(R.x0 - 30), mz(R.cz - 120)); g.lineTo(mx(R.x1 + 30), mz(R.cz - 120)); g.stroke();

      // 5) дороги
      g.lineCap = 'round'; g.lineJoin = 'round';
      const trace = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(mx(p[0]), mz(p[1])) : g.moveTo(mx(p[0]), mz(p[1])))); };
      for (const r of Geo.roads) {
        trace(r.pts); g.strokeStyle = r.type === 'freeway' ? 'rgb(176,174,168)' : 'rgb(150,148,144)'; g.lineWidth = (r.width + 6) / pxm; g.stroke();
        trace(r.pts); g.strokeStyle = r.type === 'freeway' ? 'rgb(58,58,62)' : 'rgb(70,70,74)'; g.lineWidth = r.width / pxm; g.stroke();
        trace(r.pts); g.strokeStyle = 'rgba(235,205,70,0.85)'; g.lineWidth = Math.max(0.8, 1.1 / pxm); g.setLineDash([10 / pxm, 12 / pxm]); g.stroke(); g.setLineDash([]);
      }

      const tex = new T.CanvasTexture(cv);
      tex.anisotropy = this.maxAniso;
      tex.minFilter = T.LinearMipmapLinearFilter;
      tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
      this.groundTex = tex;
      this.groundCanvas = cv;
    }

    // ------------------------------------------------------------ рельеф и океан
    _buildTerrain() {
      const gr = Geo.grid, B = Geo.bounds, d = gr.data, nx = gr.nx, nz = gr.nz;
      const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
      const WW = B.xmax - B.xmin, HH = B.zmax - B.zmin;
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          pos[k * 3] = B.xmin + i * gr.dx; pos[k * 3 + 1] = d[k]; pos[k * 3 + 2] = B.zmin + j * gr.dz;
          const hl = d[j * nx + Math.max(i - 1, 0)], hr = d[j * nx + Math.min(i + 1, nx - 1)];
          const hu = d[Math.max(j - 1, 0) * nx + i], hd = d[Math.min(j + 1, nz - 1) * nx + i];
          const ddx = (hr - hl) / (2 * gr.dx), ddz = (hd - hu) / (2 * gr.dz);
          const l = Math.sqrt(ddx * ddx + 1 + ddz * ddz);
          nor[k * 3] = -ddx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -ddz / l;
          uv[k * 2] = (pos[k * 3] - B.xmin) / WW;
          uv[k * 2 + 1] = 1 - (pos[k * 3 + 2] - B.zmin) / HH;
        }
      }
      const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
      let p = 0;
      for (let j = 0; j < nz - 1; j++)
        for (let i = 0; i < nx - 1; i++) {
          const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
          idx[p++] = a; idx[p++] = c; idx[p++] = b;
          idx[p++] = b; idx[p++] = c; idx[p++] = e;
        }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
      geo.setIndex(new T.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ map: this.groundTex }));
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.terrain = mesh;
      this.scene.add(mesh);
    }

    _buildOcean() {
      const uniforms = T.UniformsUtils.merge([
        T.UniformsLib.fog,
        {
          time: { value: 0 },
          sunDir: { value: SUN_DIR.clone() },
          deepColor: { value: new T.Color(0.02, 0.2, 0.34) },
          skyColor: { value: new T.Color(0.6, 0.78, 0.94) },
        },
      ]);
      const mat = new T.ShaderMaterial({
        uniforms, fog: true, transparent: true, depthWrite: false,
        vertexShader: `
          varying vec3 vWorld;
          #include <fog_pars_vertex>
          void main(){
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            vec4 mvPosition = viewMatrix * wp;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }`,
        fragmentShader: `
          uniform float time; uniform vec3 sunDir; uniform vec3 deepColor; uniform vec3 skyColor;
          varying vec3 vWorld;
          #include <fog_pars_fragment>
          void main(){
            vec3 V = normalize(cameraPosition - vWorld);
            vec2 p = vWorld.xz; float t = time;
            vec2 g = vec2(cos(p.x*0.045 + t*0.9), cos(p.y*0.038 + t*0.7)) * 0.05;
            g += vec2(cos(p.x*0.11 + p.y*0.07 + t*1.4), cos(p.y*0.13 - p.x*0.05 + t*1.2)) * 0.024;
            g += vec2(cos(p.x*0.31 + t*2.0 + p.y*0.2), cos(p.y*0.27 + t*1.7 - p.x*0.19)) * 0.011;
            vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
            float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            vec3 refl = reflect(-V, N);
            vec3 col = mix(deepColor, skyColor, fres * 0.8 + 0.06);
            float spec = pow(max(dot(refl, normalize(sunDir)), 0.0), 140.0);
            col += vec3(1.0, 0.92, 0.75) * spec * 1.3;
            gl_FragColor = vec4(col, 0.82);
            #include <fog_fragment>
          }`,
      });
      const m = new T.Mesh(new T.PlaneGeometry(160000, 160000, 1, 1), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0;
      m.renderOrder = 2;
      m.frustumCulled = false;
      this.ocean = m;
      this.scene.add(m);
    }

    // ------------------------------------------------------------ город
    _buildCity() {
      const B = Geo.bounds, CH = 1600;
      const ncx = Math.ceil((B.xmax - B.xmin) / CH);
      const cells = new Map();
      const get = (cx, cz) => {
        const k = cz * ncx + cx;
        let c = cells.get(k);
        if (!c) { c = { hi: new LA.GeoBuilder(), lo: new LA.GeoBuilder(), cx, cz }; cells.set(k, c); }
        return c;
      };
      let nB = 0;
      for (const b of this.city.buildings) {
        const cx = Math.floor(((b.x0 + b.x1) / 2 - B.xmin) / CH), cz = Math.floor(((b.z0 + b.z1) / 2 - B.zmin) / CH);
        const c = get(cx, cz);
        const tall = b.y1 - b.y0 > 14;
        const opts = { noWin: !b.windows, bay: tall ? 4 : 3.6, floor: tall ? 3.6 : 3.1 };
        c.hi.addAABB(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, b.wall, b.roof, opts);
        if (b.major) c.lo.addAABB(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, b.wall, b.roof, opts);
        nB++;
      }
      const mat = new T.MeshLambertMaterial({ map: this.facadeTex, vertexColors: true });
      this.cityMat = mat;
      for (const c of cells.values()) {
        const entry = { hi: null, lo: null, x: 0, z: 0 };
        for (const lod of ['hi', 'lo']) {
          const bld = c[lod];
          if (bld.empty) continue;
          const geo = bld.toGeometry();
          const mesh = new T.Mesh(geo, mat);
          mesh.receiveShadow = true;
          mesh.castShadow = lod === 'hi';
          mesh.visible = false;
          this.scene.add(mesh);
          entry[lod] = mesh;
          const s = geo.boundingSphere;
          entry.x = s.center.x; entry.z = s.center.z; entry.r = s.radius;
        }
        this.chunks.push(entry);
      }
      this.buildingCount = nB;
    }

    setShadows(on) {
      this.shadowsOn = on;
      this.sun.castShadow = on;
      this.renderer.shadowMap.enabled = on;
      // материалы нужно перекомпилировать при смене режима теней
      this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => (x.needsUpdate = true)); } });
    }

    /** Каждый кадр: следим за камерой, переключаем LOD, двигаем тень. */
    update(dt, camera, planePos) {
      this.time += dt;
      this.sky.position.copy(camera.position);
      this.ocean.material.uniforms.time.value = this.time;
      const cp = camera.position;
      for (const c of this.chunks) {
        const dx = c.x - cp.x, dz = c.z - cp.z;
        const d = Math.sqrt(dx * dx + dz * dz) - c.r * 0.6;
        if (c.hi) c.hi.visible = d < 3600;
        if (c.lo) c.lo.visible = d >= 3000 && d < 14000;
      }
      // тень следует за самолётом (привязка к сетке 2 м убирает «плавание» теней)
      const sx = Math.round(planePos.x / 2) * 2, sy = Math.round(planePos.y / 2) * 2, sz = Math.round(planePos.z / 2) * 2;
      this.sun.target.position.set(sx, sy, sz);
      this.sun.position.set(sx + this.sunDir.x * 1500, sy + this.sunDir.y * 1500, sz + this.sunDir.z * 1500);
      this.sun.target.updateMatrixWorld();
      if (this.landmarks) this.landmarks.update(dt);
    }
  }

  LA.World = World;
  LA.FOG_COLOR = FOG_COLOR;
})();
