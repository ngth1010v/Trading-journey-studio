import { getCompiledShapeMap, flattenContext } from "./mathParser";
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
 * Utilizes pre-compiled evaluation functions for maximum real-time performance.
 */
export function renderShapeToLayers(shape: Shape, layers: RenderLayers) {
    const compiledMap = getCompiledShapeMap();
    const shapeDef = compiledMap[shape.type];
    if (!shapeDef) return;

    const context = flattenContext(shape);

    if (shapeDef.compiledCondition && !shapeDef.compiledCondition(context)) {
        return;
    }

    shapeDef.compiledRender.forEach((renderItem: any) => {
        if (!renderItem.compiledCondition(context)) {
            return;
        }

        const data = renderItem.compiledData(context);

        if (renderItem.type === "line") {
            const { timestamp1, price1, timestamp2, price2 } = data;

            // Abort drawing if points haven't been placed yet
            if (isNaN(timestamp1) || isNaN(price1) || isNaN(timestamp2) || isNaN(price2)) return;

            layers.lineLayer.add({
                timestamp1, price1, timestamp2, price2,
                color: data.color || [255, 255, 255, 255],
                thickness: data.thickness !== undefined ? data.thickness : 1
            });
        }
        else if (renderItem.type === "triangle") {
            const { timestamp, price, color } = data;

            // Abort drawing if array properties are misaligned or contain invalid values
            if (!timestamp || !price || timestamp.some(isNaN) || price.some(isNaN)) return;

            layers.triangleLayer.add({
                timestamp,
                price,
                color: color || [80, 80, 80, 80],
            });
        }
        else if (renderItem.type === "text") {
            const { timestamp, price, text } = data;
            
            // Abort drawing if point hasn't been placed or text is undefined
            if (isNaN(timestamp) || isNaN(price) || text === undefined || text === null) return;

            layers.textLayer.add({
                text: String(text),
                timestamp,
                price,

                color: data.color ?? [255, 255, 255],
                size: data.size ?? 14,
                alignX: data.alignX ?? "left",
                alignY: data.alignY ?? "top",
                rotation: (data.rotation ?? data.orientation ?? 0) * Math.PI / 180,
            });
        }
    });
}