import type { RGBA } from "../../../../../../shared/type";
import type { FontAtlas } from "../common/FontAtlas";
import { layoutText, measureText } from "../common/FontAtlas";
import type { TypedShape, ShapePoint } from "../../../state/source/shape/shapeType";
import type ViewportConverter from "../../viewport/ViewportConverter";

export interface LineInstance {
  p0: { x: number; y: number }; // base px (pre-transform)
  p1: { x: number; y: number };
  extendBack: boolean;
  extendForward: boolean;
  color: RGBA;
  thickness: number;
  lineType: 0 | 1 | 2; // solid, dash, dot
}

export interface RectFillInstance {
  min: { x: number; y: number }; // base px
  max: { x: number; y: number };
  color: RGBA;
}

/** Screen-space glyph quad: origin + right/down edge vectors (rotation baked in), ready for the GPU. */
export interface TextGlyphInstance {
  origin: { x: number; y: number };
  right: { x: number; y: number };
  down: { x: number; y: number };
  uv: { u1: number; v1: number; u2: number; v2: number };
  color: RGBA;
}

export type HandleKind = "point" | "edge";

export interface ShapeHandle {
  index: number;
  x: number; // screen px
  y: number;
  kind: HandleKind;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TEXT_PADDING = 6; // px between a line/rect and its label

function toBase(converter: ViewportConverter, p: ShapePoint): { x: number; y: number } {
  const base = converter.worldToBase(p.ts, p.price);
  return base ?? { x: 0, y: 0 };
}

function toScreen(converter: ViewportConverter, p: ShapePoint): { x: number; y: number } {
  const screen = converter.worldToScreen(p.ts, p.price);
  return screen ?? { x: 0, y: 0 };
}

//======================================================================================================
// LINES (base px, GPU-transformed)
//======================================================================================================

const LINE_TYPE_MAP: Record<string, 0 | 1 | 2> = { solid: 0, dash: 1, dot: 2 };

export function shapeLines(shape: TypedShape, converter: ViewportConverter): LineInstance[] {
  const style = shape.style.line;
  if (!style) return [];

  const color = style.color;
  const thickness = style.thickness;
  const lineType = LINE_TYPE_MAP[style.type] ?? 0;
  const points = shape.data.points;

  const mkLine = (
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    extendBack: boolean,
    extendForward: boolean
  ): LineInstance => ({ p0, p1, extendBack, extendForward, color, thickness, lineType });

  switch (shape.type) {
    case "trendLine":
    case "hSegment":
    case "vSegment": {
      const p0 = toBase(converter, points[0]);
      const p1 = toBase(converter, points[1]);
      return [mkLine(p0, p1, false, false)];
    }
    case "hLine": {
      const p0 = toBase(converter, points[0]);
      const p1 = toBase(converter, { ts: points[0].ts + ONE_DAY_MS, price: points[0].price });
      return [mkLine(p0, p1, true, true)];
    }
    case "hRay": {
      const p0 = toBase(converter, points[0]);
      const p1 = toBase(converter, { ts: points[0].ts + ONE_DAY_MS, price: points[0].price });
      return [mkLine(p0, p1, false, true)];
    }
    case "vLine": {
      const p0 = toBase(converter, points[0]);
      const p1 = toBase(converter, { ts: points[0].ts, price: points[0].price + 1 });
      return [mkLine(p0, p1, true, true)];
    }
    case "rectangle": {
      const a = toBase(converter, points[0]);
      const b = toBase(converter, points[1]);
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
      const tl = { x: minX, y: minY }, tr = { x: maxX, y: minY };
      const br = { x: maxX, y: maxY }, bl = { x: minX, y: maxY };
      return [
        mkLine(tl, tr, false, false),
        mkLine(tr, br, false, false),
        mkLine(br, bl, false, false),
        mkLine(bl, tl, false, false),
      ];
    }
    default:
      return [];
  }
}

//======================================================================================================
// RECTANGLE FILL (base px, GPU-transformed)
//======================================================================================================

export function shapeRectFill(shape: TypedShape, converter: ViewportConverter): RectFillInstance | null {
  if (shape.type !== "rectangle" || !shape.style.fill) return null;

  const points = shape.data.points;
  const a = toBase(converter, points[0]);
  const b = toBase(converter, points[1]);

  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    color: shape.style.fill.color,
  };
}

//======================================================================================================
// TEXT (screen px, CPU-computed — rebuilt on data/style/transform change)
//
// ponytail: the plan's shader-side anchor+ratio+screenLock system would avoid rebuilding glyph quads
// on every pan/zoom. Building screen-space quads on the CPU instead is far less code and shape counts
// are small, so the per-transform rebuild cost is negligible. Upgrade to the shader-side system only if
// profiling shows many-hundreds of shapes with text making this a bottleneck.
//======================================================================================================

