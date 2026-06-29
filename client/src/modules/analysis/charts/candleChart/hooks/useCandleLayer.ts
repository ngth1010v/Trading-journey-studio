import { useRef } from "react";
import { Application, Container, Geometry, Mesh, Shader } from "pixi.js";
import { throwAppError } from "../../../../../shared/appError";
import type { CandleData } from "./useCandleData";
import type { Viewport, ShaderWeights } from "./useViewport";
import { CONFIG } from "../shared/config";

//======================================================================================================
// PUBLIC
//======================================================================================================
export type CandleStyles = {
  outlineThickness    : number;
  upOutlineColor      : [number, number, number]; // color: rgb
  upBodyColor         : [number, number, number]; // color: rgb
  downOutlineColor    : [number, number, number]; // color: rgb
  downBodyColor       : [number, number, number]; // color: rgb
};

export type CandleLayer = {
  init        (app: Application, candleData: CandleData, viewport: Viewport): Promise<void>;
  updateData  ()                                                            : void;
  setStyles   (candleStyles: CandleStyles)                                  : void;
  draw        ()                                                            : Promise<void>;
  cleanup     ()                                                            : Promise<void>;
};

//======================================================================================================
// TYPE
//======================================================================================================
type MeshLike = {
  destroy?: (options?: any) => void;
};

type ContainerLike = Container & {
  removeChildren: () => ContainerLike[];
};

//======================================================================================================
// CONSTANT
//======================================================================================================
const DEFAULT_STYLES: CandleStyles = {
  outlineThickness  : 2,
  upOutlineColor    : [0, 170, 0],
  upBodyColor       : [0, 170, 0],
  downOutlineColor  : [220, 40, 40],
  downBodyColor     : [220, 40, 40],
};

const CANDLE_VERTEX_CORNERS: Float32Array = new Float32Array([
  -1, -1,
   1, -1,
   1,  1,
  -1, -1,
   1,  1,
  -1,  1,
]);

const FLOATS_PER_OHLC = 5;
const VERTICES_PER_CANDLE = 6;
const FLOATS_PER_CANDLE_CORNERS = VERTICES_PER_CANDLE * 2;

//======================================================================================================
// HELPER
//======================================================================================================
function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneStyles(styles: CandleStyles): CandleStyles {
  return {
    outlineThickness: styles.outlineThickness,
    upOutlineColor: [styles.upOutlineColor[0], styles.upOutlineColor[1], styles.upOutlineColor[2]],
    upBodyColor: [styles.upBodyColor[0], styles.upBodyColor[1], styles.upBodyColor[2]],
    downOutlineColor: [styles.downOutlineColor[0], styles.downOutlineColor[1], styles.downOutlineColor[2]],
    downBodyColor: [styles.downBodyColor[0], styles.downBodyColor[1], styles.downBodyColor[2]],
  };
}

function rgbToVec3(rgb: [number, number, number]): [number, number, number] {
  return [
    Math.max(0, Math.min(255, rgb[0])) / 255,
    Math.max(0, Math.min(255, rgb[1])) / 255,
    Math.max(0, Math.min(255, rgb[2])) / 255,
  ];
}

function getScreenSize(app: Application): { width: number; height: number } {
  const anyApp = app as unknown as {
    screen?: { width: number; height: number };
    renderer?: { screen?: { width: number; height: number } };
  };

  return anyApp.screen ?? anyApp.renderer?.screen ?? { width: 0, height: 0 };
}

function safeDestroy(value: MeshLike | Geometry | Shader | Container | null | undefined): void {
  try {
    (value as any)?.destroy?.();
  } catch {
    // ignore
  }
}

function createMesh(geometry: Geometry, shader: Shader): Mesh {
  return new Mesh({ geometry, shader } as any);
}

