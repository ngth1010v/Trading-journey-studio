import type { SyntheticEvent, MouseEvent, KeyboardEvent } from "react";
import ViewportEventController from "./viewport/ViewportEventController";
import type StateData from "../../state/StateData";
import type ChartController from "../ChartController";

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
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private canvasSize: { w: number; h: number } = { w: 0, h: 0 };

  // Store listeners mapped by global ID for O(1) lookups and globally unique IDs
  private listeners: Map<string, ListenerEntry> = new Map();

  public viewport : ViewportEventController = new ViewportEventController()

  public init(state: StateData, chart: ChartController): void {
    this.viewport.init(state, chart)
  }

  public destroy() {
    this.viewport.destroy()
  }

  /**
   * Sets the React RefObject reference for the canvas element and sets up a ResizeObserver.
   */
  public setCanvas(canvas: HTMLCanvasElement): void {
    // Clean up previous observer if canvas instance changes or ref unmounts
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.canvas = canvas;

    const element = this.canvas;
    if (element) {
      // Initialize size upon setting the reference
      const rect = element.getBoundingClientRect();
      this.canvasSize = { w: rect.width, h: rect.height };

      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect) {
            this.canvasSize = {
              w: entry.contentRect.width,
              h: entry.contentRect.height,
            };
          }
        }
        this.dispatch("resize", entries);
      });
      this.resizeObserver.observe(element);
    } else {
      this.canvasSize = { w: 0, h: 0 };
    }
  }

  /**
   * Returns the cached width and height of the canvas.
   */
  public getCanvasSize(): { w: number; h: number } {
    return { ...this.canvasSize };
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

  public onWheel = (e: WheelEvent): void => {
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