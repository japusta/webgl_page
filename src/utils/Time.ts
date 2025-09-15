/*
 * Утилита для измерения времени кадра. Используется для стабильного
 * интегрирования и clamp'а максимального шага (KISS).
 */
export class Time {
  private last = performance.now();
  tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    // Ограничиваем dt сверху, чтобы предотвратить огромные скачки при
    // разворачивании вкладки или лаге.
    return Math.min(dt, 1 / 30);
  }
}