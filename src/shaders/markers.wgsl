fn normalize_safe(v: vec3<f32>) -> vec3<f32> {
  let l = max(length(v), 1e-6);
  return v / l;
}

struct Globals {
  aspect : f32,
  _pad0  : vec3<f32>,
  eye    : vec3<f32>, _pad1 : f32,
  look_at: vec3<f32>, _pad2 : f32,
}
@group(0) @binding(0) var<uniform> globals : Globals;

fn ortho(l: f32, r: f32, b: f32, t: f32, n: f32, f: f32) -> mat4x4<f32> {
  return mat4x4<f32>(
    vec4<f32>(2.0/(r-l), 0.0,         0.0,        0.0),
    vec4<f32>(0.0,       2.0/(t-b),   0.0,        0.0),
    vec4<f32>(0.0,       0.0,         1.0/(n-f),  0.0),
    vec4<f32>((l+r)/(l-r), (t+b)/(b-t), n/(n-f),  1.0)
  );
}

struct VSIn {
  @location(0) local   : vec2<f32>,  // форма ромба (slot 0)
  @location(1) posSize : vec4<f32>,  // xyz — позиция, w — размер (slot 1)
  @location(2) color   : vec4<f32>,  // rgb — цвет (slot 1)
};

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) color : vec3<f32>,
};

@vertex
fn vs_mark(v: VSIn) -> VSOut {
  let eye     = globals.eye;
  let look_at = globals.look_at;
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

  let world = vec3<f32>(v.posSize.xyz) + (x * v.local.x + y * v.local.y) * v.posSize.w;

  var out: VSOut;
  out.pos = proj * view * vec4<f32>(world, 1.0);
  out.color = v.color.rgb;
  return out;
}

@fragment
fn fs_mark(in: VSOut) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0);
}
