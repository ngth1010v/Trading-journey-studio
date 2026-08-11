import { fetchAllPages, savePageApi, deletePageApi } from "./pageApi";

export interface PageElement {
  id: number;
  parentId: number;
  type: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  data: any;
}

export interface Page {
  id?: number;
  name: string;
  data: PageElement[];
}

export const DEFAULT_PAGE: Page = {
  name: "Default",
  data: [
    {
      id: 0,
      parentId: -1,
      type: "container.FixedContainer",
      position: { x: 0, y: 0 },
      size: { w: 1, h: 1 },
      data: {
        rows: 10,
        columns: 20,
        gap: "5px",
        padding: "5px",
      },
    },
  ],
};

const REFRESH_DURATION = 500; // ms

// ============================================================================
// GLOBAL STATE & LOOP
// ============================================================================

interface MainTrigger {
  triggerPageDataChange: () => void;
}

let isPageInitialized = false;
let globalRefreshIntervalId: ReturnType<typeof setInterval> | null = null;
let pagesCache: Page[] = [];

// Cache tracking variables for change detection
let previousPagesJson = "";

const pageDataCallbackMap = new Map<string, MainTrigger>();

function notifyGlobalChange(): void {
  for (const { triggerPageDataChange } of pageDataCallbackMap.values()) {
    triggerPageDataChange();
  }
}

async function executeGlobalRefresh(): Promise<void> {
  try {
    const freshPages = await fetchAllPages();
    const freshJson = JSON.stringify(freshPages);

    const hasDataChanged = freshJson !== previousPagesJson;

    if (hasDataChanged) {
      // Immediately set to cache
      pagesCache = freshPages;
      previousPagesJson = freshJson;

      // Trigger on change
      notifyGlobalChange();
    }
  } catch (err) {
    console.error("Global page refresh failed:", err);
  }
}

export function initPage(): void {
  if (isPageInitialized) {
    return;
  }
  isPageInitialized = true;

  // Run initial fetch tick
  executeGlobalRefresh();

  // Start background refresh loop
  globalRefreshIntervalId = setInterval(executeGlobalRefresh, REFRESH_DURATION);
}

export function destroyPage(): void {
  if (!isPageInitialized) {
    return;
  }

  if (globalRefreshIntervalId !== null) {
    clearInterval(globalRefreshIntervalId);
    globalRefreshIntervalId = null;
  }

  pageDataCallbackMap.clear();
  pagesCache = [];
  previousPagesJson = "";
  isPageInitialized = false;
}

// ============================================================================
// PAGEDATA CLASS
// ============================================================================

export default class PageData {
  public id: string | null = null;

  private onPageDataChangeListeners = new Map<string, () => void>();

  public init(): void {
    if (this.id !== null) {
      return; // Prevent duplicate initialization
    }

    this.id = `page_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

    // Register main trigger into global map
    pageDataCallbackMap.set(this.id, {
      triggerPageDataChange: () => this.notifyDataChange(),
    });
  }

  public getAll(): Page[] {
    return pagesCache;
  }

  public get(id: number): Page {
    const page = pagesCache.find((p) => p.id === id);
    if (!page) {
      throw new Error(`Page with id ${id} not found`);
    }
    return page;
  }

  public async set(page: Page): Promise<void> {
    // Check if given page has an id
    if (page.id === undefined || page.id === null) {
      // No id: just save directly to server
      await savePageApi(page);
      return;
    }

    // Has id: check if page has changed against cache
    const cachedPage = pagesCache.find((p) => p.id === page.id);
    const isChanged = !cachedPage || JSON.stringify(cachedPage) !== JSON.stringify(page);

    if (!isChanged) {
      // Page hasn't changed: do nothing
      return;
    }

    // Immediately update local cache
    const existingIndex = pagesCache.findIndex((p) => p.id === page.id);
    if (existingIndex !== -1) {
      pagesCache[existingIndex] = page;
    } else {
      pagesCache.push(page);
    }
    previousPagesJson = JSON.stringify(pagesCache);

    // Trigger change callback on all instances
    notifyGlobalChange();

    // Send updated page to server
    await savePageApi(page);
  }

  public async remove(id: number): Promise<void> {
    // Send directly to server; global refresh loop handles cache & notification updates
    await deletePageApi(id);
  }

  public addOnPageDataChange(id: string, cb: () => void): void {
    this.onPageDataChangeListeners.set(id, cb);
  }

  public removeOnPageDataChange(id: string): void {
    if (!this.onPageDataChangeListeners.has(id)) {
      console.warn(`[PageData] Listener ID '${id}' not found in onPageDataChange listeners.`);
      return;
    }
    this.onPageDataChangeListeners.delete(id);
  }

  private notifyDataChange(): void {
    for (const listener of this.onPageDataChangeListeners.values()) {
      try {
        listener();
      } catch (err) {
        console.error("Error executing PageData listener callback:", err);
      }
    }
  }

  public destroy(): void {
    if (this.id !== null) {
      pageDataCallbackMap.delete(this.id);
      this.id = null;
    }
    this.onPageDataChangeListeners.clear();
  }
}