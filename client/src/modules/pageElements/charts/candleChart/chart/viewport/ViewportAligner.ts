import type StateData from "../../state/StateData";
import ChartController from "../ChartController";
import type { BinCandles } from "../../state/source/candle/CandleData";

export default class ViewportAligner {
  private state: StateData | null = null;
  private chart: ChartController | null = null;

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;
  }

  public destroy(): void {
    this.state = null;
    this.chart = null;
  }

  /**
   * Fits all visible candles into the middle 80% of the screen.
   *
   * Directly updates stage.config.viewport and resets stage.viewport.transform.
   */
  public autoViewport(): void {
    const state = this.getState();
    const chart = this.getChart();
    const converter = chart.viewport.converter;

    const transformedView = converter.getTransformedView();
    if (!transformedView) return;

    //----------------------------------------------------------------------
    // Scan visible candles
    //----------------------------------------------------------------------

    let minPrice = Infinity;
    let maxPrice = -Infinity;

    const closed: BinCandles | null = state.source.candle.getAllClosed();

    if (closed) {
      for (let i = 0; i < closed.t.length; i++) {
        const ts = closed.t[i];

        if (
          ts < transformedView.fromTs ||
          ts > transformedView.toTs
        ) {
          continue;
        }

        // Skip empty candles (market closed)
        if (
          closed.o[i] === 0 &&
          closed.h[i] === 0 &&
          closed.l[i] === 0 &&
          closed.c[i] === 0 &&
          closed.v[i] === 0
        ) {
          continue;
        }

        if (closed.l[i] < minPrice) minPrice = closed.l[i];
        if (closed.h[i] > maxPrice) maxPrice = closed.h[i];
      }
    }

    
    const opening = state.source.candle.getOpening();

    if (
      opening &&
      opening.t >= transformedView.fromTs &&
      opening.t <= transformedView.toTs
    ) {
      if (opening.l < minPrice && opening.l != 0) minPrice = opening.l;
      if (opening.h > maxPrice && opening.h != 0) maxPrice = opening.h;
    }
    
    if (!isFinite(minPrice) || !isFinite(maxPrice)) {
      return;
    }
    
    //----------------------------------------------------------------------
    // Prevent zero-height range
    //----------------------------------------------------------------------
    
    if (Math.round(minPrice) === Math.round(maxPrice)) {
      minPrice -= 1;
      maxPrice += 1;
    }
    
    //----------------------------------------------------------------------
    // Calculate new price range for 80% middle alignment
    // (minPrice and maxPrice occupy middle 80%, leaving 10% padding top and bottom)
    //----------------------------------------------------------------------
    
    const priceRange = maxPrice - minPrice;
    const padding = priceRange / 10 / 2;
    
    const fromPrice = minPrice - padding;
    const toPrice = maxPrice + padding;

    //----------------------------------------------------------------------
    // Update config.viewport & reset transform
    //----------------------------------------------------------------------

    state.config.set({
      viewport: {
        fromTs: transformedView.fromTs,
        toTs: transformedView.toTs,
        fromPrice,
        toPrice,
      },
    });

    state.viewport.setTransform({
      scaleX: 1,
      offsetX: 0,
      scaleY: 1,
      offsetY: 0,
    });
  }

  //======================================================================
  // Helpers
  //======================================================================

  private getState(): StateData {
    if (!this.state) {
      throw new Error(
        "ViewportAligner: init() must be called first."
      );
    }

    return this.state;
  }

  private getChart(): ChartController {
    if (!this.chart) {
      throw new Error(
        "ViewportAligner: init() must be called first."
      );
    }

    return this.chart;
  }
}