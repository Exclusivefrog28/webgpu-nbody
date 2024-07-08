@group(0) @binding(0) var<storage, read> firstMatrix : array<f32>;
@group(0) @binding(1) var<storage, read_write> secondMatrix : array<f32>;

const gravParam = 1;

@compute @workgroup_size(8)

fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let index = global_id.x * 5;

    // Guard against out-of-bounds work group sizes
    if index >= u32(arrayLength(&firstMatrix)) {
        return;
    }

    var position = vec2(firstMatrix[index], firstMatrix[index + 1]);
    var velocity = vec2(firstMatrix[index + 2], firstMatrix[index + 3]);
    let mass = firstMatrix[index + 4];

    var acceleration = vec2(0.0, 0.0);
    for (var i = 0; i < i32(arrayLength(&firstMatrix)); i = i + 5) {
        if (i == i32(index)) {continue;}
        let otherPosition = vec2(firstMatrix[i], firstMatrix[i + 1]);
        let otherMass = firstMatrix[i + 4];

        let pathBetween = vec2(otherPosition.x - position.x, otherPosition.y - position.y);
        let direction = normalize(pathBetween);
        let squaredDistance = pathBetween.x * pathBetween.x + pathBetween.y * pathBetween.y;

        let force = gravParam * ((mass * otherMass) / squaredDistance);
        acceleration = vec2(acceleration.x + direction.x * (force / mass), acceleration.y + direction.y * (force / mass));
    }
    
    velocity = vec2(velocity.x + acceleration.x, velocity.y + acceleration.y);
    position = vec2(position.x + velocity.x, position.y + velocity.y);

    secondMatrix[index] = position.x;
    secondMatrix[index + 1] = position.y;
    secondMatrix[index + 2] = velocity.x;
    secondMatrix[index + 3] = velocity.y;
}