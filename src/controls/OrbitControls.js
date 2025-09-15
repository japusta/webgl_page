// Простые orbit-контролы: ЛКМ — вращение, колесо — зум.
export class OrbitControls {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.target = (opts.target ?? [0, 0, 0]).slice(0, 3);
    this.distance = opts.distance ?? 2.0;
    this.minDistance = opts.minDistance ?? 0.5;
    this.maxDistance = opts.maxDistance ?? 6.0;
    this.theta = opts.theta ?? 0.7; // вокруг Y
    this.phi = opts.phi ?? 1.0;    // от +Y (0..π)

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 1.0;

    this._onDown = (e) => {
      if (e.button !== 0) return; // ЛКМ
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
      this.phi   -= dy * this.rotateSpeed;
      const eps = 0.05;
      this.phi = Math.max(eps, Math.min(Math.PI - eps, this.phi));
    };
    this._onUp = () => { this._dragging = false; };
    this._onWheel = (e) => {
      e.preventDefault();
      const scale = Math.exp((e.deltaY / 100) * this.zoomSpeed * 0.1);
      this.distance = Math.min(this.maxDistance, Math.max(this.minDistance, this.distance * scale));
    };

    canvas.addEventListener("pointerdown", this._onDown);
    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
    canvas.addEventListener("wheel", this._onWheel, { passive: false });
  }

  setTarget(x, y, z) { this.target[0]=x; this.target[1]=y; this.target[2]=z; }

  getEye() {
    const r = this.distance;
    const sinp = Math.sin(this.phi), cosp = Math.cos(this.phi);
    const sint = Math.sin(this.theta), cost = Math.cos(this.theta);
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
