import { Vec3 } from "../utils/Vec3.js";

/**
 * Простой solver PBD. Реализует Verlet‑интегрирование и итеративную
 * проекцию ограничений. Работает на CPU для наглядности и простоты.
 */
export class PBDSolver {
  constructor(iterations = 8, gravity = new Vec3(0, -9.81, 0)) {
    this.iterations = iterations;
    this.gravity = gravity;
  }
  step(particles, constraints, dt, gravityOn) {
    const dt2 = dt * dt;
    for (const p of particles) {
      if (p.invMass === 0) {
        p.position.copy(p.pinTo);
        p.prevPosition.copy(p.pinTo);
        continue;
      }
      const pos = p.position;
      const prev = p.prevPosition;
      const vx = pos.x - prev.x;
      const vy = pos.y - prev.y;
      const vz = pos.z - prev.z;
      const ax = gravityOn ? this.gravity.x : 0;
      const ay = gravityOn ? this.gravity.y : 0;
      const az = gravityOn ? this.gravity.z : 0;
      const nx = pos.x + vx + ax * dt2;
      const ny = pos.y + vy + ay * dt2;
      const nz = pos.z + vz + az * dt2;
      p.prevPosition.copy(pos);
      p.position.set(nx, ny, nz);
    }
    for (let it = 0; it < this.iterations; it++) {
      for (const c of constraints) c.project(dt);
      for (const p of particles) if (p.pinned) p.position.copy(p.pinTo);
    }
  }
}