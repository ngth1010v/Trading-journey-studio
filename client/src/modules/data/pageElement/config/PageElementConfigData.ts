import { fetchPageElementConfig, updatePageElementConfig } from "./pageElementConfigApi.js";

interface PageElementConfigListener {
  target: string[];
  cb: () => void;
}

/**
 * Recursively performs a deep merge of nested configuration objects.
 * Arrays and primitive values are replaced rather than merged.
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

    if (sourceVal === undefined) {
      continue;
    }

    if (sourceVal === null) {
      output[key] = null as T[keyof T];
      continue;
    }

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

    output[key] = sourceVal as T[keyof T];
  }

  return output;
}

export default class PageElementConfigData<T extends Record<string, any> = any> {
  private pageElementId: number | null = null;
  private cache: T | null = null;

  private onConfigDataChangeListeners = new Map<string, PageElementConfigListener>();

  public init(pageElementId: number, defaultConfig: Partial<T> = {}): void {
    this.pageElementId = pageElementId;
    this.cache = null; // Keep cache null initially until polling/fetch completes

    // Fetch config from server once on initialization
    fetchPageElementConfig(pageElementId)
      .then((remoteConfig) => {
        const previousCache = this.cache;
        const merged = deepMerge((defaultConfig ?? {}) as T, remoteConfig ?? {});
        this.cache = merged;
        this.notifyConfigDataChange(previousCache, this.cache);
      })
      .catch((err) => {
        console.error(`[PageElementConfigData] Failed to fetch remote config for element ID ${pageElementId}:`, err);
        // Fallback to default config if remote call fails
        const previousCache = this.cache;
        this.cache = defaultConfig ? deepMerge({} as T, defaultConfig) : ({} as T);
        this.notifyConfigDataChange(previousCache, this.cache);
      });
  }

  public destroy(): void {
    // Flush current cache to server non-blocking before clearing
    if (this.pageElementId !== null && this.cache !== null) {
      this.flush().catch((err) => {
        console.error("[PageElementConfigData] Error during flush in destroy():", err);
      });
    }

    this.cache = null;
    this.pageElementId = null;
    // Note: per specification, destroy does not clear onChange callbacks
  }

  public get(): T | null {
    return this.cache;
  }

  public set(config: Partial<T>): void {
    // Modify local cache only and instantly notify listeners
    const previousCache = this.cache;
    this.cache = deepMerge(this.cache ?? ({} as T), config ?? {});
    this.notifyConfigDataChange(previousCache, this.cache);
  }

  public async flush(): Promise<void> {
    if (this.pageElementId === null || this.cache === null) {
      return;
    }

    try {
      await updatePageElementConfig(this.pageElementId, this.cache);
    } catch (err) {
      console.error(`[PageElementConfigData] Failed to flush config for ID ${this.pageElementId}:`, err);
    }
  }

  public addOnPageElementConfigDataChange(id: string, target: string[], cb: () => void): void {
    if (this.onConfigDataChangeListeners.has(id)) {
      console.warn(`[PageElementConfigData] Listener ID '${id}' already exists. Overwriting listener.`);
    }

    this.onConfigDataChangeListeners.set(id, { target, cb });

    // Invoke callback immediately if cache is already populated
    if (this.cache !== null) {
      try {
        cb();
      } catch (err) {
        console.error(`[PageElementConfigData] Error executing callback on register for ID '${id}':`, err);
      }
    }
  }

  public removeOnPageElementConfigDataChange(id: string): void {
    if (!this.onConfigDataChangeListeners.has(id)) {
      console.warn(`[PageElementConfigData] Listener ID '${id}' not found in listeners.`);
      return;
    }
    this.onConfigDataChangeListeners.delete(id);
  }

  private notifyConfigDataChange(oldConfig: T | null, newConfig: T | null): void {
    for (const { target, cb } of this.onConfigDataChangeListeners.values()) {
      if (this.shouldTriggerCallback(target, oldConfig, newConfig)) {
        try {
          cb();
        } catch (err) {
          console.error("[PageElementConfigData] Error executing onConfigDataChange callback:", err);
        }
      }
    }
  }

  private shouldTriggerCallback(
    target: string[],
    oldConfig: T | null,
    newConfig: T | null
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