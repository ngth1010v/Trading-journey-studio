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

      return {
        fromTs: view.fromTs * transform.scaleX + transform.offsetX,
        toTs: view.toTs * transform.scaleX + transform.offsetX,
        fromPrice: view.fromPrice * transform.scaleY + transform.offsetY,
        toPrice: view.toPrice * transform.scaleY + transform.offsetY,
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