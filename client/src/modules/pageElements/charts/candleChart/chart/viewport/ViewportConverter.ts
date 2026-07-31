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
  public pixelToTimestamp(pixel: number): number | null {
    const view = this.getViewport();
    if (!view) return null;

    const state = this.getState();
    const chart = this.getChart();
    const { w } = chart.event.getCanvasSize();
    if (w <= 0) {
      throw new Error("ViewportConverter: Canvas width must be greater than zero.");
    }

    const transform = state.viewport.getTransform();

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleX;
    if (fullDeltaTs === 0) {
      throw new Error("ViewportConverter: Timestamp range must not be zero.");
    }

    const realFromTs = view.fromTs * transform.scaleX + transform.offsetX;
    return realFromTs + (pixel / w) * fullDeltaTs;
  }

  /**
   * Converts timestamp to horizontal pixel offset on canvas.
   */
  public timestampToPixel(timestamp: number): number | null {
    const view = this.getViewport();
    if (!view) return null;

    const state = this.getState();
    const chart = this.getChart();
    const { w } = chart.event.getCanvasSize();
    if (w <= 0) {
      throw new Error("ViewportConverter: Canvas width must be greater than zero.");
    }

    const transform = state.viewport.getTransform();

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleX;
    if (fullDeltaTs === 0) {
      throw new Error("ViewportConverter: Timestamp range must not be zero.");
    }

    const halfDeltaTs = timestamp - (view.fromTs * transform.scaleX + transform.offsetX);
    return (halfDeltaTs / fullDeltaTs) * w;
  }

  /**
   * Converts vertical pixel offset on canvas to price.
   */
  public pixelToPrice(pixel: number): number | null {
    const view = this.getViewport();
    if (!view) return null;

    const state = this.getState();
    const chart = this.getChart();
    const { h } = chart.event.getCanvasSize();
    if (h <= 0) {
      throw new Error("ViewportConverter: Canvas height must be greater than zero.");
    }

    const transform = state.viewport.getTransform();

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scaleY;
    if (fullDeltaPrice === 0) {
      throw new Error("ViewportConverter: Price range must not be zero.");
    }

    const realFromPrice = view.fromPrice * transform.scaleY + transform.offsetY;
    return realFromPrice + ((h - pixel) / h) * fullDeltaPrice;
  }

  /**
   * Converts price to vertical pixel offset on canvas.
   */
  public priceToPixel(price: number): number | null {
    const view = this.getViewport();
    if (!view) return null;

    const state = this.getState();
    const chart = this.getChart();
    const { h } = chart.event.getCanvasSize();
    if (h <= 0) {
      throw new Error("ViewportConverter: Canvas height must be greater than zero.");
    }

    const transform = state.viewport.getTransform();

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scaleY;
    if (fullDeltaPrice === 0) {
      throw new Error("ViewportConverter: Price range must not be zero.");
    }

    const halfDeltaPrice = price - (view.fromPrice * transform.scaleY + transform.offsetY);
    return h - (halfDeltaPrice / fullDeltaPrice) * h;
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

  /**
   * Calculates GPU shader weights for mapping timestamp coordinates.
   * Returns null if candle offset data or viewport is unavailable.
   */
  public getTimestampToPixelWeights(): ShaderWeights | null {
    const view = this.getViewport();
    if (!view) return null;

    const state = this.getState();
    const ohlc = state.source.candle.getClosed(0);
    if (!ohlc) return null;

    const offset = ohlc.t;
    const chart = this.getChart();
    const { w } = chart.event.getCanvasSize();
    if (w <= 0) {
      throw new Error("ViewportConverter: Canvas width must be greater than zero.");
    }

    const transform = state.viewport.getTransform();

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleX;
    if (fullDeltaTs === 0) {
      throw new Error("ViewportConverter: Timestamp range must not be zero.");
    }

    const realFromTs = view.fromTs * transform.scaleX + transform.offsetX;
    const multiplication = w / fullDeltaTs;
    const addition = (offset - realFromTs) * multiplication;

    return {
      offset,
      addition,
      multiplication,
    };
  }

  /**
   * Calculates GPU shader weights for mapping price coordinates.
   * Returns null if candle offset data or viewport is unavailable.
   */
  public getPriceToPixelWeights(): ShaderWeights | null {
    const view = this.getViewport();
    if (!view) return null;

    const state = this.getState();
    const chart = this.getChart();
    const { h } = chart.event.getCanvasSize();
    if (h <= 0) {
      throw new Error("ViewportConverter: Canvas height must be greater than zero.");
    }

    const ohlc = state.source.candle.getClosed(0);
    if (!ohlc) return null;

    const offset = ohlc.l;
    const transform = state.viewport.getTransform();

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scaleY;
    if (fullDeltaPrice === 0) {
      throw new Error("ViewportConverter: Price range must not be zero.");
    }

    const realFromPrice = view.fromPrice * transform.scaleY + transform.offsetY;
    const multiplication = -h / fullDeltaPrice;
    const addition = h - ((offset - realFromPrice) * h) / fullDeltaPrice;

    return {
      offset,
      addition,
      multiplication,
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