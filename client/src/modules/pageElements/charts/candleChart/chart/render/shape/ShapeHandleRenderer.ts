import { createProgram, createUnitQuad } from "../common/glProgram";
import type { RGBA } from "../../../../../../shared/type";

const HANDLE_VS = `#version 300 es
precision highp float;

in vec2 a_position; // unit quad [0,0]..[1,1]
in vec2 a_center;   // screen px

uniform vec2 u_canvasSize;
uniform float u_radius;

out vec2 v_local;

void main() {
    vec2 local = a_position * 2.0 - 1.0; // -1..1
    vec2 pos = a_center + local * u_radius;
    vec2 clip = (pos / u_canvasSize) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_local = local;
}
`;

const HANDLE_FS = `#version 300 es
precision highp float;

in vec2 v_local;

uniform vec4 u_color;
uniform vec4 u_borderColor;
uniform float u_borderRatio; // border thickness / radius

out vec4 fragColor;

void main() {
    float d = length(v_local);
    float aa = fwidth(d);
    if (d > 1.0 + aa) discard;

    float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
    float borderStart = 1.0 - u_borderRatio;
    vec4 color = d > borderStart ? u_borderColor : u_color;
    fragColor = vec4(color.rgb, color.a * alpha);
}
`;

export interface HandleStyle {
  size: number;
  color: RGBA;
  borderThickness: number;
  borderColor: RGBA;
}

export default class ShapeHandleRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;

  private uCanvasLoc: WebGLUniformLocation | null = null;
  private uRadiusLoc: WebGLUniformLocation | null = null;
  private uColorLoc: WebGLUniformLocation | null = null;
  private uBorderColorLoc: WebGLUniformLocation | null = null;
  private uBorderRatioLoc: WebGLUniformLocation | null = null;

  private instanceData: Float32Array = new Float32Array(0);
  private count = 0;
  private style: HandleStyle = { size: 10, color: [41, 98, 255, 255], borderThickness: 1, borderColor: [255, 255, 255, 255] };

  public setGl(gl: WebGL2RenderingContext): void {
    if (this.gl === gl) return;
    this.destroy();
    this.gl = gl;
    this.initGl();
  }

  public destroy(): void {
    if (!this.gl) return;
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
    if (this.instanceBuffer) this.gl.deleteBuffer(this.instanceBuffer);
    if (this.program) this.gl.deleteProgram(this.program);
    this.gl = null;
  }

  public setStyle(style: HandleStyle): void {
    this.style = style;
  }

  public setData(centers: { x: number; y: number }[]): void {
    const data = new Float32Array(centers.length * 2);
    let o = 0;
    for (const c of centers) {
      data[o++] = c.x;
      data[o++] = c.y;
    }
    this.instanceData = data;
    this.count = centers.length;
    this.upload();
  }

  public render(canvasSize: { w: number; h: number }): void {
    if (!this.gl || !this.program || !this.vao || this.count === 0) return;
    if (canvasSize.w <= 0 || canvasSize.h <= 0) return;
    const gl = this.gl;

    const radius = this.style.size / 2;
    const borderRatio = radius > 0 ? Math.min(1, this.style.borderThickness / radius) : 0;

    gl.useProgram(this.program);
    gl.uniform2f(this.uCanvasLoc, canvasSize.w, canvasSize.h);
    gl.uniform1f(this.uRadiusLoc, radius);
    gl.uniform1f(this.uBorderRatioLoc, borderRatio);
    gl.uniform4f(this.uColorLoc, this.style.color[0] / 255, this.style.color[1] / 255, this.style.color[2] / 255, this.style.color[3] / 255);
    gl.uniform4f(this.uBorderColorLoc, this.style.borderColor[0] / 255, this.style.borderColor[1] / 255, this.style.borderColor[2] / 255, this.style.borderColor[3] / 255);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }

  private upload(): void {
    if (!this.gl || !this.instanceBuffer) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData, gl.DYNAMIC_DRAW);
  }

  private initGl(): void {
    if (!this.gl) return;
    const gl = this.gl;

    this.program = createProgram(gl, HANDLE_VS, HANDLE_FS);
    this.uCanvasLoc = gl.getUniformLocation(this.program, "u_canvasSize");
    this.uRadiusLoc = gl.getUniformLocation(this.program, "u_radius");
    this.uColorLoc = gl.getUniformLocation(this.program, "u_color");
    this.uBorderColorLoc = gl.getUniformLocation(this.program, "u_borderColor");
    this.uBorderRatioLoc = gl.getUniformLocation(this.program, "u_borderRatio");

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.quadBuffer = createUnitQuad(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const aPos = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const aCenter = gl.getAttribLocation(this.program, "a_center");
    gl.enableVertexAttribArray(aCenter);
    gl.vertexAttribPointer(aCenter, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(aCenter, 1);

    gl.bindVertexArray(null);
  }
}
