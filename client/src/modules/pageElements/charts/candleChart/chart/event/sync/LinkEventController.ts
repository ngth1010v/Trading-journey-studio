import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";


const ID_BASE = "[candleChart][chart][event][sync][LinkEventController.ts]"

export default class LinkEventController {
    private state: StateData | null = null;
    private chart: ChartController | null = null;
        
    init(state: StateData, chart: ChartController): void {
        this.state = state
        this.chart = chart

        chart.event.addOnEvent("mouseEnter", ID_BASE + "Trigger sync up", ()=>{
            state.sync.link.setMode("up")
        })
        chart.event.addOnEvent("mouseLeave", ID_BASE + "Trigger sync down", ()=>{
            state.sync.link.setMode("down")
        })
    }
        
    destroy(): void {
        
        if (this.chart){
            this.chart.event.removeOnEvent(ID_BASE + "Trigger sync up")
            this.chart.event.removeOnEvent(ID_BASE + "Trigger sync down")
        }
        this.chart = null
        this.state = null
    }

}