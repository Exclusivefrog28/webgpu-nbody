struct Body {
    position: vec2<f32>,
    velocity: vec2<f32>,
    acceleration: vec2<f32>,
    mass: f32,
    energy: f32
}

struct Params {
    deltaTime : f32
}

@group(0) @binding(0) var<storage, read> firstMatrix : array<Body>;
@group(0) @binding(1) var<storage, read_write> secondMatrix : array<Body>;
@group(0) @binding(2) var<uniform> params : Params;

const gravConst = 0.01;

@compute @workgroup_size(8)

fn main(@builtin(global_invocation_id) global_id: vec3u) {
    if global_id.x >= u32(arrayLength(&firstMatrix)) {
        return;
    }

    let body = firstMatrix[global_id.x];

    let midVelocity = vec2(
        body.velocity.x + 0.5 * body.acceleration.x * params.deltaTime,
        body.velocity.y + 0.5 * body.acceleration.y * params.deltaTime
    );

    let newPosition = vec2(
        body.position.x + midVelocity.x * params.deltaTime,
        body.position.y + midVelocity.y * params.deltaTime
    );

    var newAcceleration = vec2(0.0, 0.0);

    for (var i = 0u; i < arrayLength(&firstMatrix); i = i + 1) {
        if i == global_id.x {continue;}
        let attractor = firstMatrix[i];

        let pathBetween = vec2(attractor.position.x - newPosition.x, attractor.position.y - newPosition.y);
        let direction = normalize(pathBetween);
        let squaredDistance = max(pathBetween.x * pathBetween.x + pathBetween.y * pathBetween.y, 100);

        let forceScalar = gravConst * ((body.mass * attractor.mass) / squaredDistance);
        let accelerationScalar = forceScalar / body.mass;
        newAcceleration = vec2(newAcceleration.x + direction.x * accelerationScalar, newAcceleration.y + direction.y * accelerationScalar);
    }

    let newVelocity = vec2(
        midVelocity.x + 0.5 * newAcceleration.x * params.deltaTime,
        midVelocity.y + 0.5 * newAcceleration.y * params.deltaTime
    );

    let newEnergy = 0.5 * (newVelocity.x * newVelocity.x + newVelocity.y * newVelocity.y) * body.mass;

    secondMatrix[global_id.x] = Body(newPosition, newVelocity, newAcceleration, body.mass, newEnergy);
}