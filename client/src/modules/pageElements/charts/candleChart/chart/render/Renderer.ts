import CandleRenderer from "./candle/CandleRenderer";
import CrosshairRenderer from "./crosshair/CrosshairRenderer";
import type StateData from "../../state/StateData";
import type ChartController from "../ChartController";
import SeasonRenderer from "./season/SeasonRenderer";
import SyncRenderer from "./sync/SyncRenderer";
import TradeRenderer from "./trade/TradeRenderer";
import type { DirtyKey, Frame } from "../loop/GameLoop";
import { createLayers, type Layer } from "./layers";

const BASE_ID = "[CandleChart][chart][render][Renderer.ts]";

const ALL_KEYS: DirtyKey[] = [
  "size", "transform",
  "candle.closed", "candle.opening", "candle.style",
  "season.data", "season.style",
  "crosshair", "crosshair.style",
  "link.crosshair", "link.crosshair.style", "link.viewport",
  "trade", "trade.style",
];

type Subscription = [
  tag: string,
  add: (id: string, cb: () => void) => void,
  remove: (id: string) => void,
  keys: DirtyKey[],
];

export default class Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private chart: ChartController | null = null;

  public readonly candle = new CandleRenderer();
  public readonly crosshair = new CrosshairRenderer();
  public readonly season = new SeasonRenderer();
  public readonly sync = new SyncRenderer();
  public readonly trade = new TradeRenderer();

  private readonly layers: Layer[] = createLayers(this);
  private unsubscribers: (() => void)[] = [];

  /**
   * Generates a unique listener ID containing BASE_ID
   */
  private generateListenerId(tag: string): string {
    const randomStr = Math.random().toString(36).substring(2, 9);
    return `${BASE_ID}[${tag}][${randomStr}]`;
  }

  public init(state: StateData, chart: ChartController): void {
    this.chart = chart;

    this.season.init(state, chart);
    this.candle.init(state, chart);
    this.crosshair.init(state, chart);
    this.sync.init(state, chart);
    this.trade.init(state, chart);

    const loop = chart.loop;
    loop.draw = this.draw;

    const config = (target: string[]) => ({
      add: (id: string, cb: () => void) => state.config.addOnConfigDataChange(id, target, cb),
      remove: (id: string) => state.config.removeOnConfigDataChange(id),
    });

    //===============================================================
    // State change -> dirty keys. Listeners only mark; the loop does the work once per frame.
    //===============================================================
    const subscriptions: Subscription[] = [
      ["viewport_transform",
        (id, cb) => state.viewport.addOnViewportTransformDataChange(id, cb),
        (id) => state.viewport.removeOnViewportTransformDataChange(id),
        ["transform"]],

      ["config_viewport", config(["viewport"]).add, config(["viewport"]).remove,
        ["season.data", "candle.closed", "candle.opening"]],
      ["config_strategy", config(["strategyId"]).add, config(["strategyId"]).remove,
        ["season.data"]],
      ["config_candle_style", config(["style", "candle"]).add, config(["style", "candle"]).remove,
        ["candle.style"]],
      ["config_crosshair_style", config(["style", "crosshair"]).add, config(["style", "crosshair"]).remove,
        ["crosshair.style"]],
      ["config_sync_link_crosshair_style", config(["sync", "crosshair"]).add, config(["sync", "crosshair"]).remove,
        ["link.crosshair.style"]],
      ["config_sync_link_viewport", config(["sync", "viewport"]).add, config(["sync", "viewport"]).remove,
        ["link.viewport"]],

      ["strategy_data",
        (id, cb) => state.source.strategy.addOnStrateryDataChange(id, cb),
        (id) => state.source.strategy.removeOnStrateryDataChange(id),
        ["season.data"]],
      ["strategy_season_data",
        (id, cb) => state.source.strategy.season.addOnStrategySeasonDataChange(id, cb),
        (id) => state.source.strategy.season.removeOnStrategySeasonDataChange(id),
        ["season.style", "season.data"]],

      ["candle_closed_data",
        (id, cb) => state.source.candle.addOnClosedCandleDataChange(id, cb),
        (id) => state.source.candle.removeOnClosedCandleDataChange(id),
        ["candle.closed"]],
      ["candle_opening_data",
        (id, cb) => state.source.candle.addOnOpeningCandleDataChange(id, cb),
        (id) => state.source.candle.removeOnOpeningCandleDataChange(id),
        ["candle.opening"]],

      ["crosshair_data",
        (id, cb) => state.crosshair.addOnCrosshairDataChange(id, cb),
        (id) => state.crosshair.removeOnCrosshairDataChange(id),
        ["crosshair"]],
      ["sync_link_crosshair_data",
        (id, cb) => state.sync.link.crosshair.addOnCrosshairDataChange(id, cb),
        (id) => state.sync.link.crosshair.removeOnCrosshairDataChange(id),
        ["link.crosshair"]],

      ["trade_data",
        (id, cb) => state.source.trade.addOnTradeDataChange(id, cb),
        (id) => state.source.trade.removeOnTradeDataChange(id),
        ["trade"]],
      ["trade_selected_data",
        (id, cb) => state.source.trade.selected.addOnSelectedTradeDataChange(id, cb),
        (id) => state.source.trade.selected.removeOnSelectedTradeDataChange(id),
        ["trade"]],
      ["trade_style",
        (id, cb) => state.source.trade.style.addOnTradeStyleDataChange(id, cb),
        (id) => state.source.trade.style.removeOnTradeStyleDataChange(id),
        ["trade.style"]],

      ["canvas_resize",
        (id, cb) => chart.event.addOnEvent("resize", id, cb),
        (id) => chart.event.removeOnEvent(id),
        ["size"]],
    ];

    for (const [tag, add, remove, keys] of subscriptions) {
      const id = this.generateListenerId(tag);
      add(id, () => loop.mark(...keys));
      this.unsubscribers.push(() => remove(id));
    }

    loop.mark(...ALL_KEYS);
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
    this.sync.setGl(gl);
    this.trade.setGl(gl);

    this.chart?.loop.mark(...ALL_KEYS);
  }

  public destroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      try {
        unsubscribe();
      } catch {
        // Listener might already be removed during cleanup
      }
    }
    this.unsubscribers = [];

    this.season.destroy();
    this.candle.destroy();
    this.crosshair.destroy();
    this.sync.destroy();
    this.trade.destroy();

    this.gl = null;
    this.chart = null;
  }

  public getGl(): WebGL2RenderingContext | null {
    return this.gl;
  }

  /** Draw phase of the game loop: owns canvas size, clears once, then prepares and draws every layer. */
  private draw = (frame: Frame): void => {
    const gl = this.gl;
    if (!gl) return;

    const pixelWidth = Math.floor(frame.w * frame.dpr);
    const pixelHeight = Math.floor(frame.h * frame.dpr);
    if (gl.canvas.width !== pixelWidth || gl.canvas.height !== pixelHeight) {
      gl.canvas.width = pixelWidth;
      gl.canvas.height = pixelHeight;
    }

    for (const layer of this.layers) layer.prepare(frame);

    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0.0, 0.0, 0.0, 0.0); // Transparent canvas background
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const layer of this.layers) layer.render();
  };
}
