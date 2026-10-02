/*
 * CollisionSystem.js — упрощённые столкновения самолёта со зданиями и ориентирами.
 * Здания хранятся как AABB в равномерной хеш-сетке (ячейка 250 м): проверка точки — O(1).
 * Рельеф и вода проверяются отдельно в FlightPhysics через LA.Geo.groundHeight().
 */
globalThis.LA = globalThis.LA || {};

(function () {
  const CELL = 250;
  const OFF = 200;
  const key = (ix, iz) => (ix + OFF) * 1024 + (iz + OFF);

  class CollisionSystem {
    /** @param {Array<{x0,x1,y0,y1,z0,z1}>} boxes */
    constructor(boxes) {
      this.boxes = boxes;
      this.map = new Map();
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        const ix0 = Math.floor(b.x0 / CELL), ix1 = Math.floor(b.x1 / CELL);
        const iz0 = Math.floor(b.z0 / CELL), iz1 = Math.floor(b.z1 / CELL);
        for (let ix = ix0; ix <= ix1; ix++)
          for (let iz = iz0; iz <= iz1; iz++) {
            const k = key(ix, iz);
            let list = this.map.get(k);
            if (!list) this.map.set(k, (list = []));
            list.push(i);
          }
      }
    }

    /** Возвращает AABB, содержащий точку, либо null. */
    hit(x, y, z) {
      const list = this.map.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!list) return null;
      for (let i = 0; i < list.length; i++) {
        const b = this.boxes[list[i]];
        if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && y >= b.y0 && y <= b.y1) return b;
      }
      return null;
    }

    /** Высота самой высокой постройки под точкой (для предупреждения о препятствиях). */
    topAt(x, z) {
      const list = this.map.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      let top = -1e9;
      if (!list) return top;
      for (let i = 0; i < list.length; i++) {
        const b = this.boxes[list[i]];
        if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > top) top = b.y1;
      }
      return top;
    }
  }
  LA.CollisionSystem = CollisionSystem;
})();
