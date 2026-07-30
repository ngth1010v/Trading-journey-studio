import type StateData from "../state/StateData";
import type { Viewport } from "../state/viewport/ViewportData";


export type ShaderWeights = {
  offset: number;
  multiplication: number;
  addition: number;
};

export default class ViewportController {
  private state: StateData | null = null;

  /**
   * Initializes the controller with state reference.
   */
  public init(state: StateData): void {
    this.state = state;
  }

  /**
   * Cleans up state references.
   */
  public destroy(): void {
    this.state = null;
  }

  //======================================================================================================
  // CONVERTERS
  //======================================================================================================

  /**
   * Converts horizontal pixel offset on canvas to timestamp.
   */
  public pixelToTimestamp(pixel: number): number {
    const state = this.getState();
    const { w } = state.viewport.getCanvasSize();
    if (w <= 0) {
      throw new Error("ViewportController: Canvas width must be greater than zero.");
    }

    const view = state.viewport.getView();
    const transform = state.viewport.getTransform();

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      throw new Error("ViewportController: Timestamp range must not be zero.");
    }

    const realFromTs = view.fromTs * transform.scaleTs + transform.offsetTs;
    return realFromTs + (pixel / w) * fullDeltaTs;
  }

  /**
   * Converts timestamp to horizontal pixel offset on canvas.
   */
  public timestampToPixel(timestamp: number): number {
    const state = this.getState();
    const { w } = state.viewport.getCanvasSize();
    if (w <= 0) {
      throw new Error("ViewportController: Canvas width must be greater than zero.");
    }

    const view = state.viewport.getView();
    const transform = state.viewport.getTransform();

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      throw new Error("ViewportController: Timestamp range must not be zero.");
    }

    const halfDeltaTs = timestamp - (view.fromTs * transform.scaleTs + transform.offsetTs);
    return (halfDeltaTs / fullDeltaTs) * w;
  }

  /**
   * Converts vertical pixel offset on canvas to price.
   */
  public pixelToPrice(pixel: number): number {
    const state = this.getState();
    const { h } = state.viewport.getCanvasSize();
    if (h <= 0) {
      throw new Error("ViewportController: Canvas height must be greater than zero.");
    }

    const view = state.viewport.getView();
    const transform = state.viewport.getTransform();

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      throw new Error("ViewportController: Price range must not be zero.");
    }

    const realFromPrice = view.fromPrice * transform.scalePrice + transform.offsetPrice;
    return realFromPrice + ((h - pixel) / h) * fullDeltaPrice;
  }

  /**
   * Converts price to vertical pixel offset on canvas.
   */
  public priceToPixel(price: number): number {
    const state = this.getState();
    const { h } = state.viewport.getCanvasSize();
    if (h <= 0) {
      throw new Error("ViewportController: Canvas height must be greater than zero.");
    }

    const view = state.viewport.getView();
    const transform = state.viewport.getTransform();

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      throw new Error("ViewportController: Price range must not be zero.");
    }

    const halfDeltaPrice = price - (view.fromPrice * transform.scalePrice + transform.offsetPrice);
    return h - (halfDeltaPrice / fullDeltaPrice) * h;
  }

  //======================================================================================================
  // VIEW & WEIGHTS
  //======================================================================================================

  /**
   * Computes view bounds after applying scale and offset transformations.
   */
  public getTransformedView(): Viewport {
    const state = this.getState();
    const view = state.viewport.getView();
    const transform = state.viewport.getTransform();

    return {
      fromTs: view.fromTs * transform.scaleTs + transform.offsetTs,
      toTs: view.toTs * transform.scaleTs + transform.offsetTs,
      fromPrice: view.fromPrice * transform.scalePrice + transform.offsetPrice,
      toPrice: view.toPrice * transform.scalePrice + transform.offsetPrice,
    };
  }

  /**
   * Calculates GPU shader weights for mapping timestamp coordinates.
   * Returns null if candle offset data is unavailable.
   */
  public getTimestampToPixelWeights(): ShaderWeights | null {
    const state = this.getState();
    const ohlc = state.source.candle.getClosed(0);
    if (!ohlc) return null;

    const offset = ohlc.t;
    const { w } = state.viewport.getCanvasSize();
    if (w <= 0) {
      throw new Error("ViewportController: Canvas width must be greater than zero.");
    }

    const view = state.viewport.getView();
    const transform = state.viewport.getTransform();

    const fullDeltaTs = (view.toTs - view.fromTs) * transform.scaleTs;
    if (fullDeltaTs === 0) {
      throw new Error("ViewportController: Timestamp range must not be zero.");
    }

    const realFromTs = view.fromTs * transform.scaleTs + transform.offsetTs;
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
   * Returns null if candle offset data is unavailable.
   */
  public getPriceToPixelWeights(): ShaderWeights | null {
    const state = this.getState();
    const { h } = state.viewport.getCanvasSize();
    if (h <= 0) {
      throw new Error("ViewportController: Canvas height must be greater than zero.");
    }

    const ohlc = state.source.candle.getClosed(0);
    if (!ohlc) return null;

    const offset = ohlc.l;
    const view = state.viewport.getView();
    const transform = state.viewport.getTransform();

    const fullDeltaPrice = (view.toPrice - view.fromPrice) * transform.scalePrice;
    if (fullDeltaPrice === 0) {
      throw new Error("ViewportController: Price range must not be zero.");
    }

    const realFromPrice = view.fromPrice * transform.scalePrice + transform.offsetPrice;
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

  private getState(): StateData {
    if (!this.state) {
      throw new Error("ViewportController: Controller has not been initialized. Call init(state) first.");
    }
    return this.state;
  }
}