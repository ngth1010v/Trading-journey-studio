function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("compileShader: gl.createShader failed");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`compileShader: compile failed: ${info}`);
  }

  return shader;
}

/** Compiles + links a WebGL2 program, throwing with the shader/link info log on failure. */
export function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const program = gl.createProgram();
  if (!program) throw new Error("createProgram: gl.createProgram failed");

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`createProgram: link failed: ${info}`);
  }

  return program;
}

/** Shared `[0,0]..[1,1]` unit quad buffer, for instanced-quad renderers. */
export function createUnitQuad(gl: WebGL2RenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("createUnitQuad: gl.createBuffer failed");

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

  return buffer;
}
