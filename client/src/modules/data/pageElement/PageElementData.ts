import { fetchPageElements, savePageElement } from "./pageElementApi.js";
import PageElementConfigData from "./config/PageElementConfigData.js";

export interface PageElement {
  id?: number;
  parentId: number | null;
  entry: boolean;
  entryName: string;
  type: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
}

export const REFRESH_DURATION = 500; // 500ms

// ============================================================================
// GLOBAL STATE & LOOP
// ============================================================================

interface MainTrigger {
  triggerDataChange: () => void;
}

let isPageElementInitialized = false;
let globalRefreshIntervalId: ReturnType<typeof setInterval> | null = null;
let pageElementsCacheMap: Map<number, PageElement> = new Map();

// Cache tracking variable for change detection
let previousPageElementsJson = "";

const pageElementDataCallbackMap = new Map<string, MainTrigger>();

async function executeGlobalRefresh(): Promise<void> {
  try {
    const freshElements = await fetchPageElements();
    const freshJson = JSON.stringify(freshElements);

    const hasDataChanged = freshJson !== previousPageElementsJson;

    // Update shared global cache map
    const newMap = new Map<number, PageElement>();
    for (const item of freshElements) {
      if (item.id !== undefined && item.id !== null) {
        newMap.set(item.id, { ...item });
      }
    }

    pageElementsCacheMap = newMap;
    previousPageElementsJson = freshJson;

    // Notify registered PageElementData instances
    if (hasDataChanged) {
      for (const { triggerDataChange } of pageElementDataCallbackMap.values()) {
        triggerDataChange();
      }
    }
  } catch (err) {
    console.error("Global page elements refresh failed:", err);
  }
}

export function initPageElement(): void {
  if (isPageElementInitialized) {
    return;
  }
  isPageElementInitialized = true;

  // Run initial fetch tick
  executeGlobalRefresh();

  // Start background refresh loop
  globalRefreshIntervalId = setInterval(executeGlobalRefresh, REFRESH_DURATION);
}

export function destroyPageElement(): void {
  if (!isPageElementInitialized) {
    return;
  }

  if (globalRefreshIntervalId !== null) {
    clearInterval(globalRefreshIntervalId);
    globalRefreshIntervalId = null;
  }

  pageElementsCacheMap.clear();
  previousPageElementsJson = "";
  isPageElementInitialized = false;
}

// ============================================================================
// PAGEELEMENTDATA CLASS
// ============================================================================

export default class PageElementData {
  public config: PageElementConfigData = new PageElementConfigData();
  public id: string | null = null;

  private onPageElementDataChangeListeners = new Map<string, () => void>();

  public init(): void {
    if (this.id !== null) {
      return; // Prevent duplicate initialization
    }

    this.id = `page_element_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

    // Register main trigger into global map
    pageElementDataCallbackMap.set(this.id, {
      triggerDataChange: () => this.notifyDataChange(),
    });
  }

  public get(id: number): PageElement | null {
    return pageElementsCacheMap.get(id) ?? null;
  }

  public getAll(): PageElement[] {
    return Array.from(pageElementsCacheMap.values());
  }

  public getDefault(): PageElement {
    const existingNames = new Set(
      this.getAll().map((element) => element.entryName)
    );

    let number = 1;
    let entryName = `Default ${number}`;

    while (existingNames.has(entryName)) {
      number++;
      entryName = `Default ${number}`;
    }

    return {
      id: undefined,
      parentId: null,
      entry: true,
      entryName,
      type: "container.FixedContainer",
      position: { x: 0, y: 0 },
      size: { w: 1, h: 1 },
    };
  }

  public set(pageElement: PageElement): void {
    // If id is provided -> save to local cache + send to server
    if (pageElement.id !== undefined && pageElement.id !== null) {
      pageElementsCacheMap.set(pageElement.id, { ...pageElement });
      this.notifyDataChange();
    }

    // Send update or new element request to server
    savePageElement(pageElement).catch((err) => {
      console.error("[PageElementData] Failed to save page element to server:", err);
    });
  }

  public addOnPageElementDataChange(id: string, cb: () => void): void {
    this.onPageElementDataChangeListeners.set(id, cb);

    if (pageElementsCacheMap.size > 0) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing onPageElementDataChange callback:", err);
      }
    }
  }

  public removeOnPageElementDataChange(id: string): void {
    if (!this.onPageElementDataChangeListeners.has(id)) {
      console.warn(`[PageElementData] Listener ID '${id}' not found in onPageElementDataChange listeners.`);
      return;
    }
    this.onPageElementDataChangeListeners.delete(id);
  }

  private notifyDataChange(): void {
    for (const listener of this.onPageElementDataChangeListeners.values()) {
      try {
        listener();
      } catch (err) {
        console.error("Error executing onPageElementDataChange callback:", err);
      }
    }
  }

  public destroy(): void {
    if (this.id !== null) {
      pageElementDataCallbackMap.delete(this.id);
      this.id = null;
    }
    // Note: per specification, destroy does not clear onChange callbacks
  }
}