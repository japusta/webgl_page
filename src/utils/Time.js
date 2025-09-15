/*
 * Утилита для измерения времени кадра. Используется для стабильного
 * интегрирования и clamp'а максимального шага (KISS).
 */
export class Time {
  constructor() {
    this.last = performance.now();
  }
  tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    return Math.min(dt, 1 / 30);
  }
}