
import StateData from "../state/StateData";
import ViewportController from "./viewport/ViewportController";
import EventController from "./EventController";

export default class ChartController {
    public viewport: ViewportController = new ViewportController()
    public event: EventController = new EventController()

    public init(state: StateData): void {
        this.viewport.init(state, this)
    }
    
    public destroy(): void {
        this.viewport.destroy();
    }
}