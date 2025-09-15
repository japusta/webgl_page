import { Particle } from "./Particle.js";

/**
 * Базовый класс для ограничений. Любое ограничение должно реализовать
 * метод project(dt), который корректирует позиции частиц 
 */
export class Constraint {
  project(dt) {
    // должен быть переопределён в подклассах
  }
  w(p) {
    return p.invMass;
  }
}