import StateData from "../state/StateData";
import ViewportController from "./viewport/ViewportController";
import EventController from "./event/EventController";
import Renderer from "./render/Renderer";
import SyncController from "./sync/SyncController";

export default class ChartController {
    public viewport: ViewportController = new ViewportController()
    public event: EventController = new EventController()
    public render: Renderer = new Renderer()
    public sync: SyncController = new SyncController()

    public init(state: StateData): void {
        this.viewport.init(state, this)
        this.event.init(state, this)
        this.sync.init(state, this)
        this.render.init(state, this)
    }

    public setCanvas(canvas: HTMLCanvasElement) {
        this.event.setCanvas(canvas)
        this.render.setCanvas(canvas)
    }
    
    public destroy(): void {
        this.viewport.destroy();
        this.event.destroy();
        this.sync.destroy()
        this.render.destroy()
    }
}