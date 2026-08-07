import React, { useState, useEffect, useRef } from "react";
import style from "./FloatingBar.module.css";
import SeasonBar from "./season/SeasonBar";
import DragIcon from "../../../../../../assets/icons/dots-six-vertical.svg?react";
import ThemeData, { type Theme } from "../../../../../data/theme/ThemeData";
import type StateData from "../../state/StateData";
import type ChartController from "../../chart/ChartController";
import type { Config } from "../../state/config/ConfigData";

type FloatingBarName = keyof NonNullable<Config["floatingBar"]>;

interface FloatingBarWrapperProps {
  children: (dragButton: React.ReactNode) => React.ReactNode;
  floatingBarName: FloatingBarName;
  state: StateData;
  chart: ChartController;
}

function FloatingBarWrapper({
  children,
  floatingBarName,
  state,
}: FloatingBarWrapperProps) {
  const ID_WRAPPER = `[candleChart][interface][floatingBar][FloatingBarWrapper_${floatingBarName}]`;

  // Theme setup
  const themeDataRef = useRef<ThemeData>(new ThemeData());
  const [theme, setTheme] = useState<Theme | null>(() =>
    themeDataRef.current.getSelected()
  );

  useEffect(() => {
    themeDataRef.current.init();
    themeDataRef.current.addOnSelectedThemeDataChange(
      `${ID_WRAPPER} theme loader`,
      () => {
        setTheme(themeDataRef.current.getSelected());
      }
    );

    return () => {
      themeDataRef.current.removeOnSelectedThemeDataChange(
        `${ID_WRAPPER} theme loader`
      );
      themeDataRef.current.destroy();
    };
  }, [ID_WRAPPER]);

  // Read config state
  const [enabled, setEnabled] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 50,
    y: 50,
  });

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Dragging refs
  const isDraggingRef = useRef(false);
  const dragStartOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const boundsRef = useRef<{
    maxX: number;
    maxY: number;
    parentLeft: number;
    parentTop: number;
  }>({ maxX: 0, maxY: 0, parentLeft: 0, parentTop: 0 });
  
  const currentPosRef = useRef<{ x: number; y: number }>({ x: 50, y: 50 });
  const animationFrameRef = useRef<number | null>(null);

  // Keep state and ref synchronized
  useEffect(() => {
    currentPosRef.current = position;
  }, [position]);

  // Track enable state dynamically from config
  useEffect(() => {
    const listenerId = `${ID_WRAPPER}_config_listener`;
    const updateFromConfig = () => {
      // Do not overwrite position while the user is actively dragging
      if (isDraggingRef.current) return;

      const cfg = state.config.get()?.floatingBar?.[floatingBarName];
      if (cfg && cfg.enable !== undefined) {
        setEnabled(cfg.enable);
        const newPos = {
          x: cfg.position?.x != null ? cfg.position.x : 50,
          y: cfg.position?.y != null ? cfg.position.y : 50,
        };
        setPosition(newPos);
        currentPosRef.current = newPos;
      }
    };

    state.config.addOnConfigDataChange(listenerId, ["floatingBar"], updateFromConfig);

    return () => {
      state.config.removeOnConfigDataChange(listenerId);
    };
  }, [state, floatingBarName, ID_WRAPPER]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wrapperRef.current) return;
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const selfRect = wrapperRef.current.getBoundingClientRect();
    const parent =
      (wrapperRef.current.offsetParent as HTMLElement) || document.body;
    const parentRect = parent.getBoundingClientRect();

    dragStartOffsetRef.current = {
      x: e.clientX - selfRect.left,
      y: e.clientY - selfRect.top,
    };

    // Cache parent boundaries once to prevent layout thrashing on move
    const maxX = parentRect.width - selfRect.width;
    const maxY = parentRect.height - selfRect.height;

    boundsRef.current = {
      maxX: maxX > 0 ? maxX : 0,
      maxY: maxY > 0 ? maxY : 0,
      parentLeft: parentRect.left,
      parentTop: parentRect.top,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;

    const { maxX, maxY, parentLeft, parentTop } = boundsRef.current;

    let newX = e.clientX - parentLeft - dragStartOffsetRef.current.x;
    let newY = e.clientY - parentTop - dragStartOffsetRef.current.y;

    // Bound check
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    currentPosRef.current = { x: newX, y: newY };

    // Throttle rendering via requestAnimationFrame for 60fps drag
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        setPosition(currentPosRef.current);
        animationFrameRef.current = null;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture release fails
    }

    const finalPos = currentPosRef.current;
    setPosition(finalPos);

    // Persist position back to config only when dragging finishes
    state.config.set({
      floatingBar: {
        [floatingBarName]: {
          position: { x: finalPos.x, y: finalPos.y },
        },
      },
    });
  };

  if (!enabled) return null;

  const dragIconFill = theme?.button?.normal1?.font
    ? `rgb(${theme.button.normal1.font.join(",")})`
    : "#c5c7d0";

  const dragButton = (
    <div
      className={style.dragZone}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      title="Drag to reposition"
    >
      <DragIcon className={style.dragIcon} style={{ fill: dragIconFill }} />
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className={style.floatingBarWrapper}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {children(dragButton)}
    </div>
  );
}

export default function FloatingBar({
  state,
  chart,
}: {
  state: any;
  chart: any;
}) {
  return (
    <div className={style.FloatingBar}>
      {/* SEASON BAR */}
      <FloatingBarWrapper floatingBarName="seasonBar" state={state} chart={chart}>
        {(dragButton) => (
          <SeasonBar state={state} chart={chart} dragButton={dragButton} />
        )}
      </FloatingBarWrapper>

      {/* SHAPE BAR */}
      {/* <FloatingBarWrapper floatingBarName="shapeBar" state={state} chart={chart}>
        {(dragButton) => (
          <div>
            {dragButton}
            <span>PLACEHOLDER</span>
          </div>
        )}
      </FloatingBarWrapper> */}

      {/* TRADE BAR */}
      {/* <FloatingBarWrapper floatingBarName="tradeBar" state={state} chart={chart}>
        {(dragButton) => (
          <div>
            {dragButton}
            <span>PLACEHOLDER</span>
          </div>
        )}
      </FloatingBarWrapper> */}
    </div>
  );
}