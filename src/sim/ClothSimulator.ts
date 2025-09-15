import { MeshBuilder } from "../geom/MeshBuilder.js";
import { Particle } from "./structures/Particle.js";
import { DistanceConstraint } from "./structures/DistanceConstraint.js";
import { PBDSolver } from "./Solver.js";
import { Vec3 } from "../utils/Vec3.js";

/**
 * Класс симуляции ткани. Инкапсулирует генерацию сетки, создание частиц,
 * ограничений и интеграцию. Предоставляет публичные свойства для рендера.
 */
export class ClothSimulator {
  particles: Particle[] = [];
  constraints: DistanceConstraint[] = [];
  indices: Uint32Array;
  cornerIndices: number[];
  oscillatingIndex: number;
  gravityEnabled = true;
  solverIterations = 8;
  positions: Float32Array;
  private solver = new PBDSolver();

  constructor(
    public nx: number,
    public ny: number,
    public side: number,
    _device: GPUDevice
  ) {
    const mesh = MeshBuilder.buildGrid(nx, ny, side);
    this.indices = mesh.indices;
    this.cornerIndices = mesh.cornerIndices;
    this.oscillatingIndex = mesh.centerIndex;
    // создаём частицы
    this.particles = mesh.positions.map((p) => new Particle(new Vec3(p.x, p.y, p.z), 1));
    // фиксируем углы
    for (const idx of this.cornerIndices) {
      const p = this.particles[idx];
      p.pinned = true;
      p.invMass = 0;
      p.pinTo.copy(p.position);
    }
    // Создаём дистанционные связи (растяжение, сдвиг, диагонали)
    const idx = (i: number, j: number) => j * this.nx + i;
    const push = (a: number, b: number) => this.constraints.push(new DistanceConstraint(this.particles[a], this.particles[b]));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (i + 1 < nx) push(idx(i, j), idx(i + 1, j));
        if (j + 1 < ny) push(idx(i, j), idx(i, j + 1));
        if (i + 1 < nx && j + 1 < ny) push(idx(i, j), idx(i + 1, j + 1));
        if (i + 1 < nx && j + 1 < ny) push(idx(i + 1, j), idx(i, j + 1));
      }
    }
    this.positions = new Float32Array(this.particles.length * 3);
    this.refreshPositions();
  }

  dispose() {
    // оставлено для будущей GPU‑версии
  }

  reset() {
    // Сбрасываем частицы в исходное положение
    const mesh = MeshBuilder.buildGrid(this.nx, this.ny, this.side);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const m = mesh.positions[i];
      p.position.set(m.x, m.y, m.z);
      p.prevPosition.set(m.x, m.y, m.z);
      if (p.pinned) p.pinTo.set(m.x, m.y, m.z);
    }
  }

  update(dt: number) {
    // перемещаем центральную вершину по синусу
    const amp = 0.15;
    const freq = 1.2;
    const y = Math.sin(performance.now() * 0.001 * 2 * Math.PI * freq) * amp;
    const center = this.particles[this.oscillatingIndex];
    center.position.y = y;
    // обновляем итерации солвера и вызываем шаг
    this.solver.iterations = this.solverIterations;
    this.solver.step(this.particles, this.constraints, dt, this.gravityEnabled);
    this.refreshPositions();
  }

  private refreshPositions() {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      this.positions[i * 3 + 0] = p.position.x;
      this.positions[i * 3 + 1] = p.position.y;
      this.positions[i * 3 + 2] = p.position.z;
    }
  }
}