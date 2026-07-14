import { useRef, useCallback } from "react";
import type { Viewport } from "../../chart/viewport/useViewport";
import type { Shape, ShapeTemplate } from "../data/type";
import { shapeApis } from "../api/shapeApis";
import { CONFIG } from "../../shared/config";
import { SHAPE_MAP } from "../shapeMap";

export type ShapeData = {
    getShapes: () => Shape[];
    setShapes: (shapes: Shape[]) => void;
    getTemplates: () => ShapeTemplate[];
    setTemplates: (templates: ShapeTemplate[]) => void;
    getSymbol: () => string;
    getStrategyName: () => string;
    updateData: (symbol: string, strategyName: string) => Promise<void>;
    saveShapes: (shapes: Shape[]) => void;
    saveTemplates: (templates: ShapeTemplate[]) => Promise<void>;
    addOnShapeDataChange: (id: string, callback: () => void) => void;
    removeOnShapeDataChange: (id: string) => void;
    addOnShapeTemplateChange: (id: string, callback: () => void) => void;
    removeOnShapeTemplateChange: (id: string) => void;
};

export default function useShapeData(
    viewport: Viewport
): ShapeData {
    const symbolRef = useRef<string>("");
    const strategyRef = useRef<string>("");
    
    // Core Collections State
    const shapesRef = useRef<Shape[]>([]);
    const templatesRef = useRef<ShapeTemplate[]>([]);
    
    // Timers & Polling Anchors
    const lastUpdateTsRef = useRef<number>(Date.now());
    const lastTemplatePollTsRef = useRef<number>(0);
    const pollingIntervalRef = useRef<number | null>(null);
    const isPollingTemplateRef = useRef<boolean>(false);

    // Event Subscriptions
    const onShapeDataChangeCallbacks = useRef<Map<string, () => void>>(new Map());
    const onShapeTemplateChangeCallbacks = useRef<Map<string, () => void>>(new Map());

    const notifyShapeListeners = useCallback(() => {
        onShapeDataChangeCallbacks.current.forEach((cb) => cb());
    }, []);

    const notifyTemplateListeners = useCallback(() => {
        onShapeTemplateChangeCallbacks.current.forEach((cb) => cb());
    }, []);

    const updateShapeBoundaries = (shape: Shape) => {
        const tValues = Object.keys(shape.data)
            .filter(k => k.startsWith("t") && typeof shape.data[k] === "number")
            .map(k => shape.data[k]);

        if (tValues.length > 0) {
            shape.fromTs = Math.round(Math.min(...tValues));
            shape.toTs   = Math.round(Math.max(...tValues));
        }
    };

    const fillMissingDataDefaults = (shape: Shape) => {
        const shapeDef = (SHAPE_MAP as any)[shape.type];
        if (!shapeDef || !shapeDef.data) return;

        Object.entries(shapeDef.data).forEach(([key, type]) => {
            if (shape.data[key] === undefined) {
                shape.data[key] = type === "text" ? "" : 0;
            }
        });
    };

    const saveShapes = useCallback((shapes: Shape[]) => {
        shapes.forEach(shape => {
            fillMissingDataDefaults(shape);
            updateShapeBoundaries(shape);
        });
        shapeApis.saveShapes(strategyRef.current, symbolRef.current, shapes);
    }, []);

    const saveTemplates = useCallback(async (templates: ShapeTemplate[]) => {
        await shapeApis.saveTemplates(strategyRef.current, symbolRef.current, templates);
    }, []);

    const pollUpdates = useCallback(async () => {
        if (!symbolRef.current || !strategyRef.current) return;
        
        const now = Date.now();

        // 1. Core Shape updates (500ms cycle handler)
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
                changed.forEach(updatedShape => {
                    const idx = shapesRef.current.findIndex(s => s.id === updatedShape.id);
                    if (idx >= 0) shapesRef.current[idx] = updatedShape;
                    else shapesRef.current.push(updatedShape);
                });
                notifyShapeListeners();
            }
        } catch (e) {
            console.error("Shape polling error", e);
        }

        // 2. ShapeTemplate updates (1000ms cycle handler with execution lock)
        if (now - lastTemplatePollTsRef.current >= 1000) {
            if (!isPollingTemplateRef.current) {
                isPollingTemplateRef.current = true;
                try {
                    const serverTemplates = await shapeApis.getTemplates(strategyRef.current, symbolRef.current);
                    templatesRef.current = serverTemplates;
                    lastTemplatePollTsRef.current = Date.now();
                    notifyTemplateListeners();
                } catch (e) {
                    console.error("Template polling error", e);
                } finally {
                    isPollingTemplateRef.current = false;
                }
            }
        }
    }, [viewport, notifyShapeListeners, notifyTemplateListeners]);

    const updateData = async (symbol: string, strategyName: string) => {
        symbolRef.current = symbol;
        strategyRef.current = strategyName;
        
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        
        const view = viewport.getTransformedView();
        const extend = CONFIG.SHAPES.CACHE_EXTEND_RATIO;
        const deltaTs = view.toTs - view.fromTs;
        
        // Initial loader synchronization requests
        const [loadedShapes, loadedTemplates] = await Promise.all([
            shapeApis.getShapes(
                strategyName, 
                symbol, 
                view.fromTs - deltaTs * extend, 
                view.toTs + deltaTs * extend
            ),
            shapeApis.getTemplates(strategyName, symbol)
        ]);

        shapesRef.current = loadedShapes;
        templatesRef.current = loadedTemplates;
        lastTemplatePollTsRef.current = Date.now();
        
        notifyShapeListeners();
        notifyTemplateListeners();

        // Common polling cycle executor
        pollingIntervalRef.current = window.setInterval(pollUpdates, 500);
    };

    const apiRef = useRef<ShapeData | null>(null);
    if (!apiRef.current) {
        apiRef.current = {
            getShapes: () => shapesRef.current,
            setShapes: (shapes) => { shapesRef.current = shapes; },
            getTemplates: () => templatesRef.current,
            setTemplates: (templates) => { templatesRef.current = templates; },
            getSymbol: () => symbolRef.current,
            getStrategyName: () => strategyRef.current,
            updateData,
            saveShapes,
            saveTemplates,
            addOnShapeDataChange: (id, cb) => onShapeDataChangeCallbacks.current.set(id, cb),
            removeOnShapeDataChange: (id) => onShapeDataChangeCallbacks.current.delete(id),
            addOnShapeTemplateChange: (id, cb) => onShapeTemplateChangeCallbacks.current.set(id, cb),
            removeOnShapeTemplateChange: (id) => onShapeTemplateChangeCallbacks.current.delete(id),
        };
    }

    return apiRef.current;
}