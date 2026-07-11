import { SHAPE_MAP } from "../shapeMap";
import { parsePosition, resolveStyle, flattenContext, evaluateCondition } from "./mathParser";
import type { Shape } from "../../../shared/types";
import type { LineLayer } from "../raw/useLineLayer";
import type { TriangleLayer } from "../raw/useTriangleLayer";
import type { TextLayer } from "../raw/useTextLayer";

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

            layers.lineLayer.add({
                timestamp1: t1, price1: p1, timestamp2: t2, price2: p2,
                color: style.color || [255, 255, 255, 255],
                thickness: style.thickness !== undefined ? style.thickness : 1
            });
        }
        else if (renderItem.type === "triangle") {
            const p0 = parsePosition(renderItem.pos[0], shape.data);
            const p1 = parsePosition(renderItem.pos[1], shape.data);
            const p2 = parsePosition(renderItem.pos[2], shape.data);

            layers.triangleLayer.add({
                timestamp: [p0[0], p1[0], p2[0]],
                price: [p0[1], p1[1], p2[1]],
                color: style.color || [80, 80, 80, 80],
            });
        }
        else if (renderItem.type === "text") {
            const [timestamp, price] = parsePosition(renderItem.pos[0], shape.data);

            const data = renderItem.data ?? {};

            layers.textLayer.add({
                text: shape.data?.[data.text] ?? "",
                timestamp,
                price,

                color:
                    style.color?.slice?.(1, 4) ??
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