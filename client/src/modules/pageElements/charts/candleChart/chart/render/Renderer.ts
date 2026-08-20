import CandleRenderer from "./candle/CandleRenderer";
import CrosshairRenderer from "./crosshair/CrosshairRenderer";
import type StateData from "../../state/StateData";
import type ChartController from "../ChartController";
import SeasonRenderer from "./season/SeasonRenderer";
import SyncRenderer from "./sync/SyncRenderer";

const BASE_ID = "[CandleChart][chart][render][Renderer.ts]";

export default class Renderer {
  private gl: WebGL2RenderingContext | null = null;
  private state: StateData | null = null;

  public readonly candle = new CandleRenderer();
  public readonly crosshair = new CrosshairRenderer();
  public readonly season = new SeasonRenderer();
  public readonly sync = new SyncRenderer();

  // Quản lý các listener IDs rút gọn
  private listenerIds = {
    // Season
    seasonViewport: "",
    seasonStrategy: "",
    seasonData: "",
    seasonTransform: "",
    seasonStyle: "",

    // Candle
    candleClosed: "",
    candleOpening: "",
    candleViewport: "",
    candleTransform: "",
    candleStyle: "",

    // Crosshair
    crosshairData: "",
    crosshairStyle: "",

    syncLinkCrosshairData: "",
    syncLinkCrosshairStyle: "",
  };

  /**
   * Sinh ID ngẫu nhiên có chứa BASE_ID
   */
  private generateListenerId(tag: string): string {
    const randomStr = Math.random().toString(36).substring(2, 9);
    return `${BASE_ID}[${tag}][${randomStr}]`;
  }

