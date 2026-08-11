import type StateData from "../../state/StateData";
import type ChartController from "../ChartController";
import ViewportConverter from "./ViewportConverter";
import ViewportAligner from "./ViewportAligner";

export default class ViewportController {
  public converter: ViewportConverter = new ViewportConverter();
  public aligner: ViewportAligner = new ViewportAligner();
  

  /**
   * Initializes the viewport controller and its sub-controllers.
   */
  public init(state: StateData, chart: ChartController): void {
    this.converter.init(state, chart);
    this.aligner.init(state, chart)

    state.source.candle.addOnClosedCandleDataChange("Start align", ()=>{
      this.aligner.autoViewport()
      state.source.candle.removeOnClosedCandleDataChange("Start align")
    })
  }

  /**
   * Cleans up state references and sub-controllers.
   */
  public destroy(): void {
    this.converter.destroy();
    this.aligner.destroy()
  }
}