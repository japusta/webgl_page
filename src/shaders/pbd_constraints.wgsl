// Классический PBD для рёбер (без XPBD-лямбд).
// Безопасность обеспечивает раскраска групп на CPU (никаких гонок).

struct Params {
  dt         : f32, gravityY: f32, _unused0: f32, iterations: f32,
  oscIndex   : f32, baseY: f32, amp: f32, omega: f32,
  time       : f32, numVerts: f32, _padA: f32, _padB: f32,
};

struct Edge {
  i    : u32,
  j    : u32,
  rest : f32,
  pad  : f32,
};

@group(0) @binding(0) var<storage, read>       invMass   : array<f32>;
@group(0) @binding(1) var<storage, read_write> positions : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read>       edges     : array<Edge>;
@group(0) @binding(3) var<uniform>             params    : Params;

@compute @workgroup_size(128)
fn cs_constraints(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cid = gid.x;

  let e = edges[cid];        // количество диспатчат хост-код задаёт по g.count
  let i = e.i;
  let j = e.j;

  let wi = invMass[i];
  let wj = invMass[j];
  if (wi == 0.0 && wj == 0.0) { return; }

  var pi = positions[i].xyz;
  var pj = positions[j].xyz;

  let d = pi - pj;
  let l = length(d);
  if (l < 1e-6) { return; }

  let n = d / l;
  let C = l - e.rest;

  let wsum = wi + wj;
  if (wsum > 0.0) {
    // Ограничим шаг (shock-limiter), чтобы не выстреливало
    var corr = (C / wsum) * n;
    let maxStep = 0.2 * e.rest;                 // не больше 20% длины ребра
    let clen = length(corr);
    if (clen > maxStep) { corr = corr * (maxStep / clen); }

    pi -= wi * corr;
    pj += wj * corr;

    positions[i] = vec4<f32>(pi, positions[i].w);
    positions[j] = vec4<f32>(pj, positions[j].w);
  }
}
