import { useRef } from "react";
import { Application, Container, Geometry, Mesh, Shader, Buffer, BufferUsage  } from "pixi.js";
import { throwAppError } from "../../../../../../../shared/appError";
import type { Viewport } from "../../viewport/useViewport";
import { CONFIG } from "../../../shared/config";

//======================================================================================================
// PUBLIC TYPES
//======================================================================================================
export type Line = {
  thickness   ?: number;
  color       ?: [number, number, number, number]; // rgba
  timestamp1  ?: number;
  timestamp2  ?: number;
  price1      ?: number;
  price2      ?: number;
};

export type LineLayer = {
  init    (app: Application, viewport: Viewport): void;
  add     (line: Line): void;
  flush   (): void;
  draw    (): void;
  clean   (): void;
  destroy (): void;
};

type ContainerLike = Container & { removeChildren: () => ContainerLike[]; };

//======================================================================================================
// CONSTANTS & STRIDE CONFIGURATION
//======================================================================================================
// Stride layout: 
// [cornerX, cornerY, thickness, R, G, B, A, p1X, p1Y, p2X, p2Y] = 11 floats per vertex
const FLOATS_PER_VERTEX = 11;
const VERTICES_PER_LINE = 6;
const FLOATS_PER_LINE = VERTICES_PER_LINE * FLOATS_PER_VERTEX;
const STRIDE_BYTES = FLOATS_PER_VERTEX * 4; // 44 bytes

// Quad corner template matrices configurations
const CORNERS = [
  [0, -1], [1, -1], [1,  1],
  [0, -1], [1,  1], [0,  1]
];

//======================================================================================================
// SHADER BUILDER
//======================================================================================================
function buildLineShader(viewport: Viewport): Shader {
  const tWeights = viewport.getTimestampToPixelWeights();
  const pWeights = viewport.getPriceToPixelWeights();
  const uid = Math.random().toString(36).substring(2, 15);

  return Shader.from({
    gl: {
      vertex: `
        // UID: ${uid}
        precision mediump float;
        attribute vec2 aCorner;
        attribute float aThickness;
        attribute vec4 aColor;
        attribute vec2 aLineStart;
        attribute vec2 aLineEnd;

        uniform mat3 uProjectionMatrix;
        uniform vec2 uTimestampShaderWeights;
        uniform vec2 uPriceShaderWeights;

        varying vec4 vColor;

        void main(void) {
            vColor = aColor;

            float x1 = aLineStart.x * uTimestampShaderWeights.x + uTimestampShaderWeights.y;
            float y1 = aLineStart.y * uPriceShaderWeights.x + uPriceShaderWeights.y;
            float x2 = aLineEnd.x * uTimestampShaderWeights.x + uTimestampShaderWeights.y;
            float y2 = aLineEnd.y * uPriceShaderWeights.x + uPriceShaderWeights.y;

            vec2 p1 = vec2(x1, y1);
            vec2 p2 = vec2(x2, y2);

            vec2 dir = p2 - p1;
            vec2 norm = vec2(-dir.y, dir.x);
            if (length(norm) > 0.0) norm = normalize(norm);

            vec2 pointOnLine = mix(p1, p2, aCorner.x);
            vec2 screenPos = pointOnLine + norm * (aCorner.y * aThickness * 0.5);

            gl_Position = vec4((uProjectionMatrix * vec3(screenPos, 1.0)).xy, 0.0, 1.0);
        }
      `,
      fragment: `
        precision mediump float;
        varying vec4 vColor;
        void main(void) {
            gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a);
        }
      `
    },
    resources: {
      uLineUniforms: {
        uProjectionMatrix: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), type: "mat3x3<f32>" },
        uTimestampShaderWeights: { value: [tWeights.multiplication, tWeights.addition], type: "vec2<f32>" },
        uPriceShaderWeights: { value: [pWeights.multiplication, pWeights.addition], type: "vec2<f32>" },
      }
    }
  });
}

