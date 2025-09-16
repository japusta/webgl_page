// Verlet с лёгким демпфингом скорости (как в CPU-версии — «вязкость»).

struct Params {
  dt         : f32,
  gravityY   : f32,
  _unused0   : f32,
  iterations : f32,
  oscIndex   : f32,
  baseY      : f32,
  amp        : f32,
  omega      : f32,
  time       : f32,
  numVerts   : f32,
  _padA      : f32,
  _padB      : f32,
};

@group(0) @binding(0) var<storage, read>       invMass   : array<f32>;
@group(0) @binding(1) var<storage, read_write> positions : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> prev      : array<vec4<f32>>;
@group(0) @binding(3) var<uniform>             params    : Params;

@compute @workgroup_size(64)
fn cs_integrate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(params.numVerts)) { return; }

  let w = invMass[i];
  if (w == 0.0) {
    prev[i] = positions[i];
    return;
  }

  let p  = positions[i];
  let pp = prev[i];

  let dt      = params.dt;
  let ay      = params.gravityY;
  let damping = 0.03; // 3% демпфинга

  let vel    = (p.xyz - pp.xyz) * (1.0 - damping);
  let newPos = vec4<f32>(p.xyz + vel + vec3<f32>(0.0, ay, 0.0) * (dt * dt), 0.0);

  prev[i]      = p;
  positions[i] = newPos;
}
