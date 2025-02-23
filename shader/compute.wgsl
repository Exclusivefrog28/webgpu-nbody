struct Body {
    position: vec3<f32>,
    velocity: vec3<f32>,
    acceleration: vec3<f32>,
    mass: f32
}

struct Params {
    deltaTime : f32,
    zoom: f32,
    aspectRatio: f32
}

@group(0) @binding(0) var<uniform> params : Params;
@group(1) @binding(0) var<storage, read_write> bodiesA : array<Body>;
@group(1) @binding(1) var<storage, read_write> bodiesB : array<Body>;

const gravConst = 0.01;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    if global_id.x >= u32(arrayLength(&bodiesA)) {
        return;
    }

    let body = bodiesA[global_id.x];

    let midVelocity = body.velocity + 0.5 * body.acceleration * params.deltaTime;

    let newPosition = body.position + midVelocity * params.deltaTime;

    var newAcceleration = vec3(0.0, 0.0, 0.0);

    for (var i = 0u; i < arrayLength(&bodiesA); i = i + 1) {
        if i == global_id.x {continue;}
        let attractor = bodiesA[i];

        let pathBetween = attractor.position - newPosition;
        let direction = normalize(pathBetween);
        let squaredDistance = max(pathBetween.x * pathBetween.x + pathBetween.y * pathBetween.y + pathBetween.z * pathBetween.z, 100);

        let forceScalar = gravConst * ((body.mass * attractor.mass) / squaredDistance);
        let accelerationScalar = forceScalar / body.mass;
        newAcceleration = newAcceleration + direction * accelerationScalar;
    }

    let newVelocity = midVelocity + 0.5 * newAcceleration * params.deltaTime;

    bodiesB[global_id.x] = Body(newPosition, newVelocity, newAcceleration, body.mass);
}