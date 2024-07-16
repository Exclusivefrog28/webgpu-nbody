const loadShader = async () => {
	let shaderCode = await fetch('shader/matrix.wgsl');
	return await shaderCode.text()
}

const speed = 1;
const bodyCount = 1000;
const radius = 1000;
const spread = 200;
const velocity = 1.3;
const velocityNoise = 0;
const zoom = 0.3;
const greatAttractorMass = 100000;

const display = document.getElementById("display");
const objects = [];

const greatAttractor = document.createElement("div");
greatAttractor.style.width = "16px";
greatAttractor.style.height = "16px";
greatAttractor.style.borderRadius = "8px";
greatAttractor.style.backgroundColor = "orange";
greatAttractor.style.position = "absolute";

display.appendChild(greatAttractor);
objects.push(greatAttractor);

for (let i = 1; i < bodyCount; ++i) {
	const newElement = document.createElement("div");
	newElement.style.width = "8px";
	newElement.style.height = "8px";
	newElement.style.borderRadius = "4px";
	newElement.style.backgroundColor = "white";
	newElement.style.position = "absolute";

	display.appendChild(newElement);
	objects.push(newElement);
}

const displayObjects = (matrix) => {

	for (const [index, element] of objects.entries()) {
		element.style.transform = `translate(${(matrix[index * 8] * zoom).toFixed(0)}px, ${(matrix[index * 8 + 1] * zoom).toFixed(0)}px)`;
	}
}

(async () => {
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		return;
	}
	const device = await adapter.requestDevice();

	let bodies = [0, 0, 0, 0, 0, 0, greatAttractorMass, 0]; //a great attractor

	for (let i = 1; i < bodyCount; ++i) {
		const angle = (2 * Math.PI) * Math.random();
		const y = Math.cos(angle);
		const x = Math.sin(angle);

		const randomRadius = radius + (Math.random() - 1) * spread;

		const velocityOffsetX = (Math.random() - 1) * velocityNoise;
		const velocityOffsetY = (Math.random() - 1) * velocityNoise;

		bodies = bodies.concat([randomRadius * x, randomRadius * y, -velocity * y + velocityOffsetX, velocity * x + velocityOffsetY, 0, 0, 10, 0]);
	}

	// First Matrix
	const firstMatrix = new Float32Array(bodies);

	const gpuBufferFirstMatrix = device.createBuffer({
		mappedAtCreation: true,
		size: firstMatrix.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});
	const arrayBufferFirstMatrix = gpuBufferFirstMatrix.getMappedRange();
	new Float32Array(arrayBufferFirstMatrix).set(firstMatrix);
	gpuBufferFirstMatrix.unmap();


	// Second Matrix
	const gpuBufferSecondMatrix = device.createBuffer({
		mappedAtCreation: true,
		size: firstMatrix.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});
	const arrayBufferSecondMatrix = gpuBufferSecondMatrix.getMappedRange();
	new Float32Array(arrayBufferSecondMatrix).set(firstMatrix);
	gpuBufferSecondMatrix.unmap();

	// Deltatime

	const params = new Float32Array([0]);

	const gpuBufferParams = device.createBuffer({
		size: params.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	})


	const shaderModule = device.createShaderModule({
		code: await loadShader()
	});

	const computePipeline = device.createComputePipeline({
		layout: "auto",
		compute: {
			module: shaderModule,
			entryPoint: "main"
		}
	});

	const bindGroup = device.createBindGroup({
		layout: computePipeline.getBindGroupLayout(0),
		entries: [
			{
				binding: 0,
				resource: {
					buffer: gpuBufferFirstMatrix
				}
			},
			{
				binding: 1,
				resource: {
					buffer: gpuBufferSecondMatrix
				}
			},
			{
				binding: 2,
				resource: {
					buffer: gpuBufferParams
				}
			}
		]
	});

	let timeStart = performance.now();

	while (true) {

		const commandEncoder = device.createCommandEncoder();

		const passEncoder = commandEncoder.beginComputePass();
		passEncoder.setPipeline(computePipeline);
		passEncoder.setBindGroup(0, bindGroup);
		const workgroupCount = Math.ceil((firstMatrix.length / 8) / 8);
		passEncoder.dispatchWorkgroups(workgroupCount);
		passEncoder.end();

		// Get a GPU buffer for reading in an unmapped state.
		const gpuReadBuffer = device.createBuffer({
			size: firstMatrix.byteLength,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});

		// Encode commands for copying buffer to buffer.
		commandEncoder.copyBufferToBuffer(
			gpuBufferSecondMatrix /* source buffer */,
			0 /* source offset */,
			gpuBufferFirstMatrix /* destination buffer */,
			0 /* destination offset */,
			firstMatrix.byteLength /* size */
		);
		commandEncoder.copyBufferToBuffer(
			gpuBufferSecondMatrix /* source buffer */,
			0 /* source offset */,
			gpuReadBuffer /* destination buffer */,
			0 /* destination offset */,
			firstMatrix.byteLength /* size */
		);

		// Submit GPU commands.
		const gpuCommands = commandEncoder.finish();

		let newTime = performance.now();
		params[0] = (newTime - timeStart) * speed;
		timeStart = newTime;
		device.queue.writeBuffer(gpuBufferParams, 0, params);
		device.queue.submit([gpuCommands]);

		// Read buffer.
		await gpuReadBuffer.mapAsync(GPUMapMode.READ);
		const arrayBuffer = gpuReadBuffer.getMappedRange();
		displayObjects(new Float32Array(arrayBuffer));
	}
})();