function buildGlyphRow(
  atlas: FontAtlas,
  text: string,
  size: number,
  color: RGBA,
  startX: number,
  startY: number,
  rotated: boolean
): TextGlyphInstance[] {
  const quads = layoutText(atlas, text, size);
  const glyphs: TextGlyphInstance[] = [];

  for (const q of quads) {
    // Unrotated: origin at (startX + offsetX, startY + offsetY), right=(w,0), down=(0,h).
    // Rotated -90 (reads bottom-to-top): local +x (width) maps to screen -y, local +y (height) maps to screen +x.
    const origin = rotated
      ? { x: startX + q.offsetY, y: startY - q.offsetX }
      : { x: startX + q.offsetX, y: startY + q.offsetY };
    const right = rotated ? { x: 0, y: -q.width } : { x: q.width, y: 0 };
    const down = rotated ? { x: q.height, y: 0 } : { x: 0, y: q.height };

    glyphs.push({ origin, right, down, uv: { u1: q.u1, v1: q.v1, u2: q.u2, v2: q.v2 }, color });
  }

  return glyphs;
}

function ratioOf(align: "start" | "center" | "end"): number {
  return align === "start" ? 0 : align === "end" ? 1 : 0.5;
}

export function shapeTextGlyphs(
  shape: TypedShape,
  atlas: FontAtlas,
  converter: ViewportConverter,
  canvasSize: { w: number; h: number }
): TextGlyphInstance[] {
  const textStyle = shape.style.text;
  const text = shape.data.text;
  if (!textStyle || !text) return [];

  const { color, size } = textStyle;
  const width = measureText(atlas, text, size);
  const height = size;

  switch (shape.type) {
    case "text": {
      const p = toScreen(converter, shape.data.points[0]);
      // Text shape: label centered on its anchor.
      return buildGlyphRow(atlas, text, size, color, p.x - width / 2, p.y - height / 2, false);
    }
    case "hSegment": {
      const p0 = toScreen(converter, shape.data.points[0]);
      const p1 = toScreen(converter, shape.data.points[1]);
      const left = p0.x <= p1.x ? p0 : p1;
      const right = p0.x <= p1.x ? p1 : p0;
      const anchorX = left.x + (right.x - left.x) * ratioOf(textStyle.alignX);
      const lineY = left.y + (right.y - left.y) * ratioOf(textStyle.alignX);
      const startX = anchorX - width * ratioOf(textStyle.alignX);
      const startY = yFromAlignY(textStyle.alignY, lineY, height);
      return buildGlyphRow(atlas, text, size, color, startX, startY, false);
    }
    case "hLine":
    case "hRay": {
      const p0 = toScreen(converter, shape.data.points[0]);
      let anchorX: number;
      if (shape.type === "hLine") {
        anchorX = textStyle.alignX === "start"
          ? TEXT_PADDING
          : textStyle.alignX === "end"
            ? canvasSize.w - TEXT_PADDING
            : canvasSize.w / 2;
      } else {
        const screenMid = canvasSize.w / 2;
        const screenRight = canvasSize.w - TEXT_PADDING;
        anchorX = textStyle.alignX === "start"
          ? p0.x + TEXT_PADDING
          : Math.max(p0.x, textStyle.alignX === "end" ? screenRight : screenMid);
      }
      const startX = anchorX - width * ratioOf(textStyle.alignX);
      const startY = yFromAlignY(textStyle.alignY, p0.y, height);
      return buildGlyphRow(atlas, text, size, color, startX, startY, false);
    }
    case "vSegment":
    case "vLine": {
      let top: { x: number; y: number };
      let bottom: { x: number; y: number };
      if (shape.type === "vSegment") {
        const a = toScreen(converter, shape.data.points[0]);
        const b = toScreen(converter, shape.data.points[1]);
        top = a.y <= b.y ? a : b;
        bottom = a.y <= b.y ? b : a;
      } else {
        const p0 = toScreen(converter, shape.data.points[0]);
        top = { x: p0.x, y: 0 };
        bottom = { x: p0.x, y: canvasSize.h };
      }
      // alignX (start/center/end) => position along the line, bottom -> mid -> top
      const alongRatio = ratioOf(textStyle.alignX);
      const anchorY = bottom.y + (top.y - bottom.y) * alongRatio;
      const lineX = bottom.x + (top.x - bottom.x) * alongRatio;
      // alignY (above/on/below) => perpendicular offset, mapped to left/on/right of the line
      const perpOffset = textStyle.alignY === "above" ? -(width + TEXT_PADDING) : textStyle.alignY === "below" ? TEXT_PADDING : -width / 2;
      const startX = lineX + perpOffset;
      const startY = anchorY + width * alongRatio;
      return buildGlyphRow(atlas, text, size, color, startX, startY, true);
    }
    case "rectangle": {
      const a = toScreen(converter, shape.data.points[0]);
      const b = toScreen(converter, shape.data.points[1]);
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
      // alignX reused as left/center/right, alignY reused as top/middle/bottom
      const rx = ratioOf(textStyle.alignX);
      const ry = textStyle.alignY === "above" ? 0 : textStyle.alignY === "below" ? 1 : 0.5;
      const anchorX = minX + (maxX - minX) * rx;
      const anchorY = minY + (maxY - minY) * ry;
      const startX = anchorX - width * rx + (rx === 0 ? TEXT_PADDING : rx === 1 ? -TEXT_PADDING : 0);
      const startY = anchorY - height * ry + (ry === 0 ? TEXT_PADDING : ry === 1 ? -TEXT_PADDING : 0);
      return buildGlyphRow(atlas, text, size, color, startX, startY, false);
    }
    default:
      return [];
  }
}

