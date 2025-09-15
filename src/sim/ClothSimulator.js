import { MeshBuilder } from "../geom/MeshBuilder.js";
import { Particle } from "./structures/Particle.js";
import { DistanceConstraint } from "./structures/DistanceConstraint.js";
import { PBDSolver } from "./Solver.js";
import { Vec3 } from "../utils/Vec3.js";

/**
 * Класс симуляции ткани. Инкапсулирует генерацию сетки, создание частиц,
 * ограничений и интеграцию. Параметр yOffset поднимает всю ткань выше.
 */
export class ClothSimulator {
  constructor(nx, ny, side, _device) {
    this.nx = nx;
    this.ny = ny;
    this.side = side;

    this.gravityEnabled = true;
    this.solverIterations = 8;

    this.solver = new PBDSolver();

    // --- НАСТРОЙКА ВЫСОТЫ ТКАНИ ---
    this.yOffset = 0.35; //  поднять/опустить ткань здесь (метры)

    const mesh = MeshBuilder.buildGrid(nx, ny, side);
    this.indices = mesh.indices;
    this.cornerIndices = mesh.cornerIndices;
    this.oscillatingIndex = mesh.centerIndex;

    // частицы (с учётом yOffset)
    this.particles = mesh.positions.map(
      (p) => new Particle(new Vec3(p.x, p.y + this.yOffset, p.z), 1)
    );

    // пины (углы) — фиксируем их уже в поднятом положении
    for (const idx of this.cornerIndices) {
      const p = this.particles[idx];
      p.pinned = true;
      p.invMass = 0;
      p.pinTo.copy(p.position);
    }

    // дистанционные связи (горизонт, вертикаль, диагонали)
    this.constraints = [];
    const idx = (i, j) => j * this.nx + i;
    const link = (a, b) => this.constraints.push(new DistanceConstraint(this.particles[a], this.particles[b]));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (i + 1 < nx) link(idx(i, j), idx(i + 1, j));         // горизонт
        if (j + 1 < ny) link(idx(i, j), idx(i, j + 1));         // вертикаль
        if (i + 1 < nx && j + 1 < ny) link(idx(i, j), idx(i + 1, j + 1)); // диагональ /
        if (i + 1 < nx && j + 1 < ny) link(idx(i + 1, j), idx(i, j + 1)); // диагональ \
      }
    }

    // буфер позиций для рендера
    this.positions = new Float32Array(this.particles.length * 3);
    this.refreshPositions();
  }

  dispose() { /* no-op */ }

  reset() {
    // вернуть всё в исходное состояние, но с учётом yOffset
    const mesh = MeshBuilder.buildGrid(this.nx, this.ny, this.side);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const m = mesh.positions[i];
      const y = m.y + this.yOffset;
      p.position.set(m.x, y, m.z);
      p.prevPosition.set(m.x, y, m.z);
      if (p.pinned) p.pinTo.set(m.x, y, m.z);
    }
  }

  update(dt) {
    // центральная синусная вершина: именно перемещаем (а не сила)
    const amp = 0.15, freq = 1.2; // метры, Гц
    const ySin = Math.sin(performance.now() * 0.001 * 2 * Math.PI * freq) * amp;
    const center = this.particles[this.oscillatingIndex];
    center.position.y = this.yOffset + ySin; // добавили базовый сдвиг

    // шаг солвера
    this.solver.iterations = this.solverIterations;
    this.solver.step(this.particles, this.constraints, dt, this.gravityEnabled);

    this.refreshPositions();
  }

  refreshPositions() {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      this.positions[i * 3 + 0] = p.position.x;
      this.positions[i * 3 + 1] = p.position.y;
      this.positions[i * 3 + 2] = p.position.z;
    }
  }
}
