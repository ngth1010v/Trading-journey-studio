import ShapeTagData from "./tag/ShapeTagData";
import ShapeTemplateData from "./template/ShapeTemplateData";
import { fetchShapes, fetchLastChangeTimestamp, saveShape, deleteShape } from "./shapeApi";

export interface Shape {
  id?: number;
  type: string;
  symbol: string;
  tagIds: number[]; // stored as JSON string in DB
  fromTs: number;
  toTs: number;
  data: any; // stored as JSON string in DB
  style: any; // stored as JSON string in DB
}

const REFRESH_DURATION = 500; // ms

export default class ShapeData {
  public readonly tag: ShapeTagData = new ShapeTagData();
  public readonly template: ShapeTemplateData = new ShapeTemplateData();

  private strategyId: number | null = null;
  private symbol: string | null = null;
  private fromTs: number | null = null;
  private toTs: number | null = null;

  private cache: Shape[] = [];
  private lastRefreshTimestamp: number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, () => void> = new Map();

  public init(strategyId?: number): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }

    if (strategyId !== undefined) {
      this.strategyId = strategyId;
    }

    // Initialize inner tag and template controllers
    this.tag.init();
    if (this.strategyId !== null) {
      this.tag.setSource(this.strategyId);
      this.template.init(this.strategyId);
    }

    this.timer = setInterval(() => this.refresh(), REFRESH_DURATION);
  }

  public destroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Destroy inner tag and template controllers
    this.tag.destroy();
    this.template.destroy();

    this.cache = [];
    this.lastRefreshTimestamp = 0;
  }

  public setSource(symbol: string | null, strategyId: number | null): void {
    if (symbol){
      this.symbol = symbol;
    }
    if (strategyId){
      this.strategyId = strategyId;
      this.tag.setSource(strategyId);
      this.template.setSource(strategyId);
    }
    this.lastRefreshTimestamp = 0; // reset timestamp to force fresh fetch
  }

  public setView(fromTs: number, toTs: number): void {
    this.fromTs = fromTs;
    this.toTs = toTs;
    this.lastRefreshTimestamp = 0; // reset timestamp to force fresh fetch for new view range
  }

  public getAll(): Shape[] {
    return [...this.cache];
  }

  public get(id: number): Shape {
    const item = this.cache.find((s) => s.id === id);
    if (!item) {
      throw new Error(`Shape with id ${id} not found.`);
    }
    return item;
  }

  public async set(shape: Shape): Promise<number> {
    if (this.strategyId === null) {
      throw new Error("Strategy ID is not set.");
    }
    const res = await saveShape(this.strategyId, shape);
    return res.id;
  }

  public async remove(id: number): Promise<void> {
    if (this.strategyId === null) {
      throw new Error("Strategy ID is not set.");
    }
    await deleteShape(this.strategyId, id);
  }

  public addOnShapeDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
    if (this.cache.length){
      cb()
    }
  }

  public removeOnShapeDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private async refresh(): Promise<void> {
    if (
      this.strategyId === null ||
      this.symbol === null ||
      this.fromTs === null ||
      this.toTs === null
    ) {
      return;
    }

    try {
      const serverLastChangeTimestamp = await fetchLastChangeTimestamp(this.strategyId);
      if (serverLastChangeTimestamp > this.lastRefreshTimestamp) {
        const shapes = await fetchShapes(
          this.strategyId,
          this.symbol,
          this.fromTs,
          this.toTs
        );
        this.cache = shapes;
        this.lastRefreshTimestamp = serverLastChangeTimestamp;
        this.notifyChange();
      }
    } catch {
      // Ignore network errors during polling
    }
  }

  private notifyChange(): void {
    this.listeners.forEach((cb) => cb());
  }
}