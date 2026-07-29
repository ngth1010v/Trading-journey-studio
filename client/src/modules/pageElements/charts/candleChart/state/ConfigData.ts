import type { Viewport } from "./viewport/ViewportData";

export interface Config {
  pageId    ?: number | null;
  elementId ?: number | null;
  data?: {
    viewport    ?: Viewport | null;
    strategyId  ?: number | null;
    symbol      ?: string | null;
    timeframe   ?: string | null;
    linkId      ?: number | null;
  };
}

interface TargetedListener {
  target: string[];
  cb: () => void;
}

export default class ConfigData {
  private configCache: Config | null = null;
  private configListeners: Map<string, () => void> = new Map();
  private targetedListeners: Map<string, TargetedListener> = new Map();

  /**
   * Initializes the config state.
   */
  public init(): void {
    this.configCache = null;
    this.configListeners.clear();
    // targetedListeners persist through init() as specified
  }

  /**
   * Cleans up listeners and clears cached config data.
   */
  public destroy(): void {
    this.configListeners.clear();
    this.targetedListeners.clear();
    this.configCache = null;
  }

  /**
   * Retrieves the current configuration.
   * Throws an error if the config has not been set yet.
   */
  public get(): Config {
    if (!this.configCache) {
      throw new Error("ConfigData: Config has not been set yet. Call set() first.");
    }

    return this.cloneConfig(this.configCache);
  }

  /**
   * Updates the configuration state by merging partial updates.
   * Missing fields in `config` retain their existing values in `configCache`.
   */
  public set(config: Config): void {
    const oldConfig = this.configCache;
    const mergedConfig = this.mergeConfig(this.configCache, config);

    if (this.isEqual(oldConfig, mergedConfig)) {
      return;
    }

    this.configCache = mergedConfig;
    this.notifyConfigListeners();
    this.notifyTargetedListeners(oldConfig, mergedConfig);
  }

  public addOnConfigChange(id: string, cb: () => void): void {
    this.configListeners.set(id, cb);
  }

  public removeOnConfigChange(id: string): void {
    this.configListeners.delete(id);
  }

  /**
   * Registers a callback that triggers when data targeted by specific keys changes.
   */
  public addOnConfigDataChange(
    id: string,
    target: string[] | null | undefined,
    cb: () => void
  ): void {
    if (this.targetedListeners.has(id)) {
      throw new Error(`ConfigData: Targeted listener with id "${id}" already exists.`);
    }

    this.targetedListeners.set(id, {
      target: target ?? [],
      cb,
    });
  }

  /**
   * Unregisters a targeted callback by ID.
   */
  public removeOnConfigDataChange(id: string): void {
    this.targetedListeners.delete(id);
  }

  private notifyConfigListeners(): void {
    for (const callback of this.configListeners.values()) {
      try {
        callback();
      } catch (err) {
        console.error("ConfigData: Error inside config listener callback:", err);
      }
    }
  }

  private notifyTargetedListeners(prevConfig: Config | null, nextConfig: Config): void {
    for (const { target, cb } of this.targetedListeners.values()) {
      try {
        if (!target || target.length === 0) {
          // If target is empty, null, or undefined -> trigger on any config change
          cb();
        } else {
          const prevVal = this.getValueByPath(prevConfig, target);
          const nextVal = this.getValueByPath(nextConfig, target);

          if (this.hasSubtreeChanged(prevVal, nextVal)) {
            cb();
          }
        }
      } catch (err) {
        console.error("ConfigData: Error inside targeted config listener callback:", err);
      }
    }
  }

  /**
   * Navigates an object graph given an array of keys.
   */
  private getValueByPath(obj: any, path: string[]): any {
    let current = obj;
    for (const key of path) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = current[key];
    }
    return current;
  }

  /**
   * Checks if values or any nested values within a target subtree have changed.
   */
  private hasSubtreeChanged(prevVal: any, nextVal: any): boolean {
    if (prevVal === nextVal) return false;

    if (
      typeof prevVal !== "object" ||
      typeof nextVal !== "object" ||
      prevVal === null ||
      nextVal === null
    ) {
      return prevVal !== nextVal;
    }

    const prevKeys = Object.keys(prevVal);
    const nextKeys = Object.keys(nextVal);

    const allKeys = new Set([...prevKeys, ...nextKeys]);

    for (const key of allKeys) {
      if (this.hasSubtreeChanged(prevVal[key], nextVal[key])) {
        return true;
      }
    }

    return false;
  }

  /**
   * Merges incoming partial config with existing cached config.
   */
  private mergeConfig(current: Config | null, incoming: Config): Config {
    return {
      pageId: incoming.pageId ?? current?.pageId,
      elementId: incoming.elementId ?? current?.elementId,
      data: {
        strategyId: incoming.data?.strategyId ?? current?.data?.strategyId,
        symbol: incoming.data?.symbol ?? current?.data?.symbol,
        timeframe: incoming.data?.timeframe ?? current?.data?.timeframe,
        linkId: incoming.data?.linkId !== undefined ? incoming.data.linkId : current?.data?.linkId,
        viewport: incoming.data?.viewport
          ? { ...incoming.data.viewport }
          : current?.data?.viewport
          ? { ...current.data.viewport }
          : undefined,
      },
    };
  }

  /**
   * Deep clones a config object to prevent accidental external mutation.
   */
  private cloneConfig(config: Config): Config {
    return {
      ...config,
      data: config.data
        ? {
            ...config.data,
            viewport: config.data.viewport
              ? { ...config.data.viewport }
              : undefined,
          }
        : undefined,
    };
  }

  /**
   * Safe structural comparison supporting optional/undefined values.
   */
  private isEqual(a: Config | null, b: Config): boolean {
    if (!a) return false;

    const dataA = a.data;
    const dataB = b.data;

    const vpA = dataA?.viewport;
    const vpB = dataB?.viewport;

    return (
      a.pageId === b.pageId &&
      a.elementId === b.elementId &&
      dataA?.strategyId === dataB?.strategyId &&
      dataA?.symbol === dataB?.symbol &&
      dataA?.timeframe === dataB?.timeframe &&
      dataA?.linkId === dataB?.linkId &&
      vpA?.fromTs === vpB?.fromTs &&
      vpA?.toTs === vpB?.toTs &&
      vpA?.fromPrice === vpB?.fromPrice &&
      vpA?.toPrice === vpB?.toPrice
    );
  }
}