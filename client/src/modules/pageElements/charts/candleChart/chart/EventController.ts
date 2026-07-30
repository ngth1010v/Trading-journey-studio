import type { RefObject, SyntheticEvent, MouseEvent, WheelEvent, KeyboardEvent } from "react";

export type EventType =
  | "mouseUp"
  | "mouseDown"
  | "mouseMove"
  | "mouseEnter"
  | "mouseLeave"
  | "wheel"
  | "keyDown"
  | "keyUp"
  | "resize";

export type EventCallback = (e: SyntheticEvent | UIEvent | Event | ResizeObserverEntry[] | any) => void;

interface ListenerEntry {
  type: EventType;
  cb: EventCallback;
}

export default class EventController {
  private canvasRef: RefObject<HTMLCanvasElement | null> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Store listeners mapped by global ID for O(1) lookups and globally unique IDs
  private listeners: Map<string, ListenerEntry> = new Map();

  /**
   * Sets the React RefObject reference for the canvas element and sets up a ResizeObserver.
   */
  public setCanvasRef(canvasRef: RefObject<HTMLCanvasElement | null>): void {
    // Clean up previous observer if canvas instance changes or ref unmounts
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.canvasRef = canvasRef;

    const element = this.canvasRef?.current;
    if (element) {
      this.resizeObserver = new ResizeObserver((entries) => {
        this.dispatch("resize", entries);
      });
      this.resizeObserver.observe(element);
    }
  }

  /**
   * Registers a callback for a specific event type under a globally unique ID.
   * If the ID already exists, it will overwrite the previous listener entry.
   */
  public addOnEvent(type: EventType, id: string, cb: EventCallback): void {
    this.listeners.set(id, { type, cb });
  }

  /**
   * Removes an event listener by its global ID.
   * Throws an error if the ID is not found.
   */
  public removeOnEvent(id: string): void {
    if (!this.listeners.has(id)) {
      throw new Error(`Event listener with id "${id}" not found.`);
    }
    this.listeners.delete(id);
  }

  /**
   * Internal dispatcher that executes all registered callbacks matching the target type.
   */
  private dispatch(type: EventType, e: SyntheticEvent | Event | ResizeObserverEntry[] | any): void {
    this.listeners.forEach((entry) => {
      if (entry.type === type) {
        entry.cb(e);
      }
    });
  }

  // --- React Synthetic Event Handlers ---

  public onMouseDown = (e: MouseEvent<HTMLCanvasElement>): void => {
    this.dispatch("mouseDown", e);
  };

  public onMouseUp = (e: MouseEvent<HTMLCanvasElement>): void => {
    this.dispatch("mouseUp", e);
  };

  public onMouseMove = (e: MouseEvent<HTMLCanvasElement>): void => {
    this.dispatch("mouseMove", e);
  };

  public onMouseEnter = (e: MouseEvent<HTMLCanvasElement>): void => {
    this.dispatch("mouseEnter", e);
  };

  public onMouseLeave = (e: MouseEvent<HTMLCanvasElement>): void => {
    this.dispatch("mouseLeave", e);
  };

  public onWheel = (e: WheelEvent<HTMLCanvasElement>): void => {
    this.dispatch("wheel", e);
  };

  public onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>): void => {
    this.dispatch("keyDown", e);
  };

  public onKeyUp = (e: KeyboardEvent<HTMLCanvasElement>): void => {
    this.dispatch("keyUp", e);
  };

  public onResize = (e: UIEvent | Event | ResizeObserverEntry[] | any): void => {
    this.dispatch("resize", e);
  };
}