import EventController from "../../shared/chart/event/EventController";
import StateData from "../state/StateData";

export default class ChartController {
    public event: EventController = new EventController();

    public init(state: StateData): void {
        this.event.init(state.event, "chart.CandleChart")
    }

    public destroy(): void {
        this.event.destroy();
    }
}