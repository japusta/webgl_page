import { Particle } from "./structures/Particle.js";
import { IConstraint } from "./structures/Constraint.js";
import { Vec3 } from "../utils/Vec3.js";

/**
 * Интерфейс солвера для симуляций. Реализация (PBDSolver) может быть
 * заменена на XPBD или GPU‑вариант без изменения кода симуляции.
 */
export interface ISolver {
  step(particles: Particle[], constraints: IConstraint[], dt: number, gravityOn: boolean): void;
}

/**
 * Простой solver PBD. Реализует Verlet‑интегрирование и итеративную
 * проекцию ограничений. Работает на CPU для наглядности и простоты.
 */
export class PBDSolver implements ISolver {
  constructor(public iterations = 8, public gravity = new Vec3(0, -9.81, 0)) {}

  step(particles: Particle[], constraints: IConstraint[], dt: number, gravityOn: boolean) {
    const dt2 = dt * dt;
    // Предварительный шаг (прогноз позиции)
    for (const p of particles) {
      if (p.invMass === 0) {
        // пин
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
      // вычисляем новую позицию по Verlet
      const nx = pos.x + vx + ax * dt2;
      const ny = pos.y + vy + ay * dt2;
      const nz = pos.z + vz + az * dt2;
      p.prevPosition.copy(pos);
      p.position.set(nx, ny, nz);
    }
    // Итеративная проекция ограничений
    for (let it = 0; it < this.iterations; it++) {
      for (const c of constraints) c.project(dt);
      // удерживаем пины на месте
      for (const p of particles) if (p.pinned) p.position.copy(p.pinTo);
    }
  }
}