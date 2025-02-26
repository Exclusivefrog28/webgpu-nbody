import { getProjection } from './camera.js';
import { getSphere } from './mesh.js';

const loadShader = async (name) => {
    let shaderCode = await fetch(`shader/${name}.wgsl`);
    return await shaderCode.text()
}

let running = true;
let speed = 1;
const bodyCount = 1000;
const radius = 1500;
const spread = 500;
const velocity = 2.5;
const greatAttractorMass = 1000000;

const subDivisions = 2;

const canvas = document.getElementById("canvas");
const framerateElem = document.getElementById("framerate");
const computeTimeElem = document.getElementById("computetime");
const renderTimeElem = document.getElementById("rendertime");
const startBtn = document.getElementById("play");
const stopBtn = document.getElementById("pause");
const speedBtn = document.getElementById("speedBtn");
const speedLabel = document.getElementById("speedLabel")

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}, false);


const greatAttractor = document.createElement("div");
greatAttractor.style.width = "16px";
greatAttractor.style.height = "16px";
greatAttractor.style.borderRadius = "8px";
greatAttractor.style.backgroundColor = "aqua";
greatAttractor.style.position = "absolute";

let bodies = [
    0, 0, 0, 0, // position + offset
    0, 0, 0, 0, // velocity + offset
    0, 0, 0, greatAttractorMass // acceleartion + mass
]; // a great attractor

for (let i = 1; i < bodyCount; ++i) {
    const angle = (2 * Math.PI) * Math.random();
    const y = Math.cos(angle);
    const x = Math.sin(angle);

    const randomRadius = radius + (Math.random() - 1) * spread;

    const velocityFactor = Math.sqrt(radius / randomRadius); // scale starting velocity based on distance

    bodies = bodies.concat([
        randomRadius * x, randomRadius * y, (-0.5 + Math.random()) * 500, 0, // position + offset
        -velocity * y * velocityFactor, velocity * x * velocityFactor, 0, 0, // velocity + offset
        0, 0, 0, 10 // acceleration + mass
    ]);
}

let frameTimeSum = 0;
let frameTimerSamples = 0
const frameTimerSamplesPerUpdate = 10;
const updateFramerate = (value) => {
    frameTimeSum += value;
    frameTimerSamples++;

    if (frameTimerSamples >= frameTimerSamplesPerUpdate) {
        framerateElem.innerHTML = Math.round(1000 / (frameTimeSum / frameTimerSamples));
        frameTimeSum = 0;
        frameTimerSamples = 0;
    }
}

let computePassDurationSum = 0;
let renderPassDurationSum = 0;
let timerSamples = 0;
const timerSamplesPerUpdate = 20;
const updatePassTimes = (computePassDuration, renderPassDuration) => {
    if (computePassDuration > 0 && renderPassDuration > 0) {
        computePassDurationSum += computePassDuration;
        renderPassDurationSum += renderPassDuration;
        timerSamples++;
    }

    if (timerSamples >= timerSamplesPerUpdate) {
        const avgComputeMicroseconds = Math.round(
            computePassDurationSum / timerSamples / 1000
        );
        const avgRenderMicroseconds = Math.round(
            renderPassDurationSum / timerSamples / 1000
        );

        computeTimeElem.innerHTML = avgComputeMicroseconds;
        renderTimeElem.innerHTML = avgRenderMicroseconds;

        computePassDurationSum = 0;
        renderPassDurationSum = 0;
        timerSamples = 0;
    }
};

