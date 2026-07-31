import PageData, { type Page, type PageElement } from "../../../../data/page/PageData";
import type { Viewport } from "./viewport/ViewportData";
import type { RGBA } from "../../../../shared/type";

export interface Config {
  viewport?: Viewport;
  strategyId?: number;
  symbol?: string;
  timeframe?: string;
  linkId?: number;
  style?: {
    candle?: {
      bull?:{
        background?: RGBA;
        border?: RGBA;
      }
      bear?:{
        background?: RGBA;
        border?: RGBA;
      }
    }
  }
}

const DEFAULT_CONFIG = {
  style: {
    candle: {
      bull: {
        background: [50,255,50,255] as RGBA,
        border    : [50,255,50,255] as RGBA
      },
      bear: {
        background: [255,50,50,255] as RGBA,
        border    : [255,50,50,255] as RGBA
      }
    }
  }
}

interface ConfigListener {
  target: string[];
  cb: () => void;
}

export default class ConfigData {
  private pageData: PageData = new PageData();
  private pageId: number | null = null;
  private elementId: number | null = null;
  private cache: Config | null = null;

  private listeners = new Map<string, ConfigListener>();

  public init(pageId: number, elementId: number): void {
    this.pageId = pageId;
    this.elementId = elementId;
    if (!this.cache) this.cache = structuredClone(DEFAULT_CONFIG)

    this.pageData.init();

    const listenerId = `config_data_sync_${Math.random().toString(36).substring(2, 11)}`;

    this.pageData.addOnPageDataChange(listenerId, () => {
      this.syncFromPageData();
    });

    // Initial sync upon initialization
    this.syncFromPageData();
  }

  public destroy(): void {
    this.pageData.destroy();
    this.listeners.clear();
    this.cache = null;
    this.pageId = null;
    this.elementId = null;
  }

  /**
   * Return cached Config data
   */
  public get(): Config | null {
    return this.cache;
  }

  /**
   * Optimistically merge partial updates into cache & notify listeners, then send to server via PageData
   */
  public set(partialConfig: Partial<Config>): void {
    const previousCache = this.cache;

    // Merge partial update with existing cache (fallback to empty object if cache was null)
    const updatedConfig: Config = {
      ...(this.cache ?? {}),
      ...partialConfig,
    };

    this.cache = updatedConfig;

    // 1. Immediately notify local listeners (optimistic update)
    this.notifyListeners(previousCache, this.cache);

    // 2. Persist updated full config to server via PageData asynchronously
    this.persistToPageData(this.cache).catch((err) => {
      console.error("[ConfigData] Failed to persist config to server:", err);
    });
  }

  public addOnConfigDataChange(id: string, target: string[], cb: () => void): void {
    if (this.listeners.has(id)) {
      console.warn(`[ConfigData] Listener ID '${id}' already exists. Overwriting listener.`);
    }

    this.listeners.set(id, { target, cb });

    // Instantly invoke upon registration if cache is populated
    if (this.cache !== null) {
      try {
        cb();
      } catch (err) {
        console.error(`[ConfigData] Error executing callback on register for ID '${id}':`, err);
      }
    }
  }

  public removeOnConfigDataChange(id: string): void {
    if (!this.listeners.has(id)) {
      console.warn(`[ConfigData] Listener ID '${id}' not found in onConfigDataChange listeners.`);
      return;
    }
    this.listeners.delete(id);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private syncFromPageData(): void {
    if (this.pageId === null || this.elementId === null) {
      this.cache = null;
      return;
    }

    const previousCache = this.cache;

    try {
      const page: Page = this.pageData.get(this.pageId);
      const element: PageElement | undefined = page?.data?.find((e) => e.id === this.elementId);

      if (!page || !element) {
        this.cache = null;
      } else {
        this.cache = element.data ?? null;
      }
    } catch {
      // PageData.get() throws an error if page isn't found
      this.cache = null;
    }

    this.notifyListeners(previousCache, this.cache);
  }

  private async persistToPageData(newConfig: Config): Promise<void> {
    if (this.pageId === null || this.elementId === null) return;

    try {
      const page = this.pageData.get(this.pageId);
      if (!page) return;

      const elementIndex = page.data.findIndex((e) => e.id === this.elementId);
      if (elementIndex === -1) return;

      // Update the targeted element's data while preserving other element fields
      const updatedElements = [...page.data];
      updatedElements[elementIndex] = {
        ...updatedElements[elementIndex],
        data: newConfig,
      };

      const updatedPage: Page = {
        ...page,
        data: updatedElements,
      };

      await this.pageData.set(updatedPage);
    } catch (err) {
      console.error("[ConfigData] Error during persistToPageData:", err);
    }
  }

  private notifyListeners(oldConfig: Config | null, newConfig: Config | null): void {
    for (const { target, cb } of this.listeners.values()) {
      if (this.shouldTriggerCallback(target, oldConfig, newConfig)) {
        try {
          cb();
        } catch (err) {
          console.error("[ConfigData] Error executing listener callback:", err);
        }
      }
    }
  }

  private shouldTriggerCallback(
    target: string[],
    oldConfig: Config | null,
    newConfig: Config | null
  ): boolean {
    // If target is empty, trigger on ANY change
    if (!target || target.length === 0) {
      return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
    }

    // Trigger if targeted property values changed
    const oldObj = (oldConfig || {}) as Record<string, any>;
    const newObj = (newConfig || {}) as Record<string, any>;

    return target.some((key) => {
      return JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key]);
    });
  }
}