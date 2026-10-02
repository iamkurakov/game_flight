/*
 * CameraController.js — камеры: chase (за самолётом), cockpit (из кабины), cinematic (широкий внешний вид),
 * а также служебные: menu (облёт самолёта на старте) и crash (вокруг места аварии).
 * Камера «за самолётом» берёт курс/тангаж с задержкой (демпфирование), а крен учитывает лишь частично —
 * картинка плавная и не вызывает укачивания.
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const T = globalThis.THREE;
  const U = LA.Utils;
  const MODES = ['chase', 'cockpit', 'cinematic'];

  class CameraController {
    constructor(camera) {
      this.camera = camera;
      this.mode = 'chase';
      this.override = null; // 'menu' | 'crash' | null
      this.fwd = new T.Vector3(0, 0, -1);
      this.up = new T.Vector3(0, 1, 0);
      this.pos = new T.Vector3();
      this.tmp = new T.Vector3(); this.tmp2 = new T.Vector3(); this.look = new T.Vector3();
      this.quat = new T.Quaternion(); this.q2 = new T.Quaternion(); this.m = new T.Matrix4();
      this.t = 0;
      this.crashPoint = new T.Vector3();
      this.snap = true;
    }

    cycle() { this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]); return this.mode; }

    setMode(m) { this.mode = m; this.snap = true; this.camera.near = m === 'cockpit' ? 0.25 : 1.2; this.camera.updateProjectionMatrix(); }

    /** Жёсткая установка (после рестарта). */
    reset() { this.snap = true; }

    update(dt, phys, speedFov) {
      const cam = this.camera;
      this.t += dt;
      const f = phys._f, u = phys._u;
      const P = phys.pos;
      let fov = 62;

      if (this.override === 'menu') {
        const a = this.t * 0.16 + 0.6;
        cam.position.set(P.x + Math.cos(a) * 24, P.y + 5.5, P.z + Math.sin(a) * 24);
        cam.up.set(0, 1, 0);
        cam.lookAt(P.x, P.y + 1.2, P.z);
        fov = 50;
      } else if (this.override === 'crash') {
        const a = this.t * 0.25;
        const c = this.crashPoint;
        cam.position.set(c.x + Math.cos(a) * 55, c.y + 22, c.z + Math.sin(a) * 55);
        const gh = LA.Geo.groundHeight(cam.position.x, cam.position.z) + 6;
        if (cam.position.y < gh) cam.position.y = gh;
        cam.up.set(0, 1, 0);
        cam.lookAt(c.x, c.y + 4, c.z);
        fov = 55;
      } else if (this.mode === 'cockpit') {
        // кабина: жёстко привязана к самолёту, кватернион слегка сглажен
        this.q2.copy(phys.quat);
        if (this.snap) this.quat.copy(this.q2); else this.quat.slerp(this.q2, 1 - Math.exp(-40 * dt));
        this.tmp.set(0, 0.62, -0.22).applyQuaternion(this.quat).add(P);
        cam.position.copy(this.tmp);
        cam.quaternion.copy(this.quat);
        cam.up.set(0, 1, 0);
        fov = 74;
      } else {
        const chase = this.mode === 'chase';
        const lam = chase ? 7 : 2.2;
        if (this.snap) { this.fwd.copy(f); this.up.set(0, 1, 0); }
        else {
          this.fwd.lerp(f, 1 - Math.exp(-(chase ? 5 : 1.6) * dt)).normalize();
          this.tmp.set(0, 1, 0).lerp(u, chase ? 0.3 : 0.12).normalize();
          this.up.lerp(this.tmp, 1 - Math.exp(-3 * dt)).normalize();
        }
        const dist = chase ? 15.5 + phys.airspeed * 0.035 : 36;
        const height = chase ? 4.4 : 9;
        const side = chase ? 0 : 14;
        // «вправо» по сглаженному направлению
        this.tmp2.crossVectors(this.fwd, this.up).normalize();
        this.tmp.copy(P).addScaledVector(this.fwd, -dist).addScaledVector(this.up, height).addScaledVector(this.tmp2, side);
        if (this.snap) this.pos.copy(this.tmp); else this.pos.lerp(this.tmp, 1 - Math.exp(-lam * dt));
        cam.position.copy(this.pos);
        const gh = LA.Geo.groundHeight(cam.position.x, cam.position.z) + 3;
        if (cam.position.y < gh) cam.position.y = gh;
        this.look.copy(P).addScaledVector(this.fwd, chase ? 11 : 4);
        cam.up.copy(this.up);
        cam.lookAt(this.look);
        fov = (chase ? 62 : 52) + speedFov;
      }
      this.snap = false;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = U.damp(cam.fov, fov, 6, dt); cam.updateProjectionMatrix(); }
    }
  }
  CameraController.MODES = MODES;
  LA.CameraController = CameraController;
})();
