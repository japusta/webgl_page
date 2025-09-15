import { Vec3 } from "../../utils/Vec3.js";

/**
 * Частица ткани. Хранит текущую и предыдущую позиции, обратную массу и параметры
 * прикрепления (пин). При invMass=0 частица считается неподвижной.
 */
export class Particle {
  position = new Vec3();
  prevPosition = new Vec3();
  invMass: number;
  pinned = false;
  pinTo = new Vec3();

  constructor(pos: Vec3, mass = 1) {
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.invMass = mass > 0 ? 1 / mass : 0;
  }
}