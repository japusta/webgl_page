/*
 * Простейший класс вектора в 3D. Используется для описания позиции
 * частиц и промежуточных расчётов. Предоставляет базовые операции.
 */
export class Vec3 {
  constructor(public x = 0, public y = 0, public z = 0) {}

  copy(a: Vec3) {
    this.x = a.x;
    this.y = a.y;
    this.z = a.z;
    return this;
  }

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  add(a: Vec3) {
    this.x += a.x;
    this.y += a.y;
    this.z += a.z;
    return this;
  }

  sub(a: Vec3) {
    this.x -= a.x;
    this.y -= a.y;
    this.z -= a.z;
    return this;
  }

  scale(s: number) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  length() {
    return Math.hypot(this.x, this.y, this.z);
  }

  static sub(a: Vec3, b: Vec3) {
    return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
  }
}