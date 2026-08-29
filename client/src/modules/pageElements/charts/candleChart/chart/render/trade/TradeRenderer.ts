import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import SelectedTradeRenderer from "./SelectedTradeRenderer";
import UnselectedTradeRenderer from "./UnselectedTradeRenderer";

export default class TradeRenderer {
  public selected: SelectedTradeRenderer = new SelectedTradeRenderer();
  public unselected: UnselectedTradeRenderer = new UnselectedTradeRenderer();

  public init(state: StateData, chart: ChartController): void {
    this.selected.init(state, chart);
    this.unselected.init(state, chart);
  }

  public destroy(): void {
    this.selected.destroy();
    this.unselected.destroy();
  }

  public setGl(gl: WebGL2RenderingContext): void {
    this.selected.setGl(gl);
    this.unselected.setGl(gl);
  }

  public updateData(): void {
    this.selected.updateData();
    this.unselected.updateData();
  }

  public updateStyle(): void {
    this.selected.updateStyle();
    this.unselected.updateStyle();
  }

  public updateTransform(): void {
    this.selected.updateTransform();
    this.unselected.updateTransform();
  }
}