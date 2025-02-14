struct Params {
    deltaTime : f32,
    zoom: f32
}

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(4) color : vec4f,
}

@group(0) @binding(0) var<uniform> params : Params;

@vertex
fn vertexMain (
  @location(0) a_particlePos : vec2f,
  @location(1) a_particleVel : vec2f,
  @location(2) a_pos : vec2f
) -> VertexOutput {
    let angle = -atan2(a_particleVel.x, a_particleVel.y);
    let pos = a_pos * params.zoom * 10;

    var output : VertexOutput;
    output.position = vec4(pos + a_particlePos * params.zoom, 0.0, 1.0);

    let velocity = a_particleVel.x * a_particleVel.x + a_particleVel.y * a_particleVel.y;
    output.color = vec4f(min(0.05 * velocity ,1), 0.5, 0.5, 1.0);

    return output;
}

@fragment
fn fragmentMain(@location(4) color : vec4f) -> @location(0) vec4f {
    return color;
}