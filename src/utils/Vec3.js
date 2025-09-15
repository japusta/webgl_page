/*
 * класс вектора в 3D. используется для описания позиции
 * частиц и промежуточных расчётов.
 */
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  copy(a) {
    this.x = a.x;
    this.y = a.y;
    this.z = a.z;
    return this;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  add(a) {
    this.x += a.x;
    this.y += a.y;
    this.z += a.z;
    return this;
  }
  sub(a) {
    this.x -= a.x;
    this.y -= a.y;
    this.z -= a.z;
    return this;
  }
  scale(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  length() {
    return Math.hypot(this.x, this.y, this.z);
  }
  static sub(a, b) {
    return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
  }
}