// Run with: npx tsx shapeHitTest.check.ts
import assert from "node:assert";
import { hitTestShapes } from "./shapeHitTest";
import type { TypedShape } from "../../../state/source/shape/shapeType";
import type ViewportConverter from "../../viewport/ViewportConverter";
import type { FontAtlas } from "../../render/common/FontAtlas";

// Minimal converter stub: world (ts, price) map 1:1 to screen (ts, price) px, no transform.
const converter = {
  worldToBase: (ts: number, price: number) => ({ x: ts, y: price }),
  worldToScreen: (ts: number, price: number) => ({ x: ts, y: price }),
} as unknown as ViewportConverter;

const canvasSize = { w: 1000, h: 1000 };

function shape(partial: Partial<TypedShape>): TypedShape {
  return {
    id: 1,
    symbol: "TEST",
    tagIds: [],
    fromTs: 0,
    toTs: 0,
    style: { line: { color: [255, 255, 255, 255], thickness: 2, type: "solid" } },
    data: { points: [] },
    ...partial,
  } as TypedShape;
}

// Point on / near / away from a trendLine segment
{
  const s = shape({ type: "trendLine", data: { points: [{ ts: 0, price: 0 }, { ts: 100, price: 0 }] } });
  assert.ok(hitTestShapes([s], { x: 50, y: 0 }, converter, canvasSize, null, 8, null), "on the segment should hit");
  assert.ok(hitTestShapes([s], { x: 50, y: 3 }, converter, canvasSize, null, 8, null), "within tolerance should hit");
  assert.strictEqual(hitTestShapes([s], { x: 50, y: 50 }, converter, canvasSize, null, 8, null), null, "far away should miss");
}

// Infinite hLine clipped to canvas edges is still hit-testable at either edge
{
  const s = shape({ type: "hLine", data: { points: [{ ts: 500, price: 42 }] } });
  assert.ok(hitTestShapes([s], { x: 0, y: 42 }, converter, canvasSize, null, 8, null), "left canvas edge should hit hLine");
  assert.ok(hitTestShapes([s], { x: 999, y: 42 }, converter, canvasSize, null, 8, null), "right canvas edge should hit hLine");
  assert.strictEqual(hitTestShapes([s], { x: 500, y: 100 }, converter, canvasSize, null, 8, null), null, "off the hLine price should miss");
}

// Rectangle: inside the fill counts as body
{
  const s = shape({ type: "rectangle", data: { points: [{ ts: 10, price: 10 }, { ts: 90, price: 90 }] } });
  const hit = hitTestShapes([s], { x: 50, y: 50 }, converter, canvasSize, null, 8, null);
  assert.ok(hit && hit.target.kind === "body", "inside rectangle should hit body");
}

// Handle takes priority over body when a shape is selected
{
  const s = shape({ id: 7, type: "trendLine", data: { points: [{ ts: 0, price: 0 }, { ts: 100, price: 0 }] } });
  const hit = hitTestShapes([s], { x: 0, y: 0 }, converter, canvasSize, 7, 8, null);
  assert.deepStrictEqual(hit, { id: 7, target: { kind: "handle", index: 0 } });
}

// Text: the gap between two narrow glyphs still hits (union bbox, not per-glyph boxes)
{
  // "ii": each glyph is 4px wide but advances 20px, leaving a 16px gap between them.
  const atlas = {
    width: 100, height: 100, baseSize: 10, lineHeight: 10,
    glyphs: new Map([[105, { x: 0, y: 0, width: 4, height: 10, xoffset: 0, yoffset: 0, xadvance: 20 }]]),
  } as unknown as FontAtlas;
  const s = shape({
    type: "text",
    data: { points: [{ ts: 100, price: 100 }], text: "ii" },
    style: { text: { color: [255, 255, 255, 255], size: 10, alignX: "start", alignY: "above" } },
  });
  // Text shape is centered on its anchor (100,100): "ii" is 40px wide, glyphs at x 80-84 and 100-104, y 95-105.
  const hit = hitTestShapes([s], { x: 92, y: 100 }, converter, canvasSize, null, 8, atlas);
  assert.ok(hit, "gap between glyphs should hit text");
  assert.strictEqual(hitTestShapes([s], { x: 92, y: 150 }, converter, canvasSize, null, 8, atlas), null, "below text should miss");
  assert.strictEqual(hitTestShapes([s], { x: 110, y: 100 }, converter, canvasSize, null, 8, atlas), null, "right of centered text should miss");
}

console.log("shapeHitTest.check.ts: all assertions passed");
