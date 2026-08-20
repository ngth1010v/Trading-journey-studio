import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";

import LinkEventController from "./LinkEventController";


// const ID_BASE = "[candleChart][chart][event][viewport][ViewportSyncEventController.ts]"

export default class SyncEventController {
    private state: StateData | null = null;
    private chart: ChartController | null = null;

    public link: LinkEventController = new LinkEventController()
        
    init(state: StateData, chart: ChartController): void {
        this.state = state
        this.chart = chart

        this.link.init(this.state, this.chart)
    }
    
    destroy(): void {
        this.link.destroy()

        this.chart = null
        this.state = null
    }

}