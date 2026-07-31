import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import ClosedCandleRenderer from "./ClosedCandleRenderer";
import OpeningCandleRenderer from "./OpeningCandleRenderer";

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class CandleRenderer {
  // Directly accessible sub-renderers (as specified in Choice 1B)
  public closed: ClosedCandleRenderer;
  public opening: OpeningCandleRenderer;

  constructor() {
    // Instantiates sub-renderers which build their shaders internally (Choice 2A)
    this.closed = new ClosedCandleRenderer();
    this.opening = new OpeningCandleRenderer();
  }

  /**
   * Initializes state and chart instances across both child renderers.
   */
  public init(state: StateData, chart: ChartController): void {
    this.closed.init(state, chart);
    this.opening.init(state, chart);
  }

  /**
   * Cleans up both sub-renderers and nullifies references.
   */
  public destroy(): void {
    this.closed.destroy();
    this.opening.destroy();
  }

  /**
   * Directly delegates adding child containers to the parent Pixi container (Choice 3B).
   */
  public addToContainer(parentContainer: any): void {
    this.closed.addToContainer(parentContainer);
    this.opening.addToContainer(parentContainer);
  }

  /**
   * Updates styling uniforms (bull/bear colors, outline thickness) across both renderers.
   */
  public updateStyle(): void {
    this.closed.updateStyle();
    this.opening.updateStyle();
  }

  /**
   * Updates projection and viewport transformation matrix uniforms across both renderers.
   */
  public updateViewport(): void {
    this.closed.updateViewport();
    this.opening.updateViewport();
  }

  /**
   * Synchronizes data buffers for both closed and opening candles.
   */
  public updateData(): void {
    this.closed.updateData();
    this.opening.updateData();
  }

  /**
   * Triggers render execution cycles on both sub-renderers.
   */
  public render(): void {
    this.closed.render();
    this.opening.render();
  }
}