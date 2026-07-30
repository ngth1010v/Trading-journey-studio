import LinkData from "./link/LinkData";
import type StateData from "../StateData";

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

  private stateData: StateData | null = null;
  private transformCache: ViewportTransform = { ...DEFAULT_TRANSFORM };
  private transformListeners: Map<string, () => void> = new Map();

  constructor() {
    this.link = new LinkData();
  }

  /**
   * Initializes the transform state, stores StateData reference, and initializes LinkData.
   */
  public init(stateData: StateData): void {
    this.stateData = stateData;
    this.transformCache = { ...DEFAULT_TRANSFORM };
    this.link.init();
  }

  /**
   * Cleans up listeners, references, and LinkData instance.
   */
  public destroy(): void {
    this.link.destroy();
    this.transformListeners.clear();
    this.stateData = null;
  }

  /**
   * Delegates retrieving viewport to ConfigData (source of truth).
   */
  private getView(): Viewport {
    if (!this.stateData) {
      throw new Error("ViewportData: ViewportData has not been initialized with StateData yet.");
    }

    const viewport = this.stateData.config.get().data?.viewport;
    if (!viewport) {
      throw new Error("ViewportData: Viewport has not been set in ConfigData yet.");
    }

    return { ...viewport };
  }

  /**
   * Delegates setting viewport to ConfigData (source of truth).
   */
  private setView(viewport: Viewport): void {
    if (!this.stateData) {
      throw new Error("ViewportData: ViewportData has not been initialized with StateData yet.");
    }

    this.stateData.config.set({
      data: {
        viewport: { ...viewport },
      },
    });
  }

  /**
   * Merges current transformCache into ConfigData viewport and resets transformCache to default.
   */
  public flushTransform(): void {
    const currentView = this.getView(); // Will throw if stateData or viewport is missing
    const { scaleTs, offsetTs, scalePrice, offsetPrice } = this.transformCache;

    const newViewport: Viewport = {
      fromTs: currentView.fromTs * scaleTs + offsetTs,
      toTs: currentView.toTs * scaleTs + offsetTs,
      fromPrice: currentView.fromPrice * scalePrice + offsetPrice,
      toPrice: currentView.toPrice * scalePrice + offsetPrice,
    };

    // Update config viewport
    this.setView(newViewport);

    // Reset transform to default and notify listeners
    this.setTransform({ ...DEFAULT_TRANSFORM });
  }

  public getTransform(): ViewportTransform {
    return { ...this.transformCache };
  }

  public setTransform(transform: ViewportTransform): void {
    this.transformCache = { ...transform };
    console.log(transform);
    this.notifyTransformListeners();
  }

  public addOnViewportTransformDataChange(id: string, cb: () => void): void {
    this.transformListeners.set(id, cb); // Map.set automatically overwrites duplicate key
  }

  public removeOnViewportTransformDataChange(id: string): void {
    this.transformListeners.delete(id);
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