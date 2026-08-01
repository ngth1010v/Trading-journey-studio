import type StateData from "../../state/StateData";
import type ChartController from "../ChartController";
import ViewportConverter from "./ViewportConverter";

export default class ViewportController {
  public converter: ViewportConverter = new ViewportConverter();

  /**
   * Initializes the viewport controller and its sub-controllers.
   */
  public init(state: StateData, chart: ChartController): void {
    this.converter.init(state, chart);
  }

  /**
   * Cleans up state references and sub-controllers.
   */
  public destroy(): void {
    this.converter.destroy();
  }
}