const loadShader = async () => {
	let shaderCode = await fetch('shader/matrix.wgsl');
	return await shaderCode.text()
}

const frameRate = 144;
const frameTime = 1 / frameRate * 1000;

const display = document.getElementById("display");
const objects = Array.from(display.children).slice(0, 2);

objects.forEach((element) => {
	element.style.transition = `transform ${frameTime}ms linear`
})

const displayObjects = (matrix) => {
	
	for (const [index, element] of objects.entries()) {
		element.style.transform = `translate(${(matrix[index * 8] * 10).toFixed(0)}px, ${(matrix[index * 8 + 1] * 10).toFixed(0)}px)`;
	}
}

(async () => {
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		return;
	}
	const device = await adapter.requestDevice();

	// First Matrix
	const firstMatrix = new Float32Array([
		0, 0, 0, 0.005, 0, 0, 1000, 0,
		32, 0, 0, -5, 0, 0, 1, 0
	]);

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
		layout: computePipeline.getBindGroupLayout(0 /* index */),
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
			}
		]
	});

	setInterval(async () => {
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
		device.queue.submit([gpuCommands]);

		// Read buffer.
		await gpuReadBuffer.mapAsync(GPUMapMode.READ);
		const arrayBuffer = gpuReadBuffer.getMappedRange();
		displayObjects(new Float32Array(arrayBuffer));
	}, frameTime);

})();

