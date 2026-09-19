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
  private version = 0; // bumped on every local set/remove
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
    this.template.init();
    if (this.strategyId !== null) {
      this.tag.setSource(this.strategyId);
      this.template.setSource(this.strategyId);
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
    // Both params are optional-per-call: callers pass `null` for "leave unchanged" (StateData's
    // configSymbol/configStrategyId listeners each only touch one param). Only `undefined` skips;
    // `null` still falls through to "leave unchanged" here since it's indistinguishable from that
    // at this call shape (unlike the old `if (strategyId)` truthy check, this no longer drops a
    // legitimate falsy id like 0).
    if (symbol !== null && symbol !== undefined) {
      this.symbol = symbol;
    }
    if (strategyId !== null && strategyId !== undefined) {
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
    // Existing shape: update the cache before the network round-trip, otherwise the renderer
    // draws the stale cached copy (e.g. right after a drag ends) until the save returns.
    const prevIdx = shape.id !== undefined ? this.cache.findIndex((s) => s.id === shape.id) : -1;
    const prev = prevIdx >= 0 ? this.cache[prevIdx] : null;
    if (prev) {
      this.cache[prevIdx] = shape;
      this.version++;
      this.notifyChange();
    }

    let res: { id: number };
    try {
      res = await saveShape(this.strategyId, shape);
    } catch (err) {
      if (prev) {
        const idx = this.cache.findIndex((s) => s.id === shape.id);
        if (idx >= 0) this.cache[idx] = prev;
        this.notifyChange();
      }
      throw err;
    }
    this.version++;
    const saved: Shape = { ...shape, id: res.id };
    const idx = this.cache.findIndex((s) => s.id === saved.id);
    if (idx >= 0) {
      this.cache[idx] = saved;
    } else {
      this.cache.push(saved);
    }
    this.lastRefreshTimestamp = 0;
    this.notifyChange();
    return res.id;
  }

  public async remove(id: number): Promise<void> {
    if (this.strategyId === null) {
      throw new Error("Strategy ID is not set.");
    }
    await deleteShape(this.strategyId, id);
    this.version++;
    this.cache = this.cache.filter((s) => s.id !== id);
    this.lastRefreshTimestamp = 0;
    this.notifyChange();
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

    // A poll that started before a local set/remove would overwrite the cache with stale data.
    const startVersion = this.version;
    try {
      const serverLastChangeTimestamp = await fetchLastChangeTimestamp(this.strategyId);
      if (serverLastChangeTimestamp > this.lastRefreshTimestamp) {
        const shapes = await fetchShapes(
          this.strategyId,
          this.symbol,
          this.fromTs,
          this.toTs
        );
        if (this.version !== startVersion) return; // local change happened mid-fetch; next poll refetches
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