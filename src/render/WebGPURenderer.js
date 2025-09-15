export class WebGPURenderer {
  static async create(canvas) {
    if (!("gpu" in navigator)) throw new Error("WebGPU not supported");
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    return new WebGPURenderer(canvas, device);
  }

  constructor(canvas, device) {
    this.canvas = canvas;
    this.device = device;
    this.context = canvas.getContext("webgpu");
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: "opaque" });

    // общие буферы
    this.posBuffer = null;
    this.indexBuffer = null;
    this.indexCount = 0;

    // wireframe
    this.lineIndexBuffer = null;
    this.lineIndexCount = 0;

    // маркеры
    this.markerShapeBuffer = null;
    this.markerInstanceBuffer = null;
    this.markerInstanceCount = 0;

    // UBO + layouts
    this.globalUBO = null;        // 64 байта: aspect + eye + look_at
    this.globalBindGroup = null;
    this.globalsBGL = null;
    this.pipelineLayout = null;

    // пайплайны
    this.fillPipeline = null;
    this.linePipeline = null;
    this.markerPipeline = null;

    this._ready = false;
    this._ensurePromise = null;
  }

  async ensurePipelines() {
    if (this._ready) return;
    if (this._ensurePromise) { await this._ensurePromise; return; }

    this._ensurePromise = (async () => {
      const meshCode = await fetch(new URL("../shaders/mesh.wgsl", import.meta.url)).then(r => r.text());
      const markCode = await fetch(new URL("../shaders/markers.wgsl", import.meta.url)).then(r => r.text());
      const meshModule = this.device.createShaderModule({ code: meshCode });
      const markModule = this.device.createShaderModule({ code: markCode });

      // общий BGL/PL для всех пайплайнов
      this.globalsBGL = this.device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }]
      });
      this.pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [this.globalsBGL] });

      // UBO 64 байта
      this.globalUBO = this.device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.globalBindGroup = this.device.createBindGroup({
        layout: this.globalsBGL,
        entries: [{ binding: 0, resource: { buffer: this.globalUBO, offset: 0, size: 64 } }]
      });

      // пайплайн — заливка
      this.fillPipeline = this.device.createRenderPipeline({
        layout: this.pipelineLayout,
        vertex: {
          module: meshModule,
          entryPoint: "vs_main",
          buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }]
        },
        fragment: { module: meshModule, entryPoint: "fs_main", targets: [{ format: this.format }] },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
      });

      // пайплайн — wireframe (line-list)
      this.linePipeline = this.device.createRenderPipeline({
        layout: this.pipelineLayout,
        vertex: {
          module: meshModule,
          entryPoint: "vs_main",
          buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }]
        },
        fragment: { module: meshModule, entryPoint: "fs_line", targets: [{ format: this.format }] },
        primitive: { topology: "line-list", cullMode: "none" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
      });

      // пайплайн — маркеры (инстансинг)
      this.markerPipeline = this.device.createRenderPipeline({
        layout: this.pipelineLayout,
        vertex: {
          module: markModule,
          entryPoint: "vs_mark",
          buffers: [
            { arrayStride: 8, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
            { arrayStride: 32, stepMode: "instance", attributes: [
              { shaderLocation: 1, offset: 0,  format: "float32x4" }, // posSize
              { shaderLocation: 2, offset: 16, format: "float32x4" }  // color
            ] }
          ]
        },
        fragment: { module: markModule, entryPoint: "fs_mark", targets: [{ format: this.format }] },
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
      });

      // буфер позиций (запас)
      const maxVerts = 128 * 128;
      this.posBuffer = this.device.createBuffer({
        size: maxVerts * 3 * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });

      // форма маркера (ромб, 2 треугольника)
      const local = new Float32Array([
        -1, 0,  0, 1,  1, 0,
        -1, 0,  0,-1, 1, 0
      ]);
      this.markerShapeBuffer = this.device.createBuffer({
        size: local.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
      this.device.queue.writeBuffer(this.markerShapeBuffer, 0, local);

      // инстансы: углы + центр (5 штук)
      this.markerInstanceBuffer = this.device.createBuffer({
        size: 5 * 32,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });

      this._ready = true;
    })();

    await this._ensurePromise;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }

  async draw(positions, indices, corners, centerIdx, camera) {
    await this.ensurePipelines();
    if (!this._ready) return;
    this._draw(positions, indices, corners, centerIdx, camera);
  }

  _updateGlobalsUBO(camera) {
    const aspect = this.canvas.width / this.canvas.height;
    const eye = camera?.eye ?? [0, 1.2, 1.2];
    const look = camera?.target ?? [0, 0, 0];
    const u = new Float32Array(16); // 64 bytes
    u[0] = aspect;
    u[4] = eye[0]; u[5] = eye[1]; u[6] = eye[2];
    u[8] = look[0]; u[9] = look[1]; u[10] = look[2];
    this.device.queue.writeBuffer(this.globalUBO, 0, u);
  }

  _ensureLineIndexBuffer(indices) {
    if (this.lineIndexBuffer && this._cachedIndexLen === indices.length) return;

    // собрать уникальные рёбра из треугольников
    const set = new Set();
    const pushEdge = (a, b) => {
      const x = a < b ? (a << 16) | b : (b << 16) | a;
      set.add(x);
    };
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i+1], c = indices[i+2];
      pushEdge(a, b); pushEdge(b, c); pushEdge(c, a);
    }
    const lines = new Uint32Array(set.size * 2);
    let k = 0;
    for (const key of set) {
      const a = key >> 16, b = key & 0xffff;
      lines[k++] = a; lines[k++] = b;
    }

    this.lineIndexBuffer?.destroy();
    this.lineIndexBuffer = this.device.createBuffer({
      size: lines.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.lineIndexBuffer, 0, lines);
    this.lineIndexCount = lines.length;
    this._cachedIndexLen = indices.length;
  }

  _updateMarkerInstances(positions, corners, centerIdx) {
    const ids = [...corners, centerIdx];
    const data = new Float32Array(ids.length * 8); // vec4 posSize + vec4 color
    const size = 0.035;
    for (let i = 0; i < ids.length; i++) {
      const idx = ids[i];
      const base = i * 8;
      data[base+0] = positions[idx*3+0];
      data[base+1] = positions[idx*3+1];
      data[base+2] = positions[idx*3+2];
      data[base+3] = size;
      if (i < 4) { data[base+4]=1.00; data[base+5]=0.20; data[base+6]=0.20; data[base+7]=1.0; }
      else       { data[base+4]=0.20; data[base+5]=0.55; data[base+6]=1.00; data[base+7]=1.0; }
    }
    this.device.queue.writeBuffer(this.markerInstanceBuffer, 0, data);
    this.markerInstanceCount = ids.length;
  }

  _draw(positions, indices, corners, centerIdx, camera) {
    this.resize();
    this._updateGlobalsUBO(camera);

    // позиции
    this.device.queue.writeBuffer(this.posBuffer, 0, positions);

    // индексы треугольников
    if (!this.indexBuffer || this.indexCount !== indices.length) {
      this.indexBuffer?.destroy();
      this.indexBuffer = this.device.createBuffer({
        size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
      });
      this.indexCount = indices.length;
    }
    this.device.queue.writeBuffer(this.indexBuffer, 0, indices);

    // wireframe индексы
    this._ensureLineIndexBuffer(indices);

    // маркеры
    this._updateMarkerInstances(positions, corners, centerIdx);

    const colorView = this.context.getCurrentTexture().createView();
    const depthTex = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: colorView, loadOp: "clear",
        clearValue: { r: 0.04, g: 0.07, b: 0.11, a: 1.0 }, storeOp: "store"
      }],
      depthStencilAttachment: {
        view: depthTex.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store"
      }
    });

    // общий bind group
    pass.setBindGroup(0, this.globalBindGroup);

    // 1) заливка
    pass.setPipeline(this.fillPipeline);
    pass.setVertexBuffer(0, this.posBuffer);
    pass.setIndexBuffer(this.indexBuffer, "uint32");
    pass.drawIndexed(this.indexCount, 1, 0, 0, 0);

    // 2) wireframe
    pass.setPipeline(this.linePipeline);
    pass.setVertexBuffer(0, this.posBuffer);
    pass.setIndexBuffer(this.lineIndexBuffer, "uint32");
    pass.drawIndexed(this.lineIndexCount, 1, 0, 0, 0);

    // 3) маркеры
    pass.setPipeline(this.markerPipeline);
    pass.setVertexBuffer(0, this.markerShapeBuffer);
    pass.setVertexBuffer(1, this.markerInstanceBuffer);
    pass.draw(6, this.markerInstanceCount, 0, 0);

    pass.end();
    this.device.queue.submit([enc.finish()]);
    depthTex.destroy();
  }
}
