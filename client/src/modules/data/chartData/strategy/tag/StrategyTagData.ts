import type { RGB, RGBA } from "../../../../shared/type";
import {
  fetchAllStrategyTags,
  saveStrategyTag,
  deleteStrategyTagApi,
} from "./strategyTagApi";

export interface StrategyTag {
  id?: number;
  name: string;
  createdTimestamp: number;
  desc: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}

const REFRESH_DURATION = 500; // ms

export default class StrategyTagData {
  private cache: Map<number, StrategyTag> = new Map();
  private initialized: boolean = false;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private callbacks: Map<string, () => void> = new Map();

  /**
   * Start polling refresh loop to load strategy tags.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    await this.poll();

    this.timerId = setInterval(() => {
      this.poll();
    }, REFRESH_DURATION);
  }

  /**
   * Stop the refresh loop.
   */
  public destroy(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.cache.clear();
    this.callbacks.clear();
    this.initialized = false;
  }

  /**
   * Return specific tag.
   * Throws an error if init was not called or if tag is not found.
   */
  public get(id: number): StrategyTag {
    this.ensureInitialized();
    const tag = this.cache.get(id);
    if (!tag) {
      throw new Error(`StrategyTag with id ${id} not found.`);
    }
    return tag;
  }

  /**
   * Return all tags, or [] if empty.
   * Throws an error if init was not called.
   */
  public getAll(): StrategyTag[] {
    this.ensureInitialized();
    return Array.from(this.cache.values());
  }

  /**
   * Set/save tag (updates server directly; polling loop handles cache synchronization).
   */
  public async set(tag: StrategyTag): Promise<{ id: number }> {
    return await saveStrategyTag(tag);
  }

  /**
   * Remove tag (updates server directly; polling loop handles cache synchronization).
   */
  public async remove(id: number): Promise<void> {
    await deleteStrategyTagApi(id);
  }

  public addOnStrateryTagDataChange(id: string, cb: () => void): void {
    this.callbacks.set(id, cb);
  }

  public removeOnStrateryTagDataChange(id: string): void {
    this.callbacks.delete(id);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("StrategyTagData has not been initialized. Call init() first.");
    }
  }

  private async poll(): Promise<void> {
    try {
      const tags = await fetchAllStrategyTags();
      const newCache = new Map<number, StrategyTag>();

      for (const tag of tags) {
        if (tag.id !== undefined) {
          newCache.set(tag.id, tag);
        }
      }

      if (this.hasDataChanged(newCache)) {
        this.cache = newCache;
        this.notifySubscribers();
      }
    } catch (err) {
      // Silently swallow fetch/network errors during polling cycles
    }
  }

  private hasDataChanged(newCache: Map<number, StrategyTag>): boolean {
    if (this.cache.size !== newCache.size) return true;

    for (const [id, newTag] of newCache.entries()) {
      const oldTag = this.cache.get(id);
      if (!oldTag || JSON.stringify(oldTag) !== JSON.stringify(newTag)) {
        return true;
      }
    }

    return false;
  }

  private notifySubscribers(): void {
    this.callbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error executing StrategyTagData subscriber callback:", err);
      }
    });
  }
}