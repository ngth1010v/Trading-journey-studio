import StateData from "../../../state/StateData";
import ChartController from "../../ChartController";

export const PRELOAD_RATIO = 2;
const MAX_SEASONS = 64;

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 a_corner;
in float a_startPixel;
in float a_endPixel;
in float a_seasonIndex;

uniform float u_scaleX;
uniform float u_offsetX;
uniform vec2 u_canvasSize;

out float v_screenX;
out float v_startPixelScreen;
out float v_endPixelScreen;
flat out int v_seasonIndex;

void main() {
    v_startPixelScreen = a_startPixel * u_scaleX + u_offsetX;
    v_endPixelScreen = a_endPixel * u_scaleX + u_offsetX;

    v_screenX = mix(v_startPixelScreen, v_endPixelScreen, a_corner.x);

    float clipX = (v_screenX / u_canvasSize.x) * 2.0 - 1.0;
    float clipY = a_corner.y * 2.0 - 1.0;

    gl_Position = vec4(clipX, clipY, 0.0, 1.0);
    v_seasonIndex = int(a_seasonIndex);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

#define MAX_SEASONS 64

in float v_screenX;
in float v_startPixelScreen;
in float v_endPixelScreen;
flat in int v_seasonIndex;

uniform vec4 u_bgColors[MAX_SEASONS];
uniform vec4 u_borderColors[MAX_SEASONS];
uniform float u_borderThickness[MAX_SEASONS];

out vec4 fragColor;

void main() {
    int idx = clamp(v_seasonIndex, 0, MAX_SEASONS - 1);

    vec4 bgColor = u_bgColors[idx];
    vec4 borderColor = u_borderColors[idx];
    float thickness = u_borderThickness[idx];

    float distToLeft = v_screenX - v_startPixelScreen;
    float distToRight = v_endPixelScreen - v_screenX;

    if (distToLeft < thickness || distToRight < thickness) {
        fragColor = borderColor;
    } else {
        fragColor = bgColor;
    }
}
`;

export default class SeasonRenderer {
  private state!: StateData;
  private chart!: ChartController;
  private gl: WebGL2RenderingContext | null = null;

  // WebGL Objects
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;

  // Shader Locations
  private locations: {
    attribs: {
      corner: number;
      startPixel: number;
      endPixel: number;
      seasonIndex: number;
    };
    uniforms: {
      scaleX: WebGLUniformLocation | null;
      offsetX: WebGLUniformLocation | null;
      canvasSize: WebGLUniformLocation | null;
      bgColors: WebGLUniformLocation | null;
      borderColors: WebGLUniformLocation | null;
      borderThickness: WebGLUniformLocation | null;
    };
  } = {
    attribs: { corner: -1, startPixel: -1, endPixel: -1, seasonIndex: -1 },
    uniforms: {
      scaleX: null,
      offsetX: null,
      canvasSize: null,
      bgColors: null,
      borderColors: null,
      borderThickness: null,
    },
  };

  // Rendering State
  private instanceCount = 0;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private scaleX = 1;
  private offsetX = 0;

  // Style Cache & Season Mapping
  private seasonIdToIndexMap = new Map<number, number>();
  private bgColorsData = new Float32Array(MAX_SEASONS * 4);
  private borderColorsData = new Float32Array(MAX_SEASONS * 4);
  private borderThicknessData = new Float32Array(MAX_SEASONS);

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;
  }

  public setGl(gl: WebGL2RenderingContext): void {
    if (this.gl === gl) return;
    this.destroy();
    this.gl = gl;

    this.initGLResources();
  }

  public destroy(): void {
    if (!this.gl) return;

    if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
    if (this.instanceBuffer) this.gl.deleteBuffer(this.instanceBuffer);
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.program) this.gl.deleteProgram(this.program);

    this.gl = null;
    this.program = null;
    this.vao = null;
    this.quadBuffer = null;
    this.instanceBuffer = null;
    this.instanceCount = 0;
    this.seasonIdToIndexMap.clear();
  }

  public updateData(): void {
    const view = this.state.config.get()?.viewport;
    if (!view) {
      this.instanceCount = 0;
      return;
    }

    const canvasSize = this.chart.event.getCanvasSize();
    this.canvasWidth = canvasSize.w;
    this.canvasHeight = canvasSize.h;

    const currentStrategyId = this.state.config.get()?.strategyId
    const filter = currentStrategyId != null ? this.state.source.strategy.get(currentStrategyId)?.seasonIds : []

    const offset = (view.toTs - view.fromTs) * PRELOAD_RATIO;
    const ranges = this.state.source.strategy.season.getAllVisibleSeasonRange(
        view.fromTs - offset,
        view.toTs + offset,
        filter
    );

    if (ranges.length === 0) {
      this.instanceCount = 0;
      return;
    }

    // Prepare instance data buffer: [startPixel, endPixel, seasonIndex] per range
    const instanceData = new Float32Array(ranges.length * 3);

    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const fromPixel = this.chart.viewport.converter.timestampToPixel(
        range.fromTs
      );
      const toPixel = this.chart.viewport.converter.timestampToPixel(
        range.toTs
      );
      const sIndex = this.seasonIdToIndexMap.get(range.seasonId) ?? 0;

      const offsetIdx = i * 3;
      if (fromPixel && toPixel){
        instanceData[offsetIdx] = fromPixel;
        instanceData[offsetIdx + 1] = toPixel;
        instanceData[offsetIdx + 2] = sIndex;        
      }

    }

    this.instanceCount = ranges.length;

    if (this.gl && this.instanceBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        instanceData,
        this.gl.DYNAMIC_DRAW
      );
    }
  }

  public updateStyle(): void {
    const seasons = this.state.source.strategy.season.getAll();

    this.seasonIdToIndexMap.clear();
    this.bgColorsData.fill(0);
    this.borderColorsData.fill(0);
    this.borderThicknessData.fill(0);

    const count = Math.min(seasons.length, MAX_SEASONS);

    for (let i = 0; i < count; i++) {
      const season = seasons[i];
      const seasonId = season.id ?? i;
      this.seasonIdToIndexMap.set(seasonId, i);

      // Normalize RGBA [0-255] -> [0.0-1.0]
      const bg = season.color.background;
      const border = season.color.border;

      const bgIdx = i * 4;
      this.bgColorsData[bgIdx] = bg[0] / 255;
      this.bgColorsData[bgIdx + 1] = bg[1] / 255;
      this.bgColorsData[bgIdx + 2] = bg[2] / 255;
      this.bgColorsData[bgIdx + 3] = (bg[3] ?? 255) / 255;

      this.borderColorsData[bgIdx] = border[0] / 255;
      this.borderColorsData[bgIdx + 1] = border[1] / 255;
      this.borderColorsData[bgIdx + 2] = border[2] / 255;
      this.borderColorsData[bgIdx + 3] = (border[3] ?? 255) / 255;

      this.borderThicknessData[i] = season.style.borderThickness ?? 0;
    }
  }

  public updateTransform(): void {
    const transform = this.state.viewport.getTransform();
    this.scaleX = transform.scaleX;
    this.offsetX = transform.offsetX;
  }

  public render(): void {
    if (!this.gl || !this.program || !this.vao || this.instanceCount === 0) {
      return;
    }

    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Apply uniforms
    gl.uniform1f(this.locations.uniforms.scaleX, this.scaleX);
    gl.uniform1f(this.locations.uniforms.offsetX, this.offsetX);
    gl.uniform2f(
      this.locations.uniforms.canvasSize,
      this.canvasWidth,
      this.canvasHeight
    );

    gl.uniform4fv(this.locations.uniforms.bgColors, this.bgColorsData);
    gl.uniform4fv(this.locations.uniforms.borderColors, this.borderColorsData);
    gl.uniform1fv(
      this.locations.uniforms.borderThickness,
      this.borderThicknessData
    );

    // Enable Alpha Blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Render Instanced Quad
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);

    gl.bindVertexArray(null);
  }

  private initGLResources(): void {
    if (!this.gl) return;
    const gl = this.gl;

    const vertShader = this.compileShader(
      gl.VERTEX_SHADER,
      VERTEX_SHADER_SOURCE
    );
    const fragShader = this.compileShader(
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER_SOURCE
    );

    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(
        "SeasonRenderer program link error:",
        gl.getProgramInfoLog(program)
      );
      gl.deleteProgram(program);
      return;
    }

    this.program = program;

    // Cache Attribute Locations
    this.locations.attribs.corner = gl.getAttribLocation(program, "a_corner");
    this.locations.attribs.startPixel = gl.getAttribLocation(
      program,
      "a_startPixel"
    );
    this.locations.attribs.endPixel = gl.getAttribLocation(
      program,
      "a_endPixel"
    );
    this.locations.attribs.seasonIndex = gl.getAttribLocation(
      program,
      "a_seasonIndex"
    );

    // Cache Uniform Locations
    this.locations.uniforms.scaleX = gl.getUniformLocation(program, "u_scaleX");
    this.locations.uniforms.offsetX = gl.getUniformLocation(
      program,
      "u_offsetX"
    );
    this.locations.uniforms.canvasSize = gl.getUniformLocation(
      program,
      "u_canvasSize"
    );
    this.locations.uniforms.bgColors = gl.getUniformLocation(
      program,
      "u_bgColors"
    );
    this.locations.uniforms.borderColors = gl.getUniformLocation(
      program,
      "u_borderColors"
    );
    this.locations.uniforms.borderThickness = gl.getUniformLocation(
      program,
      "u_borderThickness"
    );

    // Setup VAO and VBOs
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Quad geometry VBO (TRIANGLE_STRIP: [0,0], [1,0], [0,1], [1,1])
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const quadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const cornerLoc = this.locations.attribs.corner;
    if (cornerLoc !== -1) {
      gl.enableVertexAttribArray(cornerLoc);
      gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
    }

    // Instanced data VBO (a_startPixel, a_endPixel, a_seasonIndex)
    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

    const stride = 3 * Float32Array.BYTES_PER_ELEMENT;

    const startLoc = this.locations.attribs.startPixel;
    if (startLoc !== -1) {
      gl.enableVertexAttribArray(startLoc);
      gl.vertexAttribPointer(startLoc, 1, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(startLoc, 1);
    }

    const endLoc = this.locations.attribs.endPixel;
    if (endLoc !== -1) {
      gl.enableVertexAttribArray(endLoc);
      gl.vertexAttribPointer(endLoc, 1, gl.FLOAT, false, stride, 4);
      gl.vertexAttribDivisor(endLoc, 1);
    }

    const idxLoc = this.locations.attribs.seasonIndex;
    if (idxLoc !== -1) {
      gl.enableVertexAttribArray(idxLoc);
      gl.vertexAttribPointer(idxLoc, 1, gl.FLOAT, false, stride, 8);
      gl.vertexAttribDivisor(idxLoc, 1);
    }

    gl.bindVertexArray(null);

    // Clean up standalone shader objects after linking
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);
  }

  private compileShader(
    type: number,
    source: string
  ): WebGLShader | null {
    if (!this.gl) return null;
    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error(
        "SeasonRenderer shader compile error:",
        this.gl.getShaderInfoLog(shader)
      );
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }
}