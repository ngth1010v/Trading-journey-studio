import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";

import LinkStateController from "./LinkStateController";


export default class LinkController {

  public state: LinkStateController = new LinkStateController()

  /**
   * Initializes the viewport controller and its sub-controllers.
   */
  public init(state: StateData, chart: ChartController): void {
    this.state.init(state, chart)
  }
  
  /**
   * Cleans up state references and sub-controllers.
  */
  public destroy(): void {
   this.state.destroy()
  }
}