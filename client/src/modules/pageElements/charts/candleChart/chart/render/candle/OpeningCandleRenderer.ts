import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import { CANDLE_SHADER } from "./candleRenderShader";

//======================================================================================================
// CONSTANTS & HELPERS
//======================================================================================================
// Unit quad corners (4 vertices using TRIANGLE_STRIP covering [0,0] to [1,1])
const QUAD_CORNERS = new Float32Array([
  0.0, 0.0,
  1.0, 0.0,
  0.0, 1.0,
  1.0, 1.0,
]);

// Single instance layout: [openTimePx, closeTimePx, openY, highY, lowY, closeY]
const FLOATS_PER_CANDLE = 6;

function rgbaToVec3(rgba: number[]): [number, number, number] {
  return [
    Math.max(0, Math.min(255, rgba[0] ?? 255)) / 255,
    Math.max(0, Math.min(255, rgba[1] ?? 255)) / 255,
    Math.max(0, Math.min(255, rgba[2] ?? 255)) / 255,
  ];
}

/**
 * Calculates the next close time (in unix milliseconds) based on openTime and timeframe.
 * Timeframe format: ${number}${prefix} (e.g. '15M', '1MN', '1Y', '15S')
 * Prefixes supported: ['S', 'M', 'H', 'D', 'W', 'MN', 'Y']
 */
