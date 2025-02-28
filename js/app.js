import { getProjection } from './camera.js';
import { getSphere } from './mesh.js';
import { generateBodies } from './scene.js';

const loadShader = async (name) => {
    let shaderCode = await fetch(`shader/${name}.wgsl`);
    return await shaderCode.text()
}

let running = true;
let speed = 1;

const bodyCount = 1000;
const radius = 1500;
const spread = 200;
const greatAttractorMass = 1000000;

const subDivisions = 3;

const canvas = document.getElementById("canvas");
const framerateElem = document.getElementById("framerate");
const attractionTimeElem = document.getElementById("attractiontime");
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

let bodies = generateBodies().addGreatAttractor(100, greatAttractorMass).addRandomOrbiters(bodyCount - 1, radius, spread, greatAttractorMass, 10).get();

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

let attractionPassDurationSum = 0;
let renderPassDurationSum = 0;
let timerSamples = 0;
const timerSamplesPerUpdate = 20;

const updatePassTimes = (attractionPassDuration, renderPassDuration) => {
    if (attractionPassDuration > 0 && renderPassDuration > 0) {
        attractionPassDurationSum += attractionPassDuration;
        renderPassDurationSum += renderPassDuration;
        timerSamples++;
    }

    if (timerSamples >= timerSamplesPerUpdate) {
        const avgComputeMicroseconds = Math.round(
            attractionPassDurationSum / timerSamples / 1000
        );
        const avgRenderMicroseconds = Math.round(
            renderPassDurationSum / timerSamples / 1000
        );

        attractionTimeElem.innerHTML = avgComputeMicroseconds;
        renderTimeElem.innerHTML = avgRenderMicroseconds;

        attractionPassDurationSum = 0;
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

    const attractionModule = device.createShaderModule({
        code: await loadShader('attraction')
    });
    const renderModule = device.createShaderModule({
        code: await loadShader('render')
    });

    const attractionLayout = device.createBindGroupLayout({
        label: 'attractionGroup',
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


    const attractionPipeline = device.createComputePipeline({
        label: "Attraction pipeline",
        layout: device.createPipelineLayout({
            bindGroupLayouts: [paramLayout, attractionLayout],
        }),
        compute: {
            module: attractionModule,
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
                            offset: 12,
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

    const attractionPassDescriptor = {};

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
        attractionPassDescriptor.timestampWrites = {
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

    const bodyArray = new Float32Array(bodies);
    const bodyBuffers = new Array(2);
    const bodyBindGroups = new Array(2);
    for (let i = 0; i < 2; ++i) {
        bodyBuffers[i] = device.createBuffer({
            size: bodyArray.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        new Float32Array(bodyBuffers[i].getMappedRange()).set(
            bodyArray
        );
        bodyBuffers[i].unmap();
    }
    for (let i = 0; i < 2; ++i) {
        bodyBindGroups[i] = device.createBindGroup({
            label: `particleBindGroup${i}`,
            layout: attractionPipeline.getBindGroupLayout(1),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: bodyBuffers[i],
                        offset: 0,
                        size: bodyArray.byteLength,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: bodyBuffers[(i + 1) % 2],
                        offset: 0,
                        size: bodyArray.byteLength,
                    },
                },
            ],
        });
    }

    const paramsBindGroup = device.createBindGroup({
        label: 'paramsBindGroup',
        layout: attractionPipeline.getBindGroupLayout(0),
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
            const attractionPass = commandEncoder.beginComputePass(attractionPassDescriptor);
            attractionPass.setPipeline(attractionPipeline);
            attractionPass.setBindGroup(0, paramsBindGroup);
            attractionPass.setBindGroup(1, bodyBindGroups[t % 2]);
            attractionPass.dispatchWorkgroups(Math.ceil(bodyCount / 64));
            attractionPass.end();
        }

        updateDescriptor();
        const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);

        renderPass.setPipeline(renderPipeline);
        renderPass.setVertexBuffer(0, bodyBuffers[(t + 1) % 2]);
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

