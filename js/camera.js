import { vec3, mat4 } from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.min.js';

let eye = vec3.create(0, 3000, 0);
let up = vec3.create(0, 0, 1);

const fov = Math.PI / 3;

let perspective = mat4.perspective(fov, window.innerWidth / window.innerHeight, 0.1);

window.addEventListener('resize', () => {
    perspective = mat4.perspective(fov, window.innerWidth / window.innerHeight, 0.1);
}, false);

document.addEventListener("wheel", (event) => {
    vec3.mulScalar(eye, (event.deltaY / 1000) + 1, eye);
    updateView();
});

let drag = false;
let dragStart = undefined;
let rotation = mat4.identity();
let initialPinchDistance = 0;

addEventListener('mousedown', (e) => {
    drag = true;
    dragStart = [e.clientX, e.clientY];
});

addEventListener('mousemove', (e) => {
    if (drag) {
        handleDragMovement(e.clientX, e.clientY);
    }
});

addEventListener('mouseup', () => {
    drag = false;
});

addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        drag = true;
        dragStart = [e.touches[0].clientX, e.touches[0].clientY];
    } else if (e.touches.length === 2) {
        // Two touches for pinch zoom
        initialPinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
        drag = false; // Disable rotation during pinch
    }
});

addEventListener('touchmove', (e) => {
    if (drag && e.touches.length === 1) {
        handleDragMovement(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const pinchRatio =  initialPinchDistance / currentDistance;
        
        vec3.mulScalar(eye, pinchRatio, eye);
        initialPinchDistance = currentDistance;
        updateView();
    }
});

addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
        drag = false;
    } else if (e.touches.length === 1) {
        dragStart = [e.touches[0].clientX, e.touches[0].clientY];
        drag = true;
    }
});

const getTouchDistance = (touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

const handleDragMovement = (x, y) => {
    const deltaX = x - dragStart[0];
    const deltaY = y - dragStart[1];

    vec3.rotateZ(eye, [0, 0, 0], -deltaX / 100, eye);
    vec3.rotateZ(up, [0, 0, 0], -deltaX / 100, up);

    const right = vec3.cross(up, eye);
    vec3.normalize(right, right);

    mat4.rotation(right, -deltaY / 100, rotation);
    mat4.multiply(rotation, [...eye, 1], eye);
    mat4.multiply(rotation, [...up, 1], up);

    updateView();

    dragStart = [x, y];
}

let view = mat4.lookAt(eye, [0, 0, 0], up);

const updateView = () => {
    mat4.lookAt(eye, [0, 0, 0], up, view);
}

export const getProjection = () => {
    return mat4.multiply(perspective, view);
};
