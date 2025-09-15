// простые orbit-контролы для WebGPU сцены
// управление камерой происходит за счёт изменения полярных
// координат (theta, phi) и расстояния до точки наблюдения.  Левый
// клик мыши вращает камеру вокруг цели, а колесо мыши
// приближает/отдаляет камеру 
// getEye() для получения
// текущих координат камеры, setTarget()  для смены точки
// наблюдения (центр).  построения матриц в
// этом классе нет, он лишь хранит состояние и обрабатывает
// события мыши

export class OrbitControls {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    // точка вокруг которой вращается камера
    this.target = (opts.target ?? [0, 0, 0]).slice(0, 3);
    // дистанция от камеры до цели
    this.distance = opts.distance ?? 2.0;
    this.minDistance = opts.minDistance ?? 0.5;
    this.maxDistance = opts.maxDistance ?? 6.0;
    // углы theta  вокруг оси Y, phi — полярный 
    this.theta = opts.theta ?? 0.7;
    this.phi = opts.phi ?? 1.0;

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 1.0;

    // обработчики 
    this._onDown = (e) => {
      if (e.button !== 0) return; // только левая кнопка
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.canvas.setPointerCapture?.(e.pointerId ?? 1);
    };
    this._onMove = (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.theta -= dx * this.rotateSpeed;
      this.phi -= dy * this.rotateSpeed;
      // не позволяем камере пересечь полюс
      const eps = 0.05;
      this.phi = Math.max(eps, Math.min(Math.PI - eps, this.phi));
    };
    this._onUp = () => {
      this._dragging = false;
    };
    this._onWheel = (e) => {
      e.preventDefault();
      const scale = Math.exp((e.deltaY / 100) * this.zoomSpeed * 0.1);
      this.distance = Math.min(
        this.maxDistance,
        Math.max(this.minDistance, this.distance * scale),
      );
    };

    canvas.addEventListener("pointerdown", this._onDown);
    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
    canvas.addEventListener("wheel", this._onWheel, { passive: false });
  }

  setTarget(x, y, z) {
    this.target[0] = x;
    this.target[1] = y;
    this.target[2] = z;
  }

  // возвращает координаты камеры впространстве
  getEye() {
    const r = this.distance;
    const sinp = Math.sin(this.phi);
    const cosp = Math.cos(this.phi);
    const sint = Math.sin(this.theta);
    const cost = Math.cos(this.theta);
    const x = this.target[0] + r * sinp * sint;
    const y = this.target[1] + r * cosp;
    const z = this.target[2] + r * sinp * cost;
    return [x, y, z];
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this._onDown);
    window.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerup", this._onUp);
    c.removeEventListener("wheel", this._onWheel);
  }
}