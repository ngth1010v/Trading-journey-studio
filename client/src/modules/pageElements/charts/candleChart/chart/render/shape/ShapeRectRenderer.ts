import { createProgram, createUnitQuad } from "../common/glProgram";
import type { RectFillInstance } from "./shapeGeometry";

const RECT_VS = `#version 300 es
precision highp float;

in vec2 a_position; // unit quad [0,0]..[1,1]

in vec4 a_bounds; // minX, minY, maxX, maxY (base px)
in vec4 a_color;

uniform vec2 u_canvasSize;
uniform vec4 u_transform; // [scaleX, offsetX, scaleY, offsetY]

out vec4 v_color;

void main() {
    vec2 minPx = a_bounds.xy * u_transform.xz + u_transform.yw;
    vec2 maxPx = a_bounds.zw * u_transform.xz + u_transform.yw;

    vec2 pos = mix(minPx, maxPx, a_position);
    vec2 clip = (pos / u_canvasSize) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

    v_color = a_color;
}
`;

const RECT_FS = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
    fragColor = v_color;
}
`;

const FLOATS_PER_INSTANCE = 8;

export default class ShapeRectRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private instanceBuffer: WebGLBuffer | null = null;

  private uTransformLoc: WebGLUniformLocation | null = null;
  private uCanvasLoc: WebGLUniformLocation | null = null;

  private instanceData: Float32Array = new Float32Array(0);
  private count = 0;

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

  public setData(rects: RectFillInstance[]): void {
    const data = new Float32Array(rects.length * FLOATS_PER_INSTANCE);
    let o = 0;
    for (const r of rects) {
      const c = r.color;
      data[o++] = r.min.x; data[o++] = r.min.y;
      data[o++] = r.max.x; data[o++] = r.max.y;
      data[o++] = c[0] / 255; data[o++] = c[1] / 255; data[o++] = c[2] / 255; data[o++] = c[3] / 255;
    }
    this.instanceData = data;
    this.count = rects.length;
    this.upload();
  }

  public updateTransform(transform: { scaleX: number; offsetX: number; scaleY: number; offsetY: number }, canvasSize: { w: number; h: number }): void {
    if (!this.gl || !this.program) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    if (this.uTransformLoc) gl.uniform4f(this.uTransformLoc, transform.scaleX, transform.offsetX, transform.scaleY, transform.offsetY);
    if (this.uCanvasLoc && canvasSize.w > 0 && canvasSize.h > 0) gl.uniform2f(this.uCanvasLoc, canvasSize.w, canvasSize.h);
    gl.useProgram(null);
  }

  public render(): void {
    if (!this.gl || !this.program || !this.vao || this.count === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
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

    this.program = createProgram(gl, RECT_VS, RECT_FS);
    this.uTransformLoc = gl.getUniformLocation(this.program, "u_transform");
    this.uCanvasLoc = gl.getUniformLocation(this.program, "u_canvasSize");

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.quadBuffer = createUnitQuad(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const aPos = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

    const stride = FLOATS_PER_INSTANCE * 4;
    const aBounds = gl.getAttribLocation(this.program, "a_bounds");
    const aColor = gl.getAttribLocation(this.program, "a_color");

    gl.enableVertexAttribArray(aBounds);
    gl.vertexAttribPointer(aBounds, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(aBounds, 1);

    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(aColor, 1);

    gl.bindVertexArray(null);
  }
}
