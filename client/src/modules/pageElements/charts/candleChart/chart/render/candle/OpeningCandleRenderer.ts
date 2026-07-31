import { Container, Geometry, Mesh, Shader } from "pixi.js";
import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { Candle } from "../../../state/source/candle/CandleData";

//======================================================================================================
// CONSTANT & HELPERS
//======================================================================================================
const CANDLE_VERTEX_CORNERS: Float32Array = new Float32Array([
  -1, -1,
   1, -1,
   1,  1,
  -1, -1,
   1,  1,
  -1,  1,
]);
const VERTICES_PER_CANDLE = 6;

function rgbaToVec3(rgba: number[]): [number, number, number] {
  return [
    Math.max(0, Math.min(255, rgba[0])) / 255,
    Math.max(0, Math.min(255, rgba[1])) / 255,
    Math.max(0, Math.min(255, rgba[2])) / 255,
  ];
}

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class OpeningCandleRenderer {
  private state: StateData | null = null;
  private chart: ChartController | null = null;

  private container: Container;
  private mesh: Mesh | null = null;
  private geometry: Geometry | null = null;
  private shader: Shader;

  // Static allocation for exactly 1 candle (Choice 3A)
  private corners = new Float32Array(12);
  private centers = new Float32Array(6);
  private opens = new Float32Array(6);
  private highs = new Float32Array(6);
  private lows = new Float32Array(6);
  private closes = new Float32Array(6);

  constructor() {
    this.container = new Container();
    this.shader = this.buildShader();
    this.initCornerBuffer();
  }

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;

    this.updateStyle();
    this.updateData();
    this.updateViewport();
  }

  public destroy(): void {
    if (this.mesh) {
      this.mesh.destroy();
      this.mesh = null;
    }
    if (this.geometry) {
      this.geometry.destroy();
      this.geometry = null;
    }
    this.container.destroy({ children: true });

    this.state = null;
    this.chart = null;
  }

  public addToContainer(parentContainer: any): void {
    if (this.container && parentContainer) {
      parentContainer.addChild(this.container);
    }
  }

  public updateStyle(): void {
    if (!this.state) return;
    const configStyle = this.state.config.get()?.style?.candle;
    if (!configStyle) return;

    const shaderAny = this.shader as any;
    const uniforms = shaderAny.resources?.uCandleUniforms?.uniforms;

    if (uniforms) {
      uniforms.uUpBodyColor = rgbaToVec3(configStyle.bull?.background || [50, 255, 50, 255]);
      uniforms.uUpOutlineColor = rgbaToVec3(configStyle.bull?.border || [50, 255, 50, 255]);
      uniforms.uDownBodyColor = rgbaToVec3(configStyle.bear?.background || [255, 50, 50, 255]);
      uniforms.uDownOutlineColor = rgbaToVec3(configStyle.bear?.border || [255, 50, 50, 255]);
      uniforms.uOutlineThickness = 2.0;
    }

    this.render();
  }

  public updateViewport(): void {
    if (!this.state || !this.chart) return;

    const view = this.state.config.get()?.viewport;
    const transform = this.state.viewport.getTransform();
    const canvas = (this.chart as any).event?.getCanvasSize();

    if (!view || !canvas || canvas.w <= 0 || canvas.h <= 0) return;

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;

    if (deltaTs === 0 || deltaPrice === 0) return;

    // Direct ViewportTransform projection matrix
    const Mx = 1 / transform.scaleX;
    const Ax = ((view.fromTs * (1 - transform.scaleX) - transform.offsetX) / (deltaTs * transform.scaleX)) * canvas.w;

    const My = 1 / transform.scaleY;
    const Ay = canvas.h * (1 - My) - ((view.fromPrice * (1 - transform.scaleY) - transform.offsetY) / (deltaPrice * transform.scaleY)) * canvas.h;

    const shaderAny = this.shader as any;
    const uniforms = shaderAny.resources?.uCandleUniforms?.uniforms;
    if (uniforms) {
      uniforms.uPixelWeights = [Mx, Ax, My, Ay];
    }

    this.render();
  }

  public updateData(): void {
    if (!this.state || !this.chart) return;

    const openingCandle: Candle | null = this.state.source.candle.getOpening();

    // Choice 1B: If null, set attribute buffers to 0 length
    if (!openingCandle) {
      this.clearGeometry();
      return;
    }

    const view = this.state.config.get()?.viewport;
    const canvas = (this.chart as any).event?.getCanvasSize();

    if (!view || !canvas || canvas.w <= 0 || canvas.h <= 0) {
      this.clearGeometry();
      return;
    }

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;

    if (deltaTs === 0 || deltaPrice === 0) {
      this.clearGeometry();
      return;
    }

    // 1. Convert opening candle (Time/Price) -> Pixel Coordinates
    const baseX = ((openingCandle.t - view.fromTs) / deltaTs) * canvas.w;
    const openY = canvas.h - ((openingCandle.o - view.fromPrice) / deltaPrice) * canvas.h;
    const highY = canvas.h - ((openingCandle.h - view.fromPrice) / deltaPrice) * canvas.h;
    const lowY = canvas.h - ((openingCandle.l - view.fromPrice) / deltaPrice) * canvas.h;
    const closeY = canvas.h - ((openingCandle.c - view.fromPrice) / deltaPrice) * canvas.h;

    for (let v = 0; v < VERTICES_PER_CANDLE; v++) {
      this.centers[v] = baseX;
      this.opens[v] = openY;
      this.highs[v] = highY;
      this.lows[v] = lowY;
      this.closes[v] = closeY;
    }

    // 2. Dynamic candle width sampling from last closed candle to opening candle (Choice 2A)
    let candleWidth = 5.0; // Fallback
    const closedCandles = this.state.source.candle.getAllClosed();
    if (closedCandles && closedCandles.t.length > 0) {
      const lastClosedTs = closedCandles.t[closedCandles.t.length - 1];
      const xLastClosed = ((lastClosedTs - view.fromTs) / deltaTs) * canvas.w;
      const xOpening = baseX;
      candleWidth = Math.max(1, Math.abs(xOpening - xLastClosed) - 1);
    }

    const shaderAny = this.shader as any;
    const uniforms = shaderAny.resources?.uCandleUniforms?.uniforms;
    if (uniforms) {
      uniforms.uCandleWidth = candleWidth;
    }

    // 3. Build or update Mesh/Geometry with active candle data
    this.rebuildOrUpdateGeometry(1);
    this.render();
  }

  public render(): void {
    // PixiJS pipeline render trigger cycle
  }

  //======================================================================================================
  // PRIVATE HELPER METHODS
  //======================================================================================================

  private initCornerBuffer(): void {
    for (let v = 0; v < VERTICES_PER_CANDLE; v++) {
      this.corners[v * 2] = CANDLE_VERTEX_CORNERS[v * 2];
      this.corners[v * 2 + 1] = CANDLE_VERTEX_CORNERS[v * 2 + 1];
    }
  }

  private clearGeometry(): void {
    if (this.geometry) {
      this.rebuildOrUpdateGeometry(0);
    }
  }

  private rebuildOrUpdateGeometry(count: number): void {
    if (!this.geometry) {
      this.geometry = new Geometry();
      this.geometry.addAttribute("aCorner", { buffer: this.corners.subarray(0, count * 12), size: 2 });
      this.geometry.addAttribute("aCenterX", { buffer: this.centers.subarray(0, count * 6), size: 1 });
      this.geometry.addAttribute("aOpenY", { buffer: this.opens.subarray(0, count * 6), size: 1 });
      this.geometry.addAttribute("aHighY", { buffer: this.highs.subarray(0, count * 6), size: 1 });
      this.geometry.addAttribute("aLowY", { buffer: this.lows.subarray(0, count * 6), size: 1 });
      this.geometry.addAttribute("aCloseY", { buffer: this.closes.subarray(0, count * 6), size: 1 });

      if (this.mesh) {
        this.container.removeChild(this.mesh);
        this.mesh.destroy();
      }

      this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader } as any);
      this.container.addChild(this.mesh);
    } else {
      // Re-link attribute dynamic subarray sizes (0 for null state, 1 for active)
      const g = this.geometry as any;
      if (g.attributes?.aCorner) g.attributes.aCorner.buffer.data = this.corners.subarray(0, count * 12);
      if (g.attributes?.aCenterX) g.attributes.aCenterX.buffer.data = this.centers.subarray(0, count * 6);
      if (g.attributes?.aOpenY) g.attributes.aOpenY.buffer.data = this.opens.subarray(0, count * 6);
      if (g.attributes?.aHighY) g.attributes.aHighY.buffer.data = this.highs.subarray(0, count * 6);
      if (g.attributes?.aLowY) g.attributes.aLowY.buffer.data = this.lows.subarray(0, count * 6);
      if (g.attributes?.aCloseY) g.attributes.aCloseY.buffer.data = this.closes.subarray(0, count * 6);

      const buffers = this.geometry.buffers;
      if (buffers) {
        buffers.forEach((b: any) => b.update?.());
      }
    }
  }

  private buildShader(): Shader {
    const uCandleUniforms = {
      uProjectionMatrix: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), type: "mat3x3<f32>" },
      uPixelWeights: { value: new Float32Array([1, 0, 1, 0]), type: "vec4<f32>" },
      uOutlineThickness: { value: 2.0, type: "f32" },
      uCandleWidth: { value: 5.0, type: "f32" },
      uUpOutlineColor: { value: [0.2, 1.0, 0.2], type: "vec3<f32>" },
      uUpBodyColor: { value: [0.2, 1.0, 0.2], type: "vec3<f32>" },
      uDownOutlineColor: { value: [1.0, 0.2, 0.2], type: "vec3<f32>" },
      uDownBodyColor: { value: [1.0, 0.2, 0.2], type: "vec3<f32>" },
    };

    const vertexSrc = `
precision mediump float;

attribute vec2 aCorner;
attribute float aCenterX;
attribute float aOpenY;
attribute float aHighY;
attribute float aLowY;
attribute float aCloseY;

uniform mat3 uProjectionMatrix;
uniform vec4 uPixelWeights;
uniform float uCandleWidth;

varying vec2 vPixelPos;
varying float vCenterX;
varying float vOpenY;
varying float vHighY;
varying float vLowY;
varying float vCloseY;

void main(void) {
  float Mx = uPixelWeights.x;
  float Ax = uPixelWeights.y;
  float My = uPixelWeights.z;
  float Ay = uPixelWeights.w;

  float x = aCenterX * Mx + Ax;
  float openY = aOpenY * My + Ay;
  float highY = aHighY * My + Ay;
  float lowY = aLowY * My + Ay;
  float closeY = aCloseY * My + Ay;

  float halfWidth = (uCandleWidth * Mx) * 0.5;

  float minHeight = 1.0;
  if (abs(highY - lowY) < minHeight) {
    highY = highY + minHeight;
  }

  vec2 pos = vec2(
    x + aCorner.x * halfWidth,
    mix(highY, lowY, (aCorner.y + 1.0) * 0.5)
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
uniform vec4 uPixelWeights;
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
  
  float Mx = uPixelWeights.x;
  float halfWidth = (uCandleWidth * Mx) * 0.5;
  float halfOutline = uOutlineThickness * 0.5;

  float rawBodyTop = min(vOpenY, vCloseY);
  float rawBodyBottom = max(vOpenY, vCloseY);

  float bodyHeight = max(abs(vOpenY - vCloseY), uOutlineThickness);

  float bodyTop;
  float bodyBottom;

  if (abs(vOpenY - vCloseY) < 0.0001) {
    bodyTop = rawBodyTop;
    bodyBottom = rawBodyTop + bodyHeight;
  } else {
    float bodyCenter = (rawBodyTop + rawBodyBottom) * 0.5;
    bodyTop = bodyCenter - bodyHeight * 0.5;
    bodyBottom = bodyCenter + bodyHeight * 0.5;
  }

  float dx = abs(vPixelPos.x - vCenterX);
  
  bool canDrawOutline = (uCandleWidth * Mx) >= uOutlineThickness && bodyHeight >= uOutlineThickness;
  bool canDrawBodyInner = (uCandleWidth * Mx) > (uOutlineThickness * 2.0) && bodyHeight > (uOutlineThickness * 2.0);

  bool inWick = dx <= halfOutline && vPixelPos.y >= vHighY && vPixelPos.y <= vLowY;
  bool inBodyOuter = canDrawOutline && dx <= halfWidth && vPixelPos.y >= bodyTop && vPixelPos.y <= bodyBottom;
  bool inBodyInner = canDrawBodyInner 
    && dx <= (halfWidth - uOutlineThickness) 
    && vPixelPos.y >= (bodyTop + uOutlineThickness) 
    && vPixelPos.y <= (bodyBottom - uOutlineThickness);

  vec4 color = vec4(0.0);

  if (inWick || inBodyOuter) {
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
}