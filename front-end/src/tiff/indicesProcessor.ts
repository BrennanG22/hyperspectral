import { ConstantNode, OperatorNode, ParenthesisNode, parse, SymbolNode, type MathNode } from "mathjs";

const WORKGROUP_SIZE = 64
const MAX_WORKGROUPS_PER_DIM = 65535

function WGSLTranspiler(
    expression: string,
    bandOrder: number[],  
    nanNumber: number,
    gridWidth: number
): string {
    const numberOfBands = bandOrder.length
    const parsedExpression = parse(expression)
    const wgslExpression = WGSLNodeTranspiler(parsedExpression)
    const presentBands = new Set<string>()
    collectBandSymbols(parsedExpression, presentBands)

    const bindingIndexByBandNumber = new Map<number, number>()
    bandOrder.forEach((bandNumber, i) => {
        if (bindingIndexByBandNumber.has(bandNumber)) {
            throw new Error(`Duplicate band number ${bandNumber} in bandOrder`)
        }
        bindingIndexByBandNumber.set(bandNumber, i)
    })

    for (const symbol of presentBands) {
        const bandNumber = Number(symbol.slice(1))
        if (!bindingIndexByBandNumber.has(bandNumber)) {
            throw new Error(`Expression references "${symbol}" but band ${bandNumber} is not present in bandOrder [${bandOrder.join(', ')}]`)
        }
    }

    const bandBindings = Array.from({ length: numberOfBands }, (_, i) =>
        `@group(0) @binding(${i}) var<storage, read> band${i}: array<f32>;`
    ).join(`\n`)
    const outputBinding = `@group(0) @binding(${numberOfBands}) var<storage, read_write> output: array<f32>;`


    const bandDecls = bandOrder.map((bandNumber, i) => {
        const symbol = `b${bandNumber}`
        return presentBands.has(symbol) ? `    let ${symbol}: f32 = band${i}[i];` : ''
    }).filter(Boolean).join('\n')

    const nanChecks = Array.from({ length: numberOfBands }, (_, i) =>
        `band${i}[i] == ${nanNumber.toFixed(1)} || !isFiniteF32(band${i}[i])`
    ).join(' || ')

    return `
${bandBindings}
${outputBinding}
const NAN_NUMBER: f32 = ${nanNumber.toFixed(1)};
const PIXEL_COUNT: u32 = ${'PIXEL_COUNT_PLACEHOLDER'}u;
const GRID_WIDTH: u32 = ${gridWidth}u; // workgroups per row of the 2D dispatch grid
fn isFiniteF32(x: f32) -> bool {
    // WGSL has no isFinite(); NaN/Inf both fail this self-equality-based check
    return (x == x) && (abs(x) < 3.4e38);
}
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(
    @builtin(workgroup_id) wgid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>
) {
    let workgroupIndex: u32 = wgid.y * GRID_WIDTH + wgid.x;
    let i: u32 = workgroupIndex * ${WORKGROUP_SIZE}u + lid.x;
    if (i >= PIXEL_COUNT) {
        return;
    }
    if (${nanChecks || 'false'}) {
        output[i] = NAN_NUMBER;
        return;
    }
${bandDecls}
    let result: f32 = ${wgslExpression};
    if (!isFiniteF32(result)) {
        output[i] = NAN_NUMBER;
    } else {
        output[i] = result;
    }
}
`.trim()
}


