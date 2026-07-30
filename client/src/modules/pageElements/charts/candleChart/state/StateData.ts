import SourceData from "./source/SourceData";
import ViewportData from "./viewport/ViewportData";
import ConfigData from "./ConfigData";

export default class StateData {
  public viewport: ViewportData = new ViewportData();
  public source: SourceData = new SourceData();
  public config: ConfigData = new ConfigData();

  /**
   * Initializes both viewport and source data instances.
   */
  public async init(): Promise<void> {
    this.config.init();
    this.viewport.init();
    await this.source.init();


    //====================================================================================================
    // Refresh logic
    //====================================================================================================
    this.config.addOnConfigDataChange("Default[data.viewport]Refresh", ["data","viewport"], ()=>{
      const view = this.config.get().data?.viewport
      if (view){
        this.source.candle.setView(view.fromTs, view.toTs)
        this.source.trade.setView (view.fromTs, view.toTs)
        this.source.shape.setView (view.fromTs, view.toTs)
      }
    })
    this.config.addOnConfigDataChange("Default[data.strategyId]Refresh", ["data","strategyId"], ()=>{
      const strategyId = this.config.get().data?.strategyId
      if (strategyId !== undefined){
        this.source.trade.setSource(null, strategyId)
        this.source.shape.setSource(null, strategyId)
      }
    })
    this.config.addOnConfigDataChange("Default[data.symbol]Refresh", ["data","symbol"], ()=>{
      const symbol = this.config.get().data?.symbol
      if (symbol !== undefined){
        this.source.trade.setSource(symbol, null)
        this.source.shape.setSource(symbol, null)
      }
    })
    this.config.addOnConfigDataChange("Default[data.timeframe]Refresh", ["data","timeframe"], ()=>{
      const timeframe = this.config.get().data?.timeframe
      if (timeframe !== undefined){
        this.source.candle.setSource(null, timeframe)
      }
    })
    this.config.addOnConfigDataChange("Default[data.link]Refresh", ["data","linkId"], ()=>{
      const linkId = this.config.get().data?.linkId
      this.viewport.link.state.setSource(linkId ? linkId : null)
    })
  }

  /**
   * Cleans up both viewport and source data instances.
   */
  public destroy(): void {
    this.viewport.destroy();
    this.source.destroy();
    this.config.destroy();
  }
}