import { fetchAllShapeTemplates, saveShapeTemplate, deleteShapeTemplate } from "./shapeTemplateApi";

export interface ShapeTemplate {
  id?: number;
  type: string;
  name: string;
  style: any; // stored as JSON string in DB
}

const REFRESH_DURATION = 500; // ms

export default class ShapeTemplateData {
  private strategyId: number | null = null;
  private cache: ShapeTemplate[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, () => void> = new Map();

  public init(strategyId?: number): void {
    if (strategyId !== undefined) this.setSource(strategyId);
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
  }

  public setSource(strategyId: number): void {
    this.strategyId = strategyId;
  }

  public getAll(): ShapeTemplate[] {
    return [...this.cache];
  }

  public get(id: number): ShapeTemplate {
    const item = this.cache.find((t) => t.id === id);
    if (!item) {
      throw new Error(`ShapeTemplate with id ${id} not found.`);
    }
    return item;
  }

  public async set(template: ShapeTemplate): Promise<number> {
    if (this.strategyId === null) {
      throw new Error("Strategy ID is not set.");
    }
    const res = await saveShapeTemplate(this.strategyId, template);
    return res.id;
  }

  public async remove(id: number): Promise<void> {
    if (this.strategyId === null) {
      throw new Error("Strategy ID is not set.");
    }
    await deleteShapeTemplate(this.strategyId, id);
  }

  public addOnShapeTemplateDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
    if (this.cache.length){
      cb()
    }
  }

  public removeOnShapeTemplateDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private async refresh(): Promise<void> {
    if (this.strategyId === null) return;

    try {
      const data = await fetchAllShapeTemplates(this.strategyId);
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