function yFromAlignY(alignY: "above" | "on" | "below", lineY: number, textHeight: number): number {
  if (alignY === "above") return lineY - textHeight - TEXT_PADDING;
  if (alignY === "below") return lineY + TEXT_PADDING;
  return lineY - textHeight / 2;
}

//======================================================================================================
// SCREEN-SPACE SEGMENTS — for hit-testing only (clipped to the canvas instead of GPU-extended).
//======================================================================================================

export interface ScreenSegment {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
}

export function shapeScreenSegments(
  shape: TypedShape,
  converter: ViewportConverter,
  canvasSize: { w: number; h: number }
): ScreenSegment[] {
  const points = shape.data.points;

  switch (shape.type) {
    case "trendLine":
    case "hSegment":
    case "vSegment":
      return [{ p0: toScreen(converter, points[0]), p1: toScreen(converter, points[1]) }];
    case "hLine": {
      const p0 = toScreen(converter, points[0]);
      return [{ p0: { x: 0, y: p0.y }, p1: { x: canvasSize.w, y: p0.y } }];
    }
    case "hRay": {
      const p0 = toScreen(converter, points[0]);
      return [{ p0, p1: { x: canvasSize.w, y: p0.y } }];
    }
    case "vLine": {
      const p0 = toScreen(converter, points[0]);
      return [{ p0: { x: p0.x, y: 0 }, p1: { x: p0.x, y: canvasSize.h } }];
    }
    case "rectangle": {
      const a = toScreen(converter, points[0]);
      const b = toScreen(converter, points[1]);
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
      const tl = { x: minX, y: minY }, tr = { x: maxX, y: minY };
      const br = { x: maxX, y: maxY }, bl = { x: minX, y: maxY };
      return [
        { p0: tl, p1: tr },
        { p0: tr, p1: br },
        { p0: br, p1: bl },
        { p0: bl, p1: tl },
      ];
    }
    default:
      return [];
  }
}

/** Axis-aligned bounding box (screen px) of a rectangle shape's fill, for "inside counts as body" hit-testing. */
export function shapeRectScreenBounds(
  shape: TypedShape,
  converter: ViewportConverter
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (shape.type !== "rectangle") return null;
  const a = toScreen(converter, shape.data.points[0]);
  const b = toScreen(converter, shape.data.points[1]);
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

//======================================================================================================
// HANDLES (screen px) — computed on demand for the selected/hovered shape, not the whole list.
//======================================================================================================

export function handlesOf(shape: TypedShape, converter: ViewportConverter): ShapeHandle[] {
  const points = shape.data.points;

  switch (shape.type) {
    case "trendLine":
    case "hSegment":
    case "vSegment": {
      const p0 = toScreen(converter, points[0]);
      const p1 = toScreen(converter, points[1]);
      return [
        { index: 0, x: p0.x, y: p0.y, kind: "point" },
        { index: 1, x: p1.x, y: p1.y, kind: "point" },
      ];
    }
    case "hLine":
    case "hRay":
    case "vLine": {
      const p0 = toScreen(converter, points[0]);
      return [{ index: 0, x: p0.x, y: p0.y, kind: "point" }];
    }
    case "rectangle": {
      const a = toScreen(converter, points[0]);
      const b = toScreen(converter, points[1]);
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
      const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
      return [
        { index: 0, x: minX, y: minY, kind: "point" }, // top-left
        { index: 1, x: maxX, y: minY, kind: "point" }, // top-right
        { index: 2, x: maxX, y: maxY, kind: "point" }, // bottom-right
        { index: 3, x: minX, y: maxY, kind: "point" }, // bottom-left
        { index: 4, x: midX, y: minY, kind: "edge" }, // top
        { index: 5, x: maxX, y: midY, kind: "edge" }, // right
        { index: 6, x: midX, y: maxY, kind: "edge" }, // bottom
        { index: 7, x: minX, y: midY, kind: "edge" }, // left
      ];
    }
    default:
      return [];
  }
}
