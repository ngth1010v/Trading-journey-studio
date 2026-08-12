import { fetchLinks, saveLink, deleteLink } from "./linkApi.js";
import LinkStateData from "./state/LinkStateData";
import type { RGB, RGBA } from "../../../../../../shared/type.js";

// IMPORTANT NOTE: `LinkMode` is only for local client state, there is not any link between Link data and LinkMode

export const REFRESH_DURATION = 500; // ms


export interface Link {
  id?: number;
  name: string;
  color: {
    background: RGBA;
    border: RGBA;
    font: RGB;
  };
}

export type LinkMode = "up" | "down"

export const  LINK_INPUT_LAYOUT = {
  name: "string",
  color: {
    background: "rgba",
    border: "rgba",
    font: "rgb",
  }
}

// ============================================================================
// GLOBAL STATE & REFRESH LOOP
// ============================================================================

interface LinkDataTrigger {
  triggerLinkDataChange: () => void;
}

let isLinkInitialized = false;
let globalRefreshIntervalId: ReturnType<typeof setInterval> | null = null;
let linksCacheMap: Map<number, Link> = new Map();
let previousLinksJson = "";

const linkDataCallbackMap = new Map<string, LinkDataTrigger>();

async function executeGlobalRefresh(): Promise<void> {
  try {
    const freshLinks = await fetchLinks();
    const freshJson = JSON.stringify(freshLinks);
    const hasDataChanged = freshJson !== previousLinksJson;

    const newMap = new Map<number, Link>();
    for (const item of freshLinks) {
      if (item.id !== undefined) {
        newMap.set(item.id, item);
      }
    }

    linksCacheMap = newMap;
    previousLinksJson = freshJson;

    if (hasDataChanged) {
      for (const { triggerLinkDataChange } of linkDataCallbackMap.values()) {
        triggerLinkDataChange();
      }
    }
  } catch (err) {
    console.error("Global link refresh failed:", err);
  }
}

export function initLinkData(): void {
  if (isLinkInitialized) {
    return;
  }
  isLinkInitialized = true;

  executeGlobalRefresh();
  globalRefreshIntervalId = setInterval(executeGlobalRefresh, REFRESH_DURATION);
}

export function destroyLinkData(): void {
  if (!isLinkInitialized) {
    return;
  }

  if (globalRefreshIntervalId !== null) {
    clearInterval(globalRefreshIntervalId);
    globalRefreshIntervalId = null;
  }

  linksCacheMap.clear();
  previousLinksJson = "";
  isLinkInitialized = false;
}

// ============================================================================
// LINKDATA CLASS
// ============================================================================

export default class LinkData {
  public id: string | null = null;
  public state = new LinkStateData();

  private onLinkDataChangeListeners = new Map<string, () => void>();
  private onLinkModeDataChangeListeners = new Map<string, () => void>();

  private linkMode: LinkMode = "down";

  public init(): void {
    if (this.id !== null) {
      return;
    }

    this.id = `link_data_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;

    linkDataCallbackMap.set(this.id, {
      triggerLinkDataChange: () => this.notifyDataChange(),
    });

    this.state.init();
  }

  public destroy(): void {
    if (this.id !== null) {
      linkDataCallbackMap.delete(this.id);
      this.id = null;
    }

    this.linkMode = "down"
    this.state.destroy();
  }

  public get(id: number): Link | null {
    return linksCacheMap.get(id) ?? null;
  }

  public getAll(): Link[] {
    return Array.from(linksCacheMap.values());
  }

  public getDefault(): Link {
      let number = 1;
      let name = `Default Link ${number}`;

      const existingLinks = this.getAll()
      const existingNames = new Set(
          existingLinks.map(link => link.name)
      );

      while (existingNames.has(name)) {
          number++;
          name = `Default Link ${number}`;
      }

      return {
          name,
          color: {
            background: [40,250,170,100] as RGBA,
            border: [40,250,170,255] as RGBA,
            font: [40,250,170] as RGB,
          }
      };
  }

  public async set(link: Link): Promise<boolean> {
    try {
      const result = await saveLink(link);
      const updatedLink = { ...link, id: result.id };

      linksCacheMap.set(result.id, updatedLink);
      this.notifyDataChange();
      return true;
    } catch (err) {
      console.error("Failed to set link:", err);
      return false;
    }
  }

  public async remove(id: number): Promise<boolean> {
    try {
      const success = await deleteLink(id);
      if (success) {
        linksCacheMap.delete(id);
        this.notifyDataChange();
      }
      return success;
    } catch (err) {
      console.error(`Failed to remove link ${id}:`, err);
      return false;
    }
  }

  public addOnLinkDataChange(id: string, cb: () => void): void {
    this.onLinkDataChangeListeners.set(id, cb);

    if (linksCacheMap.size > 0) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing onLinkDataChange callback:", err);
      }
    }
  }

  public removeOnLinkDataChange(id: string): void {
    if (!this.onLinkDataChangeListeners.has(id)) {
      console.warn(`[LinkData] Listener ID '${id}' not found.`);
      return;
    }
    this.onLinkDataChangeListeners.delete(id);
  }
  
  private notifyDataChange(): void {
    for (const listener of this.onLinkDataChangeListeners.values()) {
      try {
        listener();
      } catch (err) {
        console.error("Error executing onLinkDataChange callback:", err);
      }
    }
  }

  //=========================================================================
  // Link mode
  //=========================================================================
  public getMode() : LinkMode {
    return this.linkMode
  }

  public setMode(mode: LinkMode) {
    this.linkMode = mode
    this.notifyModeDataChange()
  }

  public addOnLinkModeDataChange(id: string, cb: () => void): void {
    this.onLinkModeDataChangeListeners.set(id, cb);

    if (linksCacheMap.size > 0) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing onLinkModeDataChange callback:", err);
      }
    }
  }

  public removeOnLinkModeDataChange(id: string): void {
    if (!this.onLinkModeDataChangeListeners.has(id)) {
      console.warn(`[LinkData] Listener ID '${id}' not found.`);
      return;
    }
    this.onLinkModeDataChangeListeners.delete(id);
  }
  
  private notifyModeDataChange(): void {
    for (const listener of this.onLinkModeDataChangeListeners.values()) {
      try {
        listener();
      } catch (err) {
        console.error("Error executing onLinkModeDataChange callback:", err);
      }
    }
  }


}