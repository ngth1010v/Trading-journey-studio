import { createProgram, createUnitQuad } from "../common/glProgram";
import type { LineInstance } from "./shapeGeometry";

const LINE_VS = `#version 300 es
precision highp float;

in vec2 a_position; // unit quad [0,0]..[1,1]: x = along (0=p0,1=p1), y*2-1 = across sign

in vec2 a_p0;
in vec2 a_p1;
in vec2 a_extend;   // (extendBack, extendForward) 0/1
in vec4 a_color;
in float a_thickness;
in float a_lineType;

uniform vec2 u_canvasSize;
uniform vec4 u_transform; // [scaleX, offsetX, scaleY, offsetY]

out vec4 v_color;
out float v_lineType;
out float v_along;
out float v_across;
out float v_thickness;

const float EXTEND_PX = 1e5;

void main() {
    vec2 realS0 = a_p0 * u_transform.xz + u_transform.yw;
    vec2 s1 = a_p1 * u_transform.xz + u_transform.yw;
    vec2 s0 = realS0;

    vec2 dir = s1 - s0;
    float len = length(dir);
    vec2 nDir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);

    if (a_extend.x > 0.5) s0 -= nDir * EXTEND_PX;
    if (a_extend.y > 0.5) s1 += nDir * EXTEND_PX;

    vec2 normal = vec2(-nDir.y, nDir.x);
    float halfW = a_thickness * 0.5 + 1.0; // +1px for AA

    vec2 along = mix(s0, s1, a_position.x);
    float acrossSign = a_position.y * 2.0 - 1.0;
    vec2 pos = along + normal * acrossSign * halfW;

    vec2 clip = (pos / u_canvasSize) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

    v_color = a_color;
    v_lineType = a_lineType;
    v_along = length(along - realS0);
    v_across = acrossSign * halfW;
    v_thickness = a_thickness;
}
`;

const LINE_FS = `#version 300 es
precision highp float;

in vec4 v_color;
in float v_lineType;
in float v_along;
in float v_across;
in float v_thickness;

out vec4 fragColor;

void main() {
    float halfW = v_thickness * 0.5;
    float edge = abs(v_across) - halfW;
    float alpha = 1.0 - clamp(smoothstep(0.0, 1.0, edge), 0.0, 1.0);
    if (alpha <= 0.0) discard;

    if (v_lineType > 0.5 && v_lineType < 1.5) {
        // dash: 6px on, 4px gap
        float cyc = mod(v_along, 10.0);
        if (cyc > 6.0) discard;
    } else if (v_lineType > 1.5) {
        // dot: round dot every 2*thickness px
        float period = max(2.0 * v_thickness, 4.0);
        float dotR = max(v_thickness * 0.5, 1.0);
        float cyc = mod(v_along, period);
        float d = length(vec2(cyc - dotR, v_across));
        if (d > dotR) discard;
    }

    fragColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;

const FLOATS_PER_INSTANCE = 12;

export default class ShapeLineRenderer {
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

  public setData(lines: LineInstance[]): void {
    const data = new Float32Array(lines.length * FLOATS_PER_INSTANCE);
    let o = 0;
    for (const l of lines) {
      const c = l.color;
      data[o++] = l.p0.x; data[o++] = l.p0.y;
      data[o++] = l.p1.x; data[o++] = l.p1.y;
      data[o++] = l.extendBack ? 1 : 0; data[o++] = l.extendForward ? 1 : 0;
      data[o++] = c[0] / 255; data[o++] = c[1] / 255; data[o++] = c[2] / 255; data[o++] = c[3] / 255;
      data[o++] = l.thickness;
      data[o++] = l.lineType;
    }
    this.instanceData = data;
    this.count = lines.length;
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

    this.program = createProgram(gl, LINE_VS, LINE_FS);
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
    const attrs: [string, number, number][] = [
      ["a_p0", 2, 0],
      ["a_p1", 2, 8],
      ["a_extend", 2, 16],
      ["a_color", 4, 24],
      ["a_thickness", 1, 40],
      ["a_lineType", 1, 44],
    ];
    for (const [name, size, offset] of attrs) {
      const loc = gl.getAttribLocation(this.program, name);
      if (loc === -1) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    }

    gl.bindVertexArray(null);
  }
}
