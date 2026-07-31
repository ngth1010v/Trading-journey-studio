import StrategyData from "../../../../../data/chartData/strategy/StrategyData";
import SymbolData from "../../../../../data/chartData/symbol/SymbolData";
import TradeData from "../../../../../data/chartData/trade/TradeData";
import CandleData from "./candle/CandleData";
import ShapeData from "./shape/ShapeData";

export default class SourceData {
  public strategy: StrategyData = new StrategyData();
  public symbol: SymbolData = new SymbolData();
  public candle: CandleData = new CandleData();
  public trade: TradeData = new TradeData();
  public shape: ShapeData = new ShapeData();

  /**
   * Initializes all underlying child state data classes.
   */
  public async init(): Promise<void> {
    // Initialize children that return Promises
    await Promise.all([
      this.strategy.init(),
      this.symbol.init(),
    ]);

    // Initialize synchronous child instances
    this.trade.init();
    this.candle.init();
    this.shape.init();
  }

  /**
   * Destroys all underlying child state data classes.
   */
  public destroy(): void {
    this.strategy.destroy();
    this.symbol.destroy();
    this.candle.destroy();
    this.trade.destroy();
    this.shape.destroy();
  }
}