function WGSLNodeTranspiler(node: MathNode): string {
    if (node instanceof ConstantNode) {
        const v = node.value as number
        if (typeof v !== 'number') {
            throw new Error(`Unsupported constant type in expression: ${typeof v}`)
        }
        return Number.isInteger(v) ? `${v}.0` : `${v}`
    }

    if (node instanceof SymbolNode) {
        if (!/^b\d+$/.test(node.name)) {
            throw new Error(`Unsupported variable "${node.name}" in expression`)
        }
        return node.name
    }

    if (node instanceof ParenthesisNode) {
        return `(${WGSLNodeTranspiler(node.content)})`
    }

    if (node instanceof OperatorNode) {
        const args = node.args

        // unary minus
        if (node.fn === 'unaryMinus' && args.length === 1) {
            return `(-${WGSLNodeTranspiler(args[0])})`
        }
        if (node.fn === 'unaryPlus' && args.length === 1) {
            return WGSLNodeTranspiler(args[0])
        }

        if (args.length === 2) {
            const l = WGSLNodeTranspiler(args[0])
            const r = WGSLNodeTranspiler(args[1])
            switch (node.op) {
                case '+': return `(${l} + ${r})`
                case '-': return `(${l} - ${r})`
                case '*': return `(${l} * ${r})`
                case '/': return `(${l} / ${r})`
                case '^': return `pow(${l}, ${r})`
                default:
                    throw new Error(`Unsupported operator "${node.op}" in expression`)
            }
        }

        throw new Error(`Unsupported operator node with ${args.length} args`)
    }

    throw new Error(`Unsupported expression node type: ${node.type}`)
}


export async function evaluateIndicesExpressionGPU(
    device: GPUDevice,
    expression: string,
    rasterData: Float32Array[],
    bandOrder: number[],
    NAN_NUMBER: number
): Promise<Float32Array> {
    if (rasterData.length !== bandOrder.length) {
        throw new Error(`rasterData length (${rasterData.length}) does not match bandOrder length (${bandOrder.length})`)
    }
    if (rasterData.length === 0) {
        throw new Error('rasterData must contain at least one band')
    }
    const pixelCount = rasterData[0].length
    for (let i = 1; i < rasterData.length; i++) {
        if (rasterData[i].length !== pixelCount) {
            throw new Error(`Band at index ${i} (b${bandOrder[i]}) has length ${rasterData[i].length}, expected ${pixelCount} to match band b${bandOrder[0]}`)
        }
    }

    const numberOfBands = bandOrder.length
    const { gridWidth, gridHeight } = getDispatchGrid(pixelCount)

    let wgsl = WGSLTranspiler(expression, bandOrder, NAN_NUMBER, gridWidth)
    wgsl = wgsl.replace('PIXEL_COUNT_PLACEHOLDER', String(pixelCount))
    const module = device.createShaderModule({ code: wgsl })
    const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module, entryPoint: 'main' },
    })

    const byteLength = pixelCount * Float32Array.BYTES_PER_ELEMENT
    const bandBuffers: GPUBuffer[] = []
    for (let i = 0; i < numberOfBands; i++) {
        const buf = device.createBuffer({
            size: byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })
        device.queue.writeBuffer(buf, 0, new Float32Array(rasterData[i]))
        bandBuffers.push(buf)
    }
    const outputBuffer = device.createBuffer({
        size: byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    const readBuffer = device.createBuffer({
        size: byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            ...bandBuffers.map((buf, i) => ({ binding: i, resource: { buffer: buf } })),
            { binding: numberOfBands, resource: { buffer: outputBuffer } },
        ],
    })
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginComputePass()
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindGroup)
    pass.dispatchWorkgroups(gridWidth, gridHeight)
    pass.end()
    encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, byteLength)
    device.queue.submit([encoder.finish()])
    await readBuffer.mapAsync(GPUMapMode.READ)
    const result = new Float32Array(readBuffer.getMappedRange().slice(0))
    readBuffer.unmap()
    bandBuffers.forEach(b => b.destroy())
    outputBuffer.destroy()
    readBuffer.destroy()
    return result
}

function getDispatchGrid(pixelCount: number) {
    const totalWorkgroups = Math.ceil(pixelCount / WORKGROUP_SIZE);
    const gridWidth = Math.min(totalWorkgroups, MAX_WORKGROUPS_PER_DIM);
    const gridHeight = Math.ceil(totalWorkgroups / gridWidth);
    return { gridWidth, gridHeight };
}

function collectBandSymbols(node: MathNode, out: Set<string>) {
    if (node instanceof SymbolNode && /^b\d+$/.test(node.name)) {
        out.add(node.name)
    }
    node.forEach((child: MathNode) => collectBandSymbols(child, out))
}
