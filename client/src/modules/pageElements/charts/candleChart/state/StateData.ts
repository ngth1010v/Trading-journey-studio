import SourceData from "./source/SourceData";
import ViewportData from "./viewport/ViewportData";
import ConfigData from "./config/ConfigData";
import ChartController from "../chart/ChartController";
import CrosshairData from "./crosshair/CrosshairData";
import SyncData from "./sync/SyncData";
import ShapeEditorData from "./shapeEditor/ShapeEditorData";

const LOAD_OFFSET_RATIO = 1;
const BASE_ID = "[CandleChart][state][StateData.ts]";

export default class StateData {
  public viewport: ViewportData = new ViewportData();
  public source: SourceData = new SourceData();
  public config: ConfigData = new ConfigData();
  public crosshair: CrosshairData = new CrosshairData();
  public sync: SyncData = new SyncData();
  public shapeEditor: ShapeEditorData = new ShapeEditorData();

  private needResetViewport = false;
  private loadedCandleAfterSymbolChange = {
    opening: false,
    closed: false,
  };

  // Lưu trữ các ID dùng để unregister listener khi destroy
  private listenerIds = {
    configViewport: "",
    configStrategyId: "",
    configSymbol: "",
    configTimeframe: "",
    configLink: "",
    candleClosed: "",
    candleOpening: "",
  };

  /**
   * Tạo ID ngẫu nhiên có chứa BASE_ID
   */
  private generateListenerId(tag: string): string {
    const randomStr = Math.random().toString(36).substring(2, 9);
    return `${BASE_ID}[${tag}][${randomStr}]`;
  }

  /**
   * Initializes config, viewport, and source data instances.
   */
  public init(pageElementId: number, chart: ChartController): void {
    this.config.init(pageElementId);
    this.crosshair.init();
    this.viewport.init(this, chart);
    this.source.init();
    this.sync.init();
    this.shapeEditor.init();

    // Khởi tạo các listener IDs
    this.listenerIds.configViewport = this.generateListenerId("viewport");
    this.listenerIds.configStrategyId = this.generateListenerId("strategyId");
    this.listenerIds.configSymbol = this.generateListenerId("symbol");
    this.listenerIds.configTimeframe = this.generateListenerId("timeframe");
    this.listenerIds.configLink = this.generateListenerId("link");
    this.listenerIds.candleClosed = this.generateListenerId("closedCandle");
    this.listenerIds.candleOpening = this.generateListenerId("openingCandle");

    //====================================================================================================
    // Refresh logic
    //====================================================================================================
    this.config.addOnConfigDataChange(this.listenerIds.configViewport, ["viewport"], () => {
      const view = this.config.get()?.viewport;
      if (view) {
        const delta = view.toTs - view.fromTs;
        const offset = delta * LOAD_OFFSET_RATIO;
        const fromTs = view.fromTs - offset;
        const toTs = view.toTs + offset;
        this.source.candle.setView(fromTs, toTs);
        this.source.trade.setView(fromTs, toTs);
        this.source.shape.setView(fromTs, toTs);
      }
    });

    this.config.addOnConfigDataChange(this.listenerIds.configStrategyId, ["strategyId"], () => {
      const strategyId = this.config.get()?.strategyId;
      if (strategyId !== undefined) {
        this.source.trade.setSource(null, strategyId);
        this.source.shape.setSource(null, strategyId);
        this.shapeEditor.clearSelection();
      }
    });

    this.config.addOnConfigDataChange(this.listenerIds.configSymbol, ["symbol"], () => {
      const symbol = this.config.get()?.symbol;
      if (symbol !== undefined) {
        this.source.candle.setSource(symbol, null);
        this.source.trade.setSource(symbol, null);
        this.source.shape.setSource(symbol, null);
        this.shapeEditor.clearSelection();
        this.needResetViewport = true;
        this.loadedCandleAfterSymbolChange = {
          opening: false,
          closed: false,
        };
      }
    });

    this.config.addOnConfigDataChange(this.listenerIds.configTimeframe, ["timeframe"], () => {
      const timeframe = this.config.get()?.timeframe;
      if (timeframe !== undefined) {
        this.source.candle.setSource(null, timeframe);
      }
    });

    this.config.addOnConfigDataChange(this.listenerIds.configLink, ["sync", "linkId"], () => {
      const linkId = this.config.get()?.sync?.linkId;
      const linkList = this.sync.link.getAll();
      if (linkList) {
        for (const l of linkList) {
          if (l.id != null && l.id == linkId) {
            this.sync.link.state.registry(linkId);
            return;
          }
        }
      }
      this.sync.link.state.unregistry();
    });

    const tryAutoViewport = () => {
      if (
        !this.needResetViewport ||
        !this.loadedCandleAfterSymbolChange.opening ||
        !this.loadedCandleAfterSymbolChange.closed
      ) {
        return;
      }

      chart.viewport.aligner.autoViewport();

      this.needResetViewport = false;
    };

    this.source.candle.addOnClosedCandleDataChange(
      this.listenerIds.candleClosed,
      () => {
        this.loadedCandleAfterSymbolChange.closed = true;
        tryAutoViewport();
      }
    );

    this.source.candle.addOnOpeningCandleDataChange(
      this.listenerIds.candleOpening,
      () => {
        this.loadedCandleAfterSymbolChange.opening = true;
        tryAutoViewport();
      }
    );
  }

  /**
   * Cleans up viewport, source, and config data instances.
   */
  public destroy(): void {
    // Clean up all registered listeners before destroying instances
    if (this.listenerIds.configViewport) this.config.removeOnConfigDataChange(this.listenerIds.configViewport);
    if (this.listenerIds.configStrategyId) this.config.removeOnConfigDataChange(this.listenerIds.configStrategyId);
    if (this.listenerIds.configSymbol) this.config.removeOnConfigDataChange(this.listenerIds.configSymbol);
    if (this.listenerIds.configTimeframe) this.config.removeOnConfigDataChange(this.listenerIds.configTimeframe);
    if (this.listenerIds.configLink) this.config.removeOnConfigDataChange(this.listenerIds.configLink);

    if (this.listenerIds.candleClosed) this.source.candle.removeOnClosedCandleDataChange(this.listenerIds.candleClosed);
    if (this.listenerIds.candleOpening) this.source.candle.removeOnClosedCandleDataChange(this.listenerIds.candleOpening);

    this.viewport.destroy();
    this.source.destroy();
    this.config.destroy();
    this.crosshair.destroy();
    this.sync.destroy();
    this.shapeEditor.destroy();
  }
}