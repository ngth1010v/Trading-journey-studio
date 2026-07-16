import { useState, useCallback, useRef } from 'react';
import type { ShapeData } from '../data/useShapeData';
import type { ShapeController } from '../useShapeController';
import type { ShapeTemplate } from '../data/type';

export type ShapeEditorController = {
    isOpen: boolean;
    shapeId: number | null;
    position: { x: number; y: number };
    open: (shapeId: number, onChange?: (shapeId: number) => void, onClose?: (shapeId: number) => void) => void;
    close: () => number | null;
    removeShape: () => void;
    setPosition: (pos: { x: number; y: number }) => void;
    handleChange: (newSectionData: any, type: 'data' | 'styles', shapeData: ShapeData) => void;
};

export default function useShapeEditorController(initialPosition: { x: number; y: number }, shapeController: ShapeController): ShapeEditorController {
    const [isOpen, setIsOpen] = useState(false);
    const [shapeId, setShapeId] = useState<number | null>(null);
    const [position, setPosition] = useState(initialPosition);

    const onChangeRef = useRef<((shapeId: number) => void) | null>(null);
    const onCloseRef = useRef<((shapeId: number) => void) | null>(null);

    const open = useCallback((newShapeId: number, onChange?: (shapeId: number) => void, onClose?: (shapeId: number) => void) => {
        // Trigger onClose on the old shape if one is currently open
        if (isOpen && shapeId !== null && onCloseRef.current) {
            onCloseRef.current(shapeId);
        }
        
        setShapeId(newShapeId);
        setIsOpen(true);
        onChangeRef.current = onChange || null;
        onCloseRef.current = onClose || null;
    }, [isOpen, shapeId]);

    const close = useCallback(() => {
        if (!isOpen || shapeId === null) return null;
        
        const closedShapeId = shapeId;
        if (onCloseRef.current) {
            onCloseRef.current(closedShapeId);
        }
        
        setIsOpen(false);
        setShapeId(null);
        onChangeRef.current = null;
        onCloseRef.current = null;
        
        return closedShapeId;
    }, [isOpen, shapeId]);

    const removeShape = useCallback(() => {
        if (shapeId){
            const lastShapeId = shapeId
            close()
            shapeController.remove(lastShapeId)
        }
    },[shapeId])

    const handleChange = useCallback((newSectionData: any, type: 'data' | 'styles', shapeData: ShapeData) => {
        if (shapeId === null) return;

        const shapes = shapeData.getShapes();
        const targetShape = shapes.find(s => s.id === shapeId);
        if (!targetShape) return;

        // Update target shape property
        targetShape[type] = newSectionData;

        // Auto-save updated shape back to ShapeData
        // shapeData.saveShapes([]);
        shapeController.set(targetShape)

        //DEFAULT template update
        if (type === 'styles'){
            const defaultTemplateId = shapeData.getTemplates().findIndex((s: any) => s.name == "<<<DEFAULT>>>" && s.type == targetShape.type)
            const shape = {
                id: defaultTemplateId === -1 ? undefined : defaultTemplateId,
                type: targetShape.type,
                name: "<<<DEFAULT>>>",
                styles: JSON.parse(JSON.stringify(targetShape.styles))
            }as ShapeTemplate            
            shapeData.saveTemplates([shape])
        }



        if (onChangeRef.current) {
            onChangeRef.current(shapeId);
        }
    }, [shapeId]);

    return { 
        isOpen, 
        shapeId, 
        position, 
        open, 
        close,
        removeShape, 
        setPosition, 
        handleChange 
    };
}