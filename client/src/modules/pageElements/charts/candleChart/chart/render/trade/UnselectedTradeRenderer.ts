import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { Trade } from "../../../../../../data/chartData/trade/TradeData";
import type { TradeStyle } from "../../../../../../data/chartData/trade/style/TradeStyleData";
import { createProgram } from "../common/glProgram";
import { getFontAtlas, type GlyphInfo } from "../common/FontAtlas";

const RECT_VS = `#version 300 es
precision highp float;

in vec2 a_position;

in vec4 a_rectBounds;
in vec4 a_bgColor;
in vec4 a_borderColor;

uniform vec2 u_canvasSize;
uniform vec4 u_transform; // [scaleX, offsetX, scaleY, offsetY]

out vec4 v_bgColor;
out vec4 v_borderColor;
out vec2 v_localPx;
out vec2 v_rectSize;

void main() {
    vec2 minPx = a_rectBounds.xy;
    vec2 maxPx = a_rectBounds.zw;

    vec2 transformedMin = minPx * u_transform.xz + u_transform.yw;
    vec2 transformedMax = maxPx * u_transform.xz + u_transform.yw;

    vec2 pos = mix(transformedMin, transformedMax, a_position);
    vec2 clipSpace = (pos / u_canvasSize) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);

    v_bgColor = a_bgColor;
    v_borderColor = a_borderColor;

    v_rectSize = abs(transformedMax - transformedMin);
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
    float border = 1.0;
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

in vec2 a_position;
in vec4 a_glyphBounds; // [x, y, w, h]
in vec4 a_uvBounds;
in vec3 a_textColor;

uniform vec2 u_canvasSize;
uniform vec4 u_transform; // [scaleX, offsetX, scaleY, offsetY]

out vec2 v_uv;
out vec3 v_textColor;

void main() {
    vec2 anchorPx = a_glyphBounds.xy * u_transform.xz + u_transform.yw;
    vec2 glyphSize = a_glyphBounds.zw;

    vec2 px = mix(anchorPx, anchorPx + glyphSize, a_position);
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
    float alpha = texture(u_fontAtlas, v_uv).a; // Roboto_0.png: glyphs in alpha, RGB is white
    if (alpha < 0.1) discard;
    fragColor = vec4(v_textColor, alpha);
}
`;

export default class UnselectedTradeRenderer {
  private state!: StateData;
  private chart!: ChartController;
  private gl: WebGL2RenderingContext | null = null;

  private rectProgram: WebGLProgram | null = null;
  private rectVao: WebGLVertexArrayObject | null = null;
  private rectQuadBuffer: WebGLBuffer | null = null;
  private rectInstanceBuffer: WebGLBuffer | null = null;
  private uRectTransformLoc: WebGLUniformLocation | null = null;
  private uRectCanvasLoc: WebGLUniformLocation | null = null;

  private textProgram: WebGLProgram | null = null;
  private textVao: WebGLVertexArrayObject | null = null;
  private textQuadBuffer: WebGLBuffer | null = null;
  private textInstanceBuffer: WebGLBuffer | null = null;
  private uTextTransformLoc: WebGLUniformLocation | null = null;
  private uTextCanvasLoc: WebGLUniformLocation | null = null;

  private fontTexture: WebGLTexture | null = null;
  private fontMap: Map<number, GlyphInfo> = new Map();
  private atlasWidth = 512;
  private atlasHeight = 512;

  private trades: Trade[] = [];
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

    // fontTexture is owned by the shared FontAtlas cache (one per GL context), not this renderer.

    this.gl = null;
  }

  public updateData(): void {
    const tradeSource = (this.state as any).source?.trade || (this.state as any).trade;
    this.trades = tradeSource?.getAll() ?? [];
    this.rebuildBuffers();
  }

  public updateStyle(): void {
    const tradeSource = (this.state as any).source?.trade || (this.state as any).trade;
    this.style = tradeSource?.style?.get() ?? null;
    this.rebuildBuffers();
  }

  /**
   * Pushes the transform matrix & canvas dimension parameters directly to the GPU 
   * without initiating a render pass (draw call).
   */
  public updateTransform(): void {
    if (!this.gl) return;

    const gl = this.gl;
    const transform = this.state.viewport?.getTransform?.() ?? {
      scaleX: 1,
      offsetX: 0,
      scaleY: 1,
      offsetY: 0,
    };
    const canvasSize = this.chart.event.getCanvasSize();

    // 1. Update Rect Program Uniforms on GPU
    if (this.rectProgram) {
      gl.useProgram(this.rectProgram);
      if (this.uRectTransformLoc) {
        gl.uniform4f(this.uRectTransformLoc, transform.scaleX, transform.offsetX, transform.scaleY, transform.offsetY);
      }
      if (this.uRectCanvasLoc && canvasSize.w > 0 && canvasSize.h > 0) {
        gl.uniform2f(this.uRectCanvasLoc, canvasSize.w, canvasSize.h);
      }
    }

    // 2. Update Text Program Uniforms on GPU
    if (this.textProgram) {
      gl.useProgram(this.textProgram);
      if (this.uTextTransformLoc) {
        gl.uniform4f(this.uTextTransformLoc, transform.scaleX, transform.offsetX, transform.scaleY, transform.offsetY);
      }
      if (this.uTextCanvasLoc && canvasSize.w > 0 && canvasSize.h > 0) {
        gl.uniform2f(this.uTextCanvasLoc, canvasSize.w, canvasSize.h);
      }
    }

    gl.useProgram(null);
  }

  /**
   * Executes the draw calls utilizing the cached state & buffers existing on the GPU.
   */
  public render(): void {
    if (!this.gl || this.trades.length === 0) return;

    const gl = this.gl;
    const canvasSize = this.chart.event.getCanvasSize();
    if (canvasSize.w <= 0 || canvasSize.h <= 0) return;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 1. Draw Rectangles Batch
    if (this.rectCount > 0 && this.rectProgram && this.rectVao) {
      gl.useProgram(this.rectProgram);
      gl.bindVertexArray(this.rectVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.rectCount);
      gl.bindVertexArray(null);
    }

    // 2. Draw Text Batch
    if (this.textCount > 0 && this.textProgram && this.textVao && this.fontTexture) {
      gl.useProgram(this.textProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);

      gl.bindVertexArray(this.textVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.textCount);
      gl.bindVertexArray(null);
    }
  }

  private rebuildBuffers(): void {
    if (this.trades.length === 0 || !this.style || !this.chart || !this.state) {
      this.rectCount = 0;
      this.textCount = 0;
      return;
    }

    const rects: number[] = [];
    const glyphs: number[] = [];
    const profitStyle = this.style.profit;
    const lossStyle = this.style.loss;

    const pBg = profitStyle.background.map((v) => v / 255);
    const pBdr = profitStyle.border.map((v) => v / 255);
    const lBg = lossStyle.background.map((v) => v / 255);
    const lBdr = lossStyle.border.map((v) => v / 255);

    for (const trade of this.trades) {
      const { openTimestamp, closeTimestamp, openPrice, closePrice, stopLossPrice, takeProfitPrice } = trade.data;

      const x1      = this.chart.viewport.converter.timestampToPixel?.(openTimestamp) ?? 0;
      const x2      = this.chart.viewport.converter.timestampToPixel?.(closeTimestamp) ?? 0;
      const yOpen   = this.chart.viewport.converter.priceToPixel?.(openPrice) ?? 0;
      const yClose  = this.chart.viewport.converter.priceToPixel?.(closePrice) ?? 0;
      const ySL     = this.chart.viewport.converter.priceToPixel?.(stopLossPrice) ?? yOpen;
      const yTP     = this.chart.viewport.converter.priceToPixel?.(takeProfitPrice) ?? yClose;

      // Profit Box
      const topY = Math.min(yOpen, yTP);
      const botY = Math.max(yOpen, yTP);
      rects.push(x1, topY, x2, botY, ...pBg, ...pBdr);

      // Loss Box
      const slTopY = Math.min(yOpen, ySL);
      const slBotY = Math.max(yOpen, ySL);
      rects.push(x1, slTopY, x2, slBotY, ...lBg, ...lBdr);

      // RRR Text calculation
      let rrrText: string | null = null;
      if (openPrice != null && closePrice != null && stopLossPrice != null) {
        if (trade.type === "long" && openPrice !== stopLossPrice) {
          rrrText = `RRR: ${((closePrice - openPrice) / (openPrice - stopLossPrice)).toFixed(2)}`;
        } else if (trade.type === "short" && stopLossPrice !== openPrice) {
          rrrText = `RRR: ${((openPrice - closePrice) / (stopLossPrice - openPrice)).toFixed(2)}`;
        }
      }

      if (rrrText && this.style.rrr?.alwayShow) {
        const isProfit = trade.type === "long" ? closePrice >= openPrice : openPrice >= closePrice;
        const fontColor = (isProfit ? profitStyle.font : lossStyle.font).map((v) => v / 255);

        const alignX = this.style.rrr.alignX;
        const alignY = this.style.rrr.alignY;
        const fontSize = this.style.rrr.size || 12;
        const scale = fontSize / 32;

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
    }

    this.rectCount = rects.length / 12;
    this.rectInstanceData = new Float32Array(rects);
    this.textCount = glyphs.length / 11;
    this.textInstanceData = new Float32Array(glyphs);

    this.uploadBuffers();
    this.updateTransform();
  }

  private uploadBuffers(): void {
    if (!this.gl) return;
    const gl = this.gl;

    if (this.rectInstanceBuffer && this.rectInstanceData.length > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.rectInstanceData, gl.STATIC_DRAW);
    }

    if (this.textInstanceBuffer && this.textInstanceData.length > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textInstanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.textInstanceData, gl.STATIC_DRAW);
    }
  }

  private initShaders(): void {
    if (!this.gl) return;
    const gl = this.gl;

    this.rectProgram = this.createProgram(RECT_VS, RECT_FS);
    if (this.rectProgram) {
      this.uRectTransformLoc = gl.getUniformLocation(this.rectProgram, "u_transform");
      this.uRectCanvasLoc = gl.getUniformLocation(this.rectProgram, "u_canvasSize");

      this.rectVao = gl.createVertexArray();
      gl.bindVertexArray(this.rectVao);

      this.rectQuadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectQuadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(this.rectProgram, "a_position");
      if (aPos !== -1) {
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      }

      this.rectInstanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectInstanceBuffer);

      const stride = 12 * 4;
      const aBounds = gl.getAttribLocation(this.rectProgram, "a_rectBounds");
      const aBg = gl.getAttribLocation(this.rectProgram, "a_bgColor");
      const aBdr = gl.getAttribLocation(this.rectProgram, "a_borderColor");

      if (aBounds !== -1) {
        gl.enableVertexAttribArray(aBounds);
        gl.vertexAttribPointer(aBounds, 4, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(aBounds, 1);
      }

      if (aBg !== -1) {
        gl.enableVertexAttribArray(aBg);
        gl.vertexAttribPointer(aBg, 4, gl.FLOAT, false, stride, 16);
        gl.vertexAttribDivisor(aBg, 1);
      }

      if (aBdr !== -1) {
        gl.enableVertexAttribArray(aBdr);
        gl.vertexAttribPointer(aBdr, 4, gl.FLOAT, false, stride, 32);
        gl.vertexAttribDivisor(aBdr, 1);
      }

      gl.bindVertexArray(null);
    }

    this.textProgram = this.createProgram(TEXT_VS, TEXT_FS);
    if (this.textProgram) {
      this.uTextTransformLoc = gl.getUniformLocation(this.textProgram, "u_transform");
      this.uTextCanvasLoc = gl.getUniformLocation(this.textProgram, "u_canvasSize");

      this.textVao = gl.createVertexArray();
      gl.bindVertexArray(this.textVao);

      this.textQuadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textQuadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(this.textProgram, "a_position");
      if (aPos !== -1) {
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      }

      this.textInstanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textInstanceBuffer);

      const stride = 11 * 4;
      const aGBounds = gl.getAttribLocation(this.textProgram, "a_glyphBounds");
      const aUBounds = gl.getAttribLocation(this.textProgram, "a_uvBounds");
      const aColor = gl.getAttribLocation(this.textProgram, "a_textColor");

      if (aGBounds !== -1) {
        gl.enableVertexAttribArray(aGBounds);
        gl.vertexAttribPointer(aGBounds, 4, gl.FLOAT, false, stride, 0);
        gl.vertexAttribDivisor(aGBounds, 1);
      }

      if (aUBounds !== -1) {
        gl.enableVertexAttribArray(aUBounds);
        gl.vertexAttribPointer(aUBounds, 4, gl.FLOAT, false, stride, 16);
        gl.vertexAttribDivisor(aUBounds, 1);
      }

      if (aColor !== -1) {
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, stride, 32);
        gl.vertexAttribDivisor(aColor, 1);
      }

      gl.bindVertexArray(null);
    }
  }

  private async loadFontAtlas(): Promise<void> {
    if (!this.gl) return;
    const gl = this.gl;

    try {
      const atlas = await getFontAtlas(gl);
      this.fontTexture = atlas.texture;
      this.fontMap = atlas.glyphs;
      this.atlasWidth = atlas.width;
      this.atlasHeight = atlas.height;

      // Set constant uniform values for font atlas once
      if (this.textProgram) {
        gl.useProgram(this.textProgram);
        gl.uniform1i(gl.getUniformLocation(this.textProgram, "u_fontAtlas"), 0);
        gl.useProgram(null);
      }

      this.rebuildBuffers();
      this.chart?.loop.mark("trade");
    } catch (e) {
      console.error("Failed loading font atlas:", e);
    }
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
    if (!this.gl) return null;
    return createProgram(this.gl, vsSource, fsSource);
  }
}