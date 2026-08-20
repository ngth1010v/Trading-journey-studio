import type StateData from "../../../../state/StateData";
import type ChartController from "../../../ChartController";
import LinkCrosshairRenderer from "./LinkCrosshairRenderer";

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class LinkRenderer {
  public crosshair: LinkCrosshairRenderer = new LinkCrosshairRenderer();

  public init(state: StateData, chart: ChartController): void {
    this.crosshair.init(state, chart);
  }

  public destroy(): void {
    this.crosshair.destroy();
  }

  public setGl(gl: WebGL2RenderingContext): void {
    this.crosshair.setGl(gl);
  }
}