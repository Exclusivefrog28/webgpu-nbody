const loadShader = async (name) => {
    let shaderCode = await fetch(`shader/${name}.wgsl`);
    return await shaderCode.text()
}

let running = true;
let speed = 1;
let zoom = 0.3;
const bodyCount = 1000;
const radius = 1500;
const spread = 500;
const velocity = 2.5;
const greatAttractorMass = 1000000;

const canvas = document.getElementById("canvas");
const framerateElem = document.getElementById("framerate");
const energyElem = document.getElementById("energy");
const startBtn = document.getElementById("play");
const stopBtn = document.getElementById("pause");
const speedBtn = document.getElementById("speedBtn");
const speedLabel = document.getElementById("speedLabel")

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const greatAttractor = document.createElement("div");
greatAttractor.style.width = "16px";
greatAttractor.style.height = "16px";
greatAttractor.style.borderRadius = "8px";
greatAttractor.style.backgroundColor = "aqua";
greatAttractor.style.position = "absolute";

let bodies = [0, 0, 0, 0, 0, 0, greatAttractorMass, 0]; // a great attractor

for (let i = 1; i < bodyCount; ++i) {
    const angle = (2 * Math.PI) * Math.random();
    const y = Math.cos(angle);
    const x = Math.sin(angle);

    const randomRadius = radius + (Math.random() - 1) * spread;

    const velocityFactor = Math.sqrt(radius / randomRadius); // scale starting velocity based on distance

    const energy = 5 * Math.pow(velocityFactor * velocity, 2); // kinetic energy

    bodies = bodies.concat([randomRadius * x, randomRadius * y, -velocity * y * velocityFactor, velocity * x * velocityFactor, 0, 0, 10, energy]);
}

const updateFramerate = (value) => {
    framerateElem.innerHTML = value.toFixed(0);
}

speedBtn.addEventListener("click", () => {
    if (speed > 2) speed = 0.5;
    else speed += 0.5;

    speedLabel.innerHTML = `${speed.toFixed(1)}x`;
});

document.addEventListener("wheel", (event) => {
    zoom *= (-event.deltaY / 1000) + 1;
});

let hypo = undefined;
document.addEventListener('touchmove', (event) => {
    event.preventDefault();
    if (event.touches.length === 2) {
        let hypo1 = Math.hypot((event.touches[0].pageX - event.touches[1].pageX),
            (event.touches[0].pageY - event.touches[1].pageY));
        if (hypo === undefined) {
            hypo = hypo1;
        }
        zoom *= ((hypo1 / hypo - 1) * 0.5) + 1;
    }
}, false);
document.addEventListener('touchend', (event) => {
    hypo = undefined;
}, false);

