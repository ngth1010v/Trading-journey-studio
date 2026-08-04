import type { RGB, RGBA } from "../../../../../../shared/type";
import { fetchAllLinks, removeLink, saveLink } from "./linkApi";
import LinkStateData from "./state/LinkStateData";

export interface Link {
  id?: number;
  name: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}


const REFRESH_DURATION = 500; // ms

export default class LinkData {
  public state: LinkStateData;

  private timer: ReturnType<typeof setInterval> | null = null;
  private cache: Link[] = [];
  private listeners: Map<string, () => void> = new Map();

  constructor() {
    this.state = new LinkStateData();
  }

  public init(): void {
    this.state.init();

    if (this.timer !== null) return;

    this.timer = setInterval(() => {
      void this.refresh();
    }, REFRESH_DURATION);
  }

  public destroy(): void {
    this.state.destroy();

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cache = [];
    this.listeners.clear();
  }

  public getAll(): Link[] {
    return JSON.parse(JSON.stringify(this.cache));
  }

  public get(id: number): Link {
    const found = this.cache.find((item) => item.id === id);
    if (!found) {
      throw new Error(`LinkData: Link with id ${id} not found.`);
    }
    return JSON.parse(JSON.stringify(found));
  }

  public async set(link: Link): Promise<void> {
    await saveLink(link);
  }

  public async remove(id: number): Promise<void> {
    await removeLink(id);
  }

  public addOnLinkDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
    if (this.cache.length){
      cb()
    }
  }

  public removeOnLinkDataChange(id: string): void {
    this.listeners.delete(id);
  }

  public getDefault(): Link {
    const existingNames = new Set(this.cache.map(link => link.name));

    let name = "Default";
    if (existingNames.has(name)) {
      let n = 2;
      while (existingNames.has(`Default ${n}`)) {
        n++;
      }
      name = `Default ${n}`;
    }

    return {
      name,
      color: {
        font: [255, 255, 255] as RGB,
        background: [100, 255, 100, 255] as RGBA,
        border: [100, 255, 100, 255] as RGBA,
      },
    };
  }

  private async refresh(): Promise<void> {
    try {
      const serverLinks = await fetchAllLinks();

      if (JSON.stringify(this.cache) !== JSON.stringify(serverLinks)) {
        this.cache = serverLinks;
        this.notifyListeners();
      }
    } catch (error) {
      console.error("LinkData: Error fetching links from server:", error);
    }
  }

  private notifyListeners(): void {
    for (const callback of this.listeners.values()) {
      try {
        callback();
      } catch (err) {
        console.error("LinkData: error thrown inside listener callback:", err);
      }
    }
  }
}