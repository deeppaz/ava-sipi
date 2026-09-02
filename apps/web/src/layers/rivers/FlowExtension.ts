/**
 * FlowExtension — animated "current" along deck.gl PathLayer strokes (spec §5.3 rivers).
 *
 * A brightness wave travels downstream; speed = flowSpeed × clamp(ratio, 0.3, 3) waves/s.
 * Wavelength scales with stroke width (wide rivers, long waves) with a pixel floor so thin
 * streams never flicker. Phase is continuous across segments thanks to a per-segment
 * cumulative distance attribute computed the same way deck's PathStyleExtension does
 * (`accessor: 'getPath'` + `transform`, deck.gl 9.3 API).
 */
import { type Layer, type LayerContext, LayerExtension, type UpdateParameters } from '@deck.gl/core'
import type { ShaderModule } from '@luma.gl/shadertools'

export type FlowExtensionProps<DataT = unknown> = {
  /** today / long-term mean; drives speed. Default 1. */
  getFlowRatio?: ((d: DataT) => number) | number
  /** seconds, advanced by the host each frame */
  flowTime?: number
  /** 0 disables the wave (reduced motion). 0..1 */
  flowIntensity?: number
  /** waves per second at ratio 1 (spec §6.4: 0.35) */
  flowSpeed?: number
  /** wavelength in half-width units before the pixel floor */
  flowWavelength?: number
}

type FlowUniforms = { time: number; intensity: number; baseSpeed: number; wavelength: number }

const uniformBlock = /* glsl */ `\
uniform flowUniforms {
  float time;
  float intensity;
  float baseSpeed;
  float wavelength;
} flow;
`

const flowModule = {
  name: 'flow',
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: { time: 'f32', intensity: 'f32', baseSpeed: 'f32', wavelength: 'f32' },
  inject: {
    'vs:#decl': /* glsl */ `
in float instanceFlowOffsets;
in float instanceFlowRatios;
out float vFlowOffset;
out float vFlowRatio;
out float vFlowWavelength;
out float vFlowAlong;
`,
    // `width` (vec3, common units for flat paths) and vPathPosition are in scope at the end of main().
    'vs:#main-end': /* glsl */ `
float flowHalfWidthPx = max(width.x * project.scale, 0.25);
float flowWl = max(flow.wavelength, 28.0 / flowHalfWidthPx);
vFlowWavelength = flowWl;
vFlowOffset = mod(instanceFlowOffsets / max(width.x, 1e-9), flowWl);
vFlowRatio = instanceFlowRatios;
// vPathPosition is only visible inside main(); carry the along-path coordinate to the fragment hook
vFlowAlong = vPathPosition.y;
`,
    'fs:#decl': /* glsl */ `
in float vFlowOffset;
in float vFlowRatio;
in float vFlowWavelength;
in float vFlowAlong;
`,
    'fs:DECKGL_FILTER_COLOR': /* glsl */ `
if (!bool(picking.isActive) && flow.intensity > 0.0) {
  float along = vFlowOffset + vFlowAlong;
  float speed = flow.baseSpeed * clamp(vFlowRatio, 0.3, 3.0);
  float phase = along / vFlowWavelength - flow.time * speed;
  float wave = 0.5 + 0.5 * cos(6.28318530718 * phase);
  wave = wave * wave * wave;
  vec3 foam = vec3(0.918, 0.957, 0.973);
  color.rgb = mix(color.rgb, foam, wave * flow.intensity);
  color.a *= 0.78 + 0.22 * wave;
  // ratio > 3: flood white with a 2 s pulse (spec §5.3)
  float surge = step(3.0, vFlowRatio);
  float pulse = 0.5 + 0.5 * sin(flow.time * 3.14159265);
  color.rgb = mix(color.rgb, foam, surge * 0.35 * pulse);
}
`,
  },
} as const satisfies ShaderModule<FlowUniforms>

const defaultProps = {
  getFlowRatio: { type: 'accessor', value: 1 },
  flowTime: 0,
  flowIntensity: 0.55,
  flowSpeed: 0.35,
  flowWavelength: 14,
}

function dist3(a: number[], b: number[]): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0)
  const dy = (a[1] ?? 0) - (b[1] ?? 0)
  const dz = (a[2] ?? 0) - (b[2] ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export default class FlowExtension extends LayerExtension {
  static override defaultProps = defaultProps
  static override extensionName = 'FlowExtension'

  override getShaders(this: Layer<FlowExtensionProps>): { modules: (typeof flowModule)[] } {
    return { modules: [flowModule] }
  }

  override initializeState(
    this: Layer<FlowExtensionProps>,
    _context: LayerContext,
    extension: FlowExtension,
  ): void {
    const attributeManager = this.getAttributeManager()
    if (!attributeManager || !('pathTesselator' in this.state)) return
    attributeManager.addInstanced({
      instanceFlowRatios: { size: 1, accessor: 'getFlowRatio' },
      instanceFlowOffsets: {
        size: 1,
        accessor: 'getPath',
        transform: extension.getFlowOffsets.bind(this),
      },
    })
  }

  override updateState(
    this: Layer<FlowExtensionProps>,
    _params: UpdateParameters<Layer<FlowExtensionProps>>,
  ): void {
    if (!('pathTesselator' in this.state)) return
    const p = this.props
    const flow: FlowUniforms = {
      time: p.flowTime ?? 0,
      intensity: p.flowIntensity ?? 0.55,
      baseSpeed: p.flowSpeed ?? 0.35,
      wavelength: p.flowWavelength ?? 14,
    }
    this.setShaderModuleProps({ flow })
  }

  /** Distance (common space) from the path start to each vertex; last entry is padding (0). */
  getFlowOffsets(this: Layer<FlowExtensionProps>, path: number[] | number[][]): number[] {
    const result = [0]
    const positionSize = (this.props as { positionFormat?: string }).positionFormat === 'XY' ? 2 : 3
    const isNested = Array.isArray(path[0])
    const geometrySize = isNested ? path.length : path.length / positionSize
    let prev: number[] | undefined
    for (let i = 0; i < geometrySize - 1; i++) {
      const raw = isNested
        ? (path[i] as number[])
        : (path as number[]).slice(i * positionSize, i * positionSize + positionSize)
      const p = this.projectPosition(raw)
      if (i > 0 && prev) result[i] = (result[i - 1] ?? 0) + dist3(prev, p)
      prev = p
    }
    result[geometrySize - 1] = 0
    return result
  }
}
