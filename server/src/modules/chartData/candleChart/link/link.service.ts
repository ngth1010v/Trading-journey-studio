import { Link, LinkState, CachedLinkEntry } from "./link.model.js";
import { LinkRepository } from "./link.repository.js";

type ElementChecker = (pageId: number, elementId: number) => boolean | null;

export class LinkService {
  private repository: LinkRepository;
  private memoryCache: Map<number, CachedLinkEntry> = new Map();
  private isElementExistCb: ElementChecker | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly REFRESH_DURATION = 1000;

  constructor() {
    this.repository = new LinkRepository();
  }

  public init(isElementExist: ElementChecker): void {
    this.repository.init();
    this.isElementExistCb = isElementExist;

    // Load initial data into RAM cache
    const records = this.repository.getAll();
    this.memoryCache.clear();

    for (const record of records) {
      const link: Link = {
        id: record.id,
        name: record.name,
        color: JSON.parse(record.color),
        children: JSON.parse(record.children),
      };

      const state: LinkState | undefined = record.state ? JSON.parse(record.state) : undefined;

      this.memoryCache.set(record.id, {
        link,
        state,
        isDirtyLink: false,
        isDirtyState: false,
      });
    }

    // Start 1000ms background periodic scan and persistence job
    this.timer = setInterval(() => this.backgroundRefresh(), this.REFRESH_DURATION);
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
    // Filter invalid children immediately using element checker callback
    const validChildren = linkData.children.filter((child) => {
      if (!this.isElementExistCb) return true;
      return this.isElementExistCb(child.pageId, child.elementId) !== false;
    });

    const sanitizedLink: Link = {
      ...linkData,
      children: validChildren,
    };

    if (sanitizedLink.id !== undefined && this.memoryCache.has(sanitizedLink.id)) {
      const existing = this.memoryCache.get(sanitizedLink.id)!;
      existing.link = sanitizedLink;
      existing.isDirtyLink = true;
      return sanitizedLink.id;
    } else {
      // Create new link immediately in disk to acquire new primary key ID
      const newId = this.repository.insert(sanitizedLink);
      sanitizedLink.id = newId;

      this.memoryCache.set(newId, {
        link: sanitizedLink,
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

  private backgroundRefresh(): void {
    if (!this.isElementExistCb) return;

    for (const entry of this.memoryCache.values()) {
      const initialLength = entry.link.children.length;

      // Scan and eliminate missing elements
      entry.link.children = entry.link.children.filter((child) => {
        return this.isElementExistCb!(child.pageId, child.elementId) !== false;
      });

      // Mark link as dirty if children were pruned
      if (entry.link.children.length !== initialLength) {
        entry.isDirtyLink = true;
      }
    }

    this.flushToDisk();
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