//======================================================================================================
// HOOK IMPLEMENTATION
//======================================================================================================
export default function useLineLayer(): LineLayer {
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);

  const layerRef = useRef<ContainerLike | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  const shaderRef = useRef<Shader | null>(null);
  const pixiBufferRef = useRef<Buffer | null>(null);

  // Single Master Interleaved Buffer Staging Array Reference
  const lineCountRef = useRef<number>(0);
  const interleavedArrayRef = useRef<Float32Array>(new Float32Array(0));

  const init = (app: Application, viewport: Viewport): void => {
    appRef.current = app;
    viewportRef.current = viewport;

    if (!layerRef.current) layerRef.current = new Container() as ContainerLike;
    const stage = (app as any).stage;
    if (stage && !stage.children?.includes?.(layerRef.current)) {
      stage.addChild(layerRef.current);
    }

    const maxLines = CONFIG.LINES_LAYER.MAX_LINES;
    lineCountRef.current = 0;
    
    // Allocate the unified single array instantly
    interleavedArrayRef.current = new Float32Array(maxLines * FLOATS_PER_LINE);

    shaderRef.current = buildLineShader(viewport);
  };

  const add = (line: Line): void => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const currentIdx = lineCountRef.current;
    if (currentIdx >= CONFIG.LINES_LAYER.MAX_LINES) {
      throwAppError("LIMIT_EXCEEDED", "Line layer capacity limit has been reached.");
    }


    if (
      line.thickness === undefined || line.color === undefined ||
      line.timestamp1 === undefined || line.price1 === undefined ||
      line.timestamp2 === undefined || line.price2 === undefined
    ) {
      throwAppError("MISSING_ARGUMENT", "Line object is missing required rendering attributes.");
    }

    const tWeights = viewport.getTimestampToPixelWeights();
    const pWeights = viewport.getPriceToPixelWeights();

    // Instant layout offsetting configuration shifts values directly to local float space metrics safely
    const t1 = line.timestamp1 - tWeights.offset;
    const p1 = line.price1 - pWeights.offset;
    const t2 = line.timestamp2 - tWeights.offset;
    const p2 = line.price2 - pWeights.offset;

    const [r, g, b, a] = line.color;
    const rf = r / 255, gf = g / 255, bf = b / 255, af = a / 255;

    const arr = interleavedArrayRef.current;
    let ptr = currentIdx * FLOATS_PER_LINE;

    // Fast inline construction loops filling 6 sequential vertices layout structures instantly
    for (let i = 0; i < VERTICES_PER_LINE; i++) {
      arr[ptr++] = CORNERS[i][0]; // aCorner.x
      arr[ptr++] = CORNERS[i][1]; // aCorner.y
      arr[ptr++] = line.thickness;// aThickness
      arr[ptr++] = rf;            // aColor.r
      arr[ptr++] = gf;            // aColor.g
      arr[ptr++] = bf;            // aColor.b
      arr[ptr++] = af;            // aColor.a
      arr[ptr++] = t1;            // aLineStart.x
      arr[ptr++] = p1;            // aLineStart.y
      arr[ptr++] = t2;            // aLineEnd.x
      arr[ptr++] = p2;            // aLineEnd.y
    }

    lineCountRef.current++;
  };

  const flush = (): void => {
    if (geometryRef.current) {
      geometryRef.current.destroy();
      geometryRef.current = null;
    }
    if (pixiBufferRef.current) {
      pixiBufferRef.current.destroy();
      pixiBufferRef.current = null;
    }
  };
// 3. UPDATE: draw() - Fix the buffer fast path
  const draw = (): void => {
    const app = appRef.current;
    const viewport = viewportRef.current;
    const count = lineCountRef.current;

    if (!app || !viewport || count === 0) {
      if (meshRef.current) {
        layerRef.current?.removeChildren();
        meshRef.current.destroy();
        meshRef.current = null;
      }
      return;
    }

    const tWeights = viewport.getTimestampToPixelWeights();
    const pWeights = viewport.getPriceToPixelWeights();
    const globalUniforms = (app.renderer as any).globalUniforms?.uniforms?.uProjectionMatrix;

    if (shaderRef.current) {
      const shaderAny = shaderRef.current as any;
      if (globalUniforms) {
        shaderAny.resources.uLineUniforms.uniforms.uProjectionMatrix = globalUniforms;
      }
      const lineUniforms = shaderAny.resources?.uLineUniforms?.uniforms;
      if (lineUniforms) {
        lineUniforms.uTimestampShaderWeights = [tWeights.multiplication, tWeights.addition];
        lineUniforms.uPriceShaderWeights = [pWeights.multiplication, pWeights.addition];
      }
    }

    // Hoisted slice for both creation and update paths
    const activeDataSlice = interleavedArrayRef.current.subarray(0, count * FLOATS_PER_LINE);

    if (!geometryRef.current) {
      pixiBufferRef.current = new Buffer({ data: activeDataSlice, usage: BufferUsage.VERTEX, shrinkToFit: false });

      const geometry = new Geometry();
      geometry.addAttribute("aCorner",    { buffer: pixiBufferRef.current, size: 2, stride: STRIDE_BYTES, offset: 0 * 4 });
      geometry.addAttribute("aThickness", { buffer: pixiBufferRef.current, size: 1, stride: STRIDE_BYTES, offset: 2 * 4 });
      geometry.addAttribute("aColor",     { buffer: pixiBufferRef.current, size: 4, stride: STRIDE_BYTES, offset: 3 * 4 });
      geometry.addAttribute("aLineStart", { buffer: pixiBufferRef.current, size: 2, stride: STRIDE_BYTES, offset: 7 * 4 });
      geometry.addAttribute("aLineEnd",   { buffer: pixiBufferRef.current, size: 2, stride: STRIDE_BYTES, offset: 9 * 4 });

      geometryRef.current = geometry;

      if (meshRef.current) {
        layerRef.current?.removeChildren();
        meshRef.current.destroy();
      }

      meshRef.current = new Mesh({ geometry, shader: shaderRef.current } as any);
      layerRef.current?.addChild(meshRef.current);
    } else {
      // Corrected fast path
      if (pixiBufferRef.current) {
        pixiBufferRef.current.data = activeDataSlice;
        pixiBufferRef.current.update(activeDataSlice.byteLength);
      }
    }
  };

  const clean = (): void => {
    lineCountRef.current = 0;
  };

  const destroy = (): void => {
    if (meshRef.current) { meshRef.current.destroy(); meshRef.current = null; }
    if (geometryRef.current) { geometryRef.current.destroy(); geometryRef.current = null; }
    if (shaderRef.current) { shaderRef.current.destroy(); shaderRef.current = null; }
    if (pixiBufferRef.current) { pixiBufferRef.current.destroy(); pixiBufferRef.current = null; }
    
    if (layerRef.current) {
      const stage = (appRef.current as any)?.stage;
      if (stage?.children?.includes(layerRef.current)) {
        try { stage.removeChild(layerRef.current); } catch {}
      }
      layerRef.current.destroy();
      layerRef.current = null;
    }

    appRef.current = null;
    viewportRef.current = null;
  };

  const apiRef = useRef<LineLayer | null>(null);
  if (!apiRef.current) {
    apiRef.current = { init, add, flush, draw, clean, destroy };
  }

  return apiRef.current;
}