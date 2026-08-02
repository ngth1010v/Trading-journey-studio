import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";

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

// Instance layout: [openTimePx, closeTimePx, openY, highY, lowY, closeY]
const FLOATS_PER_CANDLE = 6;

function rgbaToVec3(rgba: number[]): [number, number, number] {
  return [
    Math.max(0, Math.min(255, rgba[0] ?? 255)) / 255,
    Math.max(0, Math.min(255, rgba[1] ?? 255)) / 255,
    Math.max(0, Math.min(255, rgba[2] ?? 255)) / 255,
  ];
}

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class ClosedCandleRenderer {
  private state: StateData | null = null;
  private chart: ChartController | null = null;
  private gl: WebGL2RenderingContext | null = null;

  // WebGL Pipeline Objects
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  // Reusable projection matrix buffer
  private projectionMatrix: Float32Array = new Float32Array(9);

  // WebGL Buffers
  private buffers: {
    quadCorners: WebGLBuffer | null;
    candleInstances: WebGLBuffer | null;
  } = {
    quadCorners: null,
    candleInstances: null,
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

  // Geometry state
  private geomState = {
    instanceBuffer: new Float32Array(0),
    capacity: 0,
    totalCandlesCount: 0,
  };

  // Cached Style Settings
  private style = {
    upBodyColor: new Float32Array([0.2, 1.0, 0.2]),
    upOutlineColor: new Float32Array([0.2, 1.0, 0.2]),
    downBodyColor: new Float32Array([1.0, 0.2, 0.2]),
    downOutlineColor: new Float32Array([1.0, 0.2, 0.2]),
    padding: 2.0,
  };

  private readonly transformListenerId = `ClosedCandleRenderer_${Math.random().toString(36).substring(2, 9)}`;

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

    const candles = this.state.source.candle.getAllClosed();
    const view = this.state.config.get()?.viewport;
    const canvas = (this.chart as any)?.event?.getCanvasSize();

    if (!candles || !candles.t || candles.t.length === 0 || !view || !canvas || canvas.w <= 0 || canvas.h <= 0) {
      this.geomState.totalCandlesCount = 0;
      return;
    }

    const count = candles.t.length;
    const gState = this.geomState;
    let needsBufferReallocation = false;

    if (count > gState.capacity) {
      const newCap = count + 500;
      gState.instanceBuffer = new Float32Array(newCap * FLOATS_PER_CANDLE);
      gState.capacity = newCap;
      needsBufferReallocation = true;
    }

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;

    if (deltaTs === 0 || deltaPrice === 0) return;

    const tToPx = canvas.w / deltaTs;
    const pToPx = canvas.h / deltaPrice;

    // Retrieve opening candle to determine closeTime of the last closed candle
    const openingCandle = this.state.source.candle.getOpening();

    for (let i = 0; i < count; i++) {
      const openTs = candles.t[i];
      let closeTs: number;

      if (i < count - 1) {
        closeTs = candles.t[i + 1];
      } else {
        if (openingCandle && openingCandle.t != null && openingCandle.t > openTs) {
          closeTs = openingCandle.t;
        } else {
          // Fallback to previous candle duration
          const prevDuration = count >= 2 ? candles.t[count - 1] - candles.t[count - 2] : 60;
          closeTs = openTs + prevDuration;
        }
      }

      // Time conversion to pixels
      const openTimePx = (openTs - view.fromTs) * tToPx;
      const closeTimePx = (closeTs - view.fromTs) * tToPx;

      // Price conversion to pixels (higher price -> smaller Y pixel)
      const openY = canvas.h - (candles.o[i] - view.fromPrice) * pToPx;
      const highY = canvas.h - (candles.h[i] - view.fromPrice) * pToPx;
      const lowY = canvas.h - (candles.l[i] - view.fromPrice) * pToPx;
      const closeY = canvas.h - (candles.c[i] - view.fromPrice) * pToPx;

      const offset = i * FLOATS_PER_CANDLE;
      gState.instanceBuffer[offset]     = openTimePx;
      gState.instanceBuffer[offset + 1] = closeTimePx;
      gState.instanceBuffer[offset + 2] = openY;
      gState.instanceBuffer[offset + 3] = highY;
      gState.instanceBuffer[offset + 4] = lowY;
      gState.instanceBuffer[offset + 5] = closeY;
    }

    gState.totalCandlesCount = count;

    // Upload instance buffer to GPU
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.candleInstances);
    const subArray = gState.instanceBuffer.subarray(0, count * FLOATS_PER_CANDLE);

    if (needsBufferReallocation) {
      gl.bufferData(gl.ARRAY_BUFFER, gState.instanceBuffer.byteLength, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, subArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  public updateTransform(): void {
    // Pipeline handles viewport transforms directly via GPU uniforms
  }

  public render(): void {
    if (!this.gl || !this.program || !this.state || !this.chart) return;

    const totalCandles = this.geomState.totalCandlesCount;
    if (totalCandles <= 0) return;

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

    gl.drawArraysInstanced(
      gl.TRIANGLE_STRIP,
      0,
      4,
      totalCandles
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

    this.program = this.createProgram(gl, VERTEX_SHADER_SRC, FRAGMENT_SHADER_SRC);
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
    this.buffers.candleInstances = gl.createBuffer();

    gl.bindVertexArray(this.vao);

    // Quad Corners Buffer (Per Vertex)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quadCorners);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.locations.attributes.aCorner);
    gl.vertexAttribPointer(this.locations.attributes.aCorner, 2, gl.FLOAT, false, 0, 0);

    // Candle Instance Buffer (Per Instance)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.candleInstances);

    const stride = FLOATS_PER_CANDLE * Float32Array.BYTES_PER_ELEMENT;

    // aCandleTimes = vec2 [openTimePx, closeTimePx]
    gl.enableVertexAttribArray(this.locations.attributes.aCandleTimes);
    gl.vertexAttribPointer(this.locations.attributes.aCandleTimes, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(this.locations.attributes.aCandleTimes, 1);

    // aCandlePrices = vec4 [openY, highY, lowY, closeY]
    gl.enableVertexAttribArray(this.locations.attributes.aCandlePrices);
    gl.vertexAttribPointer(this.locations.attributes.aCandlePrices, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
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

    if (this.buffers.candleInstances) {
      gl.deleteBuffer(this.buffers.candleInstances);
      this.buffers.candleInstances = null;
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

//======================================================================================================
// ESSL 3.00 SHADER SOURCES
//======================================================================================================
const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 aCorner;
in vec2 aCandleTimes;  // [openTimePx, closeTimePx]
in vec4 aCandlePrices; // [openY, highY, lowY, closeY]

uniform mat3 uProjectionMatrix;
uniform vec4 uTransform; // [scaleX, scaleY, offsetX, offsetY]
uniform float uPadding;

out vec2 vPixelPos;
out vec2 vTimes;        // [openTimePx, closeTimePx]
out vec4 vPrices;       // [openY, highY, lowY, closeY]

void main(void) {
  float scaleX = uTransform.x;
  float scaleY = uTransform.y;
  float offsetX = uTransform.z;
  float offsetY = uTransform.w;

  // Transform coordinates into screen pixel space
  float openTimePx  = floor(aCandleTimes.x * scaleX + offsetX) + 0.5;
  float closeTimePx = floor(aCandleTimes.y * scaleX + offsetX) + 0.5;

  float openY  = floor(aCandlePrices.x * scaleY + offsetY) + 0.5;
  float highY  = floor(aCandlePrices.y * scaleY + offsetY) + 0.5;
  float lowY   = floor(aCandlePrices.z * scaleY + offsetY) + 0.5;
  float closeY = floor(aCandlePrices.w * scaleY + offsetY) + 0.5;

  // Calculate quad bounds to cover wick and border lines completely
  float minX = min(openTimePx, openTimePx + uPadding - 1.0);
  float maxX = max(closeTimePx, closeTimePx - uPadding + 1.0);
  
  float minY = min(highY - 1.0, lowY - 1.0);
  float maxY = max(highY + 1.0, lowY + 1.0);

  vec2 pos = vec2(
    mix(minX, maxX, aCorner.x),
    mix(minY, maxY, aCorner.y)
  );

  vPixelPos = pos;
  vTimes = vec2(openTimePx, closeTimePx);
  vPrices = vec4(openY, highY, lowY, closeY);

  vec3 projected = uProjectionMatrix * vec3(pos, 1.0);
  gl_Position = vec4(projected.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

uniform float uPadding;
uniform vec3 uUpOutlineColor;
uniform vec3 uUpBodyColor;
uniform vec3 uDownOutlineColor;
uniform vec3 uDownBodyColor;

in vec2 vPixelPos;
in vec2 vTimes;  // [openTimePx, closeTimePx]
in vec4 vPrices; // [openY, highY, lowY, closeY]

out vec4 fragColor;

void main(void) {
  float openTimePx  = vTimes.x;
  float closeTimePx = vTimes.y;

  float openY  = vPrices.x;
  float highY  = vPrices.y;
  float lowY   = vPrices.z;
  float closeY = vPrices.w;

  // Screen space: higher price = smaller Y
  bool isUp = closeY <= openY;

  vec3 outlineColor = isUp ? uUpOutlineColor : uDownOutlineColor;
  vec3 bodyColor    = isUp ? uUpBodyColor    : uDownBodyColor;

  bool hasWidth = (closeTimePx - openTimePx) > (uPadding * 2.0);

  // 1. Wick Line
  float wickX = (openTimePx + closeTimePx) * 0.5;
  bool inWick =
      abs(vPixelPos.x - wickX) <= 0.5 &&
      vPixelPos.y >= highY &&
      vPixelPos.y <= lowY;

  // 2. Body Rectangle
  float topY    = min(openY, closeY);
  float bottomY = max(openY, closeY);
  float leftX   = openTimePx + uPadding;
  float rightX  = closeTimePx - uPadding;

  bool inBody =
      hasWidth &&
      vPixelPos.x >= leftX &&
      vPixelPos.x <= rightX &&
      vPixelPos.y >= topY &&
      vPixelPos.y <= bottomY;

  // 3. Border Lines (around BODY only)
  float bLeftX  = openTimePx + uPadding - 0.5;
  float bRightX = closeTimePx - uPadding + 0.5;

  bool inHLine1 =
      hasWidth &&
      vPixelPos.x >= bLeftX &&
      vPixelPos.x <= bRightX &&
      abs(vPixelPos.y - (topY - 0.5)) <= 0.5;

  bool inHLine2 =
      hasWidth &&
      vPixelPos.x >= bLeftX &&
      vPixelPos.x <= bRightX &&
      abs(vPixelPos.y - (bottomY + 0.5)) <= 0.5;

  bool inVLine1 =
      hasWidth &&
      abs(vPixelPos.x - bLeftX) <= 0.5 &&
      vPixelPos.y >= (topY - 1.0) &&
      vPixelPos.y <= (bottomY + 1.0);

  bool inVLine2 =
      hasWidth &&
      abs(vPixelPos.x - bRightX) <= 0.5 &&
      vPixelPos.y >= (topY - 1.0) &&
      vPixelPos.y <= (bottomY + 1.0);

  bool inBorder = inHLine1 || inHLine2 || inVLine1 || inVLine2;

  vec4 color = vec4(0.0);

  if (inBody) {
    color = vec4(bodyColor, 1.0);
  }

  if (inWick || inBorder) {
    color = vec4(outlineColor, 1.0);
  }

  if (color.a <= 0.0) {
    discard;
  }

  fragColor = color;
}
`;