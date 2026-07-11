import { useRef, useCallback } from "react";
import { Application, Graphics } from "pixi.js";
import type { Viewport } from "../viewport/useViewport";
import type { Crosshair } from "../useCrosshair";
import type { Shape } from "../../shared/types";
import { shapeApis } from "../../api/shapeApis";
import { CONFIG } from "../../shared/config";
import { SHAPE_MAP } from "./shapeMap";
import { parsePosition } from "./utils/mathParser";
import { getClosestShape } from "./utils/hitTestUtils";
import { renderShapeToLayers } from "./utils/renderShapeUtils";
import type { ViewController } from "../viewport/useViewController";

import useLineLayer from "./raw/useLineLayer";
import useTriangleLayer from "./raw/useTriangleLayer";
import useTextLayer from "./raw/useTextLayer";

//======================================================================================================
// TYPES
//======================================================================================================
export type ShapeController = {
    init: (app: Application) => Promise<void>;
    updateData: (symbol: string, strategyName: string) => Promise<void>;
    
    onMouseDown: (x: number, y: number, button: number) => void;
    onMouseMove: () => void;
    onMouseUp: (button: number) => void;
    onMouseLeave: () => void;
    
    create: (shapeType: string) => void;
    set: (shape: Shape) => void;
    
    addOnStartEdit: (id: string, callback: (shape: Shape) => void) => void;
    removeOnStartEdit: (id: string) => void;
    addOnEndEdit: (id: string, callback: (shape: Shape) => void) => void;
    removeOnEndEdit: (id: string) => void;
};

