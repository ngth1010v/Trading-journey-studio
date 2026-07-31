import SourceData from "./source/SourceData";
import ViewportData from "./viewport/ViewportData";
import ConfigData from "./ConfigData";

export default class StateData {
  public viewport: ViewportData = new ViewportData();
  public source: SourceData = new SourceData();
  public config: ConfigData = new ConfigData();

  /**
   * Initializes config, viewport, and source data instances.
   */
  public async init(pageId: number, elementId: number): Promise<void> {
    this.config.init(pageId, elementId);
    this.viewport.init(this);
    await this.source.init();

    //====================================================================================================
    // Refresh logic
    //====================================================================================================
    this.config.addOnConfigDataChange("Default[data.viewport]Refresh", ["viewport"], () => {
      const view = this.config.get()?.viewport;
      if (view) {
        this.source.candle.setView(view.fromTs, view.toTs);
        this.source.trade.setView(view.fromTs, view.toTs);
        this.source.shape.setView(view.fromTs, view.toTs);
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
        this.source.trade.setSource(symbol, null);
        this.source.shape.setSource(symbol, null);
      }
    });

    this.config.addOnConfigDataChange("Default[data.timeframe]Refresh", ["timeframe"], () => {
      const timeframe = this.config.get()?.timeframe;
      if (timeframe !== undefined) {
        this.source.candle.setSource(null, timeframe);
      }
    });

    this.config.addOnConfigDataChange("Default[data.link]Refresh", ["linkId"], () => {
      const linkId = this.config.get()?.linkId;
      this.viewport.link.state.setSource(linkId ? linkId : null);
    });
  }

  /**
   * Cleans up viewport, source, and config data instances.
   */
  public destroy(): void {
    this.viewport.destroy();
    this.source.destroy();
    this.config.destroy();
  }
}