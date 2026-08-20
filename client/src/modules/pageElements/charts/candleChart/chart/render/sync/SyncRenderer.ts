import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import LinkRenderer from "./link/LinkRenderer";

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class SyncRenderer {
  public link: LinkRenderer = new LinkRenderer();

  public init(state: StateData, chart: ChartController): void {
    this.link.init(state, chart);
  }

  public destroy(): void {
    this.link.destroy();
  }

  public setGl(gl: WebGL2RenderingContext): void {
    this.link.setGl(gl);
  }
}