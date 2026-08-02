import LinkData from "./link/LinkData";
import type StateData from "../StateData";
import ChartController from "../../chart/ChartController";

export interface Viewport {
  fromTs: number;
  toTs: number;
  fromPrice: number;
  toPrice: number;
}

export interface ViewportTransform {
  scaleX: number;
  offsetX: number;
  scaleY: number;
  offsetY: number;
}

export interface CanvasSize {
  w: number;
  h: number;
}

export type CanvasRef = { current: HTMLCanvasElement | null };

const DEFAULT_TRANSFORM: ViewportTransform = {
  scaleX: 1,
  offsetX: 0,
  scaleY: 1,
  offsetY: 0,
};

export default class ViewportData {
  public link: LinkData;

  private stateData: StateData | null = null;
  private chart: ChartController | null = null
  private transformCache: ViewportTransform = { ...DEFAULT_TRANSFORM };
  private transformListeners: Map<string, () => void> = new Map();

  constructor() {
    this.link = new LinkData();
  }

  /**
   * Initializes the transform state, stores StateData reference, and initializes LinkData.
   */
  public init(stateData: StateData, chart: ChartController): void {
    this.chart = chart
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
   * Merges current transformCache into ConfigData viewport and resets transformCache to default.
   */
  public flushTransform(): void {
    const chart = this.chart;
    if (!chart) {
      throw new Error("ViewportController: Chart is not initialized.");
    }

    const { w, h } = chart.event.getCanvasSize();
    if (w <= 0 || h <= 0) {
      throw new Error("ViewportController: Invalid canvas size.");
    }

    const { offsetX, offsetY, scaleX, scaleY } = this.transformCache;

    // Ensure we don't divide by zero if scale became 0
    if (scaleX === 0 || scaleY === 0) {
      return;
    }

    const converter = chart.viewport.converter;

    // Convert current transformed screen boundaries back to original canvas pixel space:
    // Screen X=0 -> Original Pixel X = -offsetX / scaleX
    // Screen X=w -> Original Pixel X = (w - offsetX) / scaleX
    const leftPixel = -offsetX / scaleX;
    const rightPixel = (w - offsetX) / scaleX;

    // Screen Y=0 (top)    -> Original Pixel Y = -offsetY / scaleY
    // Screen Y=h (bottom) -> Original Pixel Y = (h - offsetY) / scaleY
    const topPixel = -offsetY / scaleY;
    const bottomPixel = (h - offsetY) / scaleY;

    // Convert pixel offsets to world coordinates (ts / price)
    const fromTs = converter.pixelToTimestamp(leftPixel);
    const toTs = converter.pixelToTimestamp(rightPixel);

    // Note: Y=0 (topPixel) maps to toPrice; Y=h (bottomPixel) maps to fromPrice
    const toPrice = converter.pixelToPrice(topPixel);
    const fromPrice = converter.pixelToPrice(bottomPixel);

    if (
      fromTs == null ||
      toTs == null ||
      fromPrice == null ||
      toPrice == null
    ) {
      return;
    }

    if (!this.stateData) {
      throw new Error("ViewportData: ViewportData has not been initialized with StateData yet.");
    }
    this.stateData.config.set({
      viewport: {
        fromTs,
        toTs,
        fromPrice,
        toPrice,
      },
    });

    this.setTransform({ ...DEFAULT_TRANSFORM });
  }


  

  public getTransform(): ViewportTransform {
    return { ...this.transformCache };
  }

  public setTransform(transform: ViewportTransform): void {
    this.transformCache = { ...transform };
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