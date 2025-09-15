

export class UiController {
  constructor() {
    this.gravityEl = document.getElementById("gravityToggle");
    this.itersEl = document.getElementById("iters");
    this.gridEl = document.getElementById("grid");
    this.resetBtn = document.getElementById("resetBtn");
  }

  get gravity() {
    return this.gravityEl.checked;
  }
  get iterations() {
    const val = parseInt(this.itersEl.value) || 8;
    return Math.max(1, Math.min(50, val));
  }
  get gridSize() {
    const val = parseInt(this.gridEl.value) || 22;
    return Math.max(6, Math.min(128, val));
  }

  onChange(cb) {
    const fire = (gridChanged = false) =>
      cb({
        gravity: this.gravity,
        iterations: this.iterations,
        gridSize: this.gridSize,
        gridChanged,
      });
    this.gravityEl.addEventListener("change", () => fire());
    this.itersEl.addEventListener("change", () => fire());
    this.gridEl.addEventListener("change", () => fire(true));
  }

 
  onReset(cb) {
    this.resetBtn.addEventListener("click", cb);
  }
}