//======================================================================================================
// HOOK
//======================================================================================================
export default function useShapeController(viewport: Viewport, crosshair: Crosshair, viewController: ViewController): ShapeController {
    const appRef = useRef<Application | null>(null);
    
    // Main Background Layers
    const lineLayer = useLineLayer();
    const triangleLayer = useTriangleLayer();
    const textLayer = useTextLayer();

    // Active/Edit Foreground Layers (Isolates active shape updates)
    const activeLineLayer = useLineLayer();
    const activeTriangleLayer = useTriangleLayer();
    const activeTextLayer = useTextLayer();
    
    // Anchor graphics (Used strictly for edit handles now)
    const draftingGraphics = useRef<Graphics | null>(null);

    // State
    const symbolRef = useRef<string>("");
    const strategyRef = useRef<string>("");
    const shapesRef = useRef<Shape[]>([]);
    const lastUpdateTsRef = useRef<number>(Date.now());
    const pollingIntervalRef = useRef<number | null>(null);

    // Editing / Creating State
    const activeEditShapeRef = useRef<Shape | null>(null);
    const draggingAnchorRef = useRef<string | null>(null); // the coordinate key being dragged
    
    const createShapeTypeRef = useRef<string | null>(null);
    const createPointsRef = useRef<number>(0);
    const tempShapeRef = useRef<Shape | null>(null);

    // Callbacks
    const onStartEditCallbacks = useRef<Map<string, (shape: Shape) => void>>(new Map());
    const onEndEditCallbacks = useRef<Map<string, (shape: Shape) => void>>(new Map());

    //======================================================================================================
    // RENDERING & FLUSHING
    //======================================================================================================
    
    // Flushes all background shapes (ignores actively edited shapes)
    const flushShapes = useCallback(() => {
        lineLayer.clean();
        triangleLayer.clean();
        textLayer.clean();

        const layers = { lineLayer, triangleLayer, textLayer };

        shapesRef.current.forEach(shape => {
            // Skip rendering the active shape in raw layers (it will be drawn by active layers instead)
            if (activeEditShapeRef.current && (activeEditShapeRef.current.id === shape.id || activeEditShapeRef.current === shape)) return;
            if (shape === tempShapeRef.current) return; 

            renderShapeToLayers(shape, layers);
        });

        lineLayer.flush();
        triangleLayer.flush();
        textLayer.flush();
        
        lineLayer.draw();
        triangleLayer.draw();
        textLayer.draw();
    }, [lineLayer, triangleLayer, textLayer]);

    // Draws ONLY the edit anchor hit-boxes over the shape
    const drawActiveAnchors = useCallback(() => {
        if (!draftingGraphics.current) return;
        const g = draftingGraphics.current;
        g.clear();

        const activeShape = activeEditShapeRef.current;
        if (!activeShape) return;

        const shapeDef = (SHAPE_MAP as any)[activeShape.type];
        if (!shapeDef) return;

        // Draw edit anchors if in edit mode
        const editPoints = shapeDef.editPoints.edit;
        Object.keys(editPoints).forEach(posFormula => {
            const [t, p] = parsePosition(posFormula, activeShape.data);
            const x = viewport.timestampToPixel(t);
            const y = viewport.priceToPixel(p);
            
            const anchorSize = CONFIG.SHAPES.EDIT_BUTTON.SIZE;
            const bc = CONFIG.SHAPES.EDIT_BUTTON.BORDER_COLOR;
            const fc = CONFIG.SHAPES.EDIT_BUTTON.COLOR;

            g.rect(x - anchorSize/2, y - anchorSize/2, anchorSize, anchorSize)
             .fill({ color: (fc[0]<<16) + (fc[1]<<8) + fc[2], alpha: fc[3]/255 })
             .stroke({ width: CONFIG.SHAPES.EDIT_BUTTON.BORDER_WIDTH, color: (bc[0]<<16) + (bc[1]<<8) + bc[2] });
        });
    }, [viewport]);

    // Flushes strictly the actively edited shape to identical raw layers to match visual styling
    const flushActiveShape = useCallback(() => {
        activeLineLayer.clean();
        activeTriangleLayer.clean();
        activeTextLayer.clean();

        const activeShape = tempShapeRef.current || activeEditShapeRef.current;
        
        if (activeShape) {
            renderShapeToLayers(activeShape, {
                lineLayer: activeLineLayer,
                triangleLayer: activeTriangleLayer,
                textLayer: activeTextLayer
            });
        }

        activeLineLayer.flush();
        activeTriangleLayer.flush();
        activeTextLayer.flush();

        activeLineLayer.draw();
        activeTriangleLayer.draw();
        activeTextLayer.draw();

        drawActiveAnchors();
    }, [activeLineLayer, activeTriangleLayer, activeTextLayer, drawActiveAnchors]);

    //======================================================================================================
    // API POLLING
    //======================================================================================================
    const pollUpdates = useCallback(async () => {
        if (!symbolRef.current || !strategyRef.current) return;
        
        try {
            const view = viewport.getTransformedView();
            const extend = CONFIG.SHAPES.CACHE_EXTEND_RATIO;
            const deltaTs = view.toTs - view.fromTs;
            const fromTs = view.fromTs - deltaTs * extend;
            const toTs = view.toTs + deltaTs * extend;

            const changed = await shapeApis.getChangedShapes(
                strategyRef.current, 
                symbolRef.current, 
                lastUpdateTsRef.current, 
                fromTs, 
                toTs
            );

            if (changed.length > 0) {
                lastUpdateTsRef.current = Date.now();
                
                // Merge changes - respecting Local Priority
                changed.forEach(updatedShape => {
                    // Local Priority: Skip update if currently editing this shape
                    if (activeEditShapeRef.current && (activeEditShapeRef.current.id === updatedShape.id || activeEditShapeRef.current === updatedShape)) return;

                    const idx = shapesRef.current.findIndex(s => s.id === updatedShape.id);
                    if (idx >= 0) shapesRef.current[idx] = updatedShape;
                    else shapesRef.current.push(updatedShape);
                });

                flushShapes();
            }
        } catch (e) {
            console.error("Shape polling error", e);
        }
    }, [viewport, flushShapes]);

    //======================================================================================================
    // PUBLIC METHODS
    //======================================================================================================
    const init = async (app: Application) => {
        appRef.current = app;
        
        lineLayer.init(app, viewport);
        triangleLayer.init(app, viewport);
        await textLayer.init(app, viewport);

        activeLineLayer.init(app, viewport);
        activeTriangleLayer.init(app, viewport);
        await activeTextLayer.init(app, viewport);

        draftingGraphics.current = new Graphics();
        app.stage.addChild(draftingGraphics.current);

        viewport.addOnViewportChange("shapeController/draw", () => {
            lineLayer.draw();
            triangleLayer.draw();
            textLayer.draw();

            activeLineLayer.draw();
            activeTriangleLayer.draw();
            activeTextLayer.draw();

            drawActiveAnchors();
        });

        viewport.addOnViewportFlush("shapeController/draw", () => {
            flushShapes();
            flushActiveShape();
        });
    };

    const updateData = async (symbol: string, strategyName: string) => {
        symbolRef.current = symbol;
        strategyRef.current = strategyName;
        
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        
        const view = viewport.getTransformedView();
        const extend = CONFIG.SHAPES.CACHE_EXTEND_RATIO;
        const deltaTs = view.toTs - view.fromTs;
        
        shapesRef.current = await shapeApis.getShapes(
            strategyName, 
            symbol, 
            view.fromTs - deltaTs * extend, 
            view.toTs + deltaTs * extend
        );
        
        flushShapes();

        // 0.5s polling
        pollingIntervalRef.current = window.setInterval(pollUpdates, 500);
    };

    const onMouseDown = (x: number, y: number, button: number) => {
        const { timestamp, price } = crosshair.get();

        if (button !== 0) {
            // Right/Middle click exits edit/create mode
            if (activeEditShapeRef.current) {
                onEndEditCallbacks.current.forEach(cb => cb(activeEditShapeRef.current!));
                activeEditShapeRef.current = null;
            }
            createShapeTypeRef.current = null;
            tempShapeRef.current = null;
            flushShapes();
            flushActiveShape();
            return;
        }

        // Creating Mode
        if (createShapeTypeRef.current && tempShapeRef.current) {
            const shapeDef = (SHAPE_MAP as any)[createShapeTypeRef.current];
            const keys = Object.values(shapeDef.editPoints.create) as string[];
            
            if (createPointsRef.current < keys.length) {
                // Determine which keys to fill (e.g. "t1 p1")
                const targetKeys = keys[createPointsRef.current].split(" ");
                tempShapeRef.current.data[targetKeys[0]] = timestamp;
                tempShapeRef.current.data[targetKeys[1]] = price;
                
                createPointsRef.current++;
                
                // Finished creating
                if (createPointsRef.current >= keys.length) {
                    tempShapeRef.current.fromTs = Math.min(tempShapeRef.current.data.t0, timestamp);
                    tempShapeRef.current.toTs = Math.max(tempShapeRef.current.data.t0, timestamp);
                    
                    shapeApis.saveShapes(strategyRef.current, symbolRef.current, [tempShapeRef.current]);
                    shapesRef.current.push(tempShapeRef.current);
                    
                    createShapeTypeRef.current = null;
                    tempShapeRef.current = null;
                    flushShapes();
                    flushActiveShape();
                }
            }
            return;
        }

        // Editing Mode - Anchor Hit Test
        if (activeEditShapeRef.current) {
            const shapeDef = (SHAPE_MAP as any)[activeEditShapeRef.current.type];
            const editPoints = shapeDef.editPoints.edit;
            
            for (const [posFormula, targetKeysStr] of Object.entries(editPoints)) {
                const [t, p] = parsePosition(posFormula, activeEditShapeRef.current.data);
                const px = viewport.timestampToPixel(t);
                const py = viewport.priceToPixel(p);
                
                // If clicked within anchor bounds
                if (Math.abs(x - px) < 10 && Math.abs(y - py) < 10) {
                    draggingAnchorRef.current = targetKeysStr as string;
                    viewController.setEnable({scaleTimestamp:false,scalePrice:false,panTimestamp:false,panPrice:false})
                    return;
                }
            }
        }

        // Hit testing for selection
        const closestShape = getClosestShape(shapesRef.current, x, y, viewport, CONFIG.SHAPES.TOLERANCE);
        
        if (closestShape !== activeEditShapeRef.current) {
            if (activeEditShapeRef.current) {
                onEndEditCallbacks.current.forEach(cb => cb(activeEditShapeRef.current!));
            }
            activeEditShapeRef.current = closestShape;
            if (closestShape) {
                onStartEditCallbacks.current.forEach(cb => cb(closestShape));
            }
            flushShapes();
            flushActiveShape();
        }
    };

    const onMouseMove = () => {
        const { timestamp, price } = crosshair.get();

        // Handle dragging create point
        if (createShapeTypeRef.current && tempShapeRef.current) {
            const shapeDef = (SHAPE_MAP as any)[createShapeTypeRef.current];
            const keys = Object.values(shapeDef.editPoints.create) as string[];
            
            if (createPointsRef.current < keys.length) {
                const targetKeys = keys[createPointsRef.current].split(" ");
                tempShapeRef.current.data[targetKeys[0]] = timestamp;
                tempShapeRef.current.data[targetKeys[1]] = price;
                flushActiveShape();
            }
            return;
        }

        // Handle dragging edit anchor
        if (activeEditShapeRef.current && draggingAnchorRef.current) {
            const targetKeys = draggingAnchorRef.current.split(" ");
            
            targetKeys.forEach(k => {
                if (k.startsWith("t")) activeEditShapeRef.current!.data[k] = timestamp;
                if (k.startsWith("p")) activeEditShapeRef.current!.data[k] = price;
            });
            flushActiveShape();
        }
    };

    const onMouseUp = (button: number) => {
        if (button === 0 && draggingAnchorRef.current && activeEditShapeRef.current) {
            // Commit drag edit to API
            shapeApis.saveShapes(strategyRef.current, symbolRef.current, [activeEditShapeRef.current]);
            draggingAnchorRef.current = null;
            viewController.setEnable({scaleTimestamp:true,scalePrice:true,panTimestamp:true,panPrice:true})
        }
    };

    const onMouseLeave = () => {
        if (activeEditShapeRef.current) {
            onEndEditCallbacks.current.forEach(cb => cb(activeEditShapeRef.current!));
            activeEditShapeRef.current = null;
        }
        createShapeTypeRef.current = null;
        tempShapeRef.current = null;
        draggingAnchorRef.current = null;
        flushShapes();
        flushActiveShape();
    };

    const create = (shapeType: string) => {
        if (activeEditShapeRef.current) {
            onEndEditCallbacks.current.forEach(cb => cb(activeEditShapeRef.current!));
            activeEditShapeRef.current = null;
        }

        createShapeTypeRef.current = shapeType;
        createPointsRef.current = 0;
        
        const defaultStyles: any = {};
        if (shapeType === "rectangle") {
            defaultStyles.color = [100, 100, 100, 50];
            defaultStyles.border = { color: [255, 255, 255, 255], thickness: 2 };
            defaultStyles.text = { color: [255, 255, 255], size: 12, alignX: "center", alignY: "center" };
        } else {
            defaultStyles.color = [255, 255, 255, 255];
            defaultStyles.thickness = 2;
        }

        tempShapeRef.current = {
            type: shapeType,
            fromTs: 0,
            toTs: 0,
            data: { t0: 0, p0: 0, t1: 0, p1: 0 }, 
            styles: defaultStyles
        };
        flushShapes();
        flushActiveShape();
    };

    const set = (shape: Shape) => {
        const idx = shapesRef.current.findIndex(s => s.id === shape.id);
        if (idx >= 0) shapesRef.current[idx] = shape;
        else shapesRef.current.push(shape);
        flushShapes();
    };

    const apiRef = useRef<ShapeController | null>(null);
    if (!apiRef.current) {
        apiRef.current = {
            init, updateData, onMouseDown, onMouseMove, onMouseUp, onMouseLeave,
            create, set,
            addOnStartEdit: (id, cb) => onStartEditCallbacks.current.set(id, cb),
            removeOnStartEdit: (id) => onStartEditCallbacks.current.delete(id),
            addOnEndEdit: (id, cb) => onEndEditCallbacks.current.set(id, cb),
            removeOnEndEdit: (id) => onEndEditCallbacks.current.delete(id)
        };
    }

    return apiRef.current;
}