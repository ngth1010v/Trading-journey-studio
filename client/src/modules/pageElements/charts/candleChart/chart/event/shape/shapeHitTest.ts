import type { TypedShape } from "../../../state/source/shape/shapeType";
import type ViewportConverter from "../../viewport/ViewportConverter";
import { handlesOf, shapeScreenSegments, shapeRectScreenBounds, shapeTextGlyphs, type ShapeHandle, type TextGlyphInstance } from "../../render/shape/shapeGeometry";
import type { FontAtlas } from "../../render/common/FontAtlas";

export type HitTarget = { kind: "handle"; index: number } | { kind: "body" };

export interface HitResult {
  id: number;
  target: HitTarget;
}

const LINE_HIT_TOLERANCE = 5; // px, minimum click tolerance around a thin line

function distToSegmentSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = px - x1, ddy = py - y1;
    return ddx * ddx + ddy * ddy;
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const ddx = px - cx, ddy = py - cy;
  return ddx * ddx + ddy * ddy;
}

/** Union bounding box of all glyph quads, so gaps between letters still count as a hit. */
function textHit(glyphs: TextGlyphInstance[], mouse: { x: number; y: number }): boolean {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of glyphs) {
    for (const c of [g.origin, { x: g.origin.x + g.right.x + g.down.x, y: g.origin.y + g.right.y + g.down.y }]) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
  }
  return mouse.x >= minX && mouse.x <= maxX && mouse.y >= minY && mouse.y <= maxY;
}

function hitTestBody(
  shape: TypedShape,
  mouse: { x: number; y: number },
  converter: ViewportConverter,
  canvasSize: { w: number; h: number },
  fontAtlas: FontAtlas | null
): boolean {
  if (shape.type === "text") {
    if (!fontAtlas) return false;
    const glyphs = shapeTextGlyphs(shape, fontAtlas, converter, canvasSize);
    return textHit(glyphs, mouse);
  }

  if (shape.type === "rectangle") {
    const bounds = shapeRectScreenBounds(shape, converter);
    if (bounds && mouse.x >= bounds.minX && mouse.x <= bounds.maxX && mouse.y >= bounds.minY && mouse.y <= bounds.maxY) {
      return true; // inside the fill counts as body
    }
  }

  const thickness = shape.style.line?.thickness ?? 1;
  const tolerance = Math.max(thickness / 2, LINE_HIT_TOLERANCE);
  const toleranceSq = tolerance * tolerance;

  const segments = shapeScreenSegments(shape, converter, canvasSize);
  for (const seg of segments) {
    if (distToSegmentSq(mouse.x, mouse.y, seg.p0.x, seg.p0.y, seg.p1.x, seg.p1.y) <= toleranceSq) {
      return true;
    }
  }

  // Text belonging to a line/rectangle shape also counts as body.
  if (fontAtlas && shape.style.text) {
    const glyphs = shapeTextGlyphs(shape, fontAtlas, converter, canvasSize);
    if (textHit(glyphs, mouse)) return true;
  }

  return false;
}

/**
 * Hit-tests the shape list at a screen mouse position: handles of the selected shape first
 * (highest priority), then shape bodies in reverse draw order (topmost first).
 */
export function hitTestShapes(
  shapes: TypedShape[],
  mouse: { x: number; y: number },
  converter: ViewportConverter,
  canvasSize: { w: number; h: number },
  selectedId: number | null,
  handleRadius: number,
  fontAtlas: FontAtlas | null
): HitResult | null {
  if (selectedId != null) {
    const selected = shapes.find((s) => s.id === selectedId);
    if (selected) {
      const handles: ShapeHandle[] = handlesOf(selected, converter);
      for (const h of handles) {
        const dx = mouse.x - h.x;
        const dy = mouse.y - h.y;
        if (dx * dx + dy * dy <= handleRadius * handleRadius) {
          return { id: selected.id!, target: { kind: "handle", index: h.index } };
        }
      }
    }
  }

  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (hitTestBody(shape, mouse, converter, canvasSize, fontAtlas)) {
      return { id: shape.id!, target: { kind: "body" } };
    }
  }

  return null;
}
