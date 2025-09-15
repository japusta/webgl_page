/*
 * Контроллер UI управляет пользовательским вводом: переключателем гравитации,
 * числом итераций и размером сетки. В рамках SOLID он отделён от логики
 * симуляции и рендера. Позволяет подписаться на изменения через callbacks.
 */
export class UiController {
    gravityEl = document.getElementById("gravityToggle");
    itersEl = document.getElementById("iters");
    gridEl = document.getElementById("grid");
    resetBtn = document.getElementById("resetBtn");
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
    /**
     * Подписаться на изменения UI. Callback вызывается при изменении любого
     * параметра. Если изменён размер сетки, флаг gridChanged=true.
     */
    onChange(cb) {
        const fire = (gridChanged = false) => cb({
            gravity: this.gravity,
            iterations: this.iterations,
            gridSize: this.gridSize,
            gridChanged,
        });
        this.gravityEl.addEventListener("change", () => fire());
        this.itersEl.addEventListener("change", () => fire());
        this.gridEl.addEventListener("change", () => fire(true));
    }
    /**
     * Подписаться на нажатие кнопки «Сброс».
     */
    onReset(cb) {
        this.resetBtn.addEventListener("click", cb);
    }
}
