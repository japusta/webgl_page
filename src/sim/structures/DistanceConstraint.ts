import { Constraint } from "./Constraint.js";
import { Particle } from "./Particle.js";
import { Vec3 } from "../../utils/Vec3.js";

/**
 * Классическое ограничение расстояния в PBD. Стремится удерживать две
 * частицы на расстоянии rest. В текущей реализации compliant=0 (XPBD).
 */
export class DistanceConstraint extends Constraint {
  private rest: number;

  constructor(private a: Particle, private b: Particle, restLen?: number) {
    super();
    // если restLen не задан, используем исходную дистанцию
    this.rest =
      restLen ?? Vec3.sub(a.position, b.position).length();
  }

  project(_dt: number) {
    const dir = Vec3.sub(this.a.position, this.b.position);
    const len = Math.max(dir.length(), 1e-8);
    // нормализованный вектор
    const n = dir.scale(1 / len);
    const C = len - this.rest;
    const w1 = this.a.invMass;
    const w2 = this.b.invMass;
    const w = w1 + w2;
    if (w === 0) return;
    const corr = C / w;
    // коррекция позиций
    if (w1 > 0) this.a.position.sub(new Vec3(n.x * corr * w1, n.y * corr * w1, n.z * corr * w1));
    if (w2 > 0) this.b.position.add(new Vec3(n.x * corr * w2, n.y * corr * w2, n.z * corr * w2));
  }
}