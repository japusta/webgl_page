
export type UiState = {
  gravity: boolean;
  iterations: number;
  gridSize: number;
  gridChanged: boolean;
};

export class UiController {
  private gravityEl = document.getElementById(
    "gravityToggle"
  ) as HTMLInputElement;
  private itersEl = document.getElementById("iters") as HTMLInputElement;
  private gridEl = document.getElementById("grid") as HTMLInputElement;
  private resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;

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

  onChange(cb: (state: UiState) => void) {
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

  onReset(cb: () => void) {
    this.resetBtn.addEventListener("click", cb);
  }
}