function buildShader(
  styles: CandleStyles,
  candleWidth: number,
  weights: {
    timestampShaderWeights: ShaderWeights;
    priceShaderWeights: ShaderWeights;
  },
): Shader {
  const uCandleUniforms = {
    uProjectionMatrix: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), type: "mat3x3<f32>" },
    uOutlineThickness: { value: Math.max(0, styles.outlineThickness), type: "f32" },
    uCandleWidth: { value: Math.max(0, candleWidth), type: "f32" },
    uUpOutlineColor: { value: rgbToVec3(styles.upOutlineColor), type: "vec3<f32>" },
    uUpBodyColor: { value: rgbToVec3(styles.upBodyColor), type: "vec3<f32>" },
    uDownOutlineColor: { value: rgbToVec3(styles.downOutlineColor), type: "vec3<f32>" },
    uDownBodyColor: { value: rgbToVec3(styles.downBodyColor), type: "vec3<f32>" },
    uTimestampShaderWeights: {
      value: [weights.timestampShaderWeights.multiplication, weights.timestampShaderWeights.addition],
      type: "vec2<f32>",
    },
    uPriceShaderWeights: {
      value: [weights.priceShaderWeights.multiplication, weights.priceShaderWeights.addition],
      type: "vec2<f32>",
    },
  };

  const vertexSrc = `
precision mediump float;

attribute vec2 aPosition;
attribute float aTimestamp;
attribute float aOpen;
attribute float aHigh;
attribute float aLow;
attribute float aClose;

uniform mat3 uProjectionMatrix;
uniform float uCandleWidth;
uniform vec2 uTimestampShaderWeights;
uniform vec2 uPriceShaderWeights;

varying vec2 vPixelPos;
varying float vCenterX;
varying float vOpenY;
varying float vHighY;
varying float vLowY;
varying float vCloseY;

void main(void) {
  float x = aTimestamp * uTimestampShaderWeights.x + uTimestampShaderWeights.y;
  float openY = aOpen * uPriceShaderWeights.x + uPriceShaderWeights.y;
  float highY = aHigh * uPriceShaderWeights.x + uPriceShaderWeights.y;
  float lowY = aLow * uPriceShaderWeights.x + uPriceShaderWeights.y;
  float closeY = aClose * uPriceShaderWeights.x + uPriceShaderWeights.y;

  float halfWidth = uCandleWidth * 0.5;

  float minHeight = 1.0;
  if (abs(highY - lowY) < minHeight) {
    highY = highY + minHeight;
  }

  vec2 pos = vec2(
    x + aPosition.x * halfWidth,
    mix(highY, lowY, (aPosition.y + 1.0) * 0.5)
  );

  vPixelPos = pos;
  vCenterX = x;
  vOpenY = openY;
  vHighY = highY;
  vLowY = lowY;
  vCloseY = closeY;

  vec3 projected = uProjectionMatrix * vec3(pos, 1.0);
  gl_Position = vec4(projected.xy, 0.0, 1.0);
}
`;

  const fragmentSrc = `
precision mediump float;

uniform float uOutlineThickness;
uniform float uCandleWidth;
uniform vec3 uUpOutlineColor;
uniform vec3 uUpBodyColor;
uniform vec3 uDownOutlineColor;
uniform vec3 uDownBodyColor;

varying vec2 vPixelPos;
varying float vCenterX;
varying float vOpenY;
varying float vHighY;
varying float vLowY;
varying float vCloseY;

void main(void) {
  bool isUp = vCloseY < vOpenY;

  vec3 outlineColor = isUp ? uUpOutlineColor : uDownOutlineColor;
  vec3 bodyColor = isUp ? uUpBodyColor : uDownBodyColor;

  float halfWidth = uCandleWidth * 0.5;
  float halfOutline = uOutlineThickness * 0.5;

  float rawBodyTop = min(vOpenY, vCloseY);
  float rawBodyBottom = max(vOpenY, vCloseY);

  float bodyHeight = max(abs(vOpenY - vCloseY), uOutlineThickness);

  float bodyTop;
  float bodyBottom;

  // FIX: o=h=l=c hoặc open==close
  // ép body nằm hoàn toàn trong vùng geometry thay vì bị chia đôi ra ngoài
  if (abs(vOpenY - vCloseY) < 0.0001) {
    bodyTop = rawBodyTop;
    bodyBottom = rawBodyTop + bodyHeight;
  } else {
    float bodyCenter = (rawBodyTop + rawBodyBottom) * 0.5;
    bodyTop = bodyCenter - bodyHeight * 0.5;
    bodyBottom = bodyCenter + bodyHeight * 0.5;
  }

  bool canDrawOutline = uCandleWidth >= uOutlineThickness && bodyHeight >= uOutlineThickness;
  bool canDrawBodyInner =
    uCandleWidth > (uOutlineThickness * 2.0) &&
    bodyHeight > (uOutlineThickness * 2.0);

  float dx = abs(vPixelPos.x - vCenterX);

  bool inWick = dx <= halfOutline && vPixelPos.y >= vHighY && vPixelPos.y <= vLowY;
  bool inBodyOuter = canDrawOutline && dx <= halfWidth && vPixelPos.y >= bodyTop && vPixelPos.y <= bodyBottom;
  bool inBodyInner = canDrawBodyInner
    && dx <= (halfWidth - uOutlineThickness)
    && vPixelPos.y >= (bodyTop + uOutlineThickness)
    && vPixelPos.y <= (bodyBottom - uOutlineThickness);

  vec4 color = vec4(0.0);

  if (inWick) {
    color = vec4(outlineColor, 1.0);
  }

  if (inBodyOuter) {
    color = vec4(outlineColor, 1.0);
  }

  if (inBodyInner) {
    color = vec4(bodyColor, 1.0);
  }

  if (color.a <= 0.0) {
    discard;
  }

  gl_FragColor = color;
}
`;

  return Shader.from({
    gl: {
      vertex: vertexSrc,
      fragment: fragmentSrc,
    },
    resources: {
      uCandleUniforms,
    },
  });
}

