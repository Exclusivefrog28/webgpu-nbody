const loadShader = async () => {
	let shaderCode = await fetch('shader/matrix.wgsl');
	return await shaderCode.text()
}

let running = true;
let speed = 1;
const bodyCount = 1000;
const radius = 1500;
const spread = 500;
const velocity = 2.5;
const zoom = 0.3;
const greatAttractorMass = 1000000;

const displayElem = document.getElementById("display");
const framerateElem = document.getElementById("framerate");
const energyElem = document.getElementById("energy");
const startBtn = document.getElementById("play");
const stopBtn = document.getElementById("pause");
const speedBtn = document.getElementById("speedBtn");
const speedLabel = document.getElementById("speedLabel")

const objects = [];

const greatAttractor = document.createElement("div");
greatAttractor.style.width = "16px";
greatAttractor.style.height = "16px";
greatAttractor.style.borderRadius = "8px";
greatAttractor.style.backgroundColor = "aqua";
greatAttractor.style.position = "absolute";

displayElem.appendChild(greatAttractor);
objects.push(greatAttractor);

for (let i = 1; i < bodyCount; ++i) {
	const newElement = document.createElement("div");
	newElement.style.width = "8px";
	newElement.style.height = "8px";
	newElement.style.borderRadius = "4px";
	newElement.style.backgroundColor = "white";
	newElement.style.position = "absolute";

	displayElem.appendChild(newElement);
	objects.push(newElement);
}

const displayObjects = (matrix) => {
	let totalEnergy = 0;

	for (const [index, element] of objects.entries()) {
		totalEnergy += matrix[index * 8 + 7];
		element.style.transform = `translate(${(matrix[index * 8] * zoom).toFixed(0)}px, ${(matrix[index * 8 + 1] * zoom).toFixed(0)}px)`;
	}

	energyElem.innerHTML = totalEnergy.toFixed(0);
}

const updateFramerate = (value) => {
	framerateElem.innerHTML = value.toFixed(0);
}

speedBtn.addEventListener("click", ()=>{
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
	const device = await adapter.requestDevice();

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


	const input = new Float32Array(bodies);

	const inputBuffer = device.createBuffer({
		mappedAtCreation: true,
		size: input.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});
	const inputArrayBuffer = inputBuffer.getMappedRange();
	new Float32Array(inputArrayBuffer).set(input);
	inputBuffer.unmap();

	const outputBuffer = device.createBuffer({
		mappedAtCreation: true,
		size: input.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
	});
	const outputArrayBuffer = outputBuffer.getMappedRange();
	new Float32Array(outputArrayBuffer).set(input);
	outputBuffer.unmap();


	const params = new Float32Array([0]);
	const paramsBuffer = device.createBuffer({
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
					buffer: inputBuffer
				}
			},
			{
				binding: 1,
				resource: {
					buffer: outputBuffer
				}
			},
			{
				binding: 2,
				resource: {
					buffer: paramsBuffer
				}
			}
		]
	});

	

	const startSimulation = async () => {

		let timeStart = performance.now();
		while (running) {
			const commandEncoder = device.createCommandEncoder();
	
			const passEncoder = commandEncoder.beginComputePass();
			passEncoder.setPipeline(computePipeline);
			passEncoder.setBindGroup(0, bindGroup);
			const workgroupCount = Math.ceil((input.length / 8) / 8);
			passEncoder.dispatchWorkgroups(workgroupCount);
			passEncoder.end();
	
			const readBuffer = device.createBuffer({
				size: input.byteLength,
				usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
			});
	
			commandEncoder.copyBufferToBuffer(
				outputBuffer, 0,
				inputBuffer, 0,
				input.byteLength
			);
			commandEncoder.copyBufferToBuffer(
				outputBuffer, 0,
				readBuffer, 0,
				input.byteLength
			);
	
			const gpuCommands = commandEncoder.finish();
	
			let newTime = performance.now();
			params[0] = (newTime - timeStart) * speed;
			updateFramerate(1000 / params[0]);
			timeStart = newTime;
			device.queue.writeBuffer(paramsBuffer, 0, params);
			device.queue.submit([gpuCommands]);
	
			await readBuffer.mapAsync(GPUMapMode.READ);
			const arrayBuffer = readBuffer.getMappedRange();
			displayObjects(new Float32Array(arrayBuffer));
		}
	};

	startSimulation();

	startBtn.addEventListener("click", ()=>{
		if (!running){
			running = true;
			startSimulation();
		}
	});

	stopBtn.addEventListener("click", ()=>{
		if (running){
			running = false;
		}
	});
	
})();