function calculateCloseTime(openTimeMs: number, timeframeStr: string): number | null {
  if (!timeframeStr || typeof timeframeStr !== "string") return null;

  const match = timeframeStr.trim().match(/^(\d+)(S|M|H|D|W|MN|Y)$/i);
  if (!match) return null;

  const count = parseInt(match[1], 10);
  const prefix = match[2].toUpperCase();

  if (isNaN(count) || count <= 0) return null;

  // 1. Fixed duration units in milliseconds
  const MS_MAP: Record<string, number> = {
    S: 1000,
    M: 60 * 1000,
    H: 60 * 60 * 1000,
    D: 24 * 60 * 60 * 1000,
  };

  if (prefix in MS_MAP) {
    const intervalMs = count * MS_MAP[prefix];
    // Align/modulo to unix ms boundaries
    return (Math.floor(openTimeMs / intervalMs) + 1) * intervalMs;
  }

  // 2. Calendar-dependent units (W, MN, Y) using Date objects
  const date = new Date(openTimeMs);
  if (isNaN(date.getTime())) return null;

  switch (prefix) {
    case "W": {
      // Add 'count' weeks
      date.setUTCDate(date.getUTCDate() + count * 7);
      return date.getTime();
    }
    case "MN": {
      // Add 'count' months
      date.setUTCMonth(date.getUTCMonth() + count);
      return date.getTime();
    }
    case "Y": {
      // Add 'count' years
      date.setUTCFullYear(date.getUTCFullYear() + count);
      return date.getTime();
    }
    default:
      return null;
  }
}

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class OpeningCandleRenderer {
  private state: StateData | null = null;
  private chart: ChartController | null = null;
  private gl: WebGL2RenderingContext | null = null;

  // WebGL Pipeline Objects
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  // Reusable projection matrix buffer
  private projectionMatrix: Float32Array = new Float32Array(9);

  // Fixed GPU Buffers (Single candle instance)
  private buffers: {
    quadCorners: WebGLBuffer | null;
    candleInstance: WebGLBuffer | null;
  } = {
    quadCorners: null,
    candleInstance: null,
  };

  // Uniform & Attribute Locations
  private locations = {
    attributes: {
      aCorner: -1,
      aCandleTimes: -1,  // vec2: [openTimePx, closeTimePx]
      aCandlePrices: -1, // vec4: [openY, highY, lowY, closeY]
    },
    uniforms: {
      uProjectionMatrix: null as WebGLUniformLocation | null,
      uTransform: null as WebGLUniformLocation | null,
      uPadding: null as WebGLUniformLocation | null,
      uUpOutlineColor: null as WebGLUniformLocation | null,
      uUpBodyColor: null as WebGLUniformLocation | null,
      uDownOutlineColor: null as WebGLUniformLocation | null,
      uDownBodyColor: null as WebGLUniformLocation | null,
    },
  };

  // Single fixed instance buffer
  private instanceData = new Float32Array(FLOATS_PER_CANDLE);
  private hasValidCandle = false;

  // Cached Style Settings
  private style = {
    upBodyColor: new Float32Array([0.2, 1.0, 0.2]),
    upOutlineColor: new Float32Array([0.2, 1.0, 0.2]),
    downBodyColor: new Float32Array([1.0, 0.2, 0.2]),
    downOutlineColor: new Float32Array([1.0, 0.2, 0.2]),
    padding: 2.0,
  };

  private readonly transformListenerId = `OpeningCandleRenderer_${Math.random().toString(36).substring(2, 9)}`;

  public setGl(gl: WebGL2RenderingContext): void {
    if (this.gl === gl) return;

    this.cleanupGlResources();
    this.gl = gl;

    if (this.gl) {
      this.initGlPipeline();
      this.updateStyle();
      this.updateData();
      this.updateTransform();
    }
  }

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;

    this.state.viewport.addOnViewportTransformDataChange(
      this.transformListenerId,
      () => {
        this.updateTransform();
      }
    );
  }

  public destroy(): void {
    if (this.state) {
      this.state.viewport.removeOnViewportTransformDataChange(this.transformListenerId);
    }

    this.cleanupGlResources();
    this.gl = null;
    this.state = null;
    this.chart = null;
  }

  public updateStyle(): void {
    if (!this.state) return;
    const configStyle = this.state.config.get()?.style?.candle;
    if (!configStyle) return;

    this.style.upBodyColor = new Float32Array(rgbaToVec3(configStyle.bull?.background || [50, 255, 50, 255]));
    this.style.upOutlineColor = new Float32Array(rgbaToVec3(configStyle.bull?.border || [50, 255, 50, 255]));
    this.style.downBodyColor = new Float32Array(rgbaToVec3(configStyle.bear?.background || [255, 50, 50, 255]));
    this.style.downOutlineColor = new Float32Array(rgbaToVec3(configStyle.bear?.border || [255, 50, 50, 255]));
    this.style.padding = 2.0;
  }

  public updateData(): void {
    if (!this.state || !this.gl) return;

    const openingCandle = this.state.source.candle.getOpening();
    const timeframe = this.state.config.get()?.timeframe;
    const view = this.state.config.get()?.viewport;
    const canvas = (this.chart as any)?.event?.getCanvasSize();

    // Edge case check: missing candle data, timeframe, viewport, or invalid canvas size -> clear buffer flag
    if (
      !openingCandle ||
      openingCandle.t == null ||
      openingCandle.o == null ||
      openingCandle.h == null ||
      openingCandle.l == null ||
      openingCandle.c == null ||
      !timeframe ||
      !view ||
      !canvas ||
      canvas.w <= 0 ||
      canvas.h <= 0
    ) {
      this.hasValidCandle = false;
      return;
    }

    const openTs = openingCandle.t;
    const closeTs = calculateCloseTime(openTs, timeframe);

    if (closeTs == null) {
      this.hasValidCandle = false;
      return;
    }

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;

    if (deltaTs === 0 || deltaPrice === 0) {
      this.hasValidCandle = false;
      return;
    }

    const tToPx = canvas.w / deltaTs;
    const pToPx = canvas.h / deltaPrice;

    // Time conversion to pixels
    const openTimePx = (openTs - view.fromTs) * tToPx;
    const closeTimePx = (closeTs - view.fromTs) * tToPx;

    // Price conversion to pixels (higher price -> smaller Y pixel)
    const openY = canvas.h - (openingCandle.o - view.fromPrice) * pToPx;
    const highY = canvas.h - (openingCandle.h - view.fromPrice) * pToPx;
    const lowY = canvas.h - (openingCandle.l - view.fromPrice) * pToPx;
    const closeY = canvas.h - (openingCandle.c - view.fromPrice) * pToPx;

    this.instanceData[0] = openTimePx;
    this.instanceData[1] = closeTimePx;
    this.instanceData[2] = openY;
    this.instanceData[3] = highY;
    this.instanceData[4] = lowY;
    this.instanceData[5] = closeY;

    this.hasValidCandle = true;

    // Upload single instance data to fixed GPU buffer
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.candleInstance);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  public updateTransform(): void {
    // Pipeline handles viewport transforms directly via GPU uniforms
  }

  public render(): void {
    if (!this.gl || !this.program || !this.state || !this.chart) return;
    if (!this.hasValidCandle) return;

    const transform = this.state.viewport.getTransform();
    const canvas = (this.chart as any).event?.getCanvasSize();

    if (!canvas || canvas.w <= 0 || canvas.h <= 0) return;

    const gl = this.gl;

    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.floor(canvas.w * dpr);
    const pixelHeight = Math.floor(canvas.h * dpr);

    if (gl.canvas.width !== pixelWidth || gl.canvas.height !== pixelHeight) {
      gl.canvas.width = pixelWidth;
      gl.canvas.height = pixelHeight;
    }

    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const scaleX = transform.scaleX || 1;
    const scaleY = transform.scaleY || 1;
    const offsetX = transform.offsetX || 0;
    const offsetY = transform.offsetY || 0;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    const uLocs = this.locations.uniforms;

    // 2D Orthographic Projection Matrix
    this.projectionMatrix[0] = 2 / canvas.w;
    this.projectionMatrix[1] = 0;
    this.projectionMatrix[2] = 0;
    this.projectionMatrix[3] = 0;
    this.projectionMatrix[4] = -2 / canvas.h;
    this.projectionMatrix[5] = 0;
    this.projectionMatrix[6] = -1;
    this.projectionMatrix[7] = 1;
    this.projectionMatrix[8] = 1;

    gl.uniformMatrix3fv(uLocs.uProjectionMatrix, false, this.projectionMatrix);
    gl.uniform4f(uLocs.uTransform, scaleX, scaleY, offsetX, offsetY);
    gl.uniform1f(uLocs.uPadding, this.style.padding);
    gl.uniform3fv(uLocs.uUpBodyColor, this.style.upBodyColor);
    gl.uniform3fv(uLocs.uUpOutlineColor, this.style.upOutlineColor);
    gl.uniform3fv(uLocs.uDownBodyColor, this.style.downBodyColor);
    gl.uniform3fv(uLocs.uDownOutlineColor, this.style.downOutlineColor);

    // Draw 1 candle instance
    gl.drawArraysInstanced(
      gl.TRIANGLE_STRIP,
      0,
      4,
      1
    );

    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  //======================================================================================================
  // PRIVATE HELPERS
  //======================================================================================================
  private initGlPipeline(): void {
    const gl = this.gl;
    if (!gl) return;

    this.program = this.createProgram(gl, CANDLE_SHADER.vertex, CANDLE_SHADER.fragment);
    if (!this.program) return;

    // Attributes
    this.locations.attributes.aCorner = gl.getAttribLocation(this.program, "aCorner");
    this.locations.attributes.aCandleTimes = gl.getAttribLocation(this.program, "aCandleTimes");
    this.locations.attributes.aCandlePrices = gl.getAttribLocation(this.program, "aCandlePrices");

    // Uniforms
    this.locations.uniforms.uProjectionMatrix = gl.getUniformLocation(this.program, "uProjectionMatrix");
    this.locations.uniforms.uTransform = gl.getUniformLocation(this.program, "uTransform");
    this.locations.uniforms.uPadding = gl.getUniformLocation(this.program, "uPadding");
    this.locations.uniforms.uUpOutlineColor = gl.getUniformLocation(this.program, "uUpOutlineColor");
    this.locations.uniforms.uUpBodyColor = gl.getUniformLocation(this.program, "uUpBodyColor");
    this.locations.uniforms.uDownOutlineColor = gl.getUniformLocation(this.program, "uDownOutlineColor");
    this.locations.uniforms.uDownBodyColor = gl.getUniformLocation(this.program, "uDownBodyColor");

    this.vao = gl.createVertexArray();
    this.buffers.quadCorners = gl.createBuffer();
    this.buffers.candleInstance = gl.createBuffer();

    gl.bindVertexArray(this.vao);

    // Quad Corners Buffer (Per Vertex)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quadCorners);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.locations.attributes.aCorner);
    gl.vertexAttribPointer(this.locations.attributes.aCorner, 2, gl.FLOAT, false, 0, 0);

    // Fixed Candle Instance Buffer (1 Candle, Fixed Byte Size)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.candleInstance);
    gl.bufferData(gl.ARRAY_BUFFER, FLOATS_PER_CANDLE * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_CANDLE * Float32Array.BYTES_PER_ELEMENT;

    // aCandleTimes = vec2 [openTimePx, closeTimePx]
    gl.enableVertexAttribArray(this.locations.attributes.aCandleTimes);
    gl.vertexAttribPointer(this.locations.attributes.aCandleTimes, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(this.locations.attributes.aCandleTimes, 1);

    // aCandlePrices = vec4 [openY, highY, lowY, closeY]
    gl.enableVertexAttribArray(this.locations.attributes.aCandlePrices);
    gl.vertexAttribPointer(
      this.locations.attributes.aCandlePrices,
      4,
      gl.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT
    );
    gl.vertexAttribDivisor(this.locations.attributes.aCandlePrices, 1);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private cleanupGlResources(): void {
    if (!this.gl) return;
    const gl = this.gl;

    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    if (this.buffers.quadCorners) {
      gl.deleteBuffer(this.buffers.quadCorners);
      this.buffers.quadCorners = null;
    }

    if (this.buffers.candleInstance) {
      gl.deleteBuffer(this.buffers.candleInstance);
      this.buffers.candleInstance = null;
    }

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
  }

  private createProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
    const vertShader = this.compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fragShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

    if (!vertShader || !fragShader) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("WebGL2 Program Link Error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    return program;
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("WebGL2 Shader Compile Error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }
}