import SourceData from "./source/SourceData";
import ViewportData from "./viewport/ViewportData";
import ConfigData from "./config/ConfigData";
import ChartController from "../chart/ChartController";
import CrosshairData from "./crosshair/CrosshairData";
import SyncData from "./sync/SyncData";

const LOAD_OFFSET_RATIO = 1

export default class StateData {
  public viewport: ViewportData = new ViewportData();
  public source: SourceData = new SourceData();
  public config: ConfigData = new ConfigData();
  public crosshair: CrosshairData = new CrosshairData();
  public sync: SyncData = new SyncData();

  private needResetViewport: boolean = false

  /**
   * Initializes config, viewport, and source data instances.
   */
  public async init(pageId: number, elementId: number, chart: ChartController): Promise<void> {
    this.config.init(pageId, elementId);
    this.crosshair.init();
    this.viewport.init(this, chart);
    await this.source.init();
    this.sync.init();

    //====================================================================================================
    // Refresh logic
    //====================================================================================================
    this.config.addOnConfigDataChange("Default[data.viewport]Refresh", ["viewport"], () => {
      const view = this.config.get()?.viewport;
      if (view) {
        const delta = view.toTs - view.fromTs
        const offset = delta * LOAD_OFFSET_RATIO
        const fromTs = view.fromTs - offset
        const toTs    = view.toTs + offset
        this.source.candle.setView(fromTs, toTs);
        this.source.trade .setView(fromTs, toTs);
        this.source.shape .setView(fromTs, toTs);
      }
    });

    this.config.addOnConfigDataChange("Default[data.strategyId]Refresh", ["strategyId"], () => {
      const strategyId = this.config.get()?.strategyId;
      if (strategyId !== undefined) {
        this.source.trade.setSource(null, strategyId);
        this.source.shape.setSource(null, strategyId);
      }
    });

    this.config.addOnConfigDataChange("Default[data.symbol]Refresh", ["symbol"], () => {
      const symbol = this.config.get()?.symbol;
      if (symbol !== undefined) {
        this.source.candle.setSource(symbol, null);
        this.source.trade.setSource(symbol, null);
        this.source.shape.setSource(symbol, null);
        this.needResetViewport = true
      }
    });

    this.config.addOnConfigDataChange("Default[data.timeframe]Refresh", ["timeframe"], () => {
      const timeframe = this.config.get()?.timeframe;
      if (timeframe !== undefined) {
        this.source.candle.setSource(null, timeframe);
      }
    });

    this.config.addOnConfigDataChange("Default[data.link]Refresh", ["sync","linkId"], () => {
      const linkId = this.config.get()?.sync?.linkId;
      const linkList = this.sync.link.getAll()

      if (linkList){
        for (const l of linkList){
          if (l.id != null && l.id == linkId){
            this.sync.link.state.registry(linkId)
            return
          }
        }
      }
      this.sync.link.state.unregistry()
    });

    this.source.candle.addOnClosedCandleDataChange("Symbol refresh", ()=>{
      if (this.needResetViewport){
        chart.viewport.aligner.autoViewport()
        this.needResetViewport = false
      }
    })

  }

  /**
   * Cleans up viewport, source, and config data instances.
   */
  public destroy(): void {
    this.viewport.destroy();
    this.source.destroy();
    this.config.destroy();
    this.crosshair.destroy();
    this.sync.destroy();
  }
}