import { Container, Geometry, Mesh, Shader, Buffer, BufferUsage, Assets } from "pixi.js";
import ChartController from "../../ChartController";
import StateData from "../../../state/StateData";

//======================================================================================================
// PUBLIC TYPES
//======================================================================================================
export interface RGB {
  0: number; // 0..255
  1: number; // 0..255
  2: number; // 0..255
}

export interface Text {
  text: string;
  timestamp: number;
  price: number;
  color: RGB; // [0..255, 0..255, 0..255]
  size: number;
  alignX: "left" | "center" | "right";
  alignY: "top" | "center" | "bottom";
  rotation?: number; // radians (optional)
}

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class ShapeTextRenderer {
  private state: StateData | any = null;
  private chart: ChartController | any = null;

  private container: Container;
  private mesh: Mesh | null = null;
  private geometry: Geometry | null = null;
  private shader: Shader | null = null;

  private fontData: any = null;
  private fontTextureSource: any = null;

  private rebuildGeometry = false;
  private charCapacity = 0;
  private totalCharCount = 0;

  // Separate Attribute Buffers
  private basePositions = new Float32Array(0);  // 4 vertices * 2 floats (basePixelX, basePixelY)
  private cornerOffsets = new Float32Array(0);  // 4 vertices * 2 floats (local rotated pixel offset)
  private uvs           = new Float32Array(0);  // 4 vertices * 2 floats (u, v)
  private colors        = new Float32Array(0);  // 4 vertices * 3 floats (r, g, b)
  private indices       = new Uint32Array(0);   // 6 indices per char quad

  private pixiBuffers: {
    basePos?: Buffer;
    cornerOffset?: Buffer;
    uv?: Buffer;
    color?: Buffer;
    indexBuffer?: Buffer;
  } = {};

  constructor() {
    this.container = new Container();
  }

  public async init(state: StateData, chart: ChartController, fontPath = "/fonts/Roboto/Roboto.fnt"): Promise<void> {
    this.chart = chart;
    this.state = state;

    // Load bitmap font asset
    this.fontData = await Assets.load(fontPath);
    if (!this.fontData) {
      console.error("Bitmap font failed to load from:", fontPath);
      return;
    }

    this.fontTextureSource = this.fontData.pages?.[0]?.texture?.source 
      || this.fontData.pages?.[0]?.texture 
      || (this.chart?.app?.renderer as any)?.whiteTexture;

    this.shader = this.buildShader(this.fontTextureSource);
  }

  public destroy(): void {
    if (this.mesh) {
      this.mesh.destroy();
      this.mesh = null;
    }
    if (this.geometry) {
      this.geometry.destroy();
      this.geometry = null;
    }
    if (this.shader) {
      this.shader.destroy();
      this.shader = null;
    }

    Object.values(this.pixiBuffers).forEach((buf) => buf?.destroy());
    this.pixiBuffers = {};

    this.container.destroy({ children: true });
    this.chart = null;
    this.state = null;
    this.fontData = null;
    this.fontTextureSource = null;
  }

  public addToContainer(parentContainer: Container | any): void {
    if (this.container && parentContainer) {
      parentContainer.addChild(this.container);
    }
  }

  public updateData(texts: Text[] | Text): void {
    if (!this.chart || !this.fontData || !texts) return;

    const textList = Array.isArray(texts) ? texts : [texts];
    if (textList.length === 0) {
      if (this.mesh) this.mesh.visible = false;
      this.totalCharCount = 0;
      return;
    }

    const view = this.state?.config?.get()?.viewport;
    const canvas = this.chart.event?.getCanvasSize();
    if (!view || !canvas || canvas.w <= 0 || canvas.h <= 0) return;

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;
    if (deltaTs === 0 || deltaPrice === 0) return;

    // 1. Calculate total character count
    let totalChars = 0;
    for (let i = 0; i < textList.length; i++) {
      totalChars += textList[i].text ? textList[i].text.length : 0;
    }

    if (totalChars === 0) {
      if (this.mesh) this.mesh.visible = false;
      this.totalCharCount = 0;
      return;
    }

    // 2. Buffer Capacity Allocation / Expansion
    if (totalChars > this.charCapacity) {
      this.charCapacity = totalChars + 500; // Capacity buffer headroom

      this.basePositions = new Float32Array(this.charCapacity * 4 * 2);
      this.cornerOffsets = new Float32Array(this.charCapacity * 4 * 2);
      this.uvs           = new Float32Array(this.charCapacity * 4 * 2);
      this.colors        = new Float32Array(this.charCapacity * 4 * 3);
      this.indices       = new Uint32Array(this.charCapacity * 6);

      this.rebuildGeometry = true;
    }

    this.totalCharCount = totalChars;
    const font = this.fontData;
    const fontScaleBase = font.fontMetrics?.fontSize || 32;
    const atlasWidth = this.fontTextureSource?.width || 1;
    const atlasHeight = this.fontTextureSource?.height || 1;

    let charIdx = 0;

    // 3. Process Text Data -> Attribute Arrays
    for (let i = 0; i < textList.length; i++) {
      const textObj = textList[i];
      const str = textObj.text;
      if (!str || str.length === 0) continue;

      // Calculate Screen Base Position
      const basePixelX = ((textObj.timestamp - view.fromTs) / deltaTs) * canvas.w;
      const basePixelY = canvas.h - ((textObj.price - view.fromPrice) / deltaPrice) * canvas.h;

      const fontScale = textObj.size / fontScaleBase;
      const baseLineHeight = (font.lineHeight || fontScaleBase) * fontScale;

      // Calculate total text width for alignments
      let totalWidth = 0;
      for (let c = 0; c < str.length; c++) {
        const charData = font.chars[str[c]] || font.chars[" "];
        if (charData) totalWidth += charData.xAdvance * fontScale;
      }

      let offsetX = 0;
      if (textObj.alignX === "center") offsetX = -totalWidth / 2;
      else if (textObj.alignX === "right") offsetX = -totalWidth;

      let offsetY = 0;
      if (textObj.alignY === "center") offsetY = -baseLineHeight / 2;
      else if (textObj.alignY === "bottom") offsetY = -baseLineHeight;

      const r = (textObj.color[0] ?? 255) / 255;
      const g = (textObj.color[1] ?? 255) / 255;
      const b = (textObj.color[2] ?? 255) / 255;

      const rotation = textObj.rotation || 0;
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);

      let currentX = offsetX;

      for (let c = 0; c < str.length; c++) {
        const charData = font.chars[str[c]] || font.chars[" "];
        if (!charData || !charData.texture) {
          currentX += (charData?.xAdvance || 10) * fontScale;
          continue;
        }

        const frame = charData.texture.frame;
        const charWidth = frame.width;
        const charHeight = frame.height;

        const x0 = currentX + charData.xOffset * fontScale;
        const y0 = offsetY + charData.yOffset * fontScale;
        const x1 = x0 + charWidth * fontScale;
        const y1 = y0 + charHeight * fontScale;

        const u0 = frame.x / atlasWidth;
        const v0 = frame.y / atlasHeight;
        const u1 = (frame.x + charWidth) / atlasWidth;
        const v1 = (frame.y + charHeight) / atlasHeight;

        // Apply 2D Rotation to corner offsets
        const rx0 = x0 * cosR - y0 * sinR, ry0 = x0 * sinR + y0 * cosR;
        const rx1 = x1 * cosR - y0 * sinR, ry1 = x1 * sinR + y0 * cosR;
        const rx2 = x1 * cosR - y1 * sinR, ry2 = x1 * sinR + y1 * cosR;
        const rx3 = x0 * cosR - y1 * sinR, ry3 = x0 * sinR + y1 * cosR;

        const vOffset2 = charIdx * 8;  // 4 verts * 2 floats
        const vOffset3 = charIdx * 12; // 4 verts * 3 floats
        const iOffset  = charIdx * 6;  // 6 indices
        const vStartIdx = charIdx * 4; // base vertex index

        // Vertex 0: Top-Left
        this.basePositions[vOffset2 + 0] = basePixelX; this.basePositions[vOffset2 + 1] = basePixelY;
        this.cornerOffsets[vOffset2 + 0] = rx0;        this.cornerOffsets[vOffset2 + 1] = ry0;
        this.uvs[vOffset2 + 0]           = u0;         this.uvs[vOffset2 + 1]           = v0;
        this.colors[vOffset3 + 0] = r; this.colors[vOffset3 + 1] = g; this.colors[vOffset3 + 2] = b;

        // Vertex 1: Top-Right
        this.basePositions[vOffset2 + 2] = basePixelX; this.basePositions[vOffset2 + 3] = basePixelY;
        this.cornerOffsets[vOffset2 + 2] = rx1;        this.cornerOffsets[vOffset2 + 3] = ry1;
        this.uvs[vOffset2 + 2]           = u1;         this.uvs[vOffset2 + 3]           = v0;
        this.colors[vOffset3 + 3] = r; this.colors[vOffset3 + 4] = g; this.colors[vOffset3 + 5] = b;

        // Vertex 2: Bottom-Right
        this.basePositions[vOffset2 + 4] = basePixelX; this.basePositions[vOffset2 + 5] = basePixelY;
        this.cornerOffsets[vOffset2 + 4] = rx2;        this.cornerOffsets[vOffset2 + 5] = ry2;
        this.uvs[vOffset2 + 4]           = u1;         this.uvs[vOffset2 + 5]           = v1;
        this.colors[vOffset3 + 6] = r; this.colors[vOffset3 + 7] = g; this.colors[vOffset3 + 8] = b;

        // Vertex 3: Bottom-Left
        this.basePositions[vOffset2 + 6] = basePixelX; this.basePositions[vOffset2 + 7] = basePixelY;
        this.cornerOffsets[vOffset2 + 6] = rx3;        this.cornerOffsets[vOffset2 + 7] = ry3;
        this.uvs[vOffset2 + 6]           = u0;         this.uvs[vOffset2 + 7]           = v1;
        this.colors[vOffset3 + 9] = r; this.colors[vOffset3 + 10] = g; this.colors[vOffset3 + 11] = b;

        // Quad Indexing (2 Triangles per character)
        this.indices[iOffset + 0] = vStartIdx + 0;
        this.indices[iOffset + 1] = vStartIdx + 1;
        this.indices[iOffset + 2] = vStartIdx + 2;
        this.indices[iOffset + 3] = vStartIdx + 0;
        this.indices[iOffset + 4] = vStartIdx + 2;
        this.indices[iOffset + 5] = vStartIdx + 3;

        currentX += charData.xAdvance * fontScale;
        charIdx++;
      }
    }

    // 4. Update GPU Geometry and Buffers
    this.updateGpuBuffers();
    this.updateTransform();
  }

  public updateTransform(): void {
    if (!this.chart || !this.shader || this.totalCharCount === 0) return;

    const view = this.state?.config?.get()?.viewport;
    const transform = this.state?.viewport?.getTransform();
    const canvas = this.chart.event?.getCanvasSize();

    if (!view || !transform || !canvas || canvas.w <= 0 || canvas.h <= 0) return;

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;
    if (deltaTs === 0 || deltaPrice === 0) return;

    // Calculate Pixel Transform Weights [Mx, Ax, My, Ay]
    const Mx = 1 / transform.scaleX;
    const Ax = ((view.fromTs * (1 - transform.scaleX) - transform.offsetX) / (deltaTs * transform.scaleX)) * canvas.w;

    const My = 1 / transform.scaleY;
    const Ay = canvas.h * (1 - My) - ((view.fromPrice * (1 - transform.scaleY) - transform.offsetY) / (deltaPrice * transform.scaleY)) * canvas.h;

    const shaderAny = this.shader as any;
    const uniforms = shaderAny.resources?.uTextUniforms?.uniforms;
    if (uniforms) {
      uniforms.uPixelWeights = [Mx, Ax, My, Ay];
    }

    this.render();
  }

  public render(): void {
    // PixiJS render lifecycle trigger endpoint
  }

  //======================================================================================================
  // PRIVATE HELPER METHODS
  //======================================================================================================
  private updateGpuBuffers(): void {
    if (!this.shader) return;

    const count = this.totalCharCount;
    const basePosSlice = this.basePositions.subarray(0, count * 8);
    const cornerOffsetSlice = this.cornerOffsets.subarray(0, count * 8);
    const uvSlice = this.uvs.subarray(0, count * 8);
    const colorSlice = this.colors.subarray(0, count * 12);
    const indexSlice = this.indices.subarray(0, count * 6);

    if (this.rebuildGeometry || !this.geometry) {
      if (this.geometry) this.geometry.destroy();
      Object.values(this.pixiBuffers).forEach((b) => b?.destroy());

      this.pixiBuffers.basePos = new Buffer({ data: basePosSlice, usage: BufferUsage.VERTEX });
      this.pixiBuffers.cornerOffset = new Buffer({ data: cornerOffsetSlice, usage: BufferUsage.VERTEX });
      this.pixiBuffers.uv = new Buffer({ data: uvSlice, usage: BufferUsage.VERTEX });
      this.pixiBuffers.color = new Buffer({ data: colorSlice, usage: BufferUsage.VERTEX });
      this.pixiBuffers.indexBuffer = new Buffer({ data: indexSlice, usage: BufferUsage.INDEX });

      this.geometry = new Geometry({
        attributes: {
          aBasePos: { buffer: this.pixiBuffers.basePos, size: 2 },
          aCornerOffset: { buffer: this.pixiBuffers.cornerOffset, size: 2 },
          aUV: { buffer: this.pixiBuffers.uv, size: 2 },
          aColor: { buffer: this.pixiBuffers.color, size: 3 },
        },
        indexBuffer: this.pixiBuffers.indexBuffer,
      });

      if (this.mesh) {
        this.container.removeChild(this.mesh);
        this.mesh.destroy();
      }

      this.mesh = new Mesh({
        geometry: this.geometry,
        shader: this.shader,
        state: { blend: true, blendMode: "normal", cullMode: "none", depthTest: false },
      } as any);

      this.container.addChild(this.mesh);
      this.rebuildGeometry = false;
    } else {
    if (this.pixiBuffers.basePos) {
        this.pixiBuffers.basePos.data = basePosSlice;
        this.pixiBuffers.basePos.update();
    }
    if (this.pixiBuffers.cornerOffset) {
        this.pixiBuffers.cornerOffset.data = cornerOffsetSlice;
        this.pixiBuffers.cornerOffset.update();
    }
    if (this.pixiBuffers.uv) {
        this.pixiBuffers.uv.data = uvSlice;
        this.pixiBuffers.uv.update();
    }
    if (this.pixiBuffers.color) {
        this.pixiBuffers.color.data = colorSlice;
        this.pixiBuffers.color.update();
    }
    if (this.pixiBuffers.indexBuffer) {
        this.pixiBuffers.indexBuffer.data = indexSlice;
        this.pixiBuffers.indexBuffer.update();
    }
    }

    if (this.mesh) this.mesh.visible = true;
  }

  private buildShader(textureSource: any): Shader {
    const uTextUniforms = {
      uProjectionMatrix: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), type: "mat3x3<f32>" },
      uPixelWeights: { value: new Float32Array([1, 0, 1, 0]), type: "vec4<f32>" }, // [Mx, Ax, My, Ay]
    };

    const vertexSrc = `
precision mediump float;

attribute vec2 aBasePos;
attribute vec2 aCornerOffset;
attribute vec2 aUV;
attribute vec3 aColor;

uniform mat3 uProjectionMatrix;
uniform vec4 uPixelWeights;

varying vec2 vUV;
varying vec3 vColor;

void main(void) {
  vUV = aUV;
  vColor = aColor;

  float Mx = uPixelWeights.x;
  float Ax = uPixelWeights.y;
  float My = uPixelWeights.z;
  float Ay = uPixelWeights.w;

  // Transform base timestamp/price pixel coordinate
  vec2 transformedBasePos = vec2(aBasePos.x * Mx + Ax, aBasePos.y * My + Ay);

  // Apply static screen-space character offset
  vec2 finalScreenPos = transformedBasePos + aCornerOffset;

  vec3 projected = uProjectionMatrix * vec3(finalScreenPos, 1.0);
  gl_Position = vec4(projected.xy, 0.0, 1.0);
}
`;

    const fragmentSrc = `
precision mediump float;

varying vec2 vUV;
varying vec3 vColor;
uniform sampler2D uTexture;

void main(void) {
  float alpha = texture2D(uTexture, vUV).a;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

    return Shader.from({
      gl: {
        vertex: vertexSrc,
        fragment: fragmentSrc,
      },
      resources: {
        uTextUniforms,
        uTexture: textureSource,
      },
    });
  }
}