import type { RGB, RGBA } from "../../../../../../../shared/type";
import { fetchAllShapeTags, saveShapeTag, deleteShapeTag } from "./shapeTagApi";

export interface ShapeTag {
  id?: number;
  name: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  }; // stored as JSON string in DB
}

const REFRESH_DURATION = 500; // ms

export default class ShapeTagData {
  private strategyId: number | null = null;
  private cache: ShapeTag[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, () => void> = new Map();

  public init(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => this.refresh(), REFRESH_DURATION);
  }

  public destroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cache = [];
    this.listeners.clear();
  }

  public setSource(strategyId: number): void {
    this.strategyId = strategyId;
  }

  public getAll(): ShapeTag[] {
    return [...this.cache];
  }

  public get(id: number): ShapeTag {
    const item = this.cache.find((t) => t.id === id);
    if (!item) {
      throw new Error(`ShapeTag with id ${id} not found.`);
    }
    return item;
  }

  public async set(tag: ShapeTag): Promise<number> {
    if (this.strategyId === null) {
      throw new Error("Strategy ID is not set.");
    }
    const res = await saveShapeTag(this.strategyId, tag);
    return res.id;
  }

  public async remove(id: number): Promise<void> {
    if (this.strategyId === null) {
      throw new Error("Strategy ID is not set.");
    }
    await deleteShapeTag(this.strategyId, id);
  }

  public addOnShapeTagDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
    if (this.cache.length){
      cb()
    }
  }

  public removeOnShapeTagDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private async refresh(): Promise<void> {
    if (this.strategyId === null) return;

    try {
      const data = await fetchAllShapeTags(this.strategyId);
      if (JSON.stringify(data) !== JSON.stringify(this.cache)) {
        this.cache = data;
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