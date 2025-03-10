struct Params {
    deltaTime : f32,
    projection: mat4x4<f32>,
}

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(4) color : vec4f,
}

@group(0) @binding(0) var<uniform> params : Params;

@vertex
fn vertexMain (
  @location(0) a_particlePos : vec3f,
  @location(1) a_particleVel : vec3f,
  @location(2) a_radius : f32,
  @location(3) a_pos : vec3f
) -> VertexOutput {
    let pos = a_pos * a_radius;
    
    var output : VertexOutput;
    output.position = params.projection * vec4(pos + a_particlePos, 1.0);

    let velocity = a_particleVel.x * a_particleVel.x + a_particleVel.y * a_particleVel.y;
    output.color = vec4f(min(0.04 * velocity ,1), 0.5, 0.5, 1.0);

    return output;
}

@fragment
fn fragmentMain(@location(4) color : vec4f) -> @location(0) vec4f {
    return color;
}