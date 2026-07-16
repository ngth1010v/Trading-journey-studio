import { SHAPE_MAP } from "../shapeMap";
import { parsePosition, resolveStyle, flattenContext, evaluateCondition } from "./mathParser";
import type { Shape }           from "../data/type";
import type { LineLayer }       from "../layers/useLineLayer";
import type { TriangleLayer }   from "../layers/useTriangleLayer";
import type { TextLayer }       from "../layers/useTextLayer";

export type RenderLayers = {
    lineLayer: LineLayer;
    triangleLayer: TriangleLayer;
    textLayer: TextLayer;
};

/**
 * Pushes the parsed render configuration of a shape into the provided layer targets.
 * Extracted to ensure the main shape layer and active shape layer logic remains exactly the same.
 */
export function renderShapeToLayers(shape: Shape, layers: RenderLayers) {
    const shapeDef = (SHAPE_MAP as any)[shape.type];
    if (!shapeDef) return;

    const context = flattenContext(shape);

    // Style condition validation (Treat as true if missing)
    if (shapeDef.styles && shapeDef.styles.condition) {
        if (!evaluateCondition(shapeDef.styles.condition, context)) {
            return;
        }
    }

    shapeDef.render.forEach((renderItem: any) => {
        // Render item condition validation (Treat as true if missing)
        if (renderItem.condition) {
            if (!evaluateCondition(renderItem.condition, context)) {
                return;
            }
        }

        const style = resolveStyle(renderItem.style, context);

        if (renderItem.type === "line") {
            const [t1, p1] = parsePosition(renderItem.pos[0], shape.data);
            const [t2, p2] = parsePosition(renderItem.pos[1], shape.data);

            // Abort drawing if points haven't been placed yet
            if (isNaN(t1) || isNaN(p1) || isNaN(t2) || isNaN(p2)) return;

            layers.lineLayer.add({
                timestamp1: t1, price1: p1, timestamp2: t2, price2: p2,
                color: style.color || [255, 255, 255, 255],
                thickness: style.thickness !== undefined ? style.thickness : 1
            });
        }
        else if (renderItem.type === "triangle") {
            const [t0, p0] = parsePosition(renderItem.pos[0], shape.data);
            const [t1, p1] = parsePosition(renderItem.pos[1], shape.data);
            const [t2, p2] = parsePosition(renderItem.pos[2], shape.data);

            // Abort drawing if points haven't been placed yet
            if (isNaN(t0) || isNaN(p0) || isNaN(t1) || isNaN(p1) || isNaN(t2) || isNaN(p2)) return;

            layers.triangleLayer.add({
                timestamp: [t0, t1, t2],
                price: [p0, p1, p2],
                color: style.color || [80, 80, 80, 80],
            });
        }
        else if (renderItem.type === "text") {
            const [timestamp, price] = parsePosition(renderItem.pos[0], shape.data);
            const data = renderItem.data ?? {};
            
            // Abort drawing if point hasn't been placed or text is undefined
            if (isNaN(timestamp) || isNaN(price) || shape.data?.[data.text] === undefined) return;

            layers.textLayer.add({
                text: shape.data[data.text],
                timestamp,
                price,

                color:
                    style.color ??
                    [255, 255, 255],

                size: style.size ?? 14,
                alignX: style.alignX ?? "left",
                alignY: style.alignY ?? "top",

                rotation:
                    (style?.rotation ?? style?.orientation ?? 0) *
                    Math.PI /
                    180,
            });
        }
    });
}