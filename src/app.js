import { WebGPURenderer } from "./render/WebGPURenderer.js";
import { ClothSimulatorGPU } from "./sim/ClothSimulatorGPU.js";
import { UiController } from "./ui/UiController.js";
import { Time } from "./utils/Time.js";
import { OrbitControls } from "./controls/OrbitControls.js";

const canvas = document.getElementById("gpu-canvas");

async function main() {
  const renderer = await WebGPURenderer.create(canvas);
  const ui = new UiController();

  let gridSize = ui.gridSize;

  let sim = new ClothSimulatorGPU(gridSize, gridSize, 2.0, renderer.device, {
    gravityEnabled: ui.gravity,
    iterations: ui.iterations,
    compliance: 0.0,
    yOffset: 0.0,
    oscAmp: 0.25,
    oscFreq: 1.0
  });

  const controls = new OrbitControls(canvas, {
    distance: 2.0, theta: 0.7, phi: 1.0, target: [0, sim.yOffset, 0]
  });

  ui.onChange(({ gravity, iterations, gridChanged, gridSize: g }) => {
    sim.gravityEnabled = gravity;
    sim.solverIterations = iterations;
    if (gridChanged) {
      sim.dispose();
      gridSize = g;
      sim = new ClothSimulatorGPU(gridSize, gridSize, 2.0, renderer.device, {
        gravityEnabled: ui.gravity,
        iterations: ui.iterations,
        compliance: 0.0,
        yOffset: 0.0,
        oscAmp: 0.25,
        oscFreq: 1.0
      });
      controls.setTarget(0, sim.yOffset, 0);
    }
  });

  ui.onReset(() => {
    sim.dispose();
    sim = new ClothSimulatorGPU(gridSize, gridSize, 2.0, renderer.device, {
      gravityEnabled: ui.gravity,
      iterations: ui.iterations
    });
    controls.setTarget(0, sim.yOffset, 0);
  });

  const time = new Time();
  let accTime = 0;

  function frame() {
    const dt = time.tick();
    accTime += dt;

    sim.update(dt, accTime);

    const eye = controls.getEye();
    const camera = { eye, target: controls.target };

    // Передаём GPU-буфер позиций и его размер (vec4 => 16 байт на вершину)
    renderer.draw(
      sim.positions,
      sim.indices,
      sim.cornerIndices,
      sim.oscillatingIndex,
      camera,
      { gpu: true, bytes: sim.numVerts * 16 }
    );

    requestAnimationFrame(frame);
  }
  frame();
}

main().catch(err => {
  console.error(err);
  alert("WebGPU не поддерживается или произошла ошибка инициализации.");
});
