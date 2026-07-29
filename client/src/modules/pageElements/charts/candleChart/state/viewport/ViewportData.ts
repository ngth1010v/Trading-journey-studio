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

  private viewportListeners: Map<string, () => void> = new Map();
  private transformListeners: Map<string, () => void> = new Map();

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
   * Cleans up listeners and LinkData instance.
   */
  public destroy(): void {
    this.link.destroy();
    this.viewportListeners.clear();
    this.transformListeners.clear();
    this.viewportCache = null;
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
    this.viewportListeners.set(id, cb);
  }

  public removeOnViewportDataChange(id: string): void {
    this.viewportListeners.delete(id);
  }

  public addOnViewportTransformDataChange(id: string, cb: () => void): void {
    this.transformListeners.set(id, cb);
  }

  public removeOnViewportDataTransformChange(id: string): void {
    this.transformListeners.delete(id);
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
}