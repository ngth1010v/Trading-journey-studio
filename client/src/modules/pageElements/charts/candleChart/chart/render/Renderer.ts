import CandleRenderer from "./candle/CandleRenderer";
import type StateData from "../../state/StateData";
import type ChartController from "../ChartController";

export default class Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private chart : ChartController | null = null
  private state : StateData | null = null

  public readonly candle = new CandleRenderer();

  public init(state: StateData, chart: ChartController): void {
    this.chart = chart
    this.state = state

    this.candle.init(state, chart);
    this.render()

    state.source.candle.addOnClosedCandleDataChange(
      "Closed candle render",
      () => {
        // this.candle.closed.updateData()
      }
    );

    state.source.candle.addOnOpeningCandleDataChange(
      "Opening candle render",
      () => {
        // this.candle.opening.updateData()
      }
    );

    state.config.addOnConfigDataChange(
      "Viewport render",
      ["viewport"],
      () => {
        this.candle.updateData();
      }
    );
    state.viewport.addOnViewportTransformDataChange(
      "Viewport render",
      () => {
        this.candle.updateTransform();
        this.render()
      }
    );
  }

  public setCanvas(canvas: HTMLCanvasElement): void {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });

    if (!gl) {
      throw new Error("WebGL2 is not supported.");
    }

    this.gl = gl;

    this.candle.setGl(gl)
  }

  public destroy(): void {
    this.candle.destroy();
    this.gl = null;
  }

  public getGl(): WebGL2RenderingContext | null {
    return this.gl
  }

  public render(){
    if (!this.gl) return

    this.gl.clearColor(0.0, 0.0, 0.0, 0.0); // Transparent canvas background
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.candle.render()
  }
}