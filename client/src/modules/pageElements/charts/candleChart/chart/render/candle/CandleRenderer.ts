import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import ClosedCandleRenderer from "./ClosedCandleRenderer";
import OpeningCandleRenderer from "./OpeningCandleRenderer";

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class CandleRenderer {
  public closed: ClosedCandleRenderer;
  public opening: OpeningCandleRenderer;

  constructor() {
    this.closed = new ClosedCandleRenderer();
    this.opening = new OpeningCandleRenderer();
  }

  public init(state: StateData, chart: ChartController): void {
    this.closed.init(state, chart);
    this.opening.init(state, chart);
  }

  public destroy(): void {
    this.closed.destroy();
    this.opening.destroy();
  }

  public setGl(gl: WebGL2RenderingContext): void {
    this.closed.setGl(gl);
    this.opening.setGl(gl);
  }

  public updateData(): void {
    this.closed.updateData();
    this.opening.updateData();
  }

  public updateStyle(): void {
    this.closed.updateStyle();
    this.opening.updateStyle();
  }

  public updateTransform(): void {
    this.closed.updateTransform();
    this.opening.updateTransform();
  }

  public render(): void {
    this.closed.render();
    this.opening.render();
  }
}