import { useRef, useCallback } from "react";
import { tradeApis } from "./api/tradeApis";
import type { Trade, TradeTag, TradeTemplate } from "./type";

export type TradeData = {
  init: () => void;
  destroy: () => void;

  // Trade
  setSource: (strategy: string, symbol: string) => void;
  setView: (fromTs: number, toTs: number) => void;
  set: (trade: Trade) => void;
  getAll: () => Trade[];
  get: (id: number) => Trade | undefined;
  remove: (id: number) => void;
  addOnTradeDataChange: (id: string, cb: () => void) => void;
  removeOnTradeDataChange: (id: string) => void;

  // Tag
  getTags: () => TradeTag[];
  setTag: (tag: TradeTag) => void;
  removeTag: (tagId: number) => Promise<void>;
  addOnTagChange: (id: string, cb: () => void) => void;
  removeOnTagChange: (id: string) => void;

  // Template
  getTemplates: () => Promise<TradeTemplate[]>;
  setTemplate: (template: TradeTemplate) => void;
  removeTemplate: (name: string) => Promise<void>;
};

export default function useTradeData(): TradeData {
  // --- Source & View Parameters ---
  const strategyRef = useRef<string | undefined>(undefined);
  const symbolRef = useRef<string | undefined>(undefined);
  const fromTsRef = useRef<number | undefined>(undefined);
  const toTsRef = useRef<number | undefined>(undefined);

  // --- Core State Caching ---
  const tradesRef = useRef<Trade[]>([]);
  const tagsRef = useRef<TradeTag[]>([]);
  const templatesRef = useRef<TradeTemplate[]>([]);

  // --- Synchronization Controls ---
  const isLoadingRef = useRef<boolean>(false);
  const lastUpdateTsRef = useRef<number | undefined>(undefined);
  const intervalIdRef = useRef<any | null>(null);

  // --- Callback Event Registries ---
  const tradeListenersRef = useRef<Map<string, () => void>>(new Map());
  const tagListenersRef = useRef<Map<string, () => void>>(new Map());

  // --- Helper Notification Dispatchers ---
  const notifyTradeChanges = useCallback(() => {
    tradeListenersRef.current.forEach((cb) => {
      try { cb(); } catch (e) { console.error("Trade listener error:", e); }
    });
  }, []);

  const notifyTagChanges = useCallback(() => {
    tagListenersRef.current.forEach((cb) => {
      try { cb(); } catch (e) { console.error("Tag listener error:", e); }
    });
  }, []);

  // --- Background Background Polling Synchronization Step ---
  const pollSyncStep = useCallback(async () => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    const fromTs = fromTsRef.current;
    const toTs = toTsRef.current;

    // Boundary: Skip synchronization cycles if source parameters are incomplete or locked by an active full refresh
    if (!strategy || !symbol || fromTs === undefined || toTs === undefined || isLoadingRef.current) {
      return;
    }

    const currentLastUpdate = lastUpdateTsRef.current;
    const executionTimestamp = Date.now();

    try {
      // Execute differential partial synchronization across targets concurrently
      const [incomingTrades, incomingTags] = await Promise.all([
        tradeApis.getTrades(strategy, symbol, fromTs, toTs, currentLastUpdate),
        tradeApis.getTags(strategy, symbol, currentLastUpdate),
      ]);

      let tradeStateChanged = false;
      let tagStateChanged = false;

      // Map incoming batch optimizations into local cache
      if (incomingTrades && incomingTrades.length > 0) {
        const localTradesMap = new Map(tradesRef.current.map((t) => [t.id, t]));
        incomingTrades.forEach((incoming) => {
          if (incoming.id !== undefined) {
            localTradesMap.set(incoming.id, incoming);
            tradeStateChanged = true;
          }
        });
        if (tradeStateChanged) {
          tradesRef.current = Array.from(localTradesMap.values());
        }
      }

      if (incomingTags && incomingTags.length > 0) {
        const localTagsMap = new Map(tagsRef.current.map((t) => [t.id, t]));
        incomingTags.forEach((incoming) => {
          if (incoming.id !== undefined) {
            localTagsMap.set(incoming.id, incoming);
            tagStateChanged = true;
          }
        });
        if (tagStateChanged) {
          tagsRef.current = Array.from(localTagsMap.values());
        }
      }

      // Track high watermark timestamp relative to updates verified on client side
      lastUpdateTsRef.current = executionTimestamp;

      if (tradeStateChanged) notifyTradeChanges();
      if (tagStateChanged) notifyTagChanges();
    } catch (error) {
      console.error("Error during partial update background processing:", error);
    }
  }, [notifyTradeChanges, notifyTagChanges]);

  // --- Reset/Trigger Global Data Window Fetch ---
  const forceFullRefresh = useCallback(async () => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    const fromTs = fromTsRef.current;
    const toTs = toTsRef.current;

    if (!strategy || !symbol || fromTs === undefined || toTs === undefined) {
      return;
    }

    isLoadingRef.current = true;
    const executionTimestamp = Date.now();

    try {
      const [fullTrades, fullTags] = await Promise.all([
        tradeApis.getTrades(strategy, symbol, fromTs, toTs, undefined),
        tradeApis.getTags(strategy, symbol, undefined),
      ]);

      tradesRef.current = fullTrades || [];
      tagsRef.current = fullTags || [];
      lastUpdateTsRef.current = executionTimestamp;

      notifyTradeChanges();
      notifyTagChanges();
    } catch (error) {
      console.error("Critical failure resetting cache tracking window:", error);
    } finally {
      isLoadingRef.current = false;
    }
  }, [notifyTradeChanges, notifyTagChanges]);

  // --- Reactive Hook API Interface Implementations ---

  const init = useCallback(() => {
    if (intervalIdRef.current) return;
    intervalIdRef.current = setInterval(pollSyncStep, 500);
  }, [pollSyncStep]);

  const destroy = useCallback(() => {
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  }, []);

  const setSource = useCallback((strategy: string, symbol: string) => {
    if (strategyRef.current === strategy && symbolRef.current === symbol) return;
    strategyRef.current = strategy;
    symbolRef.current = symbol;
    forceFullRefresh();
  }, [forceFullRefresh]);

  const setView = useCallback((fromTs: number, toTs: number) => {
    if (fromTsRef.current === fromTs && toTsRef.current === toTs) return;
    fromTsRef.current = fromTs;
    toTsRef.current = toTs;
    forceFullRefresh();
  }, [forceFullRefresh]);

  const set = useCallback(async (trade: Trade) => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    if (!strategy || !symbol) return;

    try {
      await tradeApis.saveTrade(strategy, symbol, trade);
      // Local optimistic upsert mutation
      if (trade.id !== undefined) {
        tradesRef.current = tradesRef.current.map((t) => (t.id === trade.id ? trade : t));
      } else {
        tradesRef.current = [...tradesRef.current, trade];
      }
      notifyTradeChanges();
    } catch (e) {
      console.error("Failed to persist mutation to target trade:", e);
    }
  }, [notifyTradeChanges]);

  const getAll = useCallback(() => tradesRef.current, []);

  const get = useCallback((id: number) => {
    return tradesRef.current.find((t) => t.id === id);
  }, []);

  const remove = useCallback(async (id: number) => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    if (!strategy || !symbol) return;

    try {
      await tradeApis.deleteTrade(strategy, symbol, id);
      tradesRef.current = tradesRef.current.filter((t) => t.id !== id);
      notifyTradeChanges();
    } catch (e) {
      console.error(`Failed to completely drop targeted element entity reference ${id}:`, e);
    }
  }, [notifyTradeChanges]);

  const addOnTradeDataChange = useCallback((id: string, cb: () => void) => {
    tradeListenersRef.current.set(id, cb);
  }, []);

  const removeOnTradeDataChange = useCallback((id: string) => {
    tradeListenersRef.current.delete(id);
  }, []);

  const getTags = useCallback(() => tagsRef.current, []);

  const setTag = useCallback(async (tag: TradeTag) => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    if (!strategy || !symbol) return;

    try {
      await tradeApis.saveTag(strategy, symbol, tag);
      if (tag.id !== undefined) {
        tagsRef.current = tagsRef.current.map((t) => (t.id === tag.id ? tag : t));
      } else {
        tagsRef.current = [...tagsRef.current, tag];
      }
      notifyTagChanges();
    } catch (e) {
      console.error("Failed to synchronize save mutation event tracking down on local tag state:", e);
    }
  }, [notifyTagChanges]);

  const removeTag = useCallback(async (tagId: number) => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    if (!strategy || !symbol) return;

    await tradeApis.deleteTag(strategy, symbol, tagId);
    tagsRef.current = tagsRef.current.filter((t) => t.id !== tagId);
    notifyTagChanges();
  }, [notifyTagChanges]);

  const addOnTagChange = useCallback((id: string, cb: () => void) => {
    tagListenersRef.current.set(id, cb);
  }, []);

  const removeOnTagChange = useCallback((id: string) => {
    tagListenersRef.current.delete(id);
  }, []);

  const getTemplates = useCallback((): Promise<TradeTemplate[]> => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    
    if (!strategy || !symbol) {
      return Promise.resolve(templatesRef.current);
    }

    return new Promise<TradeTemplate[]>((resolve) => {
      let resolved = false;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(templatesRef.current.length > 0 ? templatesRef.current : []);
        }
      }, 500);

      tradeApis.getTemplates(strategy, symbol)
        .then((fetchedTemplates) => {
          if (!resolved) {
            clearTimeout(timeoutId);
            resolved = true;
            templatesRef.current = fetchedTemplates || [];
            resolve(templatesRef.current);
          }
        })
        .catch((error) => {
          console.error("Failed executing remote fetch request updates mapping out template groups:", error);
          if (!resolved) {
            clearTimeout(timeoutId);
            resolved = true;
            resolve(templatesRef.current.length > 0 ? templatesRef.current : []);
          }
        });
    });
  }, []);

  const setTemplate = useCallback(async (template: TradeTemplate) => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    if (!strategy || !symbol) return;

    try {
      await tradeApis.saveTemplate(strategy, symbol, template);
      const exists = templatesRef.current.some((t) => t.name === template.name);
      if (exists) {
        templatesRef.current = templatesRef.current.map((t) => (t.name === template.name ? template : t));
      } else {
        templatesRef.current = [...templatesRef.current, template];
      }
    } catch (e) {
      console.error("Failed to explicitly persist new default mapping out configurations structural template properties:", e);
    }
  }, []);

  const removeTemplate = useCallback(async (name: string) => {
    const strategy = strategyRef.current;
    const symbol = symbolRef.current;
    if (!strategy || !symbol) return;

    await tradeApis.deleteTemplate(strategy, symbol, name);
    templatesRef.current = templatesRef.current.filter((t) => t.name !== name);
  }, []);

  return {
    init,
    destroy,
    setSource,
    setView,
    set,
    getAll,
    get,
    remove,
    addOnTradeDataChange,
    removeOnTradeDataChange,
    getTags,
    setTag,
    removeTag,
    addOnTagChange,
    removeOnTagChange,
    getTemplates,
    setTemplate,
    removeTemplate,
  };
}