import { registerPageApi, unregisterPageApi, flushServerApi } from "./pageApi";

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

// ============================================================================
// GLOBAL WEBSOCKET & STATE MANAGEMENT
// ============================================================================

interface MainTrigger {
  triggerPageDataChange: () => void;
}

let isPageInitialized = false;
let activeRegistryKey: string | null = null;
let socket: WebSocket | null = null;
let pagesCache: Page[] = [];

const pageDataCallbackMap = new Map<string, MainTrigger>();

function notifyGlobalChange(): void {
  for (const { triggerPageDataChange } of pageDataCallbackMap.values()) {
    triggerPageDataChange();
  }
}

export async function initPage(): Promise<void> {
  if (isPageInitialized) return;

  try {
    const { key } = await registerPageApi();
    activeRegistryKey = key;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/pages?key=${encodeURIComponent(key)}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      isPageInitialized = true;
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "INIT" || message.type === "PAGES_UPDATED") {
          pagesCache = message.payload;
          notifyGlobalChange();
        }
      } catch (err) {
        console.error("[PageData] Failed to parse WebSocket message:", err);
      }
    };

    socket.onerror = (err) => {
      console.error("[PageData] WebSocket error:", err);
    };

    socket.onclose = () => {
      isPageInitialized = false;
    };
  } catch (err) {
    console.error("[PageData] Failed to initialize page module:", err);
  }
}

export async function destroyPage(): Promise<void> {
  if (socket) {
    socket.close();
    socket = null;
  }

  if (activeRegistryKey) {
    try {
      await unregisterPageApi(activeRegistryKey);
    } catch (err) {
      console.error("[PageData] Error during page unregistration:", err);
    }
    activeRegistryKey = null;
  }

  pagesCache = [];
  isPageInitialized = false;
}

// ============================================================================
// PAGEDATA CLASS
// ============================================================================

export default class PageData {
  public id: string | null = null;
  private onPageDataChangeListeners = new Map<string, () => void>();

  public init(): void {
    if (this.id !== null) return;

    this.id = `page_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

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

  public set(page: Page): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error("[PageData] Cannot set page: WebSocket is not connected.");
      return;
    }
    socket.send(JSON.stringify({ type: "SET_PAGE", payload: page }));
  }

  public remove(id: number): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error("[PageData] Cannot remove page: WebSocket is not connected.");
      return;
    }
    socket.send(JSON.stringify({ type: "REMOVE_PAGE", payload: { id } }));
  }

  public async flushServer(): Promise<void> {
    await flushServerApi();
  }

  public addOnPageDataChange(id: string, cb: () => void): void {
    this.onPageDataChangeListeners.set(id, cb);
    if (pagesCache.length > 0) {
      try {
        cb();
      } catch (err) {
        console.error("[PageData] Error executing immediate callback:", err);
      }
    }
  }

  public removeOnPageDataChange(id: string): void {
    if (!this.onPageDataChangeListeners.has(id)) {
      console.warn(`[PageData] Listener ID '${id}' not found.`);
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