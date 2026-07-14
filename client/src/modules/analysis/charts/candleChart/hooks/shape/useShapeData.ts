import { useRef, useCallback } from "react";
import type { Viewport } from "../viewport/useViewport";
import type { Shape } from "../../shared/types";
import { shapeApis } from "../../api/shapeApis";
import { CONFIG } from "../../shared/config";
import { SHAPE_MAP } from "./shapeMap";

export type ShapeData = {
    getShapes: () => Shape[];
    setShapes: (shapes: Shape[]) => void;
    getSymbol: () => string;
    getStrategyName: () => string;
    updateData: (symbol: string, strategyName: string) => Promise<void>;
    saveShapes: (shapes: Shape[]) => void;
    addOnShapeDataChange: (id: string, callback: () => void) => void;
    removeOnShapeDataChange: (id: string) => void;
};

export default function useShapeData(
    viewport: Viewport
): ShapeData {
    const symbolRef = useRef<string>("");
    const strategyRef = useRef<string>("");
    const shapesRef = useRef<Shape[]>([]);
    const lastUpdateTsRef = useRef<number>(Date.now());
    const pollingIntervalRef = useRef<number | null>(null);

    const onShapeDataChangeCallbacks = useRef<Map<string, () => void>>(new Map());

    const notifyListeners = useCallback(() => {
        onShapeDataChangeCallbacks.current.forEach((cb) => cb());
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
                
                // Note: The active shape check bypass logic remains handled up-level or via raw checks during mutations
                changed.forEach(updatedShape => {
                    const idx = shapesRef.current.findIndex(s => s.id === updatedShape.id);
                    if (idx >= 0) shapesRef.current[idx] = updatedShape;
                    else shapesRef.current.push(updatedShape);
                });

                notifyListeners();
            }
        } catch (e) {
            console.error("Shape polling error", e);
        }
    }, [viewport, notifyListeners]);

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
        
        notifyListeners();

        // 0.5s polling
        pollingIntervalRef.current = window.setInterval(pollUpdates, 500);
    };

    const apiRef = useRef<ShapeData | null>(null);
    if (!apiRef.current) {
        apiRef.current = {
            getShapes: () => shapesRef.current,
            setShapes: (shapes) => { shapesRef.current = shapes; },
            getSymbol: () => symbolRef.current,
            getStrategyName: () => strategyRef.current,
            updateData,
            saveShapes,
            addOnShapeDataChange: (id, cb) => onShapeDataChangeCallbacks.current.set(id, cb),
            removeOnShapeDataChange: (id) => onShapeDataChangeCallbacks.current.delete(id),
        };
    }

    return apiRef.current;
}