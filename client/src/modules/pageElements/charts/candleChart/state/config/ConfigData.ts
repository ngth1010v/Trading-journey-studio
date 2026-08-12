import PageData, { type Page, type PageElement } from "../../../../../data/page/PageData";
import type { Viewport } from "../viewport/ViewportData";
import type { RGBA, RGB } from "../../../../../shared/type";

export interface Config {
  viewport?: Viewport;
  symbol?: string;
  timeframe?: string;
  strategyId?: number | null;
  sync?:{
    linkId?: number | null
  }
  style?: {
    crosshair?: {
      color?: {
        background?: RGBA;
        font?: RGB;
      };
      thickness?: number;
      type?: "dash" | "solid";
      dash?: {
        space: number; //px
        width: number; //px
      };
    };
    altCrosshair?: {
      color?: {
        background?: RGBA;
        font?: RGB;
      };
      thickness?: number;
      type?: "dash" | "solid";
      dash?: {
        space: number; //px
        width: number; //px
      };
    };
    candle?: {
      opening?: {
        color?: {
          background: RGBA;
          font?: RGB;
        };
        thickness?: number;
        type?: "dash" | "solid";
        dash?: {
          space: number; //px
          width: number; //px
        };
      };
      bull?: {
        background?: RGBA;
        border?: RGBA;
      };
      bear?: {
        background?: RGBA;
        border?: RGBA;
      };
    };
  };
  floatingBar?:{
    seasonBar?:{
      enable?: boolean,
      position?:{
        x?: number
        y?: number
      }
    }
  };
}

interface ConfigListener {
  target: string[];
  cb: () => void;
}

/**
 * Recursively performs a deep merge of nested configuration objects.
 * Arrays (such as RGBA [r, g, b, a]) and primitive values are replaced rather than merged.
 */
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const output = { ...target };

  if (!source || typeof source !== "object") {
    return output;
  }

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceVal = source[key];
    const targetVal = target[key];

    // undefined => skip, giữ nguyên target
    if (sourceVal === undefined) {
      continue;
    }

    // null => set trực tiếp thành null
    if (sourceVal === null) {
      output[key] = null as T[keyof T];
      continue;
    }

    // Object => deep merge
    if (
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal)
    ) {
      output[key] = deepMerge(
        targetVal &&
        typeof targetVal === "object" &&
        !Array.isArray(targetVal)
          ? targetVal
          : ({} as T[typeof key]),
        sourceVal as Partial<T[typeof key]>
      ) as T[keyof T];

      continue;
    }

    // Primitive / Array => replace
    output[key] = sourceVal as T[keyof T];
  }

  return output;
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

    const defaultConfig: Config = {
      viewport: {
        fromTs: Date.now() - ((1000 * 60 * 60 * 24 * 5) * 3) / 4,
        toTs: Date.now() + (1000 * 60 * 60 * 24) / 4,
        fromPrice: 0,
        toPrice: 1,
      } as Viewport,
      timeframe: "1H",
      style: {
        crosshair: {
          color: {
            background: [255, 255, 255, 255] as RGBA,
            font: [0, 0, 0] as RGB,
          },
          thickness: 1,
          type: "dash",
          dash: {
            space: 5, //px
            width: 5, //px
          },
        },
        altCrosshair: {
          color: {
            background: [255, 255, 200, 100] as RGBA,
            font: [0, 0, 0] as RGB,
          },
          thickness: 1,
          type: "dash",
          dash: {
            space: 5, //px
            width: 5, //px
          },
        },
        candle: {
          opening: {
            color: {
              background: [248, 249, 250, 255] as RGBA,
              font: [0, 0, 0] as RGB,
            },
            thickness: 1,
            type: "dash",
            dash: {
              space: 3, //px
              width: 5, //px
            },
          },
          bull: {
            background: [50, 255, 50, 255] as RGBA,
            border: [50, 255, 50, 255] as RGBA,
          },
          bear: {
            background: [255, 50, 50, 255] as RGBA,
            border: [255, 50, 50, 255] as RGBA,
          },
        },
      },
      floatingBar:{
        seasonBar:{
          enable: false,
          position:{
            x: 30,
            y: 30
          }
        }
      }
    };

    // Deeply merge default values with existing cache (if any)
    if (this.cache && this.cache.viewport && (this.cache.viewport.fromPrice == null || this.cache.viewport.toPrice == null)){
      this.cache.viewport.fromPrice = 0
      this.cache.viewport.toPrice = 1
    }
    this.cache = deepMerge(defaultConfig, this.cache ?? {});

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
    if (partialConfig.viewport && (partialConfig.viewport.fromPrice === null || partialConfig.viewport.toPrice === null)){
      partialConfig.viewport.fromPrice = 0
      partialConfig.viewport.toPrice = 1
    }

    // Deep merge partial update with existing cache
    this.cache = deepMerge(this.cache ?? {}, partialConfig);

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
        if (element.data.viewport && (element.data.viewport.fromPrice === null || element.data.viewport.toPrice === null)){
          element.data.viewport.fromPrice = 0
          element.data.viewport.toPrice = 1
        }
        // Deeply merge remote data over existing cached defaults
        this.cache = deepMerge(this.cache ?? {}, element.data ?? {});
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