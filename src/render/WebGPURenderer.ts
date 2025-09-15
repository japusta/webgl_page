
export class WebGPURenderer {
  private context: GPUCanvasContext;
  readonly device: GPUDevice;
  private pipeline!: GPURenderPipeline;
  private posBuffer!: GPUBuffer;
  private indexBuffer: GPUBuffer | null = null;
  private indexCount = 0;
  private cornerBuffer: GPUBuffer | null = null;
  private format: GPUTextureFormat;

  static async create(canvas: HTMLCanvasElement) {
    if (!("gpu" in navigator)) throw new Error("WebGPU not supported");
    const adapter = await (navigator as any).gpu.requestAdapter();
    const device = await adapter.requestDevice();
    return new WebGPURenderer(canvas, device);
  }

  private constructor(private canvas: HTMLCanvasElement, device: GPUDevice) {
    this.device = device;
    this.context = canvas.getContext("webgpu")!;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: "opaque" });
  }


  private async ensurePipeline() {
    if (this.pipeline) return;
    const code = await fetch(new URL("../shaders/mesh.wgsl", import.meta.url)).then((r) => r.text());
    const module = this.device.createShaderModule({ code });
    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 12,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [
          {
            format: this.format,
          },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });
    const maxVerts = 128 * 128;
    this.posBuffer = this.device.createBuffer({
      size: maxVerts * 3 * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  async draw(
    positions: Float32Array,
    indices: Uint32Array,
    cornerIdx: number[],
    oscIndex: number
  ) {
    await this.ensurePipeline();
    this.resize();
    // записываем позиции
    this.device.queue.writeBuffer(this.posBuffer, 0, positions);
    // обновляем индексный буфер при необходимости
    if (!this.indexBuffer || this.indexCount !== indices.length) {
      this.indexBuffer?.destroy();
      this.indexBuffer = this.device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      this.indexCount = indices.length;
    }
    this.device.queue.writeBuffer(this.indexBuffer!, 0, indices);
    // записываем индексы маркеров (углы + центр), чтобы потенциально выделять их в шейдере
    if (!this.cornerBuffer) {
      this.cornerBuffer = this.device.createBuffer({
        size: (cornerIdx.length + 1) * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    const markerData = new Uint32Array([...cornerIdx, oscIndex]);
    this.device.queue.writeBuffer(this.cornerBuffer, 0, markerData);
    // создаём текстуру глубины
    const depthTex = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const view = this.context.getCurrentTexture().createView();
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: "clear",
          clearValue: { r: 0.04, g: 0.07, b: 0.11, a: 1 },
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTex.createView(),
        depthLoadOp: "clear",
        depthStoreOp: "store",
        depthClearValue: 1,
      },
    });
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, this.posBuffer);
    pass.setIndexBuffer(this.indexBuffer!, "uint32");
    pass.drawIndexed(this.indexCount, 1, 0, 0, 0);
    pass.end();
    this.device.queue.submit([enc.finish()]);
    depthTex.destroy();
  }
}