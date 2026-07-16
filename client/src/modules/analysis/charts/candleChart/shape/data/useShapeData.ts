import { useRef, useCallback } from "react";
import type { Viewport } from "../../chart/viewport/useViewport";
import type { Shape, ShapeTemplate } from "./type";
import { shapeApis } from "../api/shapeApis";
import { CONFIG } from "../../shared/config";
import { SHAPE_MAP } from "../shapeMap";

export type ShapeData = {
    // Other
    getSymbol: () => string;
    getStrategyName: () => string;

    // Shape
    getShapes: () => Shape[];
    setShape: (shape: Shape) => void;
    remove: (shapeId: number) => Promise<void>;
    removeByType: (shapeType: string) => Promise<void>;
    updateData: (symbol: string, strategyName: string) => Promise<void>;

    addOnShapeDataChange: (id: string, callback: () => void) => void;
    removeOnShapeDataChange: (id: string) => void;

    // Template
    getTemplates: () => ShapeTemplate[];
    setTemplate: (template: ShapeTemplate) => void;
    removeTemplate: (templateId: number) => Promise<void>;

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

    const setShape = useCallback((shape: Shape) => {
        fillMissingDataDefaults(shape);
        updateShapeBoundaries(shape);

        // Update local state (upsert)
        const existingIdx = shapesRef.current.findIndex((s) => s.id !== undefined && s.id === shape.id);
        if (existingIdx >= 0) {
            shapesRef.current[existingIdx] = shape;
        } else {
            shapesRef.current.push(shape);
        }

        notifyShapeListeners();

        // Trigger backend save
        shapeApis.saveShapes(strategyRef.current, symbolRef.current, [shape]);
    }, [notifyShapeListeners]);

    const remove = useCallback(async (shapeId: number) => {
        await shapeApis.removeShape(
            strategyRef.current,
            symbolRef.current,
            shapeId
        );

        shapesRef.current = shapesRef.current.filter(
            shape => shape.id !== shapeId
        );

        notifyShapeListeners();
    }, [notifyShapeListeners]);

    const removeByType = useCallback(async (shapeType: string) => {
        await shapeApis.removeShapesByType(
            strategyRef.current,
            symbolRef.current,
            shapeType
        );

        shapesRef.current = shapesRef.current.filter(
            shape => shape.type !== shapeType
        );

        notifyShapeListeners();
    }, [notifyShapeListeners]);

    const setTemplate = useCallback((template: ShapeTemplate) => {
        // Update local state (upsert)
        const existingIdx = templatesRef.current.findIndex((t) => t.id !== undefined && t.id === template.id);
        if (existingIdx >= 0) {
            templatesRef.current[existingIdx] = template;
        } else {
            templatesRef.current.push(template);
        }

        notifyTemplateListeners();

        // Trigger backend save
        shapeApis.saveTemplates(strategyRef.current, symbolRef.current, [template]);
    }, [notifyTemplateListeners]);

    const removeTemplate = useCallback(async (templateId: number) => {
        await shapeApis.removeTemplate(strategyRef.current, symbolRef.current, templateId);
        templatesRef.current = templatesRef.current.filter(t => t.id !== templateId);
        notifyTemplateListeners();
    }, [notifyTemplateListeners]);

    const pollUpdates = useCallback(async () => {
        if (!symbolRef.current || !strategyRef.current) return;

        const now = Date.now();

        // 1. Core Shape updates
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

        // 2. ShapeTemplate updates
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

        pollingIntervalRef.current = window.setInterval(pollUpdates, 500);
    };

    const apiRef = useRef<ShapeData | null>(null);
    if (!apiRef.current) {
        apiRef.current = {
            getShapes: () => shapesRef.current,
            setShape,
            getTemplates: () => templatesRef.current,
            setTemplate,
            getSymbol: () => symbolRef.current,
            getStrategyName: () => strategyRef.current,
            updateData,
            remove,
            removeByType,
            removeTemplate,
            addOnShapeDataChange: (id, cb) => onShapeDataChangeCallbacks.current.set(id, cb),
            removeOnShapeDataChange: (id) => onShapeDataChangeCallbacks.current.delete(id),
            addOnShapeTemplateChange: (id, cb) => onShapeTemplateChangeCallbacks.current.set(id, cb),
            removeOnShapeTemplateChange: (id) => onShapeTemplateChangeCallbacks.current.delete(id),
        };
    }

    return apiRef.current;
}