import React, { useState, useEffect, useRef } from "react";
import style from "./ButtonWithPopover.module.css";

export default function ButtonWithPopover({
    type = "click",
    position = "bottom",
    align = "center",
    onPopupOpen,
    onPopupClose,
    button,
    popup
}: {
    type?: "hover" | "click";
    position?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    onPopupOpen?: () => void;
    onPopupClose?: () => void;
    button: React.ReactNode;
    popup: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isRendered, setIsRendered] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync rendering state with open state
    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
            onPopupOpen?.();
        }
    }, [isOpen]);

    // Handle clicking outside to close (Only for type="click")
    useEffect(() => {
        if (type !== "click" || !isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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

    // Capitalize strings for dynamic class map matches (e.g., Top, Bottom, Start, Center, End)
    const posClass = position.charAt(0).toUpperCase() + position.slice(1);
    const alignClass = align.charAt(0).toUpperCase() + align.slice(1);

    const combinedClassName = `${style.Container} ${style[posClass]} ${style[`Align${alignClass}`]}`;

    return (
        <div 
            ref={containerRef} 
            className={combinedClassName}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className={style.ButtonContainer} onClick={handleButtonClick}>
                {button}
            </div>
            
            {isRendered && (
                <div 
                    className={`${style.PopupContainer} ${isOpen ? style.Open : style.Close}`}
                    onAnimationEnd={handleAnimationEnd}
                >
                    {popup}
                </div>
            )}
        </div>
    );
}