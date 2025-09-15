import { Particle } from "./Particle.js";

/**
 * Базовый интерфейс ограничения. Любое ограничение должно реализовать
 * метод project(dt), который корректирует позиции частиц 
 */
export interface IConstraint {
  project(dt: number): void;
}

/**
 * Абстрактный класс для ограничений. Предоставляет вспомогательную функцию для
 * доступа к обратной массе.
 */
export abstract class Constraint implements IConstraint {
  abstract project(dt: number): void;
  protected w(p: Particle) {
    return p.invMass;
  }
}