import { fetchPageElementConfig, updatePageElementConfig } from "./pageElementConfigApi.js";

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

export default class PageElementConfigData {
  private pageElementId: number | null = null;
  private cache: any = null;

  private onConfigDataChangeListeners = new Map<string, () => void>();

  public init(pageElementId: number, defaultConfig: any = {}): void {
    this.pageElementId = pageElementId;
    this.cache = null; // Keep cache null initially until polling/fetch completes

    // Fetch config from server once on initialization
    fetchPageElementConfig(pageElementId)
      .then((remoteConfig) => {
        const merged = deepMerge(defaultConfig ?? {}, remoteConfig ?? {});
        this.cache = merged;
        this.notifyConfigDataChange();
      })
      .catch((err) => {
        console.error(`[PageElementConfigData] Failed to fetch remote config for element ID ${pageElementId}:`, err);
        // Fallback to default config if remote call fails
        this.cache = defaultConfig ? deepMerge({}, defaultConfig) : {};
        this.notifyConfigDataChange();
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

  public get(): any {
    return this.cache;
  }

  public set(config: any): void {
    // Modify local cache only and instantly notify listeners
    this.cache = deepMerge(this.cache ?? {}, config ?? {});
    this.notifyConfigDataChange();
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

  public addOnPageElementConfigDataChange(id: string, cb: () => void): void {
    this.onConfigDataChangeListeners.set(id, cb);

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

  private notifyConfigDataChange(): void {
    for (const cb of this.onConfigDataChangeListeners.values()) {
      try {
        cb();
      } catch (err) {
        console.error("[PageElementConfigData] Error executing onConfigDataChange callback:", err);
      }
    }
  }
}