export const getVertices = (points = 3) => {
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