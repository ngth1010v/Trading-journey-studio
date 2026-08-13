import { PageRepository } from "./page.repository.js";
import { Page } from "./page.model.js";
import crypto from "crypto";

export class PageService {
  private pagesInMemory = new Map<number, Page>();
  private deletedPageIds = new Set<number>();
  private registeredKeys = new Set<string>();
  private nextTempId = 1;

  constructor(private repository: PageRepository) {}

  public init(): void {
    const pagesFromDb = this.repository.findAll();
    let maxId = 0;

    for (const page of pagesFromDb) {
      if (page.id !== undefined) {
        this.pagesInMemory.set(page.id, page);
        if (page.id > maxId) maxId = page.id;
      }
    }
    this.nextTempId = maxId + 1;
  }

  public registerKey(): string {
    const key = crypto.randomUUID();
    this.registeredKeys.add(key);
    return key;
  }

  public unregisterKey(key: string): boolean {
    return this.registeredKeys.delete(key);
  }

  public isValidKey(key: string): boolean {
    return this.registeredKeys.has(key);
  }

  public getAllPages(): Page[] {
    return Array.from(this.pagesInMemory.values());
  }

  public getPageById(id: number): Page {
    const page = this.pagesInMemory.get(id);
    if (!page) {
      throw new Error(`Page with ID ${id} not found`);
    }
    return page;
  }

  public isElementExist(pageId: number, elementId: number): boolean {
    const page = this.pagesInMemory.get(pageId);
    if (!page) return false;
    return page.data.some((element) => element.id === elementId);
  }

  public setPage(page: Page): Page {
    let targetId = page.id;

    if (targetId === undefined) {
      targetId = this.nextTempId++;
      page.id = targetId;
    }

    this.deletedPageIds.delete(targetId);
    this.pagesInMemory.set(targetId, page);
    return page;
  }

  public removePage(id: number): void {
    if (this.pagesInMemory.has(id)) {
      this.pagesInMemory.delete(id);
      this.deletedPageIds.add(id);
    }
  }

  public flush(): void {
    const activePages = Array.from(this.pagesInMemory.values());
    this.repository.flushToDatabase(activePages, this.deletedPageIds);
    this.deletedPageIds.clear();
  }
}