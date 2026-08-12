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

export const STRATEGY_TAG_INPUT_LAYOUT = {
  name: 'string',
  color: {
    font: "rgb",
    background: "rgba",
    border: "rgba",
  },
  desc: "text",
}

export const REFRESH_DURATION = 500; // ms

// ============================================================================
// GLOBAL STATE & LOOP
// ============================================================================

interface StrategyTagMainTrigger {
  triggerStrategyTagDataChange: () => void;
}

let isStrategyTagInitialized = false;
let globalStrategyTagIntervalId: ReturnType<typeof setInterval> | null = null;
let strategyTagCacheMap: Map<number, StrategyTag> = new Map();
let previousStrategyTagJson = "";

const strategyTagDataCallbackMap = new Map<string, StrategyTagMainTrigger>();

async function executeGlobalStrategyTagRefresh(): Promise<void> {
  try {
    const freshTags = await fetchAllStrategyTags();
    const freshJson = JSON.stringify(freshTags);

    const hasDataChanged = freshJson !== previousStrategyTagJson;

    const newMap = new Map<number, StrategyTag>();
    for (const item of freshTags) {
      if (item.id !== undefined) {
        newMap.set(item.id, item);
      }
    }

    strategyTagCacheMap = newMap;
    previousStrategyTagJson = freshJson;

    if (hasDataChanged) {
      for (const { triggerStrategyTagDataChange } of strategyTagDataCallbackMap.values()) {
        triggerStrategyTagDataChange();
      }
    }
  } catch (err) {
    // Silently swallow fetch/network errors during polling cycles
  }
}

export function initStrategyTag(): void {
  if (isStrategyTagInitialized) {
    return;
  }
  isStrategyTagInitialized = true;

  executeGlobalStrategyTagRefresh();
  globalStrategyTagIntervalId = setInterval(executeGlobalStrategyTagRefresh, REFRESH_DURATION);
}

export function destroyStrategyTag(): void {
  if (!isStrategyTagInitialized) {
    return;
  }

  if (globalStrategyTagIntervalId !== null) {
    clearInterval(globalStrategyTagIntervalId);
    globalStrategyTagIntervalId = null;
  }

  strategyTagCacheMap.clear();
  previousStrategyTagJson = "";
  isStrategyTagInitialized = false;
}

// ============================================================================
// STRATEGYTAGDATA CLASS
// ============================================================================

export default class StrategyTagData {
  public id: string | null = null;

  private callbacks = new Map<string, () => void>();

  public init(): void {
    if (this.id !== null) {
      return; // Prevent duplicate initialization
    }

    this.id = `strategy_tag_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

    strategyTagDataCallbackMap.set(this.id, {
      triggerStrategyTagDataChange: () => this.notifyDataChange(),
    });
  }

  public destroy(): void {
    if (this.id !== null) {
      strategyTagDataCallbackMap.delete(this.id);
      this.id = null;
    }
  }

  /**
   * Return specific tag.
   * Throws an error if tag is not found.
   */
  public get(id: number): StrategyTag {
    const tag = strategyTagCacheMap.get(id);
    if (!tag) {
      throw new Error(`StrategyTag with id ${id} not found.`);
    }
    return tag;
  }

  /**
   * Return all tags, or [] if empty.
   */
  public getAll(): StrategyTag[] {
    return Array.from(strategyTagCacheMap.values());
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

  public getDefault(): StrategyTag {
    const tag: StrategyTag = {
      name: "Default",
      createdTimestamp: Date.now(),
      desc: "",
      color: {
        font: [255, 255, 255],
        background: [120, 90, 150, 1],
        border: [145, 118, 175, 1],
      },
    };

    const existingNames = new Set(this.getAll().map((t) => t.name));

    const baseName = tag.name;
    let index = 1;

    while (existingNames.has(tag.name)) {
      tag.name = `${baseName} ${index++}`;
    }

    return tag;
  }

  public addOnStrateryTagDataChange(id: string, cb: () => void): void {
    this.callbacks.set(id, cb);

    // Nếu đã có dữ liệu thì gọi callback ngay lập tức
    if (strategyTagCacheMap.size > 0) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing StrategyData subscriber callback:", err);
      }
    }
  }

  public removeOnStrateryTagDataChange(id: string): void {
    if (!this.callbacks.has(id)) {
      console.warn(`[StrategyTagData] Listener ID '${id}' not found.`);
      return;
    }
    this.callbacks.delete(id);
  }

  private notifyDataChange(): void {
    for (const cb of this.callbacks.values()) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing StrategyTagData subscriber callback:", err);
      }
    }
  }
}