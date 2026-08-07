import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";

//======================================================================================================
// SHADER DEFINITION
//======================================================================================================
const OPENING_CANDLE_SHADER = {
  vertex: `#version 300 es
precision highp float;

in vec2 aCorner;
in vec2 aCandleTimes;  // [openTimePx, closeTimePx]
in vec4 aCandlePrices; // [openY, highY, lowY, closeY]

uniform mat3 uProjectionMatrix;
uniform vec4 uTransform; // [scaleX, scaleY, offsetX, offsetY]
uniform float uPadding;
uniform float uCanvasWidth;
uniform float uOpeningThickness;

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

  // Candle quad bounds
  float minCandleX = min(openTimePx, openTimePx + uPadding - 1.0);
  float maxCandleX = max(closeTimePx, closeTimePx - uPadding + 1.0);
  
  float minCandleY = min(highY - 1.0, lowY - 1.0);
  float maxCandleY = max(highY + 1.0, lowY + 1.0);

  // Line quad bounds (From open time to canvas right edge, centered on closeY)
  float halfThick = max(0.5, uOpeningThickness * 0.5);
  float minLineX = openTimePx;
  float maxLineX = max(openTimePx, uCanvasWidth);

  float minLineY = closeY - halfThick - 1.0;
  float maxLineY = closeY + halfThick + 1.0;

  // Overall combined bounding quad for both candle and opening line
  float minX = min(minCandleX, minLineX);
  float maxX = max(maxCandleX, maxLineX);

  float minY = min(minCandleY, minLineY);
  float maxY = max(maxCandleY, maxLineY);

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
`,

  fragment: `#version 300 es
precision highp float;

uniform float uPadding;
uniform vec3 uUpOutlineColor;
uniform vec3 uUpBodyColor;
uniform vec3 uDownOutlineColor;
uniform vec3 uDownBodyColor;

// Opening Line Uniforms
uniform vec4 uOpeningColor;     // RGBA
uniform float uOpeningThickness;
uniform float uOpeningType;      // 0 = solid, 1 = dash
uniform float uOpeningDashWidth;
uniform float uOpeningDashSpace;

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

  vec2 pixelPos = floor(vPixelPos) + 0.5;

  // Screen space: higher price = smaller Y
  bool isUp = closeY <= openY;

  vec3 outlineColor = isUp ? uUpOutlineColor : uDownOutlineColor;
  vec3 bodyColor    = isUp ? uUpBodyColor    : uDownBodyColor;

  // bool hasWidth = (closeTimePx - openTimePx) > (uPadding * 2.0);
  bool hasWidth = true;

  // 1. Wick Line
  float wickX = (openTimePx + closeTimePx) * 0.5;
  bool inWick =
      abs(pixelPos.x - wickX) <= 0.5 &&
      pixelPos.y >= highY &&
      pixelPos.y <= lowY;

  // 2. Body Rectangle
  float topY    = min(openY, closeY);
  float bottomY = max(openY, closeY);
  float leftX   = openTimePx + uPadding;
  float rightX  = closeTimePx - uPadding;

  bool inBody =
      hasWidth &&
      pixelPos.x >= leftX &&
      pixelPos.x <= rightX &&
      pixelPos.y >= topY &&
      pixelPos.y <= bottomY;

  // 3. Border Lines (around BODY only)
  float bLeftX  = openTimePx + uPadding - 0.5;
  float bRightX = closeTimePx - uPadding + 0.5;

  bool inHLine1 =
      hasWidth &&
      pixelPos.x >= bLeftX &&
      pixelPos.x <= bRightX &&
      abs(pixelPos.y - (topY - 0.5)) <= 0.5;

  bool inHLine2 =
      hasWidth &&
      pixelPos.x >= bLeftX &&
      pixelPos.x <= bRightX &&
      abs(pixelPos.y - (bottomY + 0.5)) <= 0.5;

  bool inVLine1 =
      hasWidth &&
      abs(pixelPos.x - bLeftX) <= 0.5 &&
      pixelPos.y >= (topY - 1.0) &&
      pixelPos.y <= (bottomY + 1.0);

  bool inVLine2 =
      hasWidth &&
      abs(pixelPos.x - bRightX) <= 0.5 &&
      pixelPos.y >= (topY - 1.0) &&
      pixelPos.y <= (bottomY + 1.0);

  bool inBorder = inHLine1 || inHLine2 || inVLine1 || inVLine2;

  

  vec4 color = vec4(0.0);

  // 4. Opening Line (From Close Price / Open Time to Right Edge)
  float halfThick = max(0.5, uOpeningThickness * 0.5);
  bool inLineY = abs(pixelPos.y - closeY) <= halfThick;
  bool inLineX = pixelPos.x >= (openTimePx + uPadding);

  if (inLineX && inLineY) {
    bool drawSegment = true;
    if (uOpeningType > 0.5) { // "dash"
      float cycle = uOpeningDashWidth + uOpeningDashSpace;
      if (cycle > 0.0) {
        float distFromStart = pixelPos.x - openTimePx;
        float posInCycle = mod(distFromStart, cycle);
        if (posInCycle > uOpeningDashWidth) {
          drawSegment = false;
        }
      }
    }

    if (drawSegment) {
      // Alpha composite opening line over candle color if both overlap
      color = vec4(mix(color.rgb, uOpeningColor.rgb, uOpeningColor.a), max(color.a, uOpeningColor.a));
    }
  }  

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
`,
};

//======================================================================================================
// CONSTANTS & HELPERS
//======================================================================================================
const QUAD_CORNERS = new Float32Array([
  0.0, 0.0,
  1.0, 0.0,
  0.0, 1.0,
  1.0, 1.0,
]);

const FLOATS_PER_CANDLE = 6;

function rgbaToVec4(rgba: number[]): [number, number, number, number] {
  return [
    Math.max(0, Math.min(255, rgba[0] ?? 255)) / 255,
    Math.max(0, Math.min(255, rgba[1] ?? 255)) / 255,
    Math.max(0, Math.min(255, rgba[2] ?? 255)) / 255,
    Math.max(0, Math.min(255, rgba[3] ?? 255)) / 255,
  ];
}

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
      uCanvasWidth: null as WebGLUniformLocation | null,
      uUpOutlineColor: null as WebGLUniformLocation | null,
      uUpBodyColor: null as WebGLUniformLocation | null,
      uDownOutlineColor: null as WebGLUniformLocation | null,
      uDownBodyColor: null as WebGLUniformLocation | null,
      uOpeningColor: null as WebGLUniformLocation | null,
      uOpeningThickness: null as WebGLUniformLocation | null,
      uOpeningType: null as WebGLUniformLocation | null,
      uOpeningDashWidth: null as WebGLUniformLocation | null,
      uOpeningDashSpace: null as WebGLUniformLocation | null,
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
    opening: {
      color: new Float32Array([0.39, 1.0, 0.39, 1.0]),
      thickness: 1.0,
      type: 1.0, // 0 = solid, 1 = dash
      dashWidth: 5.0,
      dashSpace: 10.0,
    },
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

    // Load line style from state.config.get().candle.opening
    const openingStyle = configStyle.opening;
    if (openingStyle) {
      this.style.opening.color = new Float32Array(rgbaToVec4(openingStyle.color?.background || [100, 255, 100, 255]));
      this.style.opening.thickness = openingStyle.thickness ?? 1.0;
      this.style.opening.type = openingStyle.type === "solid" ? 0.0 : 1.0;
      this.style.opening.dashWidth = openingStyle.dash?.width ?? 5.0;
      this.style.opening.dashSpace = openingStyle.dash?.space ?? 10.0;
    }
  }

  public updateData(): void {
    if (!this.state || !this.gl) return;

    const openingCandle = this.state.source.candle.getOpening();
    const view = this.state.config.get()?.viewport;
    const canvas = (this.chart as any)?.event?.getCanvasSize();

    if (
      !openingCandle ||
      openingCandle.t == null ||
      openingCandle.o == null ||
      openingCandle.h == null ||
      openingCandle.l == null ||
      openingCandle.c == null ||
      !view ||
      !canvas ||
      canvas.w <= 0 ||
      canvas.h <= 0
    ) {
      this.hasValidCandle = false;
      return;
    }

    const openTs = openingCandle.t;
    const closeTs = this.state.source.candle.getOpeningCloseTime();

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

    // Price conversion to pixels
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
    gl.uniform1f(uLocs.uCanvasWidth, canvas.w);
    gl.uniform3fv(uLocs.uUpBodyColor, this.style.upBodyColor);
    gl.uniform3fv(uLocs.uUpOutlineColor, this.style.upOutlineColor);
    gl.uniform3fv(uLocs.uDownBodyColor, this.style.downBodyColor);
    gl.uniform3fv(uLocs.uDownOutlineColor, this.style.downOutlineColor);

    // Set opening line uniforms
    gl.uniform4fv(uLocs.uOpeningColor, this.style.opening.color);
    gl.uniform1f(uLocs.uOpeningThickness, this.style.opening.thickness);
    gl.uniform1f(uLocs.uOpeningType, this.style.opening.type);
    gl.uniform1f(uLocs.uOpeningDashWidth, this.style.opening.dashWidth);
    gl.uniform1f(uLocs.uOpeningDashSpace, this.style.opening.dashSpace);

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

    this.program = this.createProgram(gl, OPENING_CANDLE_SHADER.vertex, OPENING_CANDLE_SHADER.fragment);
    if (!this.program) return;

    // Attributes
    this.locations.attributes.aCorner = gl.getAttribLocation(this.program, "aCorner");
    this.locations.attributes.aCandleTimes = gl.getAttribLocation(this.program, "aCandleTimes");
    this.locations.attributes.aCandlePrices = gl.getAttribLocation(this.program, "aCandlePrices");

    // Uniforms
    this.locations.uniforms.uProjectionMatrix = gl.getUniformLocation(this.program, "uProjectionMatrix");
    this.locations.uniforms.uTransform = gl.getUniformLocation(this.program, "uTransform");
    this.locations.uniforms.uPadding = gl.getUniformLocation(this.program, "uPadding");
    this.locations.uniforms.uCanvasWidth = gl.getUniformLocation(this.program, "uCanvasWidth");
    this.locations.uniforms.uUpOutlineColor = gl.getUniformLocation(this.program, "uUpOutlineColor");
    this.locations.uniforms.uUpBodyColor = gl.getUniformLocation(this.program, "uUpBodyColor");
    this.locations.uniforms.uDownOutlineColor = gl.getUniformLocation(this.program, "uDownOutlineColor");
    this.locations.uniforms.uDownBodyColor = gl.getUniformLocation(this.program, "uDownBodyColor");

    this.locations.uniforms.uOpeningColor = gl.getUniformLocation(this.program, "uOpeningColor");
    this.locations.uniforms.uOpeningThickness = gl.getUniformLocation(this.program, "uOpeningThickness");
    this.locations.uniforms.uOpeningType = gl.getUniformLocation(this.program, "uOpeningType");
    this.locations.uniforms.uOpeningDashWidth = gl.getUniformLocation(this.program, "uOpeningDashWidth");
    this.locations.uniforms.uOpeningDashSpace = gl.getUniformLocation(this.program, "uOpeningDashSpace");

    this.vao = gl.createVertexArray();
    this.buffers.quadCorners = gl.createBuffer();
    this.buffers.candleInstance = gl.createBuffer();

    gl.bindVertexArray(this.vao);

    // Quad Corners Buffer (Per Vertex)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.quadCorners);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.locations.attributes.aCorner);
    gl.vertexAttribPointer(this.locations.attributes.aCorner, 2, gl.FLOAT, false, 0, 0);

    // Fixed Candle Instance Buffer
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