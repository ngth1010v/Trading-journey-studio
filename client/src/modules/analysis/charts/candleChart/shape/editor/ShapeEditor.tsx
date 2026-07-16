import React, { useRef } from 'react';
import style from './ShapeEditor.module.css';
import type { ShapeEditorController } from './useShapeEditorController';
import type { ShapeData } from '../data/useShapeData';
import { SHAPE_MAP } from '../shapeMap';
import ButtonWithPopover from '../../../../../../shared/components/ButtonWithPopover';

import PanelInput from '../../../../../input/panel/PanelInput'; 

import DragIcon from '../../../../../../assets/icons/dots-six-vertical.svg?react';
import DataIcon from '../../../../../../assets/icons/database.svg?react';
import StyleIcon from '../../../../../../assets/icons/paint-brush-broad.svg?react';

export default function ShapeEditor({
    shapeEditorController,
    shapeData
}: {
    shapeEditorController: ShapeEditorController;
    shapeData: ShapeData;
}) {
    const { isOpen, shapeId, position, setPosition, handleChange } = shapeEditorController;
    const panelRef = useRef<HTMLDivElement>(null);

    if (!isOpen || shapeId === null) return null;

    // Dynamically retrieve shape directly from ShapeData using shapeId
    const shape = shapeData.getShapes().find(s => s.id === shapeId);
    if (!shape) return null;

    const shapeDef = (SHAPE_MAP as any)[shape.type];
    if (!shapeDef) return null;

    const ShapeIcon = shapeDef.icon;

    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startPosX = position.x;
        const startPosY = position.y;

        const onMouseMove = (moveEvent: MouseEvent) => {
            let newX = startPosX + (moveEvent.clientX - startX);
            let newY = startPosY + (moveEvent.clientY - startY);

            // Restrict panel to stay inside the parent chart container
            if (panelRef.current && panelRef.current.parentElement) {
                const parentRect = panelRef.current.parentElement.getBoundingClientRect();
                const panelRect = panelRef.current.getBoundingClientRect();
                
                newX = Math.max(0, Math.min(newX, parentRect.width - panelRect.width));
                newY = Math.max(0, Math.min(newY, parentRect.height - panelRect.height));
            }

            setPosition({ x: newX, y: newY });
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div 
            ref={panelRef}
            data-shape-editor="true"
            className={style.Panel} 
            style={{ left: position.x, top: position.y }}
        >
            <div className={style.DragZone} onMouseDown={handleDragStart}>
                <DragIcon className={style.Icon} />
            </div>

            <div className={style.ShapeInfo}>
                {ShapeIcon && <ShapeIcon className={style.Icon} />}
                <span className={style.ShapeName}>{shapeDef.name}</span>
            </div>

            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                button={
                    <div className={style.IconButton}>
                        <DataIcon className={style.Icon} />
                    </div>
                }
                popup={
                    <PanelInput 
                        layout={shapeDef.data} 
                        data={shape.data} 
                        minWidth='300px'
                        onDataChange={(newData: any) => handleChange(newData, 'data', shapeData)} 
                    />
                }
            />

            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                button={
                    <div className={style.IconButton}>
                        <StyleIcon className={style.Icon} />
                    </div>
                }
                popup={
                    <PanelInput 
                        layout={shapeDef.styles} 
                        minWidth='300px'
                        data={shape.styles} 
                        onDataChange={(newStyles: any) => handleChange(newStyles, 'styles', shapeData)} 
                    />
                }
            />
        </div>
    );
}