function buildGeometryFromRange(
  flatOhlcs: Float32Array,
  startIndex: number,
  endExclusive: number,
): Geometry {
  const candleCount = Math.max(0, endExclusive - startIndex);

  const corners = new Float32Array(candleCount * FLOATS_PER_CANDLE_CORNERS);
  const timestamps = new Float32Array(candleCount * VERTICES_PER_CANDLE);
  const opens = new Float32Array(candleCount * VERTICES_PER_CANDLE);
  const highs = new Float32Array(candleCount * VERTICES_PER_CANDLE);
  const lows = new Float32Array(candleCount * VERTICES_PER_CANDLE);
  const closes = new Float32Array(candleCount * VERTICES_PER_CANDLE);

  for (let i = 0; i < candleCount; i += 1) {
    const src = (startIndex + i) * FLOATS_PER_OHLC;
    const dstVertex = i * VERTICES_PER_CANDLE;
    const dstCorner = i * FLOATS_PER_CANDLE_CORNERS;

    const t = flatOhlcs[src + 0];
    const o = flatOhlcs[src + 1];
    const h = flatOhlcs[src + 2];
    const l = flatOhlcs[src + 3];
    const c = flatOhlcs[src + 4];

    for (let v = 0; v < VERTICES_PER_CANDLE; v += 1) {
      const vIndex = dstVertex + v;

      timestamps[vIndex] = t;
      opens[vIndex] = o;
      highs[vIndex] = h;
      lows[vIndex] = l;
      closes[vIndex] = c;

      corners[dstCorner + (v * 2)] = CANDLE_VERTEX_CORNERS[v * 2];
      corners[dstCorner + (v * 2) + 1] = CANDLE_VERTEX_CORNERS[(v * 2) + 1];
    }
  }

  const geometry = new Geometry();
  geometry.addAttribute("aPosition", { buffer: corners, size: 2 });
  geometry.addAttribute("aTimestamp", { buffer: timestamps, size: 1 });
  geometry.addAttribute("aOpen", { buffer: opens, size: 1 });
  geometry.addAttribute("aHigh", { buffer: highs, size: 1 });
  geometry.addAttribute("aLow", { buffer: lows, size: 1 });
  geometry.addAttribute("aClose", { buffer: closes, size: 1 });

  return geometry;
}

