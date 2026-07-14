import { useRef } from "react";
import { Application, Container, Geometry, Mesh, Shader } from "pixi.js";
import { throwAppError } from "../../../../../../shared/appError";
import type { CandleData } from "../../market/hooks/useCandleData";
import type { Viewport, ShaderWeights } from "../viewport/useViewport";
import { CONFIG } from "../../shared/config";

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

type MeshLike = { destroy?: (options?: any) => void; };
type ContainerLike = Container & { removeChildren: () => ContainerLike[]; };

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

function cloneStyles(styles: CandleStyles): CandleStyles {
  return {
    outlineThickness: styles.outlineThickness,
    upOutlineColor: [...styles.upOutlineColor],
    upBodyColor: [...styles.upBodyColor],
    downOutlineColor: [...styles.downOutlineColor],
    downBodyColor: [...styles.downBodyColor],
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
  const anyApp = app as any;
  return anyApp.screen ?? anyApp.renderer?.screen ?? { width: 0, height: 0 };
}

function safeDestroy(value: MeshLike | Geometry | Shader | Container | null | undefined): void {
  try { (value as any)?.destroy?.(); } catch {}
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
function toPixelFlatTimestamp(viewport: Viewport, flatTimestamp: number, timestampOffset: number): number {
  return viewport.timestampToPixel(flatTimestamp + timestampOffset);
}

function findVisibleRange(
  viewport: Viewport,
  flatOhlcs: Float32Array,
  candleCount: number, // Truyền trực tiếp số lượng nến hiện có
  timestampOffset: number,
  candleWidth: number,
  canvasWidth: number,
): { start: number; endExclusive: number } {
  if (candleCount <= 0) return { start: 0, endExclusive: 0 };

  const halfWidth = candleWidth * 0.5;
  let left = 0, right = candleCount;

  while (left < right) {
    const mid = (left + right) >> 1;
    const x = toPixelFlatTimestamp(viewport, flatOhlcs[mid * FLOATS_PER_OHLC], timestampOffset);
    if ((x + halfWidth) < 0) left = mid + 1;
    else right = mid;
  }
  const start = left;

  left = start;
  right = candleCount;
  while (left < right) {
    const mid = (left + right) >> 1;
    const x = toPixelFlatTimestamp(viewport, flatOhlcs[mid * FLOATS_PER_OHLC], timestampOffset);
    if ((x - halfWidth) <= canvasWidth) left = mid + 1;
    else right = mid;
  }
  const endExclusive = left;

  return {
    start: Math.max(0, start - 1),
    endExclusive: Math.min(candleCount, endExclusive + 1),
  };
}

// Hàm hỗ trợ copy 1 cây nến vào mảng pre-allocate
function copyCandleToGeometryBuffers(
  flatOhlcs: Float32Array,
  srcCandleIndex: number,
  gState: any,
  dstCandleIndex: number
) {
  const src = srcCandleIndex * FLOATS_PER_OHLC;
  const t = flatOhlcs[src + 0];
  const o = flatOhlcs[src + 1];
  const h = flatOhlcs[src + 2];
  const l = flatOhlcs[src + 3];
  const c = flatOhlcs[src + 4];

  const dstCorner = dstCandleIndex * FLOATS_PER_CANDLE_CORNERS;
  const dstVertex = dstCandleIndex * VERTICES_PER_CANDLE;

  for (let v = 0; v < VERTICES_PER_CANDLE; v += 1) {
    const vIdx = dstVertex + v;
    gState.timestamps[vIdx] = t;
    gState.opens[vIdx] = o;
    gState.highs[vIdx] = h;
    gState.lows[vIdx] = l;
    gState.closes[vIdx] = c;

    gState.corners[dstCorner + (v * 2)] = CANDLE_VERTEX_CORNERS[v * 2];
    gState.corners[dstCorner + (v * 2) + 1] = CANDLE_VERTEX_CORNERS[(v * 2) + 1];
  }
}

//======================================================================================================
// HOOK
//======================================================================================================
export default function useCandleLayer(): CandleLayer {
  const appRef = useRef<Application | null>(null);
  const candleDataRef = useRef<CandleData | null>(null);
  const viewportRef = useRef<Viewport | null>(null);

  const stylesRef = useRef<CandleStyles>(cloneStyles(DEFAULT_STYLES));
  const layerRef = useRef<ContainerLike | null>(null);
  const meshRef = useRef<MeshLike | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  const shaderRef = useRef<Shader | null>(null);

  // 1. POOLING: Quản lý data gốc 
  const dataStateRef = useRef({
    flatOhlcs: new Float32Array(0),
    count: 0,
    capacity: 0,
  });

  // 2. POOLING: Quản lý mảng Geometry để tránh khởi tạo mảng ở mỗi frame
  const geomStateRef = useRef({
    corners: new Float32Array(0),
    timestamps: new Float32Array(0),
    opens: new Float32Array(0),
    highs: new Float32Array(0),
    lows: new Float32Array(0),
    closes: new Float32Array(0),
    capacity: 0,
    lastStart: -1,
    lastEnd: -1,
  });


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

  const cleanupMeshOnly = (): void => {
    if (layerRef.current) layerRef.current.removeChildren();
    safeDestroy(meshRef.current);
    meshRef.current = null;
    safeDestroy(geometryRef.current);
    geometryRef.current = null;
    geomStateRef.current.lastStart = -1; // Reset để force rebuild nếu có vẽ lại
  };

  const updateData = (): void => {
    const candleData = candleDataRef.current;
    if (!candleData) throwAppError("NOT_INITIALIZED", "candleData is not initialized");

    const size = candleData.getSize();
    const binOhlcs = candleData.getBinRange(0, size);

    if (!binOhlcs) {
      dataStateRef.current.count = 0;
      return;
    }

    const tOffset = viewportRef.current?.getTimestampToPixelWeights()?.offset ?? 0;
    const pOffset = viewportRef.current?.getPriceToPixelWeights()?.offset ?? 0;

    const neededSize = size * FLOATS_PER_OHLC;
    // Tối ưu: Cấp phát dư 2000 nến để không phải reallocate liên tục khi data nhồi vào
    if (dataStateRef.current.capacity < neededSize) {
      const newCapacity = neededSize + 2000 * FLOATS_PER_OHLC;
      dataStateRef.current.flatOhlcs = new Float32Array(newCapacity);
      dataStateRef.current.capacity = newCapacity;
    }

    const flat = dataStateRef.current.flatOhlcs;
    for (let i = 0; i < size; i += 1) {
      const base = i * FLOATS_PER_OHLC;
      flat[base + 0] = binOhlcs.t[i] - tOffset;
      flat[base + 1] = binOhlcs.o[i] - pOffset;
      flat[base + 2] = binOhlcs.h[i] - pOffset;
      flat[base + 3] = binOhlcs.l[i] - pOffset;
      flat[base + 4] = binOhlcs.c[i] - pOffset;
    }

    dataStateRef.current.count = size;
    geomStateRef.current.lastStart = -1; // Đánh dấu dirty
  };

  const draw = async (): Promise<void> => {
    const app = appRef.current;
    const viewport = viewportRef.current;
    if (!app || !viewport) return;

    const screen = getScreenSize(app);
    viewport.getTransformedView();

    const tWeights = viewport.getTimestampToPixelWeights();
    const pWeights = viewport.getPriceToPixelWeights();
    const dState = dataStateRef.current;

    if (dState.count <= 0) {
      cleanupMeshOnly();
      return;
    }

    // 1. Xử lý nến cuối trực tiếp trên mảng flatOhlcs hiện tại
    const lastOhlc = candleDataRef.current?.getLast();
    if (lastOhlc) {
      const lastIndex = dState.count - 1;
      const lastT = dState.flatOhlcs[lastIndex * FLOATS_PER_OHLC] + tWeights.offset;

      if (lastOhlc.t === lastT) {
        // Ghi đè in-place, KHÔNG tạo Float32Array mới
        const base = lastIndex * FLOATS_PER_OHLC;
        dState.flatOhlcs[base + 1] = lastOhlc.o - pWeights.offset;
        dState.flatOhlcs[base + 2] = lastOhlc.h - pWeights.offset;
        dState.flatOhlcs[base + 3] = lastOhlc.l - pWeights.offset;
        dState.flatOhlcs[base + 4] = lastOhlc.c - pWeights.offset;
      } else if (lastOhlc.t > lastT) {
        // Thêm nến mới
        if ((dState.count + 1) * FLOATS_PER_OHLC > dState.capacity) {
          const newCap = dState.capacity + 2000 * FLOATS_PER_OHLC;
          const newArr = new Float32Array(newCap);
          newArr.set(dState.flatOhlcs);
          dState.flatOhlcs = newArr;
          dState.capacity = newCap;
        }
        const base = dState.count * FLOATS_PER_OHLC;
        dState.flatOhlcs[base + 0] = lastOhlc.t - tWeights.offset;
        dState.flatOhlcs[base + 1] = lastOhlc.o - pWeights.offset;
        dState.flatOhlcs[base + 2] = lastOhlc.h - pWeights.offset;
        dState.flatOhlcs[base + 3] = lastOhlc.l - pWeights.offset;
        dState.flatOhlcs[base + 4] = lastOhlc.c - pWeights.offset;
        dState.count++;
      }
    }

    // 2. Tính toán vùng nhìn thấy
    let candleWidth = 1;
    if (dState.count >= 2) {
      const x0 = toPixelFlatTimestamp(viewport, dState.flatOhlcs[0], tWeights.offset);
      const x1 = toPixelFlatTimestamp(viewport, dState.flatOhlcs[FLOATS_PER_OHLC], tWeights.offset);
      candleWidth = Math.max(1, Math.abs(x1 - x0) - CONFIG.CANDLE_LAYER.CANDLE_SPACING);
    }

    const visible = findVisibleRange(viewport, dState.flatOhlcs, dState.count, tWeights.offset, candleWidth, screen.width);
    const visibleCount = visible.endExclusive - visible.start;

    if (visibleCount <= 0) {
      cleanupMeshOnly();
      return;
    }

    // 3. Quản lý Geometry Buffers
    const gState = geomStateRef.current;
    let needsFullRefill = false;
    let needsMeshRebuild = false;

    // Expand buffer nếu số nến hiển thị vượt quá capacity của geometry arrays
    if (visibleCount > gState.capacity) {
      const newCap = visibleCount + 500; // Dư ra 500 nến để pan/zoom không bị giật
      gState.corners = new Float32Array(newCap * FLOATS_PER_CANDLE_CORNERS);
      gState.timestamps = new Float32Array(newCap * VERTICES_PER_CANDLE);
      gState.opens = new Float32Array(newCap * VERTICES_PER_CANDLE);
      gState.highs = new Float32Array(newCap * VERTICES_PER_CANDLE);
      gState.lows = new Float32Array(newCap * VERTICES_PER_CANDLE);
      gState.closes = new Float32Array(newCap * VERTICES_PER_CANDLE);
      gState.capacity = newCap;
      needsFullRefill = true;
      needsMeshRebuild = true;
    }

    // Nếu vùng nhìn đổi, ta phải fill lại toàn bộ dữ liệu visible
    if (visible.start !== gState.lastStart || visible.endExclusive !== gState.lastEnd) {
      needsFullRefill = true;
    }

    const prevVisibleCount = gState.lastEnd - gState.lastStart;
    if (visibleCount !== prevVisibleCount) {
      needsMeshRebuild = true;
    }

    // THỰC THI REFILL HOẶC PARTIAL UPDATE
    if (needsFullRefill) {
      for (let i = 0; i < visibleCount; i++) {
        copyCandleToGeometryBuffers(dState.flatOhlcs, visible.start + i, gState, i);
      }
      gState.lastStart = visible.start;
      gState.lastEnd = visible.endExclusive;
    } else {
      // PARTIAL UPDATE: Vùng nhìn không đổi, chỉ có nến cuối thay đổi!
      // Tiết kiệm tối đa CPU/RAM
      const lastVisibleIndex = visible.endExclusive - 1;
      copyCandleToGeometryBuffers(dState.flatOhlcs, lastVisibleIndex, gState, visibleCount - 1);
    }

    // 4. Update Geometry Object
    buildOrUpdatePipeline(app, candleWidth, { 
      timestampShaderWeights: { offset: 0, multiplication: tWeights.multiplication, addition: tWeights.addition },
      priceShaderWeights: { offset: 0, multiplication: pWeights.multiplication, addition: pWeights.addition }
    });

    if (!geometryRef.current || needsMeshRebuild) {
      // Nếu số lượng nến khác, phải rebuild Geometry object để mapping đúng kích thước subarray
      if (geometryRef.current) safeDestroy(geometryRef.current);
      
      const geometry = new Geometry();
      geometry.addAttribute("aPosition", { buffer: gState.corners.subarray(0, visibleCount * FLOATS_PER_CANDLE_CORNERS), size: 2 });
      geometry.addAttribute("aTimestamp", { buffer: gState.timestamps.subarray(0, visibleCount * VERTICES_PER_CANDLE), size: 1 });
      geometry.addAttribute("aOpen", { buffer: gState.opens.subarray(0, visibleCount * VERTICES_PER_CANDLE), size: 1 });
      geometry.addAttribute("aHigh", { buffer: gState.highs.subarray(0, visibleCount * VERTICES_PER_CANDLE), size: 1 });
      geometry.addAttribute("aLow", { buffer: gState.lows.subarray(0, visibleCount * VERTICES_PER_CANDLE), size: 1 });
      geometry.addAttribute("aClose", { buffer: gState.closes.subarray(0, visibleCount * VERTICES_PER_CANDLE), size: 1 });
      
      geometryRef.current = geometry;
      
      if (meshRef.current) {
        layerRef.current?.removeChildren();
        safeDestroy(meshRef.current);
      }
      meshRef.current = new Mesh({ geometry, shader: shaderRef.current } as any) as any;
      layerRef.current?.addChild(meshRef.current as any);
      
    } else {
      // FIX CỰC KỲ QUAN TRỌNG: 
      // Nếu viewport không đổi và không có nến mới, chỉ push data đã modify lên GPU 
      // mà không đụng chạm đến cấp phát bộ nhớ.
      const buffers = geometryRef.current.buffers;
      if (buffers) {
        buffers.forEach((b: any) => b.update?.());
      }
    }
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
  };


  // ... (Paste lại init, setStyles, cleanup cũ)

  const apiRef = useRef<CandleLayer | null>(null);
  if (!apiRef.current) {
    apiRef.current = { init, updateData, setStyles, draw, cleanup };
  }

  return apiRef.current;
}