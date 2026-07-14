import { useRef } from "react";
import { Application, Container, Geometry, Mesh, Shader, Buffer, BufferUsage } from "pixi.js";
import type { Viewport } from "../../chart/viewport/useViewport";
import { CONFIG } from "../../shared/config";

//======================================================================================================
// PUBLIC TYPES
//======================================================================================================
export type Triangle = {
  color     : [number, number, number, number]; // rgba 
  timestamp : [number, number, number];         // point1, point2, point3
  price     : [number, number, number];         // point1, point2, point3
};

export type TriangleLayer = {
  init    (app: Application, viewport: Viewport): void;
  add     (triangle: Triangle): void;
  flush   (): void;
  draw    (): void;
  clean   (): void;
  destroy (): void;
};

type ContainerLike = Container & { removeChildren: () => ContainerLike[]; };

//======================================================================================================
// CONSTANTS & STRIDE CONFIGURATION
//======================================================================================================
// Stride layout per vertex: 
// [timestamp, price, R, G, B, A] = 6 floats per vertex
const FLOATS_PER_VERTEX = 6;
const VERTICES_PER_TRIANGLE = 3;
const FLOATS_PER_TRIANGLE = VERTICES_PER_TRIANGLE * FLOATS_PER_VERTEX;
const STRIDE_BYTES = FLOATS_PER_VERTEX * 4; // 24 bytes

//======================================================================================================
// SHADER BUILDER
//======================================================================================================
function buildTriangleShader(viewport: Viewport): Shader {
  const tWeights = viewport.getTimestampToPixelWeights();
  const pWeights = viewport.getPriceToPixelWeights();
  const uid = Math.random().toString(36).substring(2, 15);

  return Shader.from({
    gl: {
      vertex: `
        // UID: ${uid}
        precision mediump float;
        attribute vec2 aPosition;
        attribute vec4 aColor;

        uniform mat3 uProjectionMatrix;
        uniform vec2 uTimestampShaderWeights;
        uniform vec2 uPriceShaderWeights;

        varying vec4 vColor;

        void main(void) {
            vColor = aColor;

            // Viewport matrix scale-conversions using standard screen projections
            float screenX = aPosition.x * uTimestampShaderWeights.x + uTimestampShaderWeights.y;
            float screenY = aPosition.y * uPriceShaderWeights.x + uPriceShaderWeights.y;

            gl_Position = vec4((uProjectionMatrix * vec3(screenX, screenY, 1.0)).xy, 0.0, 1.0);
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
      uTriangleUniforms: {
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
export default function useTriangleLayer(): TriangleLayer {
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);

  const layerRef = useRef<ContainerLike | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  const shaderRef = useRef<Shader | null>(null);
  const pixiBufferRef = useRef<Buffer | null>(null);

  // Unified Flat Array Target Buffer Tracker References
  const triangleCountRef = useRef<number>(0);
  const interleavedArrayRef = useRef<Float32Array>(new Float32Array(0));

  const init = (app: Application, viewport: Viewport): void => {
    appRef.current = app;
    viewportRef.current = viewport;

    if (!layerRef.current) layerRef.current = new Container() as ContainerLike;
    const stage = (app as any).stage;
    if (stage && !stage.children?.includes?.(layerRef.current)) {
      stage.addChild(layerRef.current);
    }

    // Set max configurations utilizing matching line bounds layout properties
    const maxTriangles = CONFIG.LINES_LAYER.MAX_LINES; 
    triangleCountRef.current = 0;
    
    interleavedArrayRef.current = new Float32Array(maxTriangles * FLOATS_PER_TRIANGLE);

    shaderRef.current = buildTriangleShader(viewport);
  };

  const add = (triangle: Triangle): void => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const currentIdx = triangleCountRef.current;
    if (currentIdx >= CONFIG.LINES_LAYER.MAX_LINES) {
      throw new Error("Triangle layer capacity limit has been reached.");
    }

    if (
      !triangle.color || 
      !triangle.timestamp || triangle.timestamp.length < 3 ||
      !triangle.price || triangle.price.length < 3
    ) {
      throw new Error("Triangle object is missing required rendering positional vertex attributes.");
    }

    const tWeights = viewport.getTimestampToPixelWeights();
    const pWeights = viewport.getPriceToPixelWeights();

    const [r, g, b, a] = triangle.color;
    const rf = r / 255, gf = g / 255, bf = b / 255, af = a / 255;

    const arr = interleavedArrayRef.current;
    let ptr = currentIdx * FLOATS_PER_TRIANGLE;

    // Direct packing sequence loop across all 3 spatial endpoints positions safely
    for (let i = 0; i < VERTICES_PER_TRIANGLE; i++) {
      arr[ptr++] = triangle.timestamp[i] - tWeights.offset; // aPosition.x
      arr[ptr++] = triangle.price[i] - pWeights.offset;     // aPosition.y
      arr[ptr++] = rf;                                      // aColor.r
      arr[ptr++] = gf;                                      // aColor.g
      arr[ptr++] = bf;                                      // aColor.b
      arr[ptr++] = af;                                      // aColor.a
    }

    triangleCountRef.current++;
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

const draw = (): void => {
    const app = appRef.current;
    const viewport = viewportRef.current;
    const count = triangleCountRef.current;

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
        shaderAny.resources.uTriangleUniforms.uniforms.uProjectionMatrix = globalUniforms;
      }
      const triangleUniforms = shaderAny.resources?.uTriangleUniforms?.uniforms;
      if (triangleUniforms) {
        triangleUniforms.uTimestampShaderWeights = [tWeights.multiplication, tWeights.addition];
        triangleUniforms.uPriceShaderWeights = [pWeights.multiplication, pWeights.addition];
      }
    }

    // Hoisted slice
    const activeDataSlice = interleavedArrayRef.current.subarray(0, count * FLOATS_PER_TRIANGLE);

    if (!geometryRef.current) {
      pixiBufferRef.current = new Buffer({ data: activeDataSlice, usage: BufferUsage.VERTEX, shrinkToFit: false });

      const geometry = new Geometry();
      geometry.addAttribute("aPosition", { buffer: pixiBufferRef.current, size: 2, stride: STRIDE_BYTES, offset: 0 * 4 });
      geometry.addAttribute("aColor",    { buffer: pixiBufferRef.current, size: 4, stride: STRIDE_BYTES, offset: 2 * 4 });

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
    triangleCountRef.current = 0;
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

  const apiRef = useRef<TriangleLayer | null>(null);
  if (!apiRef.current) {
    apiRef.current = { init, add, flush, draw, clean, destroy };
  }

  return apiRef.current;
}