speedBtn.addEventListener("click", () => {
    if (speed > 2) speed = 0.5;
    else speed += 0.5;

    speedLabel.innerHTML = `${speed.toFixed(1)}x`;
});


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

    const hasTimestampQuery = adapter.features.has('timestamp-query');

    const device = await adapter.requestDevice({
        requiredFeatures: hasTimestampQuery ? ['timestamp-query'] : [],
    });

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
                buffer: { type: 'storage' }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: 'storage' }
            }
        ]
    });
    const paramLayout = device.createBindGroupLayout({
        label: 'paramGroup',
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                buffer: { type: 'uniform' }
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
                    arrayStride: 48,
                    stepMode: 'instance',
                    attributes: [
                        {
                            shaderLocation: 0,
                            offset: 0,
                            format: 'float32x3',
                        },
                        {
                            shaderLocation: 1,
                            offset: 16,
                            format: 'float32x3',
                        },
                        {
                            shaderLocation: 2,
                            offset: 44,
                            format: 'float32',
                        },
                    ],
                },
                {
                    arrayStride: 3 * 4,
                    stepMode: 'vertex',
                    attributes: [
                        {
                            shaderLocation: 3,
                            offset: 0,
                            format: 'float32x3',
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
            frontFace: 'cw',
            cullMode: 'back',
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
        }
    });

    const renderPassDescriptor = {
        colorAttachments: [{
            view: undefined,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.051, g: 0.067, b: 0.09, a: 1 }
        }],
        depthStencilAttachment: {
            view: undefined,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
    };

    let depthTexture = undefined;
    const updateDescriptor = () => {
        const canvasTexture = ctx.getCurrentTexture();
        
        if (!depthTexture ||
            depthTexture.width !== canvasTexture.width ||
            depthTexture.height !== canvasTexture.height) {
          if (depthTexture) {
            depthTexture.destroy();
          }
          depthTexture = device.createTexture({
            size: [canvasTexture.width, canvasTexture.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          });
        }

        renderPassDescriptor.colorAttachments[0].view = canvasTexture.createView();
        renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();
    };

    const computePassDescriptor = {};

    let querySet = undefined;
    let resolveBuffer = undefined;
    const spareResultBuffers = [];

    if (hasTimestampQuery) {
        querySet = device.createQuerySet({
            type: 'timestamp',
            count: 4,
        });
        resolveBuffer = device.createBuffer({
            size: 4 * BigInt64Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        });
        computePassDescriptor.timestampWrites = {
            querySet,
            beginningOfPassWriteIndex: 0,
            endOfPassWriteIndex: 1,
        };
        renderPassDescriptor.timestampWrites = {
            querySet,
            beginningOfPassWriteIndex: 2,
            endOfPassWriteIndex: 3,
        };
    }

    const vertexBufferData = new Float32Array(getSphere(subDivisions));
    const vertexBuffer = device.createBuffer({
        size: vertexBufferData.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    })
    new Float32Array(vertexBuffer.getMappedRange()).set(vertexBufferData);
    vertexBuffer.unmap();

    const paramsBuffer = device.createBuffer({
        size: 80,
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
        device.queue.writeBuffer(paramsBuffer, 0, new Float32Array([
            deltaTime, 0, 0, 0, ...getProjection()
        ]));
    }

    let t = 0;
    let lastTime = performance.now();

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            lastTime = performance.now();
        }
    });

    const iteration = async (startTime) => {
        const deltaTime = startTime - lastTime;
        updateFramerate(deltaTime);
        updateParams(deltaTime * speed);
        lastTime = startTime;

        const commandEncoder = device.createCommandEncoder();

        if (running) {
            const computePass = commandEncoder.beginComputePass(computePassDescriptor);
            computePass.setPipeline(computePipeline);
            computePass.setBindGroup(0, paramsBindGroup);
            computePass.setBindGroup(1, particleBindGroups[t % 2]);
            computePass.dispatchWorkgroups(Math.ceil(bodyCount / 64));
            computePass.end();
        }

        updateDescriptor();
        const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);

        renderPass.setPipeline(renderPipeline);
        renderPass.setVertexBuffer(0, particleBuffers[(t + 1) % 2]);
        renderPass.setVertexBuffer(1, vertexBuffer);
        renderPass.setBindGroup(0, paramsBindGroup);
        renderPass.draw(vertexBufferData.length / 3, bodyCount, 0, 0);
        renderPass.end();

        let resultBuffer = undefined;
        if (hasTimestampQuery) {
            resultBuffer =
                spareResultBuffers.pop() ||
                device.createBuffer({
                    size: 4 * BigInt64Array.BYTES_PER_ELEMENT,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                });
            commandEncoder.resolveQuerySet(querySet, 0, 4, resolveBuffer, 0);
            commandEncoder.copyBufferToBuffer(resolveBuffer, 0, resultBuffer, 0, resultBuffer.size);
        }


        device.queue.submit([commandEncoder.finish()]);
        await device.queue.onSubmittedWorkDone();

        if (hasTimestampQuery) {
            resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
                const times = new BigInt64Array(resultBuffer.getMappedRange());
                const computePassDuration = Number(times[1] - times[0]);
                const renderPassDuration = Number(times[3] - times[2]);

                resultBuffer.unmap();
                updatePassTimes(computePassDuration, renderPassDuration);

                spareResultBuffers.push(resultBuffer);
            });
        }

        if (running) ++t;
        requestAnimationFrame(iteration);
    };

    requestAnimationFrame(iteration);

    startBtn.addEventListener("click", () => {
        if (!running) {
            running = true;
        }
    });

    stopBtn.addEventListener("click", () => {
        if (running) {
            running = false;
        }
    });

})();