(async () => {
	if (!navigator.gpu) {
		console.log("WebGPU not supported on this browser.");
		return;
	}
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		console.log("No appropriate GPUAdapter found.");
		return;
	}
	const device = await adapter.requestDevice();

    const ctx = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({
        device: device,
        format: canvasFormat,
    });

    const computeModule = device.createShaderModule({
        code: await loadShader('compute')
    });
    const renderModule = device.createShaderModule({
        code: await loadShader('render')
    });

    const computeLayout = device.createBindGroupLayout({
        label: 'computeGroup',
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'storage'}
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'storage'}
            }
        ]
    });
    const paramLayout = device.createBindGroupLayout({
        label: 'paramGroup',
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                buffer: {type: 'uniform'}
            }
        ]
    });


    const computePipeline = device.createComputePipeline({
        label: "Compute pipeline",
        layout: device.createPipelineLayout({
            bindGroupLayouts: [paramLayout, computeLayout],
        }),
        compute: {
            module: computeModule,
            entryPoint: "main"
        }
    });


    const renderPipeline = device.createRenderPipeline({
        label: "Render pipeline",
        layout: device.createPipelineLayout({
            bindGroupLayouts: [paramLayout],
        }),
        vertex: {
            module: renderModule,
            entryPoint: "vertexMain",
            buffers: [
                {
                    // instanced particles buffer
                    arrayStride: 8 * 4,
                    stepMode: 'instance',
                    attributes: [
                        {
                            // instance position
                            shaderLocation: 0,
                            offset: 0,
                            format: 'float32x2',
                        },
                        {
                            // instance velocity
                            shaderLocation: 1,
                            offset: 2 * 4,
                            format: 'float32x2',
                        },
                    ],
                },
                {
                    // vertex buffer
                    arrayStride: 2 * 4,
                    stepMode: 'vertex',
                    attributes: [
                        {
                            // vertex positions
                            shaderLocation: 2,
                            offset: 0,
                            format: 'float32x2',
                        },
                    ],
                },
            ],
        },
        fragment: {
            module: renderModule,
            entryPoint: "fragmentMain",
            targets: [{
                format: canvasFormat
            }]
        },
        primitive: {
            topology: 'triangle-list',
        }
    });

    const vertexBufferData = new Float32Array([
        -0.01, -0.02, 0.01,
        -0.02, 0.0, 0.02
    ]);
    const vertexBuffer = device.createBuffer({
        size: vertexBufferData.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation : true
    })
    new Float32Array(vertexBuffer.getMappedRange()).set(vertexBufferData);
    vertexBuffer.unmap();

    const paramCount = 2;
    const paramsBuffer = device.createBuffer({
        size: paramCount * Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    const particleArray = new Float32Array(bodies);
    const particleBuffers = new Array(2);
    const particleBindGroups = new Array(2);
    for (let i = 0; i < 2; ++i) {
        particleBuffers[i] = device.createBuffer({
            size: particleArray.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        new Float32Array(particleBuffers[i].getMappedRange()).set(
            particleArray
        );
        particleBuffers[i].unmap();
    }
    for (let i = 0; i < 2; ++i) {
        particleBindGroups[i] = device.createBindGroup({
            label: `particleBindGroup${i}`,
            layout: computePipeline.getBindGroupLayout(1),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: particleBuffers[i],
                        offset: 0,
                        size: particleArray.byteLength,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: particleBuffers[(i + 1) % 2],
                        offset: 0,
                        size: particleArray.byteLength,
                    },
                },
            ],
        });
    }

    const paramsBindGroup = device.createBindGroup({
        label: 'paramsBindGroup',
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: paramsBuffer,
                },
            }
        ],
    });

    const updateParams = (deltaTime) => {
        device.queue.writeBuffer(paramsBuffer, 0, new Float32Array([deltaTime, zoom]));
    }

    let t = 0;
    const startSimulation = async () => {

        let timeStart = performance.now();

        while (running) {
            let newTime = performance.now();
            const frameTime = (newTime - timeStart) * speed;
            updateFramerate(1000 / frameTime);
            updateParams(frameTime);

            timeStart = newTime;

            const commandEncoder = device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(computePipeline);
            computePass.setBindGroup(0, paramsBindGroup);
            computePass.setBindGroup(1, particleBindGroups[t % 2]);
            computePass.dispatchWorkgroups(Math.ceil(bodyCount / 64));

            computePass.end();

            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: ctx.getCurrentTexture().createView(),
                    loadOp: "clear",
                    storeOp: "store",
                    clearValue: {r: 0.051, g: 0.067, b: 0.09, a: 1}
                }]
            });

            renderPass.setPipeline(renderPipeline);
            renderPass.setVertexBuffer(0, particleBuffers[(t + 1) % 2]);
            renderPass.setVertexBuffer(1, vertexBuffer);
            renderPass.setBindGroup(0, paramsBindGroup);
            renderPass.draw(3, bodyCount, 0, 0);

            renderPass.end();

            const gpuCommands = commandEncoder.finish();

            device.queue.submit([gpuCommands]);
            await new Promise(resolve => setTimeout(resolve, 1));


            ++t;
        }
    };

    startSimulation();

    startBtn.addEventListener("click", () => {
        if (!running) {
            running = true;
            startSimulation();
        }
    });

    stopBtn.addEventListener("click", () => {
        if (running) {
            running = false;
        }
    });

})();

