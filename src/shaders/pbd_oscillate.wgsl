// Жёстко задаём координату центральной вершины по синусу,
// НО не обнуляем prev — так Verlet получает импульс и волна
// естественно распространяется.

struct Params {
  dt         : f32, gravityY: f32, _unused0: f32, iterations: f32,
  oscIndex   : f32, baseY: f32, amp: f32, omega: f32,
  time       : f32, numVerts: f32, _padA: f32, _padB: f32,
};

@group(0) @binding(1) var<storage, read_write> positions : array<vec4<f32>>;
// prev не нужен здесь
@group(0) @binding(3) var<uniform>             params    : Params;

@compute @workgroup_size(1)
fn cs_oscillate() {
  let idx = u32(params.oscIndex);
  // целевая высота по синусу
  let y_target = params.baseY + params.amp * sin(params.omega * params.time);

  // просто перезаписываем Y; prev НЕ трогаем
  var p = positions[idx];
  p.y = y_target;
  positions[idx] = p;
}
