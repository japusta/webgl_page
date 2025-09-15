import { WebGPURenderer } from "./render/WebGPURenderer.js";
import { ClothSimulator } from "./sim/ClothSimulator.js";
import { UiController } from "./ui/UiController.js";
import { Time } from "./utils/Time.js";
/*
 * Главный модуль приложения. Здесь связывается пользовательский интерфейс,
 * симулятор ткани и WebGPU‑рендерер. Принцип единственной ответственности (SOLID)
 * соблюдён: каждый класс отвечает за свою область.
 */
const canvas = document.getElementById("gpu-canvas");
async function main() {
    const renderer = await WebGPURenderer.create(canvas);
    const ui = new UiController();
    // начальные параметры сетки
    let gridSize = ui.gridSize;
    let sim = new ClothSimulator(gridSize, gridSize, 1.0, renderer.device);
    sim.gravityEnabled = ui.gravity;
    sim.solverIterations = ui.iterations;
    // реакция на изменения UI
    ui.onChange(({ gravity, iterations, gridChanged, gridSize: g }) => {
        sim.gravityEnabled = gravity;
        sim.solverIterations = iterations;
        if (gridChanged) {
            // пересоздать симулятор при изменении размера сетки
            gridSize = g;
            sim.dispose();
            sim = new ClothSimulator(gridSize, gridSize, 1.0, renderer.device);
        }
    });
    ui.onReset(() => {
        sim.reset();
    });
    const time = new Time();
    function frame() {
        const dt = time.tick();
        sim.update(dt);
        renderer.draw(sim.positions, sim.indices, sim.cornerIndices, sim.oscillatingIndex);
        requestAnimationFrame(frame);
    }
    frame();
}
main().catch((err) => {
    console.error(err);
    alert("WebGPU не поддерживается или произошла ошибка инициализации.");
});
