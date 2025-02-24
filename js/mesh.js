export const getCircle = (points = 3) => {
    const outerVertices = [];
    for (let i = 0; i < points; i++) {
        const angle = (Math.PI * 2) / points * i;
        outerVertices.push([Math.cos(angle), Math.sin(angle)]);
    }

    const vertices = [];
    for (let i = 0; i < points; i++) {
        vertices.push(outerVertices[i]);
        vertices.push(outerVertices[(i + 1) % points]);
        vertices.push([0, 0]);
    }

    return vertices.flat();
}

// triangles of an octahedron
const octahedron = [
    [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
    [[0, 0, -1], [0, -1, 0], [1, 0, 0]],
    [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, -1, 0]],
    [[0, 0, 1], [-1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [0, 1, 0], [-1, 0, 0]],
    [[0, 0, 1], [0, 1, 0], [1, 0, 0]],
    [[0, 0, -1], [1, 0, 0], [0, 1, 0]]
];

export const getSphere = (subDivisions = 0) => {
    let triangles = octahedron;
    for (let i = 0; i < subDivisions; i++) {
        const newTriangles = [];
        for (const [a, b, c] of triangles) {
            const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
            const ac = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
            const bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2];
            newTriangles.push([a, ab, ac]);
            newTriangles.push([ab, b, bc]);
            newTriangles.push([ac, bc, c]);
            newTriangles.push([ab, bc, ac]);
        }
        triangles = newTriangles;
    }

    triangles = triangles.map(triangle => 
        triangle.map(vertex => normalize
            (vertex)
        )
    );

    return triangles.flat().flat();
}

const normalize = (v) => {
    const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / length, v[1] / length, v[2] / length];
}