function toPixelTimestamp(viewport: Viewport, timestamp: number): number {
  return viewport.timestampToPixel(timestamp);
}

function toPixelFlatTimestamp(
  viewport: Viewport,
  flatTimestamp: number,
  timestampOffset: number,
): number {
  return toPixelTimestamp(viewport, flatTimestamp + timestampOffset);
}

function findVisibleRange(
  viewport: Viewport,
  flatOhlcs: Float32Array,
  timestampOffset: number,
  candleWidth: number,
  canvasWidth: number,
): { start: number; endExclusive: number } {
  const candleCount = Math.floor(flatOhlcs.length / FLOATS_PER_OHLC);

  if (candleCount <= 0) {
    return { start: 0, endExclusive: 0 };
  }

  const halfWidth = candleWidth * 0.5;

  let left = 0;
  let right = candleCount;

  while (left < right) {
    const mid = (left + right) >> 1;
    const x = toPixelFlatTimestamp(viewport, flatOhlcs[mid * FLOATS_PER_OHLC], timestampOffset);

    if ((x + halfWidth) < 0) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const start = left;

  left = start;
  right = candleCount;

  while (left < right) {
    const mid = (left + right) >> 1;
    const x = toPixelFlatTimestamp(viewport, flatOhlcs[mid * FLOATS_PER_OHLC], timestampOffset);

    if ((x - halfWidth) <= canvasWidth) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const endExclusive = left;

  return {
    start: Math.max(0, start - 1),
    endExclusive: Math.min(candleCount, endExclusive + 1),
  };
}

//======================================================================================================
// HOOK
//======================================================================================================
export default function useCandleLayer(): CandleLayer {
  const appRef = useRef<Application | null>(null);
  const candleDataRef = useRef<CandleData | null>(null);
  const viewportRef = useRef<Viewport | null>(null);

  const flatOhlcsRef = useRef<Float32Array>(new Float32Array());
  const stylesRef = useRef<CandleStyles>(cloneStyles(DEFAULT_STYLES));

  const layerRef = useRef<ContainerLike | null>(null);
  const meshRef = useRef<MeshLike | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  const shaderRef = useRef<Shader | null>(null);

  //DEBUG
  {

  }
  //DEBUG

  const buildOrUpdatePipeline = (
    app: Application,
    candleWidth: number,
    weights: {
      timestampShaderWeights: ShaderWeights;
      priceShaderWeights: ShaderWeights;
    },
  ): void => {
    const styles = stylesRef.current;
    const globalUniforms = (app.renderer as any).globalUniforms?.uniforms?.uProjectionMatrix;

    if (!shaderRef.current) {
      shaderRef.current = buildShader(styles, candleWidth, weights);
      if (globalUniforms) {
        (shaderRef.current as any).resources.uCandleUniforms.uniforms.uProjectionMatrix = globalUniforms;
      }
      return;
    }

    const shaderAny = shaderRef.current as any;
    if (globalUniforms) {
      shaderAny.resources.uCandleUniforms.uniforms.uProjectionMatrix = globalUniforms;
    }

    // Gán thông qua group uCandleUniforms.uniforms (Dành cho PixiJS v8)
    const candleUniforms = shaderAny.resources?.uCandleUniforms?.uniforms;
    
    if (candleUniforms) {
      candleUniforms.uOutlineThickness = Math.max(0, styles.outlineThickness);
      candleUniforms.uCandleWidth = Math.max(0, candleWidth);
      candleUniforms.uUpOutlineColor = rgbToVec3(styles.upOutlineColor);
      candleUniforms.uUpBodyColor = rgbToVec3(styles.upBodyColor);
      candleUniforms.uDownOutlineColor = rgbToVec3(styles.downOutlineColor);
      candleUniforms.uDownBodyColor = rgbToVec3(styles.downBodyColor);
      candleUniforms.uTimestampShaderWeights = [
        weights.timestampShaderWeights.multiplication,
        weights.timestampShaderWeights.addition,
      ];
      candleUniforms.uPriceShaderWeights = [
        weights.priceShaderWeights.multiplication,
        weights.priceShaderWeights.addition,
      ];
    }
  };

  const setMesh = (geometry: Geometry, shader: Shader): void => {
    const layer = layerRef.current;
    if (!layer) {
      return;
    }

    if (meshRef.current) {
      layer.removeChildren();
      safeDestroy(meshRef.current);
      meshRef.current = null;
    }

    const mesh = createMesh(geometry, shader) as unknown as MeshLike;
    meshRef.current = mesh;
    layer.addChild(mesh as any);
  };

  const cleanupMeshOnly = (): void => {
    const layer = layerRef.current;
    if (layer) {
      layer.removeChildren();
    }

    safeDestroy(meshRef.current);
    meshRef.current = null;
    safeDestroy(geometryRef.current);
    geometryRef.current = null;
    safeDestroy(shaderRef.current);
    shaderRef.current = null;
  };

  const init = async (
    app: Application,
    candleData: CandleData,
    viewport: Viewport,
  ): Promise<void> => {
    appRef.current = app;
    candleDataRef.current = candleData;
    viewportRef.current = viewport;

    if (!layerRef.current) {
      layerRef.current = new Container() as ContainerLike;
    }

    const stage = (app as any)?.stage;
    if (stage && !stage.children?.includes?.(layerRef.current)) {
      stage.addChild(layerRef.current);
    }

    updateData();
    await draw();

    candleDataRef.current.addOnDataChange("candleLayer/init", updateData);
    candleDataRef.current.addOnLastDataChange("candleLayer/init", draw);
    viewportRef.current.addOnViewportChange("candleLayer/init", draw);
  };

  const updateData = (): void => {
    const candleData = candleDataRef.current;
    if (!candleData) {
      throwAppError("NOT_INITIALIZED", "candleData is not initialized");
    }

    const size = candleData.getSize();
    const binOhlcs = candleData.getBinRange(0, size);

    if (!binOhlcs) {
      flatOhlcsRef.current = new Float32Array();
      return;
    }

    const timestampWeightsResult = viewportRef.current?.getTimestampToPixelWeights();
    const timestampOffset = timestampWeightsResult ? timestampWeightsResult.offset : 0;

    const priceWeightsResult = viewportRef.current?.getPriceToPixelWeights();
    const priceOffset = priceWeightsResult ? priceWeightsResult.offset : 0;

    const flat = new Float32Array(size * FLOATS_PER_OHLC);

    for (let i = 0; i < size; i += 1) {
      const base = i * FLOATS_PER_OHLC;
      // Convert BigInt to Number & subtract offsets directly
      flat[base + 0] = Number(binOhlcs.t[i]) - timestampOffset;
      flat[base + 1] = Number(binOhlcs.o[i]) - priceOffset;
      flat[base + 2] = Number(binOhlcs.h[i]) - priceOffset;
      flat[base + 3] = Number(binOhlcs.l[i]) - priceOffset;
      flat[base + 4] = Number(binOhlcs.c[i]) - priceOffset;
    }

    flatOhlcsRef.current = flat;
  };

  const setStyles = (candleStyles: CandleStyles): void => {
    stylesRef.current = cloneStyles(candleStyles);

    if (shaderRef.current) {
      const shaderAny = shaderRef.current as any;
      const candleUniforms = shaderAny.resources?.uCandleUniforms?.uniforms;
      
      if (candleUniforms) {
        candleUniforms.uOutlineThickness = Math.max(0, candleStyles.outlineThickness);
        candleUniforms.uUpOutlineColor = rgbToVec3(candleStyles.upOutlineColor);
        candleUniforms.uUpBodyColor = rgbToVec3(candleStyles.upBodyColor);
        candleUniforms.uDownOutlineColor = rgbToVec3(candleStyles.downOutlineColor);
        candleUniforms.uDownBodyColor = rgbToVec3(candleStyles.downBodyColor);
      }
    }
  };

  const draw = async (): Promise<void> => {
    const app = appRef.current;
    const viewport = viewportRef.current;

    if (!app || !viewport) {
      throwAppError("NOT_INITIALIZED", "candle layer is not initialized");
    }

    const screen = getScreenSize(app);
    if (!isValidNumber(screen.width) || !isValidNumber(screen.height) || screen.width <= 0 || screen.height <= 0) {
      throwAppError("INVALID_CANVAS_SIZE", "canvas size must be set before draw()");
    }

    viewport.getTransformedView();

    const timestampWeights = viewport.getTimestampToPixelWeights();
    const priceWeights = viewport.getPriceToPixelWeights();

    const flatOhlcs = flatOhlcsRef.current;
    const candleCount = Math.floor(flatOhlcs.length / FLOATS_PER_OHLC);

    if (candleCount <= 0) {
      cleanupMeshOnly();
      return;
    }

    const timestampOffset = timestampWeights.offset;

    let candleWidth = 1;
    if (candleCount >= 2) {
      const x0 = toPixelFlatTimestamp(viewport, flatOhlcs[0], timestampOffset);
      const x1 = toPixelFlatTimestamp(viewport, flatOhlcs[FLOATS_PER_OHLC], timestampOffset);
      candleWidth = Math.max(1, Math.abs(x1 - x0) - CONFIG.CANDLE_LAYER.CANDLE_SPACING);
    }

    const visible = findVisibleRange(
      viewport,
      flatOhlcs,
      timestampOffset,
      candleWidth,
      screen.width,
    );
    const visibleCount = Math.max(0, visible.endExclusive - visible.start);

    if (visibleCount <= 0) {
      cleanupMeshOnly();
      return;
    }

    const adjustedWeights = {
      timestampShaderWeights: {
        offset: 0,
        multiplication: timestampWeights.multiplication,
        addition: timestampWeights.addition,
      },
      priceShaderWeights: {
        offset: 0,
        multiplication: priceWeights.multiplication,
        addition: priceWeights.addition,
      },
    };


    let finalFlatOhlcs = flatOhlcs;
    let finalStart = visible.start;
    let finalEndExclusive = visible.endExclusive;

    const lastOhlc = candleDataRef.current?.getLast();

    if (lastOhlc) {
      const timestampWeights = viewport.getTimestampToPixelWeights();
      const priceWeights = viewport.getPriceToPixelWeights();

      const tOffset = timestampWeights.offset;
      const pOffset = priceWeights.offset;

      const totalCandles = Math.floor(flatOhlcs.length / FLOATS_PER_OHLC);

      if (totalCandles > 0) {
        const lastFlatIndex = totalCandles - 1;
        const lastFlatT = flatOhlcs[lastFlatIndex * FLOATS_PER_OHLC + 0] + tOffset;

        const sameTimestamp = lastOhlc.t === lastFlatT;

        // THAY ĐỔI Ở CUỐI: ghi đè candle cuối thay vì bỏ qua
        if (sameTimestamp) {
          const currentVisibleLength = (visible.endExclusive - visible.start) * FLOATS_PER_OHLC;
          const injectedBuffer = new Float32Array(currentVisibleLength);

          const srcOffset = visible.start * FLOATS_PER_OHLC;
          injectedBuffer.set(
            flatOhlcs.subarray(srcOffset, srcOffset + currentVisibleLength),
            0
          );

          // ghi đè candle cuối cùng trong buffer visible
          const dst = currentVisibleLength - FLOATS_PER_OHLC;
          injectedBuffer[dst + 0] = lastOhlc.t - tOffset;
          injectedBuffer[dst + 1] = lastOhlc.o - pOffset;
          injectedBuffer[dst + 2] = lastOhlc.h - pOffset;
          injectedBuffer[dst + 3] = lastOhlc.l - pOffset;
          injectedBuffer[dst + 4] = lastOhlc.c - pOffset;

          finalFlatOhlcs = injectedBuffer;
          finalStart = 0;
          finalEndExclusive = currentVisibleLength / FLOATS_PER_OHLC;
        }
        // THÊM BAR MỚI Ở CUỐI
        else if (lastOhlc.t > lastFlatT) {
          const currentVisibleLength = (visible.endExclusive - visible.start) * FLOATS_PER_OHLC;
          const injectedBuffer = new Float32Array(currentVisibleLength + FLOATS_PER_OHLC);

          const srcOffset = visible.start * FLOATS_PER_OHLC;
          injectedBuffer.set(
            flatOhlcs.subarray(srcOffset, srcOffset + currentVisibleLength),
            0
          );

          injectedBuffer[currentVisibleLength + 0] = lastOhlc.t - tOffset;
          injectedBuffer[currentVisibleLength + 1] = lastOhlc.o - pOffset;
          injectedBuffer[currentVisibleLength + 2] = lastOhlc.h - pOffset;
          injectedBuffer[currentVisibleLength + 3] = lastOhlc.l - pOffset;
          injectedBuffer[currentVisibleLength + 4] = lastOhlc.c - pOffset;

          finalFlatOhlcs = injectedBuffer;
          finalStart = 0;
          finalEndExclusive = (currentVisibleLength / FLOATS_PER_OHLC) + 1;
        }
      }
    }
    const geometry = buildGeometryFromRange(finalFlatOhlcs, finalStart, finalEndExclusive);

    // FIX TẠI ĐÂY: Gọi update() trên mảng buffers nội bộ của Geometry (Chuẩn PixiJS v8)
    if (finalFlatOhlcs !== flatOhlcs) {
      if (geometry.buffers) {
        geometry.buffers.forEach((buffer: any) => {
          buffer.update?.();
        });
      }
    }
    // ==========================================

    buildOrUpdatePipeline(app, candleWidth, adjustedWeights);

    if (!shaderRef.current) {
      throwAppError("SHADER_BUILD_FAILED", "failed to build candle shader");
    }

    if (geometryRef.current) {
      safeDestroy(geometryRef.current);
    }
    geometryRef.current = geometry;

    setMesh(geometry, shaderRef.current);
  };

  const cleanup = async (): Promise<void> => {
    cleanupMeshOnly();

    const layer = layerRef.current;
    const stage = (appRef.current as any)?.stage;

    if (layer && stage && stage.children?.includes?.(layer)) {
      try {
        stage.removeChild(layer);
      } catch {
        // ignore
      }
    }

    candleDataRef.current?.removeOnDataChange("candleLayer/init");
    candleDataRef.current?.removeOnLastDataChange("candleLayer/init");
    viewportRef.current?.removeOnViewportChange("candleLayer/init");

    appRef.current = null;
    candleDataRef.current = null;
    viewportRef.current = null;
    flatOhlcsRef.current = new Float32Array();
  };

  const apiRef = useRef<CandleLayer | null>(null);

  if (!apiRef.current) {
    apiRef.current = { init, updateData, setStyles, draw, cleanup };
  }

  return apiRef.current;
}