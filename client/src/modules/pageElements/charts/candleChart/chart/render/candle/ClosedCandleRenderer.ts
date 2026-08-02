import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";

//======================================================================================================
// CONSTANTS & HELPERS
//======================================================================================================
// Unit quad corners (4 vertices using TRIANGLE_STRIP: [x, y])
const QUAD_CORNERS = new Float32Array([
  -0.5, -1.0,
   0.5, -1.0,
  -0.5,  1.0,
   0.5,  1.0,
]);

const FLOATS_PER_CANDLE = 5; // [x, openY, highY, lowY, closeY]

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

  // Reusable projection matrix buffer to avoid per-frame GC allocation
  private projectionMatrix: Float32Array = new Float32Array(9);

  // WebGL Buffers
  private buffers: {
    quadCorners: WebGLBuffer | null;
    candleInstances: WebGLBuffer | null;
  } = {
    quadCorners: null,
    candleInstances: null,
  };

  // Uniform Locations
  private locations = {
    attributes: {
      aCorner: -1,
      aCandleData: -1, // vec4: [x, openY, highY, lowY]
      aCloseY: -1,     // float: closeY
    },
    uniforms: {
      uProjectionMatrix: null as WebGLUniformLocation | null,
      uOutlineThickness: null as WebGLUniformLocation | null,
      uCandleWidth: null as WebGLUniformLocation | null,
      uUpOutlineColor: null as WebGLUniformLocation | null,
      uUpBodyColor: null as WebGLUniformLocation | null,
      uDownOutlineColor: null as WebGLUniformLocation | null,
      uDownBodyColor: null as WebGLUniformLocation | null,
      uTransform: null as WebGLUniformLocation | null, // [scaleX, scaleY, offsetX, offsetY]
    },
  };

  // Geometry array pooling & reference caches
  private geomState = {
    instanceBuffer: new Float32Array(0),
    capacity: 0,
    totalCandlesCount: 0,
    timeStepPx: 0,
    pixelXPositions: [] as number[], // Used for fast CPU binary search culling
  };

  // Cached Style Settings
  private style = {
    upBodyColor: new Float32Array([0.2, 1.0, 0.2]),
    upOutlineColor: new Float32Array([0.2, 1.0, 0.2]),
    downBodyColor: new Float32Array([1.0, 0.2, 0.2]),
    downOutlineColor: new Float32Array([1.0, 0.2, 0.2]),
    outlineThickness: 2.0,
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
    }
  }

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;

    // Listen to real-time high-frequency transform changes (pan / zoom)
    this.state.viewport.addOnViewportTransformDataChange(
      this.transformListenerId,
      () => this.render()
    );

    this.updateStyle();
    this.updateData();
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
    this.style.outlineThickness = 2.0;

    this.render();
  }

  public updateData(): void {
    if (!this.state || !this.gl) return;

    const candles = this.state.source.candle.getAllClosed();
    const view = this.state.config.get()?.viewport;
    const canvas = (this.chart as any)?.event?.getCanvasSize();

    if (!candles || !candles.t || candles.t.length === 0 || !view || !canvas || canvas.w <= 0 || canvas.h <= 0) {
      this.geomState.totalCandlesCount = 0;
      this.render();
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

    // Convert raw time/price directly to base pixel coordinate reference space
    const tToPx = canvas.w / deltaTs;
    const pToPx = canvas.h / deltaPrice;

    gState.pixelXPositions = new Array(count);

    for (let i = 0; i < count; i++) {
      const x = (candles.t[i] - view.fromTs) * tToPx;
      const openY = canvas.h - (candles.o[i] - view.fromPrice) * pToPx;
      const highY = canvas.h - (candles.h[i] - view.fromPrice) * pToPx;
      const lowY = canvas.h - (candles.l[i] - view.fromPrice) * pToPx;
      const closeY = canvas.h - (candles.c[i] - view.fromPrice) * pToPx;

      const offset = i * FLOATS_PER_CANDLE;
      gState.instanceBuffer[offset] = x;
      gState.instanceBuffer[offset + 1] = openY;
      gState.instanceBuffer[offset + 2] = highY;
      gState.instanceBuffer[offset + 3] = lowY;
      gState.instanceBuffer[offset + 4] = closeY;

      gState.pixelXPositions[i] = x;
    }

    gState.totalCandlesCount = count;
    gState.timeStepPx = count >= 2 ? Math.abs(gState.pixelXPositions[1] - gState.pixelXPositions[0]) : 5;

    // Upload instance buffer to GPU
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.candleInstances);
    const subArray = gState.instanceBuffer.subarray(0, count * FLOATS_PER_CANDLE);

    if (needsBufferReallocation) {
      gl.bufferData(gl.ARRAY_BUFFER, gState.instanceBuffer.byteLength, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, subArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.render();
  }

  public updateViewport(): void {
    this.render();
  }

  public render(): void {
    if (!this.gl || !this.program || !this.state || !this.chart) return;

    const totalCandles = this.geomState.totalCandlesCount;
    if (totalCandles <= 0) return;

    const transform = this.state.viewport.getTransform();
    const canvas = (this.chart as any).event?.getCanvasSize();

    if (!canvas || canvas.w <= 0 || canvas.h <= 0) return;

    const gl = this.gl;

    // Viewport & Pixel Density Setup
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

    // Dynamic Zoom / Pan Transform Parameters
    const scaleX = transform.scaleX || 1;
    const scaleY = transform.scaleY || 1;
    const offsetX = transform.offsetX || 0;
    const offsetY = transform.offsetY || 0;

    // Calculate Candle Width in Pixel Space
    const baseWidth = Math.max(1, this.geomState.timeStepPx - 1);
    const candleWidth = Math.max(1, baseWidth * scaleX);

    // Issue WebGL Draw Calls
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Apply Uniforms
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
    gl.uniform1f(uLocs.uCandleWidth, candleWidth);
    gl.uniform1f(uLocs.uOutlineThickness, this.style.outlineThickness);
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

    // Cache Attributes
    this.locations.attributes.aCorner = gl.getAttribLocation(this.program, "aCorner");
    this.locations.attributes.aCandleData = gl.getAttribLocation(this.program, "aCandleData");
    this.locations.attributes.aCloseY = gl.getAttribLocation(this.program, "aCloseY");

    // Cache Uniforms
    this.locations.uniforms.uProjectionMatrix = gl.getUniformLocation(this.program, "uProjectionMatrix");
    this.locations.uniforms.uTransform = gl.getUniformLocation(this.program, "uTransform");
    this.locations.uniforms.uOutlineThickness = gl.getUniformLocation(this.program, "uOutlineThickness");
    this.locations.uniforms.uCandleWidth = gl.getUniformLocation(this.program, "uCandleWidth");
    this.locations.uniforms.uUpOutlineColor = gl.getUniformLocation(this.program, "uUpOutlineColor");
    this.locations.uniforms.uUpBodyColor = gl.getUniformLocation(this.program, "uUpBodyColor");
    this.locations.uniforms.uDownOutlineColor = gl.getUniformLocation(this.program, "uDownOutlineColor");
    this.locations.uniforms.uDownBodyColor = gl.getUniformLocation(this.program, "uDownBodyColor");

    // Create Buffers & VAO
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

    // aCandleData = vec4 [x, openY, highY, lowY]
    gl.enableVertexAttribArray(this.locations.attributes.aCandleData);
    gl.vertexAttribPointer(this.locations.attributes.aCandleData, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(this.locations.attributes.aCandleData, 1);

    // aCloseY = float [closeY]
    gl.enableVertexAttribArray(this.locations.attributes.aCloseY);
    gl.vertexAttribPointer(this.locations.attributes.aCloseY, 1, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribDivisor(this.locations.attributes.aCloseY, 1);

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
in vec4 aCandleData; // [x, openY, highY, lowY]
in float aCloseY;

uniform mat3 uProjectionMatrix;
uniform vec4 uTransform; // [scaleX, scaleY, offsetX, offsetY]
uniform float uCandleWidth;

out vec2 vPixelPos;
out float vCenterX;
out float vOpenY;
out float vHighY;
out float vLowY;
out float vCloseY;

void main(void) {
  float scaleX = uTransform.x;
  float scaleY = uTransform.y;
  float offsetX = uTransform.z;
  float offsetY = uTransform.w;

  float centerX = floor(aCandleData.x * scaleX - offsetX) + 0.5;
  float openY   = floor(aCandleData.y * scaleY - offsetY) + 0.5;
  float highY   = floor(aCandleData.z * scaleY - offsetY) + 0.5;
  float lowY    = floor(aCandleData.w * scaleY - offsetY) + 0.5;
  float closeY  = floor(aCloseY       * scaleY - offsetY) + 0.5;

  float minHeight = 1.0;
  if (abs(highY - lowY) < minHeight) {
    highY = highY + minHeight;
  }

  vec2 pos = vec2(
    centerX + aCorner.x * uCandleWidth,
    mix(highY, lowY, (aCorner.y + 1.0) * 0.5)
  );

  vPixelPos = pos;
  vCenterX = centerX;
  vOpenY = openY;
  vHighY = highY;
  vLowY = lowY;
  vCloseY = closeY;

  vec3 projected = uProjectionMatrix * vec3(pos, 1.0);
  gl_Position = vec4(projected.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

uniform float uOutlineThickness;
uniform float uCandleWidth;
uniform vec3 uUpOutlineColor;
uniform vec3 uUpBodyColor;
uniform vec3 uDownOutlineColor;
uniform vec3 uDownBodyColor;

in vec2 vPixelPos;
in float vCenterX;
in float vOpenY;
in float vHighY;
in float vLowY;
in float vCloseY;

out vec4 fragColor;

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

  if (abs(vOpenY - vCloseY) < 0.0001) {
    bodyTop = rawBodyTop;
    bodyBottom = rawBodyTop + bodyHeight;
  } else {
    float bodyCenter = (rawBodyTop + rawBodyBottom) * 0.5;
    bodyTop = bodyCenter - bodyHeight * 0.5;
    bodyBottom = bodyCenter + bodyHeight * 0.5;
  }

  bool canrenderOutline = uCandleWidth >= uOutlineThickness && bodyHeight >= uOutlineThickness;
  bool canrenderBodyInner =
    uCandleWidth > (uOutlineThickness * 2.0) &&
    bodyHeight > (uOutlineThickness * 2.0);

  float dx = abs(vPixelPos.x - vCenterX);

  bool inWick = dx <= halfOutline && vPixelPos.y >= vHighY && vPixelPos.y <= vLowY;
  bool inBodyOuter = canrenderOutline && dx <= halfWidth && vPixelPos.y >= bodyTop && vPixelPos.y <= bodyBottom;
  bool inBodyInner = canrenderBodyInner
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

  fragColor = color;
}
`;