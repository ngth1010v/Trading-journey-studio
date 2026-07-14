import type { Shape } from "../data/type";
import { SHAPE_MAP } from "../shapeMap";
import { parsePosition } from "./mathParser";
import type { Viewport } from "../../chart/viewport/useViewport";

function distToSegmentSquared(p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
}

/**
 * Finds the closest shape to the given pixel coordinates.
 */
export function getClosestShape(
    shapes: Shape[], 
    px: number, 
    py: number, 
    viewport: Viewport, 
    tolerance: number
): Shape | null {
    let closestShape: Shape | null = null;
    let minDistanceSq = tolerance * tolerance;

    for (const shape of shapes) {
        const shapeDef = (SHAPE_MAP as any)[shape.type];
        if (!shapeDef) continue;

        const context = { ...shape.data };

        // Test each render primitive against the mouse position
        for (const renderItem of shapeDef.render) {
            // Simplified hit testing based on bounding boxes/lines
            if (renderItem.type === "line" && renderItem.pos.length >= 2) {
                const [t1, p1] = parsePosition(renderItem.pos[0], context);
                const [t2, p2] = parsePosition(renderItem.pos[1], context);

                // Skip hit testing if the point hasn't been selected yet
                if (isNaN(t1) || isNaN(p1) || isNaN(t2) || isNaN(p2)) continue;

                const v = { x: viewport.timestampToPixel(t1), y: viewport.priceToPixel(p1) };
                const w = { x: viewport.timestampToPixel(t2), y: viewport.priceToPixel(p2) };

                const d2 = distToSegmentSquared({ x: px, y: py }, v, w);
                if (d2 < minDistanceSq) {
                    minDistanceSq = d2;
                    closestShape = shape;
                }
            }
            // Add triangle/text rough AABB bounding tests here if needed
        }
    }

    return closestShape;
}