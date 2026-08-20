import type StateData from "../../../../state/StateData";
import type ChartController from "../../../ChartController";
import LinkCrosshairRenderer from "./LinkCrosshairRenderer";
import LinkViewportRenderer from "./LinkViewportRenderer";

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class LinkRenderer {
  public crosshair: LinkCrosshairRenderer = new LinkCrosshairRenderer();
  public viewport: LinkViewportRenderer = new LinkViewportRenderer();

  public init(state: StateData, chart: ChartController): void {
    this.crosshair.init(state, chart);
    this.viewport.init(state, chart);
  }

  public destroy(): void {
    this.crosshair.destroy();
    this.viewport.destroy();
  }

  public setGl(gl: WebGL2RenderingContext): void {
    this.crosshair.setGl(gl);
    this.viewport.setGl(gl);
  }
}