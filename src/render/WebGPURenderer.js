// Рендерер WebGPU: принимает позиции как vec4 (stride 16),
// копирует их с GPU-симулятора в VBO и обновляет маркеры чисто на GPU.
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

    // mesh buffers
    this.posBuffer = null;     // VBO для позиций (vec4)
    this.indexBuffer = null;
    this.indexCount = 0;

    // wireframe
    this.lineIndexBuffer = null;
    this.lineIndexCount  = 0;

    // markers
    this.markerShapeBuffer    = null; // slot 0 (локальная форма ромба)
    this.markerInstanceBuffer = null; // slot 1 (posSize + color)
    this.markerInstanceCount  = 0;

    // UBO + layouts/pipelines
    this.globalUBO = null;     // 64 байта: aspect + eye + look_at
    this.globalsBGL = null;
    this.pipelineLayout = null;
    this.globalBindGroup = null;

    this.fillPipeline   = null;
    this.linePipeline   = null;
    this.markerPipeline = null;

    this._ready = false;
    this._ensurePromise = null;

    // создать форму маркера сразу (чтобы не было гонок)
    const local = new Float32Array([
      -1, 0,   0, 1,   1, 0,
      -1, 0,   0,-1,   1, 0
    ]);
    this.markerShapeBuffer = this.device.createBuffer({
      size: local.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.markerShapeBuffer, 0, local);
  }

  async ensurePipelines() {
    if (this._ready) return;
    if (!this._ensurePromise) {
      this._ensurePromise = (async () => {
        const meshCode = await fetch(new URL("../shaders/mesh.wgsl", import.meta.url)).then(r => r.text());
        const markCode = await fetch(new URL("../shaders/markers.wgsl", import.meta.url)).then(r => r.text());
        const meshModule = this.device.createShaderModule({ code: meshCode });
        const markModule = this.device.createShaderModule({ code: markCode });

        // общий BGL/PL для UBO
        this.globalsBGL = this.device.createBindGroupLayout({
          entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" }
          }]
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

        // pipelines (заметим: формат вершины теперь float32x4, stride 16)
        this.fillPipeline = this.device.createRenderPipeline({
          layout: this.pipelineLayout,
          vertex: {
            module: meshModule,
            entryPoint: "vs_main",
            buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }] }]
          },
          fragment: { module: meshModule, entryPoint: "fs_main", targets: [{ format: this.format }] },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
        });

        this.linePipeline = this.device.createRenderPipeline({
          layout: this.pipelineLayout,
          vertex: {
            module: meshModule,
            entryPoint: "vs_main",
            buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }] }]
          },
          fragment: { module: meshModule, entryPoint: "fs_line", targets: [{ format: this.format }] },
          primitive: { topology: "line-list", cullMode: "none" },
          depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
        });

        this.markerPipeline = this.device.createRenderPipeline({
          layout: this.pipelineLayout,
          vertex: {
            module: markModule,
            entryPoint: "vs_mark",
            buffers: [
              { arrayStride: 8,  stepMode: "vertex",   attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] },
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

        // основной VBO (vec4) с запасом
        const maxVerts = 128 * 128;
        this.posBuffer = this.device.createBuffer({
          size: maxVerts * 16, // vec4 = 16 байт
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        this._ready = true;
      })();
    }
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

  async draw(positionsOrGPU, indices, corners, centerIdx, camera, gpuInfo) {
    await this.ensurePipelines();
    if (!this._ready) return;
    this._draw(positionsOrGPU, indices, corners, centerIdx, camera, gpuInfo);
  }

  _updateGlobalsUBO(camera) {
    const aspect = this.canvas.width / this.canvas.height;
    const eye  = camera?.eye    ?? [0, 1.2, 1.2];
    const look = camera?.target ?? [0, 0, 0];

    const u = new Float32Array(16); // 64 bytes
    u[0]  = aspect;
    // из-за выравнивания (vec3 как 16 байт): eye идёт с 8-го float, look_at с 12-го
    u[8]  = eye[0];  u[9]  = eye[1];  u[10] = eye[2];
    u[12] = look[0]; u[13] = look[1]; u[14] = look[2];

    this.device.queue.writeBuffer(this.globalUBO, 0, u);
  }

  _ensureLineIndexBuffer(indices) {
    if (this.lineIndexBuffer && this._cachedIndexLen === indices.length) return;
    const set = new Set();
    const push = (a,b)=> set.add(a<b ? (a<<16)|b : (b<<16)|a);
    for (let i=0;i<indices.length;i+=3){
      const a=indices[i], b=indices[i+1], c=indices[i+2];
      push(a,b); push(b,c); push(c,a);
    }
    const lines = new Uint32Array(set.size*2);
    let k=0; for (const key of set){ lines[k++]=key>>16; lines[k++]=key&0xffff; }
    this.lineIndexBuffer?.destroy();
    this.lineIndexBuffer = this.device.createBuffer({
      size: lines.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(this.lineIndexBuffer, 0, lines);
    this.lineIndexCount = lines.length;
    this._cachedIndexLen = indices.length;
  }

  // Подготовка/обновление инстанс-буфера маркеров без CPU-чтения:
  // копируем XYZ из GPU-позиций в posSize каждого инстанса (12 байт),
  // размер (W) и цвет задаются один раз.
  _syncMarkerInstancesFromGPU(enc, positionsGPU, corners, centerIdx) {
    const ids = [...corners, centerIdx];
    const stride = 32; // vec4 posSize + vec4 color
    const count  = ids.length;

    if (!this.markerInstanceBuffer || this.markerInstanceCount !== count) {
      this.markerInstanceBuffer?.destroy();
      this.markerInstanceBuffer = this.device.createBuffer({
        size: count * stride,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
      });
      // Инициализация: заполняем size и color (позиции зальём копированием)
      const init = new Float32Array(count * 8); // 2 * vec4
      const size = 0.035;
      for (let i=0;i<count;i++){
        const base = i*8;
        // posSize: xyz (пока нули), w = size
        init[base+3] = size;
        // color
        if (i < 4) { // углы — красные
          init[base+4]=1.0; init[base+5]=0.2; init[base+6]=0.2; init[base+7]=1.0;
        } else {    // центр — синий
          init[base+4]=0.2; init[base+5]=0.55; init[base+6]=1.0; init[base+7]=1.0;
        }
      }
      this.device.queue.writeBuffer(this.markerInstanceBuffer, 0, init);
      this.markerInstanceCount = count;
    }

    // Обновляем xyz из positionsGPU → posSize (первые 12 байт vec4)
    for (let i=0;i<count;i++){
      const vidx = ids[i];
      const srcOffset = vidx * 16;       // vec4 в симуляторе
      const dstOffset = i * stride + 0;  // начало posSize
      enc.copyBufferToBuffer(positionsGPU, srcOffset, this.markerInstanceBuffer, dstOffset, 12);
    }
  }

  _draw(positionsOrGPU, indices, corners, centerIdx, camera, gpuInfo) {
    this.resize();
    this._updateGlobalsUBO(camera);

    const enc = this.device.createCommandEncoder();

    // Позиции: GPU-путь (копирование) или CPU-путь (writeBuffer)
    if (gpuInfo?.gpu === true) {
      enc.copyBufferToBuffer(
        positionsOrGPU, 0,
        this.posBuffer, 0,
        gpuInfo.bytes // numVerts * 16
      );
      // маркеры обновим тоже на GPU
      this._syncMarkerInstancesFromGPU(enc, positionsOrGPU, corners, centerIdx);
    } else {
      // CPU fallback (positionsOrGPU — Float32Array vec4-позиций)
      this.device.queue.writeBuffer(this.posBuffer, 0, positionsOrGPU);
      // markers: можно собрать из CPU-массива (не рассматриваем здесь)
    }

    // индексы и wireframe
    if (!this.indexBuffer || this.indexCount !== indices.length) {
      this.indexBuffer?.destroy();
      this.indexBuffer = this.device.createBuffer({
        size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
      });
      this.indexCount = indices.length;
    }
    this.device.queue.writeBuffer(this.indexBuffer, 0, indices);
    this._ensureLineIndexBuffer(indices);

    const colorView = this.context.getCurrentTexture().createView();
    const depthTex  = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT
    });

    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: colorView, loadOp: "clear",
        clearValue: { r:0.04, g:0.07, b:0.11, a:1.0 },
        storeOp: "store"
      }],
      depthStencilAttachment: {
        view: depthTex.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store"
      }
    });

    // fill
    pass.setPipeline(this.fillPipeline);
    pass.setBindGroup(0, this.globalBindGroup);
    pass.setVertexBuffer(0, this.posBuffer);
    pass.setIndexBuffer(this.indexBuffer, "uint32");
    pass.drawIndexed(this.indexCount, 1, 0, 0, 0);

    // wireframe
    pass.setPipeline(this.linePipeline);
    pass.setBindGroup(0, this.globalBindGroup);
    pass.setVertexBuffer(0, this.posBuffer);
    pass.setIndexBuffer(this.lineIndexBuffer, "uint32");
    pass.drawIndexed(this.lineIndexCount, 1, 0, 0, 0);

    // markers
    pass.setPipeline(this.markerPipeline);
    pass.setBindGroup(0, this.globalBindGroup);
    pass.setVertexBuffer(0, this.markerShapeBuffer);
    pass.setVertexBuffer(1, this.markerInstanceBuffer);
    pass.draw(6, this.markerInstanceCount, 0, 0);

    pass.end();
    this.device.queue.submit([enc.finish()]);
    depthTex.destroy();
  }
}
