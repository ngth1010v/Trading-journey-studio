import { Link, LinkState, CachedLinkEntry } from "./link.model.js";
import { LinkRepository } from "./link.repository.js";

export class LinkService {
  private repository: LinkRepository;
  private memoryCache: Map<number, CachedLinkEntry> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private readonly REFRESH_DURATION = 1000;

  constructor() {
    this.repository = new LinkRepository();
  }

  public init(): void {
    this.repository.init();

    // Load initial data into RAM cache
    const records = this.repository.getAll();
    this.memoryCache.clear();

    for (const record of records) {
      const link: Link = {
        id: record.id,
        name: record.name,
        color: JSON.parse(record.color),
      };

      const state: LinkState | undefined = record.state ? JSON.parse(record.state) : undefined;

      this.memoryCache.set(record.id, {
        link,
        state,
        isDirtyLink: false,
        isDirtyState: false,
      });
    }

    // Start 1000ms background persistence job
    this.timer = setInterval(() => this.flushToDisk(), this.REFRESH_DURATION);
  }

  public shutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Flush remaining dirty changes to disk on exit
    this.flushToDisk();
    this.repository.close();
  }

  public getAllLinks(): Link[] {
    return Array.from(this.memoryCache.values()).map((entry) => entry.link);
  }

  public saveLink(linkData: Link): number {
    if (linkData.id !== undefined && this.memoryCache.has(linkData.id)) {
      const existing = this.memoryCache.get(linkData.id)!;
      existing.link = linkData;
      existing.isDirtyLink = true;
      return linkData.id;
    } else {
      // Create new link immediately in disk to acquire new primary key ID
      const newId = this.repository.insert(linkData);
      linkData.id = newId;

      this.memoryCache.set(newId, {
        link: linkData,
        isDirtyLink: false, // Already inserted into DB
        isDirtyState: false,
      });

      return newId;
    }
  }

  public deleteLink(id: number): boolean {
    if (!this.memoryCache.has(id)) {
      return false;
    }
    this.memoryCache.delete(id);
    this.repository.delete(id);
    return true;
  }

  public getLinkState(id: number): LinkState | null {
    const entry = this.memoryCache.get(id);
    if (!entry || !entry.state) {
      return null;
    }
    return entry.state;
  }

  public updateLinkState(id: number, newState: LinkState): { success: boolean; reason?: string } {
    const entry = this.memoryCache.get(id);
    if (!entry) {
      return { success: false, reason: "Link not found" };
    }

    // Validate state full structural integrity
    if (!this.isValidLinkState(newState)) {
      return { success: false, reason: "Incomplete LinkState structure" };
    }

    const oldState = entry.state;

    if (oldState) {
      const isTimestampNewer = oldState.lastEditor.timestamp < newState.lastEditor.timestamp;
      const isSameEditor =
        oldState.lastEditor.pageId === newState.lastEditor.pageId &&
        oldState.lastEditor.elementId === newState.lastEditor.elementId;
      const isRelease = newState.lastEditor.release === true;

      const isValidUpdate = isTimestampNewer && (isSameEditor || isRelease);

      if (!isValidUpdate) {
        return { success: false, reason: "State update conditions failed" };
      }
    }

    entry.state = newState;
    entry.isDirtyState = true;
    return { success: true };
  }

  private isValidLinkState(state: any): state is LinkState {
    return (
      state &&
      typeof state === "object" &&
      state.lastEditor &&
      typeof state.lastEditor.pageId === "number" &&
      typeof state.lastEditor.elementId === "number" &&
      typeof state.lastEditor.timestamp === "number" &&
      typeof state.lastEditor.release === "boolean" &&
      typeof state.symbol === "string" &&
      state.view &&
      typeof state.view.fromTs === "number" &&
      typeof state.view.toTs === "number" &&
      typeof state.view.fromPrice === "number" &&
      typeof state.view.toPrice === "number"
    );
  }

  private flushToDisk(): void {
    for (const entry of this.memoryCache.values()) {
      if (entry.isDirtyLink || entry.isDirtyState) {
        if (entry.link.id !== undefined) {
          this.repository.update(entry.link.id, entry.link, entry.state);
          entry.isDirtyLink = false;
          entry.isDirtyState = false;
        }
      }
    }
  }
}

export const linkService = new LinkService();