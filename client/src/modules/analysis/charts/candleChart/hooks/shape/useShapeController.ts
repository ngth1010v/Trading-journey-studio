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

    // Editing / Creating State - Stored by numeric ID to prevent reference mismatch on data flushes
    const activeEditShapeIdRef = useRef<number | null>(null);
    const draggingAnchorRef = useRef<string | null>(null); // the coordinate key being dragged
    
    // Entire Shape Dragging State
    const isDraggingEntireShapeRef = useRef<boolean>(false);
    const dragStartMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const dragStartShapeDataRef = useRef<any>(null);

    const createShapeTypeRef = useRef<string | null>(null);
    const createPointsRef = useRef<number>(0);
    const tempShapeRef = useRef<Shape | null>(null);

    // Callbacks
    const onStartEditCallbacks = useRef<Map<string, (shape: Shape) => void>>(new Map());
    const onEndEditCallbacks = useRef<Map<string, (shape: Shape) => void>>(new Map());

    //======================================================================================================
    // HELPER METHODS
    //======================================================================================================
    const updateShapeBoundaries = (shape: Shape) => {
        const tValues = Object.keys(shape.data)
            .filter(k => k.startsWith("t") && typeof shape.data[k] === "number")
            .map(k => shape.data[k]);

        if (tValues.length > 0) {
            shape.fromTs = Math.round(Math.min(...tValues));
            shape.toTs   = Math.round(Math.max(...tValues));
        }
    };

    const saveShapes = (shapes: Shape[]) => {
        shapes.forEach(updateShapeBoundaries);
        shapeApis.saveShapes(strategyRef.current, symbolRef.current, shapes);
    };

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
            if (activeEditShapeIdRef.current !== null && shape.id === activeEditShapeIdRef.current) return;
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

        if (activeEditShapeIdRef.current === null) return;
        const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
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

        const activeShape = tempShapeRef.current || (activeEditShapeIdRef.current !== null ? shapesRef.current.find(s => s.id === activeEditShapeIdRef.current) : null);
        
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
                    if (activeEditShapeIdRef.current !== null && updatedShape.id === activeEditShapeIdRef.current) return;

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
            const onFlush = async () => {
                flushShapes();
                flushActiveShape();                
                await updateData(symbolRef.current, strategyRef.current)
            }
            onFlush()
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
            if (activeEditShapeIdRef.current !== null) {
                const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
                if (activeShape) {
                    onEndEditCallbacks.current.forEach(cb => cb(activeShape));
                }
                activeEditShapeIdRef.current = null;
            }
            createShapeTypeRef.current = null;
            tempShapeRef.current = null;
            isDraggingEntireShapeRef.current = false;
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
                    saveShapes([tempShapeRef.current]);
                    shapesRef.current.push(tempShapeRef.current);
                    
                    createShapeTypeRef.current = null;
                    tempShapeRef.current = null;
                    flushShapes();
                    flushActiveShape();
                }
            }
            return;
        }

        // Editing Mode - Anchor & Shape Hit Test
        if (activeEditShapeIdRef.current !== null) {
            const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
            if (activeShape) {
                const shapeDef = (SHAPE_MAP as any)[activeShape.type];
                const editPoints = shapeDef.editPoints.edit;
                let hitAnchor = false;
                
                for (const [posFormula, targetKeysStr] of Object.entries(editPoints)) {
                    const [t, p] = parsePosition(posFormula, activeShape.data);
                    const px = viewport.timestampToPixel(t);
                    const py = viewport.priceToPixel(p);
                    
                    // If clicked within anchor bounds
                    if (Math.abs(x - px) < 10 && Math.abs(y - py) < 10) {
                        draggingAnchorRef.current = targetKeysStr as string;
                        viewController.setEnable({scaleTimestamp:false,scalePrice:false,panTimestamp:false,panPrice:false});
                        hitAnchor = true;
                        return;
                    }
                }

                // Drag entire shape if clicking on the shape but missed the anchor
                if (!hitAnchor) {
                    const closestShape = getClosestShape(shapesRef.current, x, y, viewport, CONFIG.SHAPES.TOLERANCE);
                    if (closestShape && closestShape.id === activeEditShapeIdRef.current) {
                        isDraggingEntireShapeRef.current = true;
                        dragStartMousePosRef.current = { x, y };
                        dragStartShapeDataRef.current = JSON.parse(JSON.stringify(activeShape.data));
                        viewController.setEnable({scaleTimestamp:false,scalePrice:false,panTimestamp:false,panPrice:false});
                        flushShapes(); // Hide it instantly from background layer maps
                        return;
                    }
                }
            }
        }

        // Hit testing for selection
        const closestShape = getClosestShape(shapesRef.current, x, y, viewport, CONFIG.SHAPES.TOLERANCE);
        
        if (!closestShape || closestShape.id !== activeEditShapeIdRef.current) {
            if (activeEditShapeIdRef.current !== null) {
                const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
                if (activeShape) {
                    onEndEditCallbacks.current.forEach(cb => cb(activeShape));
                }
            }
            activeEditShapeIdRef.current =
                closestShape && closestShape.id !== undefined
                    ? closestShape.id
                    : null;
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
        if (activeEditShapeIdRef.current !== null && draggingAnchorRef.current) {
            const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
            if (activeShape) {
                const targetKeys = draggingAnchorRef.current.split(" ");
                
                targetKeys.forEach(k => {
                    if (k.startsWith("t")) activeShape.data[k] = timestamp;
                    if (k.startsWith("p")) activeShape.data[k] = price;
                });
                updateShapeBoundaries(activeShape);
                flushActiveShape();
            }
            return;
        }

        // Handle dragging entire shape
        if (isDraggingEntireShapeRef.current && activeEditShapeIdRef.current !== null && dragStartShapeDataRef.current) {
            const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
            if (activeShape) {
                const currentX = viewport.timestampToPixel(timestamp);
                const currentY = viewport.priceToPixel(price);

                const deltaX = currentX - dragStartMousePosRef.current.x;
                const deltaY = currentY - dragStartMousePosRef.current.y;

                Object.keys(dragStartShapeDataRef.current).forEach(k => {
                    if (k.startsWith("t") && typeof dragStartShapeDataRef.current[k] === "number") {
                        const originalPixelX = viewport.timestampToPixel(dragStartShapeDataRef.current[k]);
                        activeShape.data[k] = viewport.pixelToTimestamp(originalPixelX + deltaX);
                    }
                    if (k.startsWith("p") && typeof dragStartShapeDataRef.current[k] === "number") {
                        const originalPixelY = viewport.priceToPixel(dragStartShapeDataRef.current[k]);
                        activeShape.data[k] = viewport.pixelToPrice(originalPixelY + deltaY);
                    }
                });
                
                updateShapeBoundaries(activeShape);
                
                flushActiveShape();
            }
        }
    };

    const onMouseUp = (button: number) => {
        if (button === 0) {
            if (activeEditShapeIdRef.current !== null) {
                const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
                if (activeShape) {
                    if (draggingAnchorRef.current) {
                        saveShapes([activeShape]);
                        draggingAnchorRef.current = null;
                        viewController.setEnable({scaleTimestamp:true,scalePrice:true,panTimestamp:true,panPrice:true});
                    } else if (isDraggingEntireShapeRef.current) {
                        saveShapes([activeShape]);
                        isDraggingEntireShapeRef.current = false;
                        dragStartShapeDataRef.current = null;
                        viewController.setEnable({scaleTimestamp:true,scalePrice:true,panTimestamp:true,panPrice:true});
                        
                        // Final layout sync across layers
                        flushShapes();
                        flushActiveShape();
                    }
                }
            }
        }
    };

    const onMouseLeave = () => {
        if (activeEditShapeIdRef.current !== null) {
            const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
            if (activeShape) {
                saveShapes([activeShape]);
                onEndEditCallbacks.current.forEach(cb => cb(activeShape));
            }
            activeEditShapeIdRef.current = null;
        }
        createShapeTypeRef.current = null;
        tempShapeRef.current = null;
        draggingAnchorRef.current = null;
        isDraggingEntireShapeRef.current = false;
        dragStartShapeDataRef.current = null;
        viewController.setEnable({scaleTimestamp:true,scalePrice:true,panTimestamp:true,panPrice:true});
        flushShapes();
        flushActiveShape();
    };

    const create = (shapeType: string) => {
        if (activeEditShapeIdRef.current !== null) {
            const activeShape = shapesRef.current.find(s => s.id === activeEditShapeIdRef.current);
            if (activeShape) {
                onEndEditCallbacks.current.forEach(cb => cb(activeShape));
            }
            activeEditShapeIdRef.current = null;
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
        } as unknown as Shape; // Cast since id is missing while creating
        
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