  public init(state: StateData, chart: ChartController): void {
    this.state = state;

    this.season.init(state, chart);
    this.candle.init(state, chart);
    this.crosshair.init(state, chart);
    this.sync.init(state, chart);
    

    this.render();

    // Khởi tạo tất cả listener IDs
    this.listenerIds.seasonViewport = this.generateListenerId("season_viewport");
    this.listenerIds.seasonStrategy = this.generateListenerId("season_strategy");
    this.listenerIds.seasonData = this.generateListenerId("season_data");
    this.listenerIds.seasonTransform = this.generateListenerId("season_transform");
    this.listenerIds.seasonStyle = this.generateListenerId("season_style");

    this.listenerIds.candleClosed = this.generateListenerId("candle_closed");
    this.listenerIds.candleOpening = this.generateListenerId("candle_opening");
    this.listenerIds.candleViewport = this.generateListenerId("candle_viewport");
    this.listenerIds.candleTransform = this.generateListenerId("candle_transform");
    this.listenerIds.candleStyle = this.generateListenerId("candle_style");

    this.listenerIds.crosshairData = this.generateListenerId("crosshair_data");
    this.listenerIds.crosshairStyle = this.generateListenerId("crosshair_style");

    this.listenerIds.syncLinkCrosshairData = this.generateListenerId("sync_link_crosshair_data");
    this.listenerIds.syncLinkCrosshairStyle = this.generateListenerId("sync_link_crosshair_style");

    //===============================================================
    // Season
    //===============================================================
    state.config.addOnConfigDataChange(
      this.listenerIds.seasonViewport,
      ["viewport"],
      () => {
        this.season.updateData();
      }
    );

    state.config.addOnConfigDataChange(
      this.listenerIds.seasonStrategy,
      ["strategyId"],
      () => {
        this.season.updateData();
        this.render();
      }
    );

    state.source.strategy.addOnStrateryDataChange(
      this.listenerIds.seasonData,
      () => {
        this.season.updateData();
        this.render();
      }
    );

    state.viewport.addOnViewportTransformDataChange(
      this.listenerIds.seasonTransform,
      () => {
        this.season.updateTransform();
        this.render();
      }
    );

    state.source.strategy.season.addOnStrategySeasonDataChange(
      this.listenerIds.seasonStyle,
      () => {
        this.season.updateStyle();
        this.season.updateData();
        this.render();
      }
    );

    //===============================================================
    // Candle
    //===============================================================
    state.source.candle.addOnClosedCandleDataChange(
      this.listenerIds.candleClosed,
      () => {
        this.candle.closed.updateData();
        this.render();
      }
    );

    state.source.candle.addOnOpeningCandleDataChange(
      this.listenerIds.candleOpening,
      () => {
        this.candle.opening.updateData();
        this.render();
      }
    );

    state.config.addOnConfigDataChange(
      this.listenerIds.candleViewport,
      ["viewport"],
      () => {
        this.candle.updateData();
      }
    );

    state.viewport.addOnViewportTransformDataChange(
      this.listenerIds.candleTransform,
      () => {
        this.candle.updateTransform();
        this.render();
      }
    );

    state.config.addOnConfigDataChange(
      this.listenerIds.candleStyle,
      ["style", "candle"],
      () => {
        this.candle.updateStyle();
        this.render();
      }
    );

    //===============================================================
    // Crosshair State & Style Subscriptions
    //===============================================================
    state.crosshair.addOnCrosshairDataChange(this.listenerIds.crosshairData, () => {
      this.crosshair.updateData();
      this.render();
    });

    state.config.addOnConfigDataChange(
      this.listenerIds.crosshairStyle,
      ["style", "crosshair"],
      () => {
        this.crosshair.updateStyle();
        this.crosshair.updateData();
        this.render();
      }
    );

    //===============================================================
    // Sync - link
    //===============================================================
    state.sync.link.crosshair.addOnCrosshairDataChange(this.listenerIds.syncLinkCrosshairData, () => {
      this.sync.link.crosshair.updateData();
      this.render();
    });

    state.config.addOnConfigDataChange(
      this.listenerIds.syncLinkCrosshairStyle,
      ["sync", "crosshair"],
      () => {
        this.sync.link.crosshair.updateStyle();
        this.sync.link.crosshair.updateData();
        this.render();
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

    this.season.setGl(gl);
    this.candle.setGl(gl);
    this.crosshair.setGl(gl);
    this.sync.setGl(gl);
  }

  public destroy(): void {
    if (this.state) {
      //===============================================================
      // Season
      //===============================================================
      if (this.listenerIds.seasonViewport) {
        this.state.config.removeOnConfigDataChange(this.listenerIds.seasonViewport);
      }
      if (this.listenerIds.seasonStrategy) {
        this.state.config.removeOnConfigDataChange(this.listenerIds.seasonStrategy);
      }
      if (this.listenerIds.seasonData) {
        this.state.source.strategy.removeOnStrateryDataChange(this.listenerIds.seasonData);
      }
      if (this.listenerIds.seasonTransform) {
        this.state.viewport.removeOnViewportTransformDataChange(this.listenerIds.seasonTransform);
      }
      if (this.listenerIds.seasonStyle) {
        this.state.source.strategy.season.removeOnStrategySeasonDataChange(this.listenerIds.seasonStyle);
      }

      //===============================================================
      // Candle
      //===============================================================
      if (this.listenerIds.candleClosed) {
        this.state.source.candle.removeOnClosedCandleDataChange(this.listenerIds.candleClosed);
      }
      if (this.listenerIds.candleOpening) {
        this.state.source.candle.removeOnOpeningCandleDataChange(this.listenerIds.candleOpening);
      }
      if (this.listenerIds.candleViewport) {
        this.state.config.removeOnConfigDataChange(this.listenerIds.candleViewport);
      }
      if (this.listenerIds.candleTransform) {
        this.state.viewport.removeOnViewportTransformDataChange(this.listenerIds.candleTransform);
      }
      if (this.listenerIds.candleStyle) {
        this.state.config.removeOnConfigDataChange(this.listenerIds.candleStyle);
      }

      //===============================================================
      // Crosshair
      //===============================================================
      if (this.listenerIds.crosshairData) {
        this.state.crosshair.removeOnCrosshairDataChange(this.listenerIds.crosshairData);
      }
      if (this.listenerIds.crosshairStyle) {
        this.state.config.removeOnConfigDataChange(this.listenerIds.crosshairStyle);
      }
      
      
      //===============================================================
      // Sync - link
      //===============================================================
      if (this.listenerIds.syncLinkCrosshairData) {
        this.state.sync.link.crosshair.removeOnCrosshairDataChange(this.listenerIds.syncLinkCrosshairData);
      }
      if (this.listenerIds.syncLinkCrosshairStyle) {
        this.state.config.removeOnConfigDataChange(this.listenerIds.syncLinkCrosshairStyle);
      }
    }

    this.season.destroy();
    this.candle.destroy();
    this.crosshair.destroy();
    this.sync.destroy();

    this.gl = null;
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
    this.sync.link.crosshair.render();
  }
}