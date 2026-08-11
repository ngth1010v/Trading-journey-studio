import type StateData from "../../state/StateData";
import type ChartController from "../ChartController";

import LinkController from "./link/LinkController";

export default class SyncController {

    public link : LinkController = new LinkController()

    /**
     * Initializes the viewport controller and its sub-controllers.
     */
    public init(state: StateData, chart: ChartController): void {
        this.link.init(state,chart)
    }

    /**
     * Cleans up state references and sub-controllers.
     */
    public destroy(): void {
        this.link.destroy()
    }
}