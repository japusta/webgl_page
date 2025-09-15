import { WebGPURenderer } from "./render/WebGPURenderer.js";
import { ClothSimulator } from "./sim/ClothSimulator.js";
import { UiController } from "./ui/UiController.js";
import { Time } from "./utils/Time.js";
import { OrbitControls } from "./controls/OrbitControls.js";

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
        // орбит‑контролы: вращение/зум вокруг центра ткани
    const controls = new OrbitControls(canvas, {
        distance: 2.0,
        theta: 0.7,
        phi: 1.0,
        target: [0, 0, 0],
    });
    // реакция на изменения UI
    ui.onChange(({ gravity, iterations, gridChanged, gridSize: g }) => {
        sim.gravityEnabled = gravity;
        sim.solverIterations = iterations;
        if (gridChanged) {
            // пересоздать симулятор при изменении размера сетки
            gridSize = g;
            sim.dispose();
            sim = new ClothSimulator(gridSize, gridSize, 1.0, renderer.device);
            controls.setTarget(0, 0, 0);

        }
    });
    ui.onReset(() => {
        sim.reset();
    });
    const time = new Time();
    function frame() {
        const dt = time.tick();
        sim.update(dt);
        const eye = controls.getEye();
        const camera = { eye, target: controls.target };
        renderer.draw(sim.positions, sim.indices, sim.cornerIndices, sim.oscillatingIndex, camera);
                requestAnimationFrame(frame);
    }
    frame();
}
main().catch((err) => {
    console.error(err);
    alert("WebGPU не поддерживается или произошла ошибка инициализации.");
});
