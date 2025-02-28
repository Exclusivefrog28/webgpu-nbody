import { vec3 } from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.min.js';

export const generateBodies = () => {
    const bodies = [];
    const scene = {};

    scene.addGreatAttractor = (radius, mass) => {
        bodies.push(...[
            0, 0, 0, radius, // position + radius
            0, 0, 0, 0, // velocity + offset
            0, 0, 0, mass // acceleration + mass
        ]);

        return scene;
    }

    scene.addRandomOrbiters = (count, semiMajorAxis, spread, parentMass, orbiterMass) => {
        for (let i = 0; i < count; ++i) {
            const angleXY = (2 * Math.PI) * Math.random();
            const distance = semiMajorAxis + spread * 2 * (Math.random() - 1);

            const y = Math.cos(angleXY) * distance;
            const x = Math.sin(angleXY) * distance;

            let velocity = vec3.create(1, 0, 0);
            vec3.rotateY(velocity, [0, 0, 0], 2 * Math.PI * Math.random(), velocity);
            vec3.rotateZ(velocity, [0, 0, 0], -angleXY, velocity);
            vec3.mulScalar(velocity, Math.sqrt(0.01 * parentMass / distance), velocity);
        
            bodies.push(...[
                x, y, 0, 10, // position + radius
                ...velocity, 0, // velocity + offset
                0, 0, 0, orbiterMass // acceleration + mass
            ])
        }

        return scene;
    };

    scene.get = () => {
        return bodies;
    }

    return scene;
}

