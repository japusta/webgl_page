import { Vec3 } from "../../utils/Vec3.js";

/**
 * Частица ткани. Хранит текущую и предыдущую позиции, обратную массу и параметры
 * прикрепления (пин). При invMass=0 частица считается неподвижной.
 */
export class Particle {
  constructor(pos, mass = 1) {
    this.position = new Vec3();
    this.prevPosition = new Vec3();
    this.invMass = 0;
    this.pinned = false;
    this.pinTo = new Vec3();
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.invMass = mass > 0 ? 1 / mass : 0;
  }
}