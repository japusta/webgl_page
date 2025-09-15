import { Vec3 } from "../utils/Vec3.js";
/**
 * Генератор регулярной квадратной сетки на плоскости XZ (Y=0).
 * Возвращает массив позиций вершин, индексы треугольников, уголки и центральную точку.
 */
export class MeshBuilder {
    static buildGrid(nx, ny, side = 1.0) {
        const positions = [];
        const indices = [];
        const dx = side / (nx - 1);
        const dy = side / (ny - 1);
        const x0 = -side / 2;
        const y0 = -side / 2;
        // создаём вершины
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                positions.push(new Vec3(x0 + i * dx, 0, y0 + j * dy));
            }
        }
        // создаём треугольники (две диагонали на квадрат)
        const idx = (i, j) => j * nx + i;
        for (let j = 0; j < ny - 1; j++) {
            for (let i = 0; i < nx - 1; i++) {
                const a = idx(i, j);
                const b = idx(i + 1, j);
                const c = idx(i, j + 1);
                const d = idx(i + 1, j + 1);
                // диагональ /
                indices.push(a, c, b);
                // диагональ \
                indices.push(b, c, d);
            }
        }
        const cornerIndices = [idx(0, 0), idx(nx - 1, 0), idx(0, ny - 1), idx(nx - 1, ny - 1)];
        const centerIndex = idx(Math.floor(nx / 2), Math.floor(ny / 2));
        return { positions, indices: new Uint32Array(indices), cornerIndices, centerIndex };
    }
}
