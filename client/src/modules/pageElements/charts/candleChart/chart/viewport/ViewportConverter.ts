import type StateData from "../../state/StateData";
import ChartController from "../ChartController";
import type { Viewport } from "../../state/viewport/ViewportData";

export type ShaderWeights = {
  offset: number;
  multiplication: number;
  addition: number;
};

export default class ViewportConverter {
  private state: StateData | null = null;
  private chart: ChartController | null = null;

  /**
   * Initializes the converter with state reference.
   */
  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;
  }

  /**
   * Cleans up state references.
   */
  public destroy(): void {
    this.state = null;
    this.chart = null;
  }

  //======================================================================================================
  // CONVERTERS
  //======================================================================================================
  /**
   * Converts horizontal pixel offset on canvas to timestamp.
   */
  public pixelToTimestamp(pixel: number): number |null {
    const view = this.getViewport();
    if (!view) return null;

    const chart = this.getChart();
    const { w } = chart.event.getCanvasSize();

    if (w <= 0) {
      throw new Error("ViewportConverter: Canvas width must be greater than zero.");
    }

    const deltaTs = view.toTs - view.fromTs;
    if (deltaTs === 0) {
      throw new Error("ViewportConverter: Timestamp range must not be zero.");
    }

    return view.fromTs + (pixel / w) * deltaTs;
  }

  /**
   * Converts timestamp to horizontal pixel offset on canvas.
   */
  public timestampToPixel(timestamp: number): number | null {
    const view = this.getViewport();
    if (!view) return null;

    const chart = this.getChart();
    const { w } = chart.event.getCanvasSize();

    if (w <= 0) {
      throw new Error("ViewportConverter: Canvas width must be greater than zero.");
    }

    const deltaTs = view.toTs - view.fromTs;
    if (deltaTs === 0) {
      throw new Error("ViewportConverter: Timestamp range must not be zero.");
    }

    return ((timestamp - view.fromTs) / deltaTs) * w;
  }

  /**
   * Converts vertical pixel offset on canvas to price.
   */
  public pixelToPrice(pixel: number): number | null {
    const view = this.getViewport();
    if (!view) return null;

    const chart = this.getChart();
    const { h } = chart.event.getCanvasSize();

    if (h <= 0) {
      throw new Error("ViewportConverter: Canvas height must be greater than zero.");
    }

    const deltaPrice = view.toPrice - view.fromPrice;
    if (deltaPrice === 0) {
      throw new Error("ViewportConverter: Price range must not be zero.");
    }

    return view.fromPrice + ((h - pixel) / h) * deltaPrice;
  }

  /**
   * Converts price to vertical pixel offset on canvas.
   */
  public priceToPixel(price: number): number | null {
    const view = this.getViewport();
    if (!view) return null;

    const chart = this.getChart();
    const { h } = chart.event.getCanvasSize();

    if (h <= 0) {
      throw new Error("ViewportConverter: Canvas height must be greater than zero.");
    }

    const deltaPrice = view.toPrice - view.fromPrice;
    if (deltaPrice === 0) {
      throw new Error("ViewportConverter: Price range must not be zero.");
    }

    return h - ((price - view.fromPrice) / deltaPrice) * h;
  }

  //======================================================================================================
  // WORLD <-> SCREEN (transform-aware)
  //======================================================================================================

  /**
   * Base pixel (pre-transform) for a world point. Renderers draw shape geometry in this space
   * and let the GPU apply the transform uniform, so panning/zooming needs no CPU rebuild.
   */
  public worldToBase(ts: number, price: number): { x: number; y: number } | null {
    const x = this.timestampToPixel(ts);
    const y = this.priceToPixel(price);
    if (x == null || y == null) return null;
    return { x, y };
  }

  /**
   * Screen pixel for a world point, with the current pan/zoom transform applied.
   */
  public worldToScreen(ts: number, price: number): { x: number; y: number } | null {
    const base = this.worldToBase(ts, price);
    if (!base) return null;
    const transform = this.getState().viewport.getTransform();
    return {
      x: base.x * transform.scaleX + transform.offsetX,
      y: base.y * transform.scaleY + transform.offsetY,
    };
  }

  /**
   * World point (ts, price) for a screen pixel, with the current pan/zoom transform applied.
   */
  public screenToWorld(x: number, y: number): { ts: number; price: number } | null {
    const transform = this.getState().viewport.getTransform();
    if (transform.scaleX === 0 || transform.scaleY === 0) return null;

    const baseX = (x - transform.offsetX) / transform.scaleX;
    const baseY = (y - transform.offsetY) / transform.scaleY;

    const ts = this.pixelToTimestamp(baseX);
    const price = this.pixelToPrice(baseY);
    if (ts == null || price == null) return null;
    return { ts, price };
  }

    //======================================================================================================
    // VIEW & WEIGHTS
    //======================================================================================================

    /**
     * Computes view bounds after applying scale and offset transformations.
     */
    public getTransformedView(): Viewport | null {
      const view = this.getViewport();
      if (!view) return null;

      const state = this.getState();
      const transform = state.viewport.getTransform();

      // Original viewport -> pixel
      const fromX = this.timestampToPixel(view.fromTs);
      const toX = this.timestampToPixel(view.toTs);

      const fromY = this.priceToPixel(view.fromPrice);
      const toY = this.priceToPixel(view.toPrice);

      if (
        fromX == null ||
        toX == null ||
        fromY == null ||
        toY == null
      ) {
        return null;
      }

      // Apply transform in pixel space
      const transformedFromX = fromX * transform.scaleX + transform.offsetX;
      const transformedToX = toX * transform.scaleX + transform.offsetX;

      const transformedFromY = fromY * transform.scaleY + transform.offsetY;
      const transformedToY = toY * transform.scaleY + transform.offsetY;

      // Convert back to viewport space
      const newFromTs = this.pixelToTimestamp(transformedFromX);
      const newToTs = this.pixelToTimestamp(transformedToX);

      const newFromPrice = this.pixelToPrice(transformedFromY);
      const newToPrice = this.pixelToPrice(transformedToY);

      if (
        newFromTs == null ||
        newToTs == null ||
        newFromPrice == null ||
        newToPrice == null
      ) {
        return null;
      }

      return {
        fromTs: newFromTs,
        toTs: newToTs,
        fromPrice: newFromPrice,
        toPrice: newToPrice,
      };
    }

  //======================================================================================================
  // PRIVATE HELPER
  //======================================================================================================

  private getViewport(): Viewport | null {
    const state = this.getState();
    return state.config.get()?.viewport ?? null;
  }

  private getState(): StateData {
    if (!this.state) {
      throw new Error("ViewportConverter: Controller has not been initialized. Call init first.");
    }
    return this.state;
  }

  private getChart(): ChartController {
    if (!this.chart) {
      throw new Error("ViewportConverter: Controller has not been initialized. Call init first.");
    }
    return this.chart;
  }
}