import { useCallback, useRef } from "react";
import { CONFIG } from "../shared/config";
import type { Viewport } from "./useViewport";

export type ViewController = {
  onMouseDown   : (x: number, y: number, button: number) => void;
  onMouseUp     : (x: number, y: number, button: number) => Promise<void> | void;
  onMouseLeave  : (x: number, y: number, button: number) => Promise<void> | void;
  onMouseMove   : (x: number, y: number) => void;
  onWheel       : (x: number, y: number, delta: number) => void;
  onKeyDown     : (key: string) => void;
  onKeyUp       : (key: string) => void;
};

//======================================================================================================
// LOGIC
//======================================================================================================
type Point = {
  x: number;
  y: number;
};

const LEFT_BUTTON = 0;


export default function useViewController(viewport: Viewport): ViewController {
  const mouseStartPos = useRef<Point>({ x: 0, y: 0 });
  const mousePos = useRef<Point>({ x: 0, y: 0 });
  const mouseDragging = useRef<boolean>(false);
  const pressingKey = useRef<Set<string>>(new Set<string>());

  const onMouseDown = useCallback(
    (x: number, y: number, button: number): void => {
      if (button !== LEFT_BUTTON) {
        return;
      }

      mouseDragging.current = true;
      mouseStartPos.current.x = x;
      mouseStartPos.current.y = y;
      mousePos.current.x = x;
      mousePos.current.y = y;
    },
    [],
  );

  const onMouseUp = useCallback(
    async (_x: number, _y: number, button: number): Promise<void> => {
      if (button !== LEFT_BUTTON) {
        return;
      }

      if (!mouseDragging.current) {
        return;
      }

      mouseDragging.current = false;
      await viewport.flush();
    },
    [viewport],
  );

  const onMouseMove = useCallback(
    (x: number, y: number): void => {
      if (!mouseDragging.current) {
        return;
      }

      mousePos.current.x = x;
      mousePos.current.y = y;

      const rx = mouseStartPos.current.x - mousePos.current.x;
      const ry = mouseStartPos.current.y - mousePos.current.y;

      viewport.setOffsetTimestamp(rx);
      viewport.setOffsetPrice(ry);
    },
    [viewport],
  );

  const onMouseLeave = useCallback(
    async (_x: number, _y: number, button: number): Promise<void> => {
      if (button !== LEFT_BUTTON) {
        return;
      }

      if (!mouseDragging.current) {
        return;
      }

      mouseDragging.current = false;
      await viewport.flush();
    },
    [viewport],
  );

  const onWheel = useCallback(
    (x: number, y: number, delta: number): void => {
      if (mouseDragging.current) {
        return;
      }

      const baseStep = CONFIG.VIEW_CONTROLLER.CLIENT_EVENT.SCALE_RATIO;

      // Use wheel direction + magnitude:
      // delta < 0 => zoom in
      // delta > 0 => zoom out
      const direction = delta > 0 ? 1 : -1;
      const magnitude = Math.max(1, Math.abs(delta) / 120);
      const scaleFactor = Math.pow(baseStep, magnitude);
      const step = direction > 0 ? scaleFactor : 1 / scaleFactor;
      
      if (!pressingKey.current.has("Alt")) {
        viewport.setScaleTimestamp(step, x, true);
      }
      if (!pressingKey.current.has("Control")) {
        viewport.setScalePrice(step, y, true);
      }
      
      viewport.flush()
    },
    [viewport],
  );
  
  const onKeyDown = useCallback(
    (key: string): void => {
      if (key === "") {
        return;
      }
      
      pressingKey.current.add(key);

      if (pressingKey.current.has("Control") && pressingKey.current.has("r")) {
        viewport.setAutoPrice();
      }
    },
    [viewport],
  );

  const onKeyUp = useCallback((key: string): void => {
    if (key === "") {
      return;
    }

    pressingKey.current.delete(key);
  }, []);

  return {
    onMouseDown,
    onMouseUp,
    onMouseMove,
    onWheel,
    onKeyDown,
    onKeyUp,
    onMouseLeave
  };
}
