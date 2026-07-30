import LinkData from "./link/LinkData";

export interface Viewport {
  fromTs: number;
  toTs: number;
  fromPrice: number;
  toPrice: number;
}

export interface ViewportTransform {
  scaleTs: number;
  offsetTs: number;
  scalePrice: number;
  offsetPrice: number;
}

export interface CanvasSize {
  w: number;
  h: number;
}

export type CanvasRef = { current: HTMLCanvasElement | null };

const DEFAULT_TRANSFORM: ViewportTransform = {
  scaleTs: 1,
  offsetTs: 0,
  scalePrice: 1,
  offsetPrice: 0,
};

export default class ViewportData {
  public link: LinkData;

  private viewportCache: Viewport | null = null;
  private transformCache: ViewportTransform = { ...DEFAULT_TRANSFORM };

  private canvasSizeCache: CanvasSize | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private viewportListeners: Map<string, () => void> = new Map();
  private transformListeners: Map<string, () => void> = new Map();
  private resizeListeners: Map<string, () => void> = new Map();

  constructor() {
    this.link = new LinkData();
  }

  /**
   * Initializes the transform state and initializes LinkData.
   */
  public init(): void {
    this.transformCache = { ...DEFAULT_TRANSFORM };
    this.link.init();
  }

  /**
   * Cleans up listeners, ResizeObserver, and LinkData instance.
   */
  public destroy(): void {
    this.stopResizeObserver();
    this.link.destroy();
    this.viewportListeners.clear();
    this.transformListeners.clear();
    this.resizeListeners.clear();
    this.viewportCache = null;
    this.canvasSizeCache = null;
  }

  /**
   * Sets up the canvas React ref and starts monitoring size changes with ResizeObserver.
   */
  public setCanvasRef(canvasRef: CanvasRef): void {
    if (!canvasRef || !canvasRef.current) {
      throw new Error(
        "ViewportData: canvasRef or canvasRef.current is null or undefined."
      );
    }

    const canvasElement = canvasRef.current;

    // Clean up existing observer if re-assigned
    this.stopResizeObserver();

    // Read initial size
    this.canvasSizeCache = {
      w: canvasElement.clientWidth,
      h: canvasElement.clientHeight,
    };

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === canvasElement) {
          const { width, height } = entry.contentRect;
          this.canvasSizeCache = { w: width, h: height };
          this.notifyResizeListeners();
        }
      }
    });

    this.resizeObserver.observe(canvasElement);
  }

  public getCanvasSize(): CanvasSize {
    if (!this.canvasSizeCache) {
      throw new Error(
        "ViewportData: Canvas size has not been initialized. Call setCanvasRef() first."
      );
    }
    return { ...this.canvasSizeCache };
  }

  public getView(): Viewport {
    if (!this.viewportCache) {
      throw new Error("ViewportData: Viewport has not been set yet. Call setView() first.");
    }
    return { ...this.viewportCache };
  }

  public setView(viewport: Viewport): void {
    this.viewportCache = { ...viewport };
    this.notifyViewportListeners();
  }

  public getTransform(): ViewportTransform {
    return { ...this.transformCache };
  }

  public setTransform(transform: ViewportTransform): void {
    this.transformCache = { ...transform };
    this.notifyTransformListeners();
  }

  public addOnViewportDataChange(id: string, cb: () => void): void {
    this.viewportListeners.set(id, cb); // Map.set automatically overwrites duplicate key
  }

  public removeOnViewportDataChange(id: string): void {
    this.viewportListeners.delete(id);
  }

  public addOnViewportTransformDataChange(id: string, cb: () => void): void {
    this.transformListeners.set(id, cb); // Map.set automatically overwrites duplicate key
  }

  public removeOnViewportDataTransformChange(id: string): void {
    this.transformListeners.delete(id);
  }

  public addOnCanvasResize(id: string, cb: () => void): void {
    this.resizeListeners.set(id, cb); // Map.set automatically overwrites duplicate key
  }

  public removeOnCanvasResize(id: string): void {
    this.resizeListeners.delete(id);
  }

  private stopResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private notifyViewportListeners(): void {
    for (const callback of this.viewportListeners.values()) {
      try {
        callback();
      } catch (err) {
        console.error("ViewportData: Error inside viewport listener callback:", err);
      }
    }
  }

  private notifyTransformListeners(): void {
    for (const callback of this.transformListeners.values()) {
      try {
        callback();
      } catch (err) {
        console.error("ViewportData: Error inside transform listener callback:", err);
      }
    }
  }

  private notifyResizeListeners(): void {
    for (const callback of this.resizeListeners.values()) {
      try {
        callback();
      } catch (err) {
        console.error("ViewportData: Error inside canvas resize listener callback:", err);
      }
    }
  }
}