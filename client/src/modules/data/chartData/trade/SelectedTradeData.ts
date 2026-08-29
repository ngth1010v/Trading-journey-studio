import TradeData, { type Trade } from "./TradeData";

export default class SelectedTradeData {
  private tradeData: TradeData;
  private selectedId: number | null = null;
  private listeners: Map<string, () => void> = new Map();

  constructor(tradeData: TradeData) {
    this.tradeData = tradeData;
  }

  public init(): void {
    this.selectedId = null;
  }

  public destroy(): void {
    this.selectedId = null;
    // Note: Listeners are retained per requirement #3
  }

  public setSelectedId(id: number | null): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.notifyListeners();
    // Notify parent TradeData listeners since getAll() output changes when selection changes
    this.tradeData.notifyListeners();
  }

  public get(): Trade | null {
    if (this.selectedId === null) {
      return null;
    }
    return this.tradeData.get(this.selectedId);
  }

  public set(trade: Trade): void{
    if (this.selectedId === null) {
      return;
    }
    this.tradeData.set(trade);
  }

  public addOnSelectedTradeDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
  }

  public removeOnSelectedTradeDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private notifyListeners(): void {
    for (const callback of this.listeners.values()) {
      callback();
    }
  }
}