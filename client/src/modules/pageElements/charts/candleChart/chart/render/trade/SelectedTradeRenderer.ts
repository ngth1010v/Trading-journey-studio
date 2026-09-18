import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { Trade } from "../../../../../../data/chartData/trade/TradeData";
import type { TradeStyle } from "../../../../../../data/chartData/trade/style/TradeStyleData";

// Modern GLSL 300 es shaders
const RECT_VS = `#version 300 es
precision highp float;

in vec2 a_position; // Unit quad: [0, 0] to [1, 1]

// Instanced Attributes per region (Profit / Loss)
in vec4 a_rectBounds; // (x1, y1, x2, y2) in pixel space
in vec4 a_bgColor;    // (r, g, b, a) normalized [0..1]
in vec4 a_borderColor;// (r, g, b, a) normalized [0..1]

uniform vec2 u_canvasSize;

out vec4 v_bgColor;
out vec4 v_borderColor;
out vec2 v_localPx;
out vec2 v_rectSize;

void main() {
    vec2 pos = mix(a_rectBounds.xy, a_rectBounds.zw, a_position);
    vec2 clipSpace = (pos / u_canvasSize) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);

    v_bgColor = a_bgColor;
    v_borderColor = a_borderColor;
    v_rectSize = abs(a_rectBounds.zw - a_rectBounds.xy);
    v_localPx = a_position * v_rectSize;
}
`;

const RECT_FS = `#version 300 es
precision highp float;

in vec4 v_bgColor;
in vec4 v_borderColor;
in vec2 v_localPx;
in vec2 v_rectSize;

out vec4 fragColor;

void main() {
    float border = 1.0; // 1px solid border
    bool isBorder = v_localPx.x < border || v_localPx.x > (v_rectSize.x - border) ||
                    v_localPx.y < border || v_localPx.y > (v_rectSize.y - border);

    if (isBorder) {
        fragColor = v_borderColor;
    } else {
        fragColor = v_bgColor;
    }
}
`;

const TEXT_VS = `#version 300 es
precision highp float;

in vec2 a_position;   // Unit quad [0, 0] to [1, 1]
in vec4 a_glyphBounds; // (x, y, width, height) in pixel space
in vec4 a_uvBounds;    // (u1, v1, u2, v2) atlas normalized coordinates
in vec3 a_textColor;   // (r, g, b) normalized [0..1]

uniform vec2 u_canvasSize;

out vec2 v_uv;
out vec3 v_textColor;

void main() {
    vec2 px = mix(a_glyphBounds.xy, a_glyphBounds.xy + a_glyphBounds.zw, a_position);
    vec2 clipSpace = (px / u_canvasSize) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);

    v_uv = mix(a_uvBounds.xy, a_uvBounds.zw, a_position);
    v_textColor = a_textColor;
}
`;

const TEXT_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec3 v_textColor;

uniform sampler2D u_fontAtlas;

out vec4 fragColor;

void main() {
    float alpha = texture(u_fontAtlas, v_uv).r;
    if (alpha < 0.1) discard;
    fragColor = vec4(v_textColor, alpha);
}
`;

interface GlyphInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}

export default class SelectedTradeRenderer {
  private state!: StateData;
  private chart!: ChartController;
  private gl: WebGL2RenderingContext | null = null;

  // WebGL Resources
  private rectProgram: WebGLProgram | null = null;
  private rectVao: WebGLVertexArrayObject | null = null;
  private rectQuadBuffer: WebGLBuffer | null = null;
  private rectInstanceBuffer: WebGLBuffer | null = null;

  private textProgram: WebGLProgram | null = null;
  private textVao: WebGLVertexArrayObject | null = null;
  private textQuadBuffer: WebGLBuffer | null = null;
  private textInstanceBuffer: WebGLBuffer | null = null;

  private fontTexture: WebGLTexture | null = null;
  private fontMap: Map<number, GlyphInfo> = new Map();
  private atlasWidth = 512;
  private atlasHeight = 512;

  // Cache Data
  private selectedTrade: Trade | null = null;
  private style: TradeStyle | null = null;
  private rectInstanceData: Float32Array = new Float32Array(0);
  private textInstanceData: Float32Array = new Float32Array(0);
  private rectCount = 0;
  private textCount = 0;

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;
  }

  public setGl(gl: WebGL2RenderingContext): void {
    if (this.gl === gl) return;
    this.destroy();
    this.gl = gl;

    this.initShaders();
    this.loadFontAtlas();
  }

  public destroy(): void {
    if (!this.gl) return;

    if (this.rectVao) this.gl.deleteVertexArray(this.rectVao);
    if (this.rectQuadBuffer) this.gl.deleteBuffer(this.rectQuadBuffer);
    if (this.rectInstanceBuffer) this.gl.deleteBuffer(this.rectInstanceBuffer);
    if (this.rectProgram) this.gl.deleteProgram(this.rectProgram);

    if (this.textVao) this.gl.deleteVertexArray(this.textVao);
    if (this.textQuadBuffer) this.gl.deleteBuffer(this.textQuadBuffer);
    if (this.textInstanceBuffer) this.gl.deleteBuffer(this.textInstanceBuffer);
    if (this.textProgram) this.gl.deleteProgram(this.textProgram);

    if (this.fontTexture) this.gl.deleteTexture(this.fontTexture);

    this.gl = null;
  }

  public updateData(): void {
    const tradeSource = (this.state as any).source?.trade || (this.state as any).trade;
    this.selectedTrade = tradeSource?.selected?.get() ?? null;
    this.rebuildBuffers();
  }

  public updateStyle(): void {
    const tradeSource = (this.state as any).source?.trade || (this.state as any).trade;
    this.style = tradeSource?.style?.get() ?? null;
    this.rebuildBuffers();
  }

  public updateTransform(): void {
    this.rebuildBuffers();
  }

  public render(): void {
    if (!this.gl || !this.selectedTrade) return;

    const gl = this.gl;
    const canvasSize = this.chart.event.getCanvasSize();
    if (canvasSize.w <= 0 || canvasSize.h <= 0) return;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 1. Draw Rectangles (Profit & Loss Regions)
    if (this.rectCount > 0 && this.rectProgram && this.rectVao) {
      gl.useProgram(this.rectProgram);
      gl.bindVertexArray(this.rectVao);

      const uCanvas = gl.getUniformLocation(this.rectProgram, "u_canvasSize");
      gl.uniform2f(uCanvas, canvasSize.w, canvasSize.h);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.rectInstanceData, gl.DYNAMIC_DRAW);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.rectCount);
      gl.bindVertexArray(null);
    }

    // 2. Draw RRR Text
    if (this.textCount > 0 && this.textProgram && this.textVao && this.fontTexture) {
      gl.useProgram(this.textProgram);
      gl.bindVertexArray(this.textVao);

      const uCanvas = gl.getUniformLocation(this.textProgram, "u_canvasSize");
      gl.uniform2f(uCanvas, canvasSize.w, canvasSize.h);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
      gl.uniform1i(gl.getUniformLocation(this.textProgram, "u_fontAtlas"), 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.textInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.textInstanceData, gl.DYNAMIC_DRAW);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.textCount);
      gl.bindVertexArray(null);
    }
  }

  private rebuildBuffers(): void {
    if (!this.selectedTrade || !this.style) {
      this.rectCount = 0;
      this.textCount = 0;
      return;
    }

    const trade = this.selectedTrade;
    const { openTimestamp, closeTimestamp, openPrice, closePrice, stopLossPrice, takeProfitPrice } = trade.data;

    // Convert chart values to pixel coordinates via chart API
    const x1 = (this.chart as any).timeToPx?.(openTimestamp) ?? 0;
    const x2 = (this.chart as any).timeToPx?.(closeTimestamp) ?? 0;
    const yOpen = (this.chart as any).priceToPx?.(openPrice) ?? 0;
    const yClose = (this.chart as any).priceToPx?.(closePrice) ?? 0;
    const ySL = (this.chart as any).priceToPx?.(stopLossPrice) ?? yOpen;
    const yTP = (this.chart as any).priceToPx?.(takeProfitPrice) ?? yClose;

    // Build Rectangles
    const rects: number[] = [];
    const profitStyle = this.style.profit;
    const lossStyle = this.style.loss;

    // Profit Box
    const pBg = profitStyle.background.map((v) => v / 255);
    const pBdr = profitStyle.border.map((v) => v / 255);
    const topY = Math.min(yOpen, yTP);
    const botY = Math.max(yOpen, yTP);
    rects.push(x1, topY, x2, botY, ...pBg, ...pBdr);

    // Loss Box
    const lBg = lossStyle.background.map((v) => v / 255);
    const lBdr = lossStyle.border.map((v) => v / 255);
    const slTopY = Math.min(yOpen, ySL);
    const slBotY = Math.max(yOpen, ySL);
    rects.push(x1, slTopY, x2, slBotY, ...lBg, ...lBdr);

    this.rectCount = 2;
    this.rectInstanceData = new Float32Array(rects);

    // Compute RRR
    let rrrText: string | null = null;
    if (openPrice != null && closePrice != null && stopLossPrice != null) {
      if (trade.type === "long" && openPrice !== stopLossPrice) {
        rrrText = `RRR: ${((closePrice - openPrice) / (openPrice - stopLossPrice)).toFixed(2)}`;
      } else if (trade.type === "short" && stopLossPrice !== openPrice) {
        rrrText = `RRR: ${((openPrice - closePrice) / (stopLossPrice - openPrice)).toFixed(2)}`;
      }
    }

    // Build Text Quads
    const glyphs: number[] = [];
    if (rrrText && this.style.rrr) {
      const isProfit = trade.type === "long" ? closePrice >= openPrice : openPrice >= closePrice;
      const fontColor = (isProfit ? profitStyle.font : lossStyle.font).map((v) => v / 255);

      const alignX = this.style.rrr.alignX;
      const alignY = this.style.rrr.alignY;
      const fontSize = this.style.rrr.size || 12;
      const scale = fontSize / 32; // Font atlas baseline size ~32px

      let cursorX = alignX === "right" ? x2 - 80 : x1 + 5;
      let cursorY = alignY === "bottom" ? botY - 15 : topY + 15;

      for (let i = 0; i < rrrText.length; i++) {
        const code = rrrText.charCodeAt(i);
        const glyph = this.fontMap.get(code);
        if (!glyph) continue;

        const gx = cursorX + glyph.xoffset * scale;
        const gy = cursorY + glyph.yoffset * scale;
        const gw = glyph.width * scale;
        const gh = glyph.height * scale;

        const u1 = glyph.x / this.atlasWidth;
        const v1 = glyph.y / this.atlasHeight;
        const u2 = (glyph.x + glyph.width) / this.atlasWidth;
        const v2 = (glyph.y + glyph.height) / this.atlasHeight;

        glyphs.push(gx, gy, gw, gh, u1, v1, u2, v2, ...fontColor);
        cursorX += glyph.xadvance * scale;
      }
    }

    this.textCount = glyphs.length / 11;
    this.textInstanceData = new Float32Array(glyphs);
  }

  private initShaders(): void {
    if (!this.gl) return;
    const gl = this.gl;

    // Setup Rect Pipeline
    this.rectProgram = this.createProgram(RECT_VS, RECT_FS);
    if (this.rectProgram) {
      this.rectVao = gl.createVertexArray();
      gl.bindVertexArray(this.rectVao);

      this.rectQuadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectQuadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(this.rectProgram, "a_position");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.rectInstanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectInstanceBuffer);

      const stride = 12 * 4;
      const aBounds = gl.getAttribLocation(this.rectProgram, "a_rectBounds");
      const aBg = gl.getAttribLocation(this.rectProgram, "a_bgColor");
      const aBdr = gl.getAttribLocation(this.rectProgram, "a_borderColor");

      gl.enableVertexAttribArray(aBounds);
      gl.vertexAttribPointer(aBounds, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(aBounds, 1);

      gl.enableVertexAttribArray(aBg);
      gl.vertexAttribPointer(aBg, 4, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(aBg, 1);

      gl.enableVertexAttribArray(aBdr);
      gl.vertexAttribPointer(aBdr, 4, gl.FLOAT, false, stride, 32);
      gl.vertexAttribDivisor(aBdr, 1);

      gl.bindVertexArray(null);
    }

    // Setup Text Pipeline
    this.textProgram = this.createProgram(TEXT_VS, TEXT_FS);
    if (this.textProgram) {
      this.textVao = gl.createVertexArray();
      gl.bindVertexArray(this.textVao);

      this.textQuadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textQuadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(this.textProgram, "a_position");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.textInstanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textInstanceBuffer);

      const stride = 11 * 4;
      const aGBounds = gl.getAttribLocation(this.textProgram, "a_glyphBounds");
      const aUBounds = gl.getAttribLocation(this.textProgram, "a_uvBounds");
      const aColor = gl.getAttribLocation(this.textProgram, "a_textColor");

      gl.enableVertexAttribArray(aGBounds);
      gl.vertexAttribPointer(aGBounds, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(aGBounds, 1);

      gl.enableVertexAttribArray(aUBounds);
      gl.vertexAttribPointer(aUBounds, 4, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(aUBounds, 1);

      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 32);
      gl.vertexAttribDivisor(aColor, 1);

      gl.bindVertexArray(null);
    }
  }

  private async loadFontAtlas(): Promise<void> {
    if (!this.gl) return;
    const gl = this.gl;

    try {
      const res = await fetch("/fonts/Roboto.fnt");
      const text = await res.text();
      this.parseFnt(text);

      const img = new Image();
      img.src = "/fonts/Roboto/Roboto_0.png";
      await img.decode();

      this.atlasWidth = img.width;
      this.atlasHeight = img.height;

      this.fontTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } catch (e) {
      console.error("Failed loading font atlas:", e);
    }
  }

  private parseFnt(fntText: string): void {
    const lines = fntText.split("\n");
    for (const line of lines) {
      if (!line.startsWith("char ")) continue;
      const matches = [...line.matchAll(/(\w+)=(-?\d+)/g)];
      const data: Record<string, number> = {};
      for (const m of matches) {
        data[m[1]] = parseInt(m[2], 10);
      }
      if (data.id !== undefined) {
        this.fontMap.set(data.id, {
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          xoffset: data.xoffset,
          yoffset: data.yoffset,
          xadvance: data.xadvance,
        });
      }
    }
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
    if (!this.gl) return null;
    const gl = this.gl;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }
}