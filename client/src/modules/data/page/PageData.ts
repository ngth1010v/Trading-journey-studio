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

export const DEFAULT_PAGE = {
  name: "Default",
  data: [
    {
      id: 0,
      parentId: -1,
      type: "container.FixedContainer",
      position: {x:0,y:0},
      size: {w:1,h:1},
      data: {
        rows: 10,
        columns: 20,
        gap: "5px",
        padding: "5px"
      }
    }
  ]

}

const REFRESH_DURATION = 500; // ms

export default class PageData {
  private cache: Page[] = [];
  private listeners: Map<string, () => void> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isFetching: boolean = false;

  public init(): void {
    if (this.intervalId !== null) {
      return;
    }

    // Trigger immediate fetch on init
    this.refresh();

    this.intervalId = setInterval(() => {
      this.refresh();
    }, REFRESH_DURATION);
  }

  public destroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public getAll(): Page[] {
    return this.cache;
  }

  public get(id: number): Page {
    const page = this.cache.find((p) => p.id === id);
    if (!page) {
      throw new Error(`Page with id ${id} not found`);
    }
    return page;
  }

  public async set(page: Page): Promise<Page> {
    return savePageApi(page);
  }

  public async remove(id: number): Promise<void> {
    return deletePageApi(id);
  }

  public addOnPageDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
  }

  public removeOnPageDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private async refresh(): Promise<void> {
    if (this.isFetching) {
      return;
    }

    this.isFetching = true;

    try {
      const remotePages = await fetchAllPages();

      if (JSON.stringify(this.cache) !== JSON.stringify(remotePages)) {
        this.cache = remotePages;
        this.notifyListeners();
        console.log(remotePages)
      }
    } catch (error) {
      console.error("Failed to refresh PageData:", error);
    } finally {
      this.isFetching = false;
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error executing PageData listener callback:", err);
      }
    });
  }
}