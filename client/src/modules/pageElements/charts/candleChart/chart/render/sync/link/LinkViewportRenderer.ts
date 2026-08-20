import StateData from "../../../../state/StateData";
import ChartController from "../../../ChartController";
import type { RGBA } from "../../../../../../../shared/type";

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 a_position; // Unit quad: [0,0] to [1,1]

void main() {
    // Map unit quad [0, 1] directly to WebGL Clip Space [-1, 1]
    vec2 clipSpace = a_position * 2.0 - 1.0;
    // Flip Y axis so Y=0 is top and Y=canvasHeight is bottom in pixel coordinate calculations
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec2 u_canvasSize;
uniform vec4 u_extend; // (top, bottom, left, right)
uniform vec4 u_bgColor;
uniform vec4 u_borderColor;
uniform float u_borderThickness;
uniform int u_borderType; // 0 = solid, 1 = dash
uniform vec2 u_dashConfig; // (space, width)

out vec4 fragColor;

void main() {
    float w = u_canvasSize.x;
    float h = u_canvasSize.y;

    if (w <= 0.0 || h <= 0.0) {
        discard;
    }

    // Convert fragCoord (origin bottom-left in GLSL) to pixel coordinate (origin top-left)
    vec2 px = vec2(gl_FragCoord.x, h - gl_FragCoord.y);

    float topExt = u_extend.x;
    float bottomExt = u_extend.y;
    float leftExt = u_extend.z;
    float rightExt = u_extend.w;

    float horizontalDiv = 1.0 + leftExt + rightExt;
    float verticalDiv = 1.0 + bottomExt + topExt;

    // Outer non-overlapped extension rectangle boundaries (Pixel coordinates)
    float leftW = (horizontalDiv > 0.0) ? (w / horizontalDiv) * leftExt : 0.0;
    float rightW = (horizontalDiv > 0.0) ? (w / horizontalDiv) * rightExt : 0.0;
    float topH = (verticalDiv > 0.0) ? (h / verticalDiv) * topExt : 0.0;
    float bottomH = (verticalDiv > 0.0) ? (h / verticalDiv) * bottomExt : 0.0;

    // Remaining inner active area covered by the border
    float innerLeft = leftW;
    float innerRight = w - rightW;
    float innerTop = topH;
    float innerBottom = h - bottomH;

    // 1. Check if pixel falls inside non-overlapping extend background rectangles
    bool isLeftRect = (leftW > 0.0) && (px.x < leftW);
    bool isRightRect = (rightW > 0.0) && (px.x >= w - rightW);
    bool isTopRect = (topH > 0.0) && (px.y < topH) && (px.x >= leftW && px.x < w - rightW);
    bool isBottomRect = (bottomH > 0.0) && (px.y >= h - bottomH) && (px.x >= leftW && px.x < w - rightW);

    bool isBgArea = isLeftRect || isRightRect || isTopRect || isBottomRect;

    // 2. Check if pixel falls within the border around the inner remaining area
    // The border is out-aligned: overlaps the outer extension rectangles, not the inner center
    float t = u_borderThickness;
    bool isBorderArea = false;

    if (t > 0.0) {
        bool inHorizontalBounds = (px.x >= innerLeft - t && px.x <= innerRight + t);
        bool inVerticalBounds = (px.y >= innerTop - t && px.y <= innerBottom + t);

        bool isTopEdge = (px.y >= innerTop - t && px.y < innerTop) && inHorizontalBounds;
        bool isBottomEdge = (px.y >= innerBottom && px.y <= innerBottom + t) && inHorizontalBounds;
        bool isLeftEdge = (px.x >= innerLeft - t && px.x < innerLeft) && inVerticalBounds;
        bool isRightEdge = (px.x >= innerRight && px.x <= innerRight + t) && inVerticalBounds;

        if (isTopEdge || isBottomEdge || isLeftEdge || isRightEdge) {
            if (u_borderType == 1) { // Dash border logic
                float dashPattern = u_dashConfig.x + u_dashConfig.y; // space + width
                if (dashPattern > 0.0) {
                    float pos = (isTopEdge || isBottomEdge) ? px.x : px.y;
                    float modPos = mod(pos, dashPattern);
                    if (modPos < u_dashConfig.y) {
                        isBorderArea = true;
                    }
                }
            } else { // Solid border
                isBorderArea = true;
            }
        }
    }

    // Output final color blending: border takes precedence over background
    if (isBorderArea) {
        fragColor = u_borderColor;
    } else if (isBgArea) {
        fragColor = u_bgColor;
    } else {
        discard;
    }
}
`;

export default class LinkViewportRenderer {
  private state!: StateData;
  private chart!: ChartController;
  private gl: WebGL2RenderingContext | null = null;

  // WebGL Objects
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;

  // Shader Locations
  private locations: {
    attribs: {
      position: number;
    };
    uniforms: {
      canvasSize: WebGLUniformLocation | null;
      extend: WebGLUniformLocation | null;
      bgColor: WebGLUniformLocation | null;
      borderColor: WebGLUniformLocation | null;
      borderThickness: WebGLUniformLocation | null;
      borderType: WebGLUniformLocation | null;
      dashConfig: WebGLUniformLocation | null;
    };
  } = {
    attribs: { position: -1 },
    uniforms: {
      canvasSize: null,
      extend: null,
      bgColor: null,
      borderColor: null,
      borderThickness: null,
      borderType: null,
      dashConfig: null,
    },
  };

  // Cached Style & State
  private canvasWidth = 0;
  private canvasHeight = 0;
  private extendData = new Float32Array([0, 0, 0, 0]); // top, bottom, left, right
  private bgColorData = new Float32Array([0, 0, 0, 0]);
  private borderColorData = new Float32Array([0, 0, 0, 0]);
  private borderThickness = 0;
  private borderType = 0; // 0: solid, 1: dash
  private dashConfigData = new Float32Array([0, 0]); // space, width
  private isEnabled = false;

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
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    if (this.program) this.gl.deleteProgram(this.program);

    this.gl = null;
    this.program = null;
    this.vao = null;
    this.quadBuffer = null;
    this.isEnabled = false;
  }

  public updateDataAndStyle(): void {
    const config = this.state.config.get();
    const viewportSync = config?.sync?.viewport;

    if (!viewportSync || viewportSync.enable === false) {
      this.isEnabled = false;
      return;
    }

    this.isEnabled = true;

    // Save extensions: top, bottom, left, right
    const extend = viewportSync.extend;
    this.extendData[0] = extend?.top ?? 0;
    this.extendData[1] = extend?.bottom ?? 0;
    this.extendData[2] = extend?.left ?? 0;
    this.extendData[3] = extend?.right ?? 0;

    // Save style
    const style = viewportSync.style;

    // Normalize RGBA background [0..255] -> [0.0..1.0]
    const bg: RGBA = style?.background ?? [0, 0, 0, 0];
    this.bgColorData[0] = bg[0] / 255;
    this.bgColorData[1] = bg[1] / 255;
    this.bgColorData[2] = bg[2] / 255;
    this.bgColorData[3] = (bg[3] ?? 255) / 255;

    // Normalize RGBA border [0..255] -> [0.0..1.0]
    const border = style?.border;
    const borderCol: RGBA = border?.color ?? [0, 0, 0, 0];
    this.borderColorData[0] = borderCol[0] / 255;
    this.borderColorData[1] = borderCol[1] / 255;
    this.borderColorData[2] = borderCol[2] / 255;
    this.borderColorData[3] = (borderCol[3] ?? 255) / 255;

    this.borderThickness = border?.thickness ?? 0;
    this.borderType = border?.type === "dash" ? 1 : 0;
    this.dashConfigData[0] = border?.dash?.space ?? 0;
    this.dashConfigData[1] = border?.dash?.width ?? 0;
  }

public render(): void {
    if (!this.isEnabled || !this.gl || !this.program || !this.vao) {
      return;
    }

    // Dynamic canvas size update per render call
    const canvasSize = this.chart.event.getCanvasSize();
    this.canvasWidth = canvasSize.w;
    this.canvasHeight = canvasSize.h;

    if (this.canvasWidth <= 0 || this.canvasHeight <= 0) {
      return;
    }

    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Apply uniforms
    gl.uniform2f(
      this.locations.uniforms.canvasSize,
      this.canvasWidth,
      this.canvasHeight
    );
    gl.uniform4fv(this.locations.uniforms.extend, this.extendData);
    gl.uniform4fv(this.locations.uniforms.bgColor, this.bgColorData);
    gl.uniform4fv(this.locations.uniforms.borderColor, this.borderColorData);
    gl.uniform1f(
      this.locations.uniforms.borderThickness,
      this.borderThickness
    );
    gl.uniform1i(this.locations.uniforms.borderType, this.borderType);
    gl.uniform2fv(this.locations.uniforms.dashConfig, this.dashConfigData);

    // Enable Alpha Blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Draw full-screen quad (Fragment shader calculates region clipping and borders)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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
        "LinkViewportRenderer program link error:",
        gl.getProgramInfoLog(program)
      );
      gl.deleteProgram(program);
      return;
    }

    this.program = program;

    // Cache Attributes
    this.locations.attribs.position = gl.getAttribLocation(
      program,
      "a_position"
    );

    // Cache Uniforms
    this.locations.uniforms.canvasSize = gl.getUniformLocation(
      program,
      "u_canvasSize"
    );
    this.locations.uniforms.extend = gl.getUniformLocation(
      program,
      "u_extend"
    );
    this.locations.uniforms.bgColor = gl.getUniformLocation(
      program,
      "u_bgColor"
    );
    this.locations.uniforms.borderColor = gl.getUniformLocation(
      program,
      "u_borderColor"
    );
    this.locations.uniforms.borderThickness = gl.getUniformLocation(
      program,
      "u_borderThickness"
    );
    this.locations.uniforms.borderType = gl.getUniformLocation(
      program,
      "u_borderType"
    );
    this.locations.uniforms.dashConfig = gl.getUniformLocation(
      program,
      "u_dashConfig"
    );

    // Setup VAO and VBO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Full-screen Quad unit coordinates: [0,0], [1,0], [0,1], [1,1]
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const quadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const posLoc = this.locations.attribs.position;
    if (posLoc !== -1) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }

    gl.bindVertexArray(null);

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
        "LinkViewportRenderer shader compile error:",
        this.gl.getShaderInfoLog(shader)
      );
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }
}