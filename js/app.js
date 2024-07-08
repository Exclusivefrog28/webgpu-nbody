const loadShader = async () => {
  let shaderCode = await fetch('shader/matrix.wgsl');
  return await shaderCode.text()
}

(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    return;
  }
  const device = await adapter.requestDevice();

  // First Matrix

  const firstMatrix = new Float32Array([
    0, 0, 0, 0, 1,
    2, 2, 0, 0, 1
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

  const secondMatrix = new Float32Array([
    0, 0, 0, 0, 1,
    2, 2, 0, 0, 1
  ]);

  const gpuBufferSecondMatrix = device.createBuffer({
    mappedAtCreation: true,
    size: secondMatrix.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const arrayBufferSecondMatrix = gpuBufferSecondMatrix.getMappedRange();
  new Float32Array(arrayBufferSecondMatrix).set(secondMatrix);
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

  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  const workgroupCount = Math.ceil((firstMatrix.length / 5) / 8);
  passEncoder.dispatchWorkgroups(workgroupCount);
  passEncoder.end();

  // Get a GPU buffer for reading in an unmapped state.
  const gpuReadBuffer = device.createBuffer({
    size: secondMatrix.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
  });

  // Encode commands for copying buffer to buffer.
  commandEncoder.copyBufferToBuffer(
    gpuBufferSecondMatrix /* source buffer */,
    0 /* source offset */,
    gpuBufferFirstMatrix /* destination buffer */,
    0 /* destination offset */,
    secondMatrix.byteLength /* size */
  );
  commandEncoder.copyBufferToBuffer(
    gpuBufferSecondMatrix /* source buffer */,
    0 /* source offset */,
    gpuReadBuffer /* destination buffer */,
    0 /* destination offset */,
    secondMatrix.byteLength /* size */
  );

  // Submit GPU commands.
  const gpuCommands = commandEncoder.finish();
  device.queue.submit([gpuCommands]);

  // Read buffer.
  await gpuReadBuffer.mapAsync(GPUMapMode.READ);
  const arrayBuffer = gpuReadBuffer.getMappedRange();
  console.log(new Float32Array(arrayBuffer));

})();

