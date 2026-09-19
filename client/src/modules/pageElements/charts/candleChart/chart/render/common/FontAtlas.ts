export interface GlyphInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}

export interface FontAtlas {
  texture: WebGLTexture;
  width: number;
  height: number;
  glyphs: Map<number, GlyphInfo>;
  baseSize: number;
  lineHeight: number;
}

export interface GlyphQuad {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  u1: number;
  v1: number;
  u2: number;
  v2: number;
}

const FONT_PATH = "/fonts/Roboto/Roboto.fnt";
const ATLAS_PATH = "/fonts/Roboto/Roboto_0.png";

// One load per canvas/context instead of one per renderer.
const cache = new WeakMap<WebGL2RenderingContext, Promise<FontAtlas>>();

/** Loads (and caches per GL context) the shared bitmap font atlas used by trade and shape text. */
export function getFontAtlas(gl: WebGL2RenderingContext): Promise<FontAtlas> {
  let promise = cache.get(gl);
  if (!promise) {
    promise = loadFontAtlas(gl);
    cache.set(gl, promise);
  }
  return promise;
}

async function loadFontAtlas(gl: WebGL2RenderingContext): Promise<FontAtlas> {
  const res = await fetch(FONT_PATH);
  const text = await res.text();
  const { glyphs, baseSize, lineHeight } = parseFnt(text);

  const img = new Image();
  img.src = ATLAS_PATH;
  await img.decode();

  const texture = gl.createTexture();
  if (!texture) throw new Error("getFontAtlas: gl.createTexture failed");

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return { texture, width: img.width, height: img.height, glyphs, baseSize, lineHeight };
}

function parseFnt(fntText: string): { glyphs: Map<number, GlyphInfo>; baseSize: number; lineHeight: number } {
  const glyphs = new Map<number, GlyphInfo>();
  let baseSize = 32;
  let lineHeight = 32;

  const lines = fntText.split("\n");
  for (const line of lines) {
    if (line.startsWith("info ")) {
      const m = /size=(-?\d+)/.exec(line);
      if (m) baseSize = Math.abs(parseInt(m[1], 10));
    } else if (line.startsWith("common ")) {
      const m = /lineHeight=(-?\d+)/.exec(line);
      if (m) lineHeight = parseInt(m[1], 10);
    } else if (line.startsWith("char ")) {
      const matches = [...line.matchAll(/(\w+)=(-?\d+)/g)];
      const data: Record<string, number> = {};
      for (const m of matches) {
        data[m[1]] = parseInt(m[2], 10);
      }
      if (data.id !== undefined) {
        glyphs.set(data.id, {
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

  return { glyphs, baseSize, lineHeight };
}

/** Width in px of `str` rendered at `size`. */
export function measureText(atlas: FontAtlas, str: string, size: number): number {
  const scale = size / atlas.baseSize;
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const glyph = atlas.glyphs.get(str.charCodeAt(i));
    if (!glyph) continue;
    width += glyph.xadvance * scale;
  }
  return width;
}

/** Glyph quads (local offsets from the string's start + UVs) for `str` at `size`. */
export function layoutText(atlas: FontAtlas, str: string, size: number): GlyphQuad[] {
  const scale = size / atlas.baseSize;
  const quads: GlyphQuad[] = [];
  let cursorX = 0;

  for (let i = 0; i < str.length; i++) {
    const glyph = atlas.glyphs.get(str.charCodeAt(i));
    if (!glyph) continue;

    quads.push({
      offsetX: cursorX + glyph.xoffset * scale,
      offsetY: glyph.yoffset * scale,
      width: glyph.width * scale,
      height: glyph.height * scale,
      u1: glyph.x / atlas.width,
      v1: glyph.y / atlas.height,
      u2: (glyph.x + glyph.width) / atlas.width,
      v2: (glyph.y + glyph.height) / atlas.height,
    });

    cursorX += glyph.xadvance * scale;
  }

  return quads;
}
