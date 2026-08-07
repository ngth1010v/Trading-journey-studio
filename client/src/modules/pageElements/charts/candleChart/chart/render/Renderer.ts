import CandleRenderer from "./candle/CandleRenderer";
import CrosshairRenderer from "./crosshair/CrosshairRenderer";
import type StateData from "../../state/StateData";
import type ChartController from "../ChartController";
import SeasonRenderer from "./season/SeasonRenderer";

export default class Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private chart: ChartController | null = null;
  private state: StateData | null = null;

  public readonly candle = new CandleRenderer();
  public readonly crosshair = new CrosshairRenderer();
  public readonly season = new SeasonRenderer();

  public init(state: StateData, chart: ChartController): void {
    this.chart = chart;
    this.state = state;

    this.season.init(state, chart);
    this.candle.init(state, chart);
    this.crosshair.init(state, chart);

    this.render();

    //===============================================================
    // Season
    //===============================================================
    {
      state.config.addOnConfigDataChange(
        "[chart][render][Renderer.ts] Update viewport data for season",
        ["viewport"],
        () => {
          this.season.updateData();
        }
      );

      state.config.addOnConfigDataChange(
        "[chart][render][Renderer.ts] Update current strategy data for season",
        ["strategyId"],
        () => {
          this.season.updateData();
          this.render()
        }
      );

      state.source.strategy.addOnStrateryDataChange(
        "[chart][render][Renderer.ts] Update strategy data for season",
        () => {
          this.season.updateData();
          this.render()
        }
      );

      state.viewport.addOnViewportTransformDataChange(
        "[chart][render][Renderer.ts] Update transform for season",
        () => {
          this.season.updateTransform();
          this.render();
        }
      );

      state.source.strategy.season.addOnStrategySeasonDataChange(
        "[chart][render][Renderer.ts] Season style/data update",
        () => {
          this.season.updateStyle();
          this.season.updateData();
          this.render()
        }
      );      
    }


    //===============================================================
    // Candle
    //===============================================================
    {
      state.source.candle.addOnClosedCandleDataChange(
        "[chart][render][Renderer.ts] Closed candle render",
        () => {
          this.candle.closed.updateData();
          this.render();
        }
      );

      state.source.candle.addOnOpeningCandleDataChange(
        "[chart][render][Renderer.ts] Opening candle render",
        () => {
          this.candle.opening.updateData();
          this.render();
        }
      );

      state.config.addOnConfigDataChange(
        "[chart][render][Renderer.ts] Viewport render",
        ["viewport"],
        () => {
          this.candle.updateData();
        }
      );

      state.viewport.addOnViewportTransformDataChange(
        "[chart][render][Renderer.ts] Viewport render",
        () => {
          this.candle.updateTransform();
          this.render();
        }
      );

      state.config.addOnConfigDataChange(
        "[chart][render][Renderer.ts] Candle style update",
        ["style","candle"],
        () => {
          this.candle.updateStyle();
          this.render()
        }
      );      
    }


    //===============================================================
    // Crosshair State & Style Subscriptions
    //===============================================================
    {
      state.crosshair.addOnCrosshairDataChange("Crosshair render", () => {
        this.crosshair.updateData();
        this.render();
      });

      state.config.addOnConfigDataChange(
        "[chart][render][Renderer.ts] Crosshair style change",
        ["style"],
        () => {
          this.crosshair.updateStyle();
          this.crosshair.updateData();
          this.render();
        }
      );      
    }

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

    this.season.setGl(gl);
    this.candle.setGl(gl);
    this.crosshair.setGl(gl);
  }

  public destroy(): void {
    if (this.state) {
      //===============================================================
      // Season
      //===============================================================
      this.state.config.removeOnConfigDataChange(
        "[chart][render][Renderer.ts] Update viewport data for season"
      );

      this.state.config.removeOnConfigDataChange(
        "[chart][render][Renderer.ts] Update current strategy data for season"
      )

      this.state.source.strategy.removeOnStrateryDataChange(
        "[chart][render][Renderer.ts] Update strategy data for season"
      );

      this.state.viewport.removeOnViewportTransformDataChange(
        "[chart][render][Renderer.ts] Update transform for season"
      );

      this.state.source.strategy.season.removeOnStrategySeasonDataChange(
        "[chart][render][Renderer.ts] Season style/data update"
      );

      //===============================================================
      // Candle
      //===============================================================
      this.state.source.candle.removeOnClosedCandleDataChange(
        "[chart][render][Renderer.ts] Closed candle render"
      );

      this.state.source.candle.removeOnOpeningCandleDataChange(
        "[chart][render][Renderer.ts] Opening candle render"
      );

      this.state.config.removeOnConfigDataChange(
        "[chart][render][Renderer.ts] Viewport render"
      );

      this.state.viewport.removeOnViewportTransformDataChange(
        "[chart][render][Renderer.ts] Viewport render"
      );

      this.state.config.removeOnConfigDataChange(
        "[chart][render][Renderer.ts] Candle style update"
      );

      //===============================================================
      // Crosshair
      //===============================================================
      this.state.crosshair.removeOnCrosshairDataChange(
        "Crosshair render"
      );

      this.state.config.removeOnConfigDataChange(
        "[chart][render][Renderer.ts] Crosshair style change"
      );
    }

    this.season.destroy();
    this.candle.destroy();
    this.crosshair.destroy();

    this.gl = null;
    this.chart = null;
    this.state = null;
  }

  public getGl(): WebGL2RenderingContext | null {
    return this.gl;
  }

  public render(): void {
    if (!this.gl) return;

    this.gl.clearColor(0.0, 0.0, 0.0, 0.0); // Transparent canvas background
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.season.render();
    this.candle.render();
    this.crosshair.render();
  }
}