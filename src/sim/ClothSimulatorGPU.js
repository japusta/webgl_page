// GPU-сим ткань: классический PBD (без XPBD-лямбд), безопасная раскраска
// рёбер: 12 независимых групп (H×2, V×2, D1×4, D2×4). Интегратор Verlet
// с небольшим демпфингом в шейдере. Геометрия масштабируется параметром size.

export class ClothSimulatorGPU {
  constructor(nx, ny, size, device, {
    gravityEnabled = true,
    iterations = 12,
    yOffset = 0.0,
    oscAmp = 0.20,
    oscFreq = 1.0
  } = {}) {
    this.device = device;
    this.nx = nx; this.ny = ny; this.size = size;

    this.gravityEnabled   = gravityEnabled;
    this.solverIterations = iterations;
    this.yOffset          = yOffset;
    this.oscAmp           = oscAmp;
    this.oscFreq          = oscFreq;

    const {
      positions4, prev4, invMass,
      indices, groups, centerIdx, cornerIdx
    } = this._buildGrid();

    this.indices          = indices;
    this.cornerIndices    = cornerIdx;
    this.oscillatingIndex = centerIdx;
    this.numVerts         = positions4.length / 4;

    // GPU-буферы состояния
    this.positions = this._buf(positions4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.prev      = this._buf(prev4,       GPUBufferUsage.STORAGE);
    this.invMass   = this._buf(invMass,     GPUBufferUsage.STORAGE);

    // Группы рёбер (каждая — независимый набор без общих вершин)
    this.edgeGroups = groups.map(g => {
      const edges = this.device.createBuffer({
        size: g.arrayBuffer.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.device.queue.writeBuffer(edges, 0, g.arrayBuffer);
      return { edges, count: g.count };
    });

    // Параметры кадра
    this.paramBuf = this.device.createBuffer({
      size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // ---------- BindGroupLayouts / Pipelines ----------
    this.layoutSim = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // invMass
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },           // positions
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },           // prev
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },           // params
      ]
    });

    this.layoutConstr = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // invMass
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },           // positions
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // edges
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },           // params
      ]
    });

    this.plIntegrate   = this.device.createPipelineLayout({ bindGroupLayouts: [this.layoutSim] });
    this.plConstraints = this.device.createPipelineLayout({ bindGroupLayouts: [this.layoutConstr] });

    // Общий bind group для интеграции/осцилляции
    this.bgSim = this.device.createBindGroup({
      layout: this.layoutSim,
      entries: [
        { binding: 0, resource: { buffer: this.invMass } },
        { binding: 1, resource: { buffer: this.positions } },
        { binding: 2, resource: { buffer: this.prev } },
        { binding: 3, resource: { buffer: this.paramBuf } },
      ]
    });

    // Bind groups для каждой группы рёбер
    this.bgConstr = this.edgeGroups.map(g => this.device.createBindGroup({
      layout: this.layoutConstr,
      entries: [
        { binding: 0, resource: { buffer: this.invMass } },
        { binding: 1, resource: { buffer: this.positions } },
        { binding: 2, resource: { buffer: g.edges } },
        { binding: 3, resource: { buffer: this.paramBuf } },
      ]
    }));

    // Компьют-пайплайны
    this._ready = false;
    this._initPromise = this._buildPipelines();
  }

  async _buildPipelines() {
    const base = import.meta.url;
    const [integrateWGSL, constraintsWGSL, oscillateWGSL] = await Promise.all([
      fetch(new URL("../shaders/pbd_integrate.wgsl", base)).then(r=>r.text()),
      fetch(new URL("../shaders/pbd_constraints.wgsl", base)).then(r=>r.text()),
      fetch(new URL("../shaders/pbd_oscillate.wgsl", base)).then(r=>r.text()),
    ]);

    const mIntegrate   = this.device.createShaderModule({ code: integrateWGSL });
    const mConstraints = this.device.createShaderModule({ code: constraintsWGSL });
    const mOscillate   = this.device.createShaderModule({ code: oscillateWGSL });

    this.pIntegrate   = this.device.createComputePipeline({
      layout: this.plIntegrate,   compute: { module: mIntegrate,   entryPoint: "cs_integrate" }
    });
    this.pOscillate   = this.device.createComputePipeline({
      layout: this.plIntegrate,   compute: { module: mOscillate,   entryPoint: "cs_oscillate" }
    });
    this.pConstraints = this.device.createComputePipeline({
      layout: this.plConstraints, compute: { module: mConstraints, entryPoint: "cs_constraints" }
    });

    this._ready = true;
  }

  dispose() {
    this.positions?.destroy(); this.prev?.destroy(); this.invMass?.destroy();
    this.edgeGroups.forEach(g => { g.edges.destroy(); });
    this.paramBuf?.destroy();
  }

  _buf(typed, usage) {
    const buf = this.device.createBuffer({
      size: typed.byteLength, usage: usage | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(buf, 0, typed);
    return buf;
  }

  _buildGrid() {
    const nx = this.nx, ny = this.ny;
    const num = nx * ny;
    const dx = 1.0 / (nx - 1);
    const dz = 1.0 / (ny - 1);

    const pos4  = new Float32Array(num * 4);
    const prev4 = new Float32Array(num * 4);
    const inv   = new Float32Array(num);

    const id = (x,y)=> y*nx + x;

    // Масштаб полотна (в точности как в CPU) — size × size, центр в (0, yOffset, 0)
    const sx = this.size, sz = this.size, half = 0.5;

    let k4 = 0, k = 0;
    for (let y=0;y<ny;y++){
      for (let x=0;x<nx;x++,k++,k4+=4){
        const px = (x*dx - half) * sx;
        const pz = (y*dz - half) * sz;
        const py = this.yOffset;
        pos4[k4+0]=px; pos4[k4+1]=py; pos4[k4+2]=pz; pos4[k4+3]=0.0;
        prev4[k4+0]=px; prev4[k4+1]=py; prev4[k4+2]=pz; prev4[k4+3]=0.0;
        inv[k]=1.0;
      }
    }

    // Индексы треугольников
    const ind = [];
    for (let y=0;y<ny-1;y++){
      for (let x=0;x<nx-1;x++){
        const a=id(x,y), b=id(x+1,y), c=id(x,y+1), d=id(x+1,y+1);
        ind.push(a,b,d,  a,d,c);
      }
    }

    // Пины по углам (масса 0)
    const cornerIdx=[ id(0,0), id(nx-1,0), id(0,ny-1), id(nx-1,ny-1) ];
    for (const i of cornerIdx) inv[i]=0.0;

    // Центральная вершина (для синусного движения)
    const cx = Math.floor((nx-1)/2), cy = Math.floor((ny-1)/2);
    const centerIdx = id(cx, cy);
    

    // ---------- Безопасная раскраска рёбер ----------
    const H=[[],[]], V=[[],[]];
    const D1=[[[],[]],[[],[]]]; // [xParity][yParity] для (x,y)->(x+1,y+1)
    const D2=[[[],[]],[[],[]]]; // для (x+1,y)->(x,y+1)

    const restLen = (ax,ay,bx,by)=>{
      const ai=id(ax,ay)*4, bi=id(bx,by)*4;
      const dx=pos4[ai]-pos4[bi], dy=pos4[ai+1]-pos4[bi+1], dz=pos4[ai+2]-pos4[bi+2];
      return Math.hypot(dx,dy,dz);
    };
    const push = (arr,i,j,l)=> arr.push(i,j,l);

    // горизонтали
    for (let y=0;y<ny;y++){
      for (let x=0;x<nx-1;x++){
        push(H[x&1], id(x,y), id(x+1,y), restLen(x,y,x+1,y));
      }
    }
    // вертикали
    for (let y=0;y<ny-1;y++){
      for (let x=0;x<nx;x++){
        push(V[y&1], id(x,y), id(x,y+1), restLen(x,y,x,y+1));
      }
    }
    // диагонали D1: (x,y)->(x+1,y+1)
    for (let y=0;y<ny-1;y++){
      for (let x=0;x<nx-1;x++){
        const xp = x & 1, yp = y & 1;
        push(D1[xp][yp], id(x,y),   id(x+1,y+1), restLen(x,y,x+1,y+1));
      }
    }
    // диагонали D2: (x+1,y)->(x,y+1)
    for (let y=0;y<ny-1;y++){
      for (let x=0;x<nx-1;x++){
        const xp = x & 1, yp = y & 1;
        push(D2[xp][yp], id(x+1,y), id(x,y+1),   restLen(x+1,y,x,y+1));
      }
    }

    const pack = (triples)=>{
      const count = (triples.length/3)|0;
      const buf = new ArrayBuffer(count*16);
      const dv  = new DataView(buf);
      let o=0;
      for (let t=0;t<triples.length;t+=3){
        dv.setUint32(o+0, triples[t+0], true);
        dv.setUint32(o+4, triples[t+1], true);
        dv.setFloat32(o+8, triples[t+2], true);
        dv.setFloat32(o+12, 0.0,        true);
        o += 16;
      }
      return { arrayBuffer: buf, count };
    };

    const groups = [
      pack(H[0]), pack(H[1]),
      pack(V[0]), pack(V[1]),
      pack(D1[0][0]), pack(D1[0][1]), pack(D1[1][0]), pack(D1[1][1]),
      pack(D2[0][0]), pack(D2[0][1]), pack(D2[1][0]), pack(D2[1][1]),
    ];

    return {
      positions4: pos4,
      prev4: prev4,
      invMass: inv,
      indices: new Uint32Array(ind),
      groups,
      centerIdx,
      cornerIdx
    };
  }

  _updateParams(dt, time) {
    const u = new Float32Array(16);
    u[0]  = dt;
    u[1]  = this.gravityEnabled ? -9.81 : 0.0;
    u[2]  = 0.0;                 // не используется (XPBD off)
    u[3]  = this.solverIterations;

    u[4]  = this.oscillatingIndex;
    u[5]  = this.yOffset;
    u[6]  = this.oscAmp;
    u[7]  = 2.0 * Math.PI * this.oscFreq;

    u[8]  = time;
    u[9]  = this.numVerts;
    this.device.queue.writeBuffer(this.paramBuf, 0, u);
  }

  // Как в CPU: кламп dt, 1–2 сабстепа (оставляю 1 по умолчанию).
  update(dt, time) {
    if (!this._ready) { if (this._initPromise) this._initPromise.then(()=>{ this._ready = true; }); return; }

    const substeps = 1;
    const h = Math.min(dt, 1/60) / substeps;

    const enc = this.device.createCommandEncoder();

    for (let s = 0; s < substeps; s++) {
      // интеграция
      this._updateParams(h, time + s*h);
      {
        const pass = enc.beginComputePass();
        pass.setPipeline(this.pIntegrate);
        pass.setBindGroup(0, this.bgSim);
        const wg = 64, numWG = Math.ceil(this.numVerts / wg);
        pass.dispatchWorkgroups(numWG);
        pass.end();
      }

      // жёстко двигаем одну вершину (как в CPU)
      {
        const pass = enc.beginComputePass();
        pass.setPipeline(this.pOscillate);
        pass.setBindGroup(0, this.bgSim);
        pass.dispatchWorkgroups(1);
        pass.end();
      }

      // PBD-проекции: итерации × 12 групп
      for (let it = 0; it < this.solverIterations; it++) {
        for (let gi = 0; gi < this.edgeGroups.length; gi++) {
          const g = this.edgeGroups[gi];
          const pass = enc.beginComputePass();
          pass.setPipeline(this.pConstraints);
          pass.setBindGroup(0, this.bgConstr[gi]);
          const wg = 128, numWG = Math.ceil(g.count / wg);
          pass.dispatchWorkgroups(numWG);
          pass.end();
        }
      }
    }

    this.device.queue.submit([enc.finish()]);
  }
}
