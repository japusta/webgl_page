struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
};

fn normalize_safe(v: vec3<f32>) -> vec3<f32> {
  let l = max(length(v), 1e-6);
  return v / l;
}

/* Globals: aspect + eye + target  (64 байт с паддингом) */
struct Globals {
  aspect : f32,
  _pad0  : vec3<f32>,
  eye    : vec3<f32>, _pad1 : f32,
  target : vec3<f32>, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> globals : Globals;

fn ortho(l: f32, r: f32, b: f32, t: f32, n: f32, f: f32) -> mat4x4<f32> {
  return mat4x4<f32>(
    vec4<f32>(2.0/(r-l), 0.0, 0.0, 0.0),
    vec4<f32>(0.0, 2.0/(t-b), 0.0, 0.0),
    vec4<f32>(0.0, 0.0, 1.0/(n-f), 0.0),
    vec4<f32>((l+r)/(l-r), (t+b)/(b-t), n/(n-f), 1.0)
  );
}

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VSOut {
  let eye     = globals.eye;
  let look_at = globals.target;
  let up      = vec3<f32>(0.0, 1.0, 0.0);

  let z = normalize_safe(eye - look_at);
  let x = normalize_safe(cross(up, z));
  let y = cross(z, x);

  let view = mat4x4<f32>(
    vec4<f32>(x, 0.0),
    vec4<f32>(y, 0.0),
    vec4<f32>(z, 0.0),
    vec4<f32>(-dot(x, eye), -dot(y, eye), -dot(z, eye), 1.0)
  );

  let a = max(globals.aspect, 1e-6);
  let half = 1.2;
  let proj = ortho(-half*a, half*a, -half, half, 0.01, 10.0);

  var out: VSOut;
  out.worldPos = position;
  out.pos = proj * view * vec4<f32>(position, 1.0);
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let n = vec3<f32>(0.0, 1.0, 0.0);
  let L = normalize(vec3<f32>(0.6, 1.0, 0.4));
  let ndotl = clamp(dot(n, L), 0.25, 1.0);
  let h = clamp((in.worldPos.y + 0.4) / 0.8, 0.0, 1.0);
  let base = mix(vec3<f32>(0.22, 0.30, 0.42), vec3<f32>(0.33, 0.58, 0.86), h);
  return vec4<f32>(base * ndotl, 1.0);
}

@fragment
fn fs_line(_in: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(0.06, 0.08, 0.10, 1.0);
}
