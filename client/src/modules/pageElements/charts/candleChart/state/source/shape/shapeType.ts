import type { RGBA } from "../../../../../../shared/type";
import type { Shape } from "./ShapeData";

export type ShapeType =
  | "trendLine"
  | "hSegment"
  | "hLine"
  | "hRay"
  | "vSegment"
  | "vLine"
  | "rectangle"
  | "text";

export interface ShapePoint {
  ts: number;
  price: number;
}

export type LineType = "solid" | "dash" | "dot";

export interface LineStyle {
  color: RGBA;
  thickness: number;
  type: LineType;
}

export interface TextStyle {
  color: RGBA;
  size: number; // px
  alignX: "start" | "center" | "end"; // lines; rectangle uses left/center/right
  alignY: "above" | "on" | "below"; // lines; rectangle uses top/middle/bottom
}

export interface ShapeDataJson {
  points: ShapePoint[]; // length fixed per type (ANCHOR_COUNT)
  text?: string;
  locked?: boolean;
}

export interface ShapeStyleJson {
  line?: LineStyle; // all line types; rectangle border
  fill?: { color: RGBA }; // rectangle only
  text?: TextStyle; // every type except trendLine
}

/** Shape with typed data/style, narrowed to a known ShapeType. */
export type TypedShape = Shape & { type: ShapeType; data: ShapeDataJson; style: ShapeStyleJson };

const SHAPE_TYPES: readonly ShapeType[] = [
  "trendLine",
  "hSegment",
  "hLine",
  "hRay",
  "vSegment",
  "vLine",
  "rectangle",
  "text",
];

/** Type guard used by readers to skip shapes with an unknown/legacy `type`. */
export function isShapeType(type: string): type is ShapeType {
  return (SHAPE_TYPES as readonly string[]).includes(type);
}

export function isTypedShape(shape: Shape): shape is TypedShape {
  return isShapeType(shape.type);
}

export const ANCHOR_COUNT: Record<ShapeType, 1 | 2> = {
  trendLine: 2,
  hSegment: 2,
  hLine: 1,
  hRay: 1,
  vSegment: 2,
  vLine: 1,
  rectangle: 2,
  text: 1,
};

// RGBA channels are all 0-255 (including alpha), matching Config's RGBA convention.
const DEFAULT_LINE_STYLE: LineStyle = { color: [41, 98, 255, 255], thickness: 2, type: "solid" };
const DEFAULT_TEXT_STYLE: TextStyle = {
  color: [216, 220, 227, 255],
  size: 12,
  alignX: "center",
  alignY: "above",
};
const DEFAULT_FILL_STYLE: { color: RGBA } = { color: [41, 98, 255, 40] };

export const DEFAULT_STYLE: Record<ShapeType, ShapeStyleJson> = {
  trendLine: { line: DEFAULT_LINE_STYLE },
  hSegment: { line: DEFAULT_LINE_STYLE, text: DEFAULT_TEXT_STYLE },
  hLine: { line: DEFAULT_LINE_STYLE, text: DEFAULT_TEXT_STYLE },
  hRay: { line: DEFAULT_LINE_STYLE, text: DEFAULT_TEXT_STYLE },
  vSegment: { line: DEFAULT_LINE_STYLE, text: DEFAULT_TEXT_STYLE },
  vLine: { line: DEFAULT_LINE_STYLE, text: DEFAULT_TEXT_STYLE },
  rectangle: { line: DEFAULT_LINE_STYLE, fill: DEFAULT_FILL_STYLE, text: DEFAULT_TEXT_STYLE },
  text: { text: DEFAULT_TEXT_STYLE },
};

/** Style a new shape of `type` starts with: the last style the user applied to that type, else the default. */
export function newShapeStyle(
  type: ShapeType,
  lastStyle?: Partial<Record<ShapeType, ShapeStyleJson>>
): ShapeStyleJson {
  return structuredClone(lastStyle?.[type] ?? DEFAULT_STYLE[type]);
}

/** Bounding time range sent as Shape.fromTs/toTs so the server range query finds the shape. */
export function shapeTimeBounds(
  type: ShapeType,
  points: ShapePoint[]
): { fromTs: number; toTs: number } {
  const p0 = points[0];
  switch (type) {
    case "hLine":
      return { fromTs: -Number.MAX_SAFE_INTEGER, toTs: Number.MAX_SAFE_INTEGER };
    case "hRay":
      return { fromTs: p0.ts, toTs: Number.MAX_SAFE_INTEGER };
    case "vLine":
    case "text":
      return { fromTs: p0.ts, toTs: p0.ts };
    default: {
      const ts = points.map((p) => p.ts);
      return { fromTs: Math.min(...ts), toTs: Math.max(...ts) };
    }
  }
}

/** Applies per-type constraints (hSegment same price, vSegment same ts). Used by create and drag. */
/**
 * Moves one of the 8 rectangle handles (see shapeGeometry.handlesOf: 0-3 corners TL/TR/BR/BL,
 * 4-7 edges top/right/bottom/left) to `world`. Screen top = max price, left = min ts.
 * Returns the rectangle as [top-left, bottom-right].
 */
export function moveRectHandle(points: ShapePoint[], handleIndex: number, world: ShapePoint): ShapePoint[] {
  let minTs = Math.min(points[0].ts, points[1].ts);
  let maxTs = Math.max(points[0].ts, points[1].ts);
  let minPrice = Math.min(points[0].price, points[1].price);
  let maxPrice = Math.max(points[0].price, points[1].price);
  if (handleIndex === 0 || handleIndex === 3 || handleIndex === 7) minTs = world.ts;
  if (handleIndex === 1 || handleIndex === 2 || handleIndex === 5) maxTs = world.ts;
  if (handleIndex === 0 || handleIndex === 1 || handleIndex === 4) maxPrice = world.price;
  if (handleIndex === 2 || handleIndex === 3 || handleIndex === 6) minPrice = world.price;
  return [{ ts: minTs, price: maxPrice }, { ts: maxTs, price: minPrice }];
}

export function constrainPoints(
  type: ShapeType,
  points: ShapePoint[],
  movedIndex: number
): ShapePoint[] {
  if (type === "hSegment" && points.length === 2) {
    const other = movedIndex === 0 ? 1 : 0;
    const result = [...points];
    result[other] = { ...result[other], price: result[movedIndex].price };
    return result;
  }
  if (type === "vSegment" && points.length === 2) {
    const other = movedIndex === 0 ? 1 : 0;
    const result = [...points];
    result[other] = { ...result[other], ts: result[movedIndex].ts };
    return result;
  }
  return points;
}
