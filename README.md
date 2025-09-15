# WebGPU Cloth + Orbit Controls

Коротко: симуляция ткани (PBD) на WebGPU с орбит-камерой. ЛКМ — вращение, колесо — зум. Каркас и маркеры углов/центра.

## Требования
- Браузер с WebGPU (Chrome/Edge 113+).
- Включён `navigator.gpu`.
- Node.js (для локального сервера).

## Быстрый старт
```bash
npm i -D http-server
npx http-server -p 5173 .
# Откройте:
# http://localhost:5173/public/
