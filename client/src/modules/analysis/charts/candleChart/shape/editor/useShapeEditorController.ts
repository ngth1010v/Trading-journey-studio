import { useState, useCallback, useRef } from 'react';
import type { Shape } from '../data/type';

export type ShapeEditorController = {
    isOpen: boolean;
    shape: Shape | null;
    position: { x: number; y: number };
    open: (newShape: Shape, onChange?: (shape: Shape) => void, onClose?: (shape: Shape) => void) => void;
    close: () => Shape | null;
    setPosition: (pos: { x: number; y: number }) => void;
    handleChange: (newSectionData: any, type: 'data' | 'styles') => void;
};

export default function useShapeEditorController(initialPosition: { x: number; y: number }): ShapeEditorController {
    const [isOpen, setIsOpen] = useState(false);
    const [shape, setShape] = useState<Shape | null>(null);
    const [position, setPosition] = useState(initialPosition);

    const onChangeRef = useRef<((shape: Shape) => void) | null>(null);
    const onCloseRef = useRef<((shape: Shape) => void) | null>(null);

    const open = useCallback((newShape: Shape, onChange?: (shape: Shape) => void, onClose?: (shape: Shape) => void) => {
        // Trigger onClose on the old shape if one is currently open
        if (isOpen && shape && onCloseRef.current) {
            onCloseRef.current(shape);
        }
        
        setShape(newShape);
        setIsOpen(true);
        onChangeRef.current = onChange || null;
        onCloseRef.current = onClose || null;
    }, [isOpen, shape]);

    const close = useCallback(() => {
        if (!isOpen || !shape) return null;
        
        const closedShape = shape;
        if (onCloseRef.current) {
            onCloseRef.current(closedShape);
        }
        
        setIsOpen(false);
        setShape(null);
        onChangeRef.current = null;
        onCloseRef.current = null;
        
        return closedShape;
    }, [isOpen, shape]);

    const handleChange = useCallback((newSectionData: any, type: 'data' | 'styles') => {
        if (!shape) return;
        
        const updatedShape = { ...shape, [type]: newSectionData };
        setShape(updatedShape);
        
        if (onChangeRef.current) {
            onChangeRef.current(updatedShape);
        }
    }, [shape]);

    return { 
        isOpen, 
        shape, 
        position, 
        open, 
        close, 
        setPosition, 
        handleChange 
    };
}