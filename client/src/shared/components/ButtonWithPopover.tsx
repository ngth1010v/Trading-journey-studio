import React, { useState, useEffect, useRef } from "react";
import style from "./ButtonWithPopover.module.css";

export default function ButtonWithPopover({
    type = "click",
    position = "bottom",
    align = "center",
    buttonWidth = "fit-content",
    buttonHeight = "fit-content",
    popupWidth = "fit-content",
    popupHeight = "fit-content",
    onPopupOpen,
    onPopupClose,
    button,
    popup
}: {
    type?: "hover" | "click";
    position?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    buttonWidth ?: string;
    buttonHeight?: string;
    popupWidth  ?: string;
    popupHeight ?: string;
    onPopupOpen?: () => void;
    onPopupClose?: () => void;
    button: React.ReactNode;
    popup: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isRendered, setIsRendered] = useState(false);
    
    const buttonRef = useRef<HTMLDivElement>(null);
    const bufferRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    // Sync rendering state with open state
    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
            onPopupOpen?.();
        }
    }, [isOpen, onPopupOpen]);

    // Handle clicking outside all three pieces to close (Only for type="click")
    useEffect(() => {
        if (type !== "click" || !isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            
            const clickedInsideButton = buttonRef.current?.contains(target);
            const clickedInsideBuffer = bufferRef.current?.contains(target);
            const clickedInsidePopup = popupRef.current?.contains(target);

            if (!clickedInsideButton && !clickedInsideBuffer && !clickedInsidePopup) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [type, isOpen]);

    const handleButtonClick = () => {
        if (type === "click") {
            setIsOpen((prev) => !prev);
        }
    };

    const handleMouseEnter = () => {
        if (type === "hover") {
            setIsOpen(true);
        }
    };

    // Only allow entering the buffer/popup to trigger 'open' if it hasn't already begun closing
    const handleSubElementMouseEnter = () => {
        if (type === "hover" && isOpen) {
            setIsOpen(true);
        }
    };

    const handleMouseLeave = () => {
        if (type === "hover") {
            setIsOpen(false);
        }
    };

    const handleAnimationEnd = () => {
        if (!isOpen) {
            setIsRendered(false);
            onPopupClose?.();
        }
    };

    const posClass = position.charAt(0).toUpperCase() + position.slice(1);
    const alignClass = align.charAt(0).toUpperCase() + align.slice(1);
    const combinedClassName = `${style.Container} ${style[posClass]} ${style[`Align${alignClass}`]}`;

    return (
        <div className={combinedClassName} style={{ width: buttonWidth, height: buttonHeight }}>
            {/* 1. BUTTON PART */}
            <div 
                ref={buttonRef}
                className={style.ButtonContainer} 
                onClick={handleButtonClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={{ width: buttonWidth, height: buttonHeight }}
            >
                {button}
            </div>
            
            {/* 2. BUFFER PART */}
            {isRendered && (
                <div
                    ref={bufferRef}
                    className={style.Buffer}
                    onMouseEnter={handleSubElementMouseEnter}
                    onMouseLeave={handleMouseLeave}
                />
            )}

            {/* 3. POPUP PART */}
            {isRendered && (
                <div 
                    ref={popupRef}
                    className={`${style.PopupContainer} ${isOpen ? style.Open : style.Close}`}
                    onAnimationEnd={handleAnimationEnd}
                    onMouseEnter={handleSubElementMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    style={{ width: popupWidth, height: popupHeight }}
                >
                    {popup}
                </div>
            )}
        </div>
    );
}