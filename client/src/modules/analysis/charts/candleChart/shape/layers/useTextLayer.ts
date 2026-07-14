import { useRef } from "react";
import { Application, Container, Geometry, Mesh, Shader, Buffer, BufferUsage, Cache, Assets } from "pixi.js";
import type { Viewport } from "../../chart/viewport/useViewport";
import { CONFIG } from "../../shared/config";

//======================================================================================================
// PUBLIC TYPES
//======================================================================================================
export type Text = {
  text: string;
  timestamp: number;
  price: number;
  color: [number, number, number]; // rgb [0..255, 0..255, 0..255]
  size: number;
  alignX: "left" | "center" | "right";
  alignY: "top" | "center" | "bottom";
  rotation: number; // radians
};

export type TextLayer = {
  init(app: Application, viewport: Viewport): Promise<void>;
  add(text: Text): void;
  flush(): void;
  draw(): void;
  clean(): void;
  destroy(): void;
};

type ContainerLike = Container & { removeChildren: () => ContainerLike[]; };

//======================================================================================================
// CONSTANTS & STRIDE CONFIGURATION
//======================================================================================================
const FLOATS_PER_VERTEX = 9;
const VERTICES_PER_CHAR = 4;
const FLOATS_PER_CHAR = VERTICES_PER_CHAR * FLOATS_PER_VERTEX;
const STRIDE_BYTES = FLOATS_PER_VERTEX * 4;

//======================================================================================================
// SHADER BUILDER
//======================================================================================================
function buildTextShader(viewport: Viewport, texture: any): Shader {
  const tWeights = viewport.getTimestampToPixelWeights();
  const pWeights = viewport.getPriceToPixelWeights();
  const uid = Math.random().toString(36).substring(2, 15);

  return Shader.from({
    gl: {
      vertex: `
        // UID: ${uid}
        precision mediump float;
        attribute vec4 aPositionOffset; 
        attribute vec2 aUV;
        attribute vec3 aColor;

        // Automatically injected by PixiJS Mesh system
        uniform mat3 uProjectionMatrix;
        uniform mat3 uWorldTransformMatrix;

        uniform vec2 uTimestampShaderWeights;
        uniform vec2 uPriceShaderWeights;

        varying vec2 vUV;
        varying vec3 vColor;

        void main(void) {
            vUV = aUV;
            vColor = aColor;

            float baseScreenX = aPositionOffset.x * uTimestampShaderWeights.x + uTimestampShaderWeights.y;
            float baseScreenY = aPositionOffset.y * uPriceShaderWeights.x + uPriceShaderWeights.y;

            float finalScreenX = baseScreenX + aPositionOffset.z;
            float finalScreenY = baseScreenY + aPositionOffset.w;

            // Apply the world transform and standard projection matrix
            vec3 screenPosition = uWorldTransformMatrix * vec3(finalScreenX, finalScreenY, 1.0);
            gl_Position = vec4((uProjectionMatrix * screenPosition).xy, 0.0, 1.0);
        }
      `,
      fragment: `
        precision mediump float;
        varying vec2 vUV;
        varying vec3 vColor;
        uniform sampler2D uTexture;

        void main(void) {
            float alpha = texture2D(uTexture, vUV).a;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(vColor, alpha);
        }
      `
    },
    resources: {
      uTextUniforms: {
        uTimestampShaderWeights: { value: [tWeights.multiplication, tWeights.addition], type: "vec2<f32>" },
        uPriceShaderWeights: { value: [pWeights.multiplication, pWeights.addition], type: "vec2<f32>" },
      },
      uTexture: texture.source || texture
    }
  });
}

//======================================================================================================
// HOOK IMPLEMENTATION
//======================================================================================================
export default function useTextLayer(): TextLayer {
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);

  const layerRef = useRef<ContainerLike | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  const shaderRef = useRef<Shader | null>(null);
  const pixiBufferRef = useRef<Buffer | null>(null);

  const charCountRef = useRef<number>(0);
  const interleavedArrayRef = useRef<Float32Array>(new Float32Array(0));
  const fontDataRef = useRef<any>(null);

  const init = async (app: Application, viewport: Viewport): Promise<void> => {
    appRef.current = app;
    viewportRef.current = viewport;

    if (!layerRef.current) layerRef.current = new Container() as ContainerLike;
    const stage = (app as any).stage;
    if (stage && !stage.children?.includes?.(layerRef.current)) {
      stage.addChild(layerRef.current);
    }

    const result = await Assets.load("/fonts/Roboto/Roboto.fnt");
    fontDataRef.current = result;

    if (!fontDataRef.current) {
      console.error("Available Cache keys:", Object.keys((Cache as any)._cacheMap || {}));
      throw new Error("Roboto bitmap font was not found in PixiJS Cache.");
    }

    const maxChars = CONFIG.TEXT_LAYER?.MAX_TEXTS_CHAR || 100000;
    charCountRef.current = 0;
    interleavedArrayRef.current = new Float32Array(maxChars * FLOATS_PER_CHAR);

    const mockTexture = fontDataRef.current?.pages?.[0]?.texture || (app.renderer as any).whiteTexture;
    shaderRef.current = buildTextShader(viewport, mockTexture);
  };

  const add = (textObj: Text): void => {
    const viewport = viewportRef.current;
    const font = fontDataRef.current;
    if (!viewport || !font) return;

    const str = textObj.text;
    const len = str.length;
    if (len === 0) return;

    if (charCountRef.current + len > (CONFIG.TEXT_LAYER?.MAX_TEXTS_CHAR || 100000)) {
      throw new Error( "Text character layer capability limits exceeded.");
    }

    const tWeights = viewport.getTimestampToPixelWeights();
    const pWeights = viewport.getPriceToPixelWeights();

    const fontScale = textObj.size / font.fontMetrics.fontSize;
    const baseLineHeight = font.lineHeight * fontScale;

    let totalWidth = 0;
    for (let i = 0; i < len; i++) {
      const charData = font.chars[str[i]] || font.chars[" "];
      if (charData) {
        totalWidth += charData.xAdvance * fontScale;
      }
    }

    let offsetX = 0;
    if (textObj.alignX === "center") offsetX = -totalWidth / 2;
    else if (textObj.alignX === "left") offsetX = -totalWidth;

    let offsetY = 0;
    if (textObj.alignY === "center") offsetY = -baseLineHeight / 2;
    else if (textObj.alignY === "top") offsetY = -baseLineHeight;

    const [r, g, b] = textObj.color;
    const rf = r / 255, gf = g / 255, bf = b / 255;

    const arr = interleavedArrayRef.current;
    const baseTimestamp = textObj.timestamp - tWeights.offset;
    const basePrice = textObj.price - pWeights.offset;

    let currentX = offsetX;
    let ptr = charCountRef.current * FLOATS_PER_CHAR;

    const baseTextureSource = font.pages[0]?.texture?.source;
    if (!baseTextureSource) return;
    const atlasWidth = baseTextureSource.width;
    const atlasHeight = baseTextureSource.height;

    // Precalculate rotation values
    const cosR = Math.cos(textObj.rotation);
    const sinR = Math.sin(textObj.rotation);

    for (let i = 0; i < len; i++) {
      const charData = font.chars[str[i]] || font.chars[" "];
      if (!charData || !charData.texture) continue;

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

      // Apply 2D rotation matrix centered on the alignment anchor point (0, 0)
      const rx0 = x0 * cosR - y0 * sinR;
      const ry0 = x0 * sinR + y0 * cosR;

      const rx1 = x1 * cosR - y0 * sinR;
      const ry1 = x1 * sinR + y0 * cosR;

      const rx2 = x1 * cosR - y1 * sinR;
      const ry2 = x1 * sinR + y1 * cosR;

      const rx3 = x0 * cosR - y1 * sinR;
      const ry3 = x0 * sinR + y1 * cosR;

      // Top-Left
      arr[ptr++] = baseTimestamp; arr[ptr++] = basePrice; arr[ptr++] = rx0; arr[ptr++] = ry0;
      arr[ptr++] = u0; arr[ptr++] = v0; arr[ptr++] = rf; arr[ptr++] = gf; arr[ptr++] = bf;

      // Top-Right
      arr[ptr++] = baseTimestamp; arr[ptr++] = basePrice; arr[ptr++] = rx1; arr[ptr++] = ry1;
      arr[ptr++] = u1; arr[ptr++] = v0; arr[ptr++] = rf; arr[ptr++] = gf; arr[ptr++] = bf;

      // Bottom-Right
      arr[ptr++] = baseTimestamp; arr[ptr++] = basePrice; arr[ptr++] = rx2; arr[ptr++] = ry2;
      arr[ptr++] = u1; arr[ptr++] = v1; arr[ptr++] = rf; arr[ptr++] = gf; arr[ptr++] = bf;

      // Bottom-Left
      arr[ptr++] = baseTimestamp; arr[ptr++] = basePrice; arr[ptr++] = rx3; arr[ptr++] = ry3;
      arr[ptr++] = u0; arr[ptr++] = v1; arr[ptr++] = rf; arr[ptr++] = gf; arr[ptr++] = bf;

      currentX += charData.xAdvance * fontScale;
      charCountRef.current++;
    }
  };

  const flush = (): void => {
    if (geometryRef.current) {
      geometryRef.current.destroy();
      geometryRef.current = null;
    }
    if (pixiBufferRef.current) {
      pixiBufferRef.current.destroy();
      pixiBufferRef.current = null;
    }
  };

  const draw = (): void => {
    const app = appRef.current;
    const viewport = viewportRef.current;
    const count = charCountRef.current;

    if (!app || !viewport || count === 0) {
      if (meshRef.current) {
        layerRef.current?.removeChildren();
        meshRef.current.destroy();
        meshRef.current = null;
      }
      if (geometryRef.current) {
        geometryRef.current.destroy();
        geometryRef.current = null;
      }
      return;
    }

    const tWeights = viewport.getTimestampToPixelWeights();
    const pWeights = viewport.getPriceToPixelWeights();

    if (shaderRef.current) {
      const shaderAny = shaderRef.current as any;
      const textUniformsGroup = shaderAny.resources.uTextUniforms;

      if (textUniformsGroup && textUniformsGroup.uniforms) {
        textUniformsGroup.uniforms.uTimestampShaderWeights = [tWeights.multiplication, tWeights.addition];
        textUniformsGroup.uniforms.uPriceShaderWeights = [pWeights.multiplication, pWeights.addition];
      }
      
      if (fontDataRef.current?.pages?.[0]?.texture && !shaderAny.resources.uTexture) {
        shaderAny.resources.uTexture = fontDataRef.current.pages[0].texture.source;
      }
    }

    const activeDataSlice = new Float32Array(interleavedArrayRef.current.buffer, 0, count * FLOATS_PER_CHAR);

    if (!geometryRef.current) {
      pixiBufferRef.current = new Buffer({ 
        data: activeDataSlice, 
        usage: BufferUsage.VERTEX, 
        shrinkToFit: false 
      });

      const indices = new Uint16Array(count * 6);
      for (let i = 0; i < count; i++) {
        const vIdx = i * 4;
        const iIdx = i * 6;
        indices[iIdx + 0] = vIdx + 0;
        indices[iIdx + 1] = vIdx + 1;
        indices[iIdx + 2] = vIdx + 2;
        indices[iIdx + 3] = vIdx + 0;
        indices[iIdx + 4] = vIdx + 2;
        indices[iIdx + 5] = vIdx + 3;
      }

      const geometry = new Geometry({
        attributes: {
          aPositionOffset: { buffer: pixiBufferRef.current, size: 4, stride: STRIDE_BYTES, offset: 0 },
          aUV:             { buffer: pixiBufferRef.current, size: 2, stride: STRIDE_BYTES, offset: 16 },
          aColor:          { buffer: pixiBufferRef.current, size: 3, stride: STRIDE_BYTES, offset: 24 }
        },
        indexBuffer: new Buffer({ data: indices, usage: BufferUsage.INDEX }) 
      });

      geometryRef.current = geometry;

      if (meshRef.current) {
        layerRef.current?.removeChildren();
        meshRef.current.destroy();
      }

      meshRef.current = new Mesh({ 
        geometry, 
        shader: shaderRef.current,
        state: { blend: true, blendMode: 'normal', cullMode: 'none', depthTest: false }
      } as any);
      
      layerRef.current?.addChild(meshRef.current);
    } else {
      if (pixiBufferRef.current) {
        pixiBufferRef.current.data = activeDataSlice;
        pixiBufferRef.current.update(activeDataSlice.byteLength); 
      }
    }
  };

  const clean = (): void => {
    charCountRef.current = 0;
  };

  const destroy = (): void => {
    if (meshRef.current) { meshRef.current.destroy(); meshRef.current = null; }
    if (geometryRef.current) { geometryRef.current.destroy(); geometryRef.current = null; }
    if (shaderRef.current) { shaderRef.current.destroy(); shaderRef.current = null; }
    if (pixiBufferRef.current) { pixiBufferRef.current.destroy(); pixiBufferRef.current = null; }

    if (layerRef.current) {
      const stage = (appRef.current as any)?.stage;
      if (stage?.children?.includes(layerRef.current)) {
        try { stage.removeChild(layerRef.current); } catch {}
      }
      layerRef.current.destroy();
      layerRef.current = null;
    }

    appRef.current = null;
    viewportRef.current = null;
    fontDataRef.current = null;
  };

  const apiRef = useRef<TextLayer | null>(null);
  if (!apiRef.current) {
    apiRef.current = { init, add, flush, draw, clean, destroy };
  }

  return apiRef.current;
}