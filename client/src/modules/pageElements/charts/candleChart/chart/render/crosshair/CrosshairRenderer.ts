import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { RGBA } from "../../../../../../shared/type";

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;

uniform vec2 u_resolution;

out vec2 v_pixelPosition;

void main() {
    v_pixelPosition = a_position;
    
    // Convert screen pixel coordinates (0,0 top-left) to WebGL NDC (-1 to 1, bottom-left origin)
    vec2 zeroToOne = a_position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;

    // Flip Y to match standard DOM top-left origin
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 v_pixelPosition;

uniform vec4 u_color;
uniform int u_type; // 0: solid, 1: dash
uniform vec2 u_dash; // x: width, y: space
uniform vec2 u_crosshairPos; // (x, y) intersection point

out vec4 fragColor;

void main() {
    if (u_type == 1) {
        float dashLen = u_dash.x;
        float spaceLen = u_dash.y;
        float cycle = dashLen + spaceLen;

        if (cycle > 0.0) {
            float dist = abs(v_pixelPosition.x - u_crosshairPos.x) + abs(v_pixelPosition.y - u_crosshairPos.y);
            float posInCycle = mod(dist, cycle);
            if (posInCycle > dashLen) {
                discard;
            }
        }
    }

    fragColor = u_color;
}
`;

export default class CrosshairRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private state: StateData | null = null;
  private chart: ChartController | null = null;

  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private positionBuffer: WebGLBuffer | null = null;

  private uResolutionLoc: WebGLUniformLocation | null = null;
  private uColorLoc: WebGLUniformLocation | null = null;
  private uTypeLoc: WebGLUniformLocation | null = null;
  private uDashLoc: WebGLUniformLocation | null = null;
  private uCrosshairPosLoc: WebGLUniformLocation | null = null;

  private currentX: number = -1000;
  private currentY: number = -1000;
  private color: RGBA = [255, 255, 255, 255];
  private thickness: number = 1;
  private isDash: boolean = true;
  private dashWidth: number = 5;
  private dashSpace: number = 5;

  constructor() {}

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;
  }

  public setGl(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.initGLResources();
  }

  public destroy(): void {
    if (this.gl) {
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
    }

    this.gl = null;
    this.program = null;
    this.vao = null;
    this.positionBuffer = null;
    this.state = null;
    this.chart = null;
  }

  public updateData(): void {
    if (!this.state || !this.gl) return;

    const pixel = this.state.crosshair.getPixel();
    if (pixel) {
      const dpr = window.devicePixelRatio || 1;
      
      // Get exact canvas top-left position relative to viewport if getPixel provides screen coordinates
      const canvas = this.gl.canvas as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();

      // If getPixel() returns clientX/clientY, subtract rect.top to normalize to local canvas pixel space:
      // const canvasY = pixel.y - rect.top;
      
      this.currentX = (pixel.x - rect.left) * dpr;
      this.currentY = (pixel.y - rect.top) * dpr;
    } else {
      this.currentX = -1000;
      this.currentY = -1000;
    }
  }

  public updateStyle(): void {
    if (!this.state) return;

    const config = this.state.config.get();
    const style = config?.style?.crosshair;

    if (style) {
      if (style.color) this.color = style.color;
      if (style.thickness !== undefined) this.thickness = style.thickness;
      this.isDash = style.type !== "solid";
      if (style.dash) {
        this.dashWidth = style.dash.width;
        this.dashSpace = style.dash.space;
      }
    }
  }

  public render(): void {
    if (!this.gl || !this.program || !this.vao || !this.chart) return;

    this.updateData();

    const canvas = this.gl.canvas as HTMLCanvasElement;
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    this.uploadGeometry(w, h);

    const gl = this.gl;

    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.uResolutionLoc, w, h);
    gl.uniform4f(
      this.uColorLoc,
      this.color[0] / 255,
      this.color[1] / 255,
      this.color[2] / 255,
      this.color[3] / 255
    );
    gl.uniform1i(this.uTypeLoc, this.isDash ? 1 : 0);
    gl.uniform2f(this.uDashLoc, this.dashWidth, this.dashSpace);
    gl.uniform2f(this.uCrosshairPosLoc, this.currentX, this.currentY);

    gl.drawArrays(gl.TRIANGLES, 0, 12);

    gl.bindVertexArray(null);
  }

  private uploadGeometry(w: number, h: number): void {
    if (!this.gl || !this.positionBuffer) return;

    const dpr = window.devicePixelRatio || 1;

    const thicknessPx = Math.max(1, Math.round(this.thickness * dpr));
    const halfThick = thicknessPx * 0.5;

    const x = this.currentX;
    const y = this.currentY;

    const vertices = new Float32Array([
      // Horizontal Line Quad
      0, y - halfThick,
      w, y - halfThick,
      0, y + halfThick,
      0, y + halfThick,
      w, y - halfThick,
      w, y + halfThick,

      // Vertical Line Quad
      x - halfThick, 0,
      x + halfThick, 0,
      x - halfThick, h,
      x - halfThick, h,
      x + halfThick, 0,
      x + halfThick, h,
    ]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
  }

  private initGLResources(): void {
    if (!this.gl) return;

    const gl = this.gl;
    const vertShader = this.createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = this.createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

    const program = gl.createProgram();
    if (!program) throw new Error("CrosshairRenderer: Failed to create GL program.");

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`CrosshairRenderer: Program link failure: ${info}`);
    }

    this.program = program;

    this.uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
    this.uColorLoc = gl.getUniformLocation(program, "u_color");
    this.uTypeLoc = gl.getUniformLocation(program, "u_type");
    this.uDashLoc = gl.getUniformLocation(program, "u_dash");
    this.uCrosshairPosLoc = gl.getUniformLocation(program, "u_crosshairPos");

    const positionLoc = gl.getAttribLocation(program, "a_position");

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);

    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("CrosshairRenderer: Failed to create WebGL shader.");

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`CrosshairRenderer: Shader compilation error: ${info}`);
    }

    return shader;
  }
}