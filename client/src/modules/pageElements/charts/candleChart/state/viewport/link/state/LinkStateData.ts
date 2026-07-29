import { fetchLinkState, saveLinkState } from "./linkStateApi";

export interface LinkState {
  lastEditor: {
    pageId: number;
    elementId: number;
    timestamp: number;
    release: boolean;
  };
  symbol: string;
  view: {
    fromTs: number;
    toTs: number;
    fromPrice: number;
    toPrice: number;
  };
}

const REFRESH_DURATION = 100; // ms

export default class LinkStateData {
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentLinkId: number | null = null;
  private cache: LinkState | null = null;
  private listeners: Map<string, () => void> = new Map();

  public init(): void {
    if (this.timer !== null) return;

    this.timer = setInterval(() => {
      void this.refresh();
    }, REFRESH_DURATION);
  }

  public destroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cache = null;
    this.currentLinkId = null;
    this.listeners.clear();
  }

  public setSource(linkId: number | null): void {
    if (this.currentLinkId === linkId) return;

    this.currentLinkId = linkId;
    this.cache = null; // Reset local cache on link source change
  }

  public get(): LinkState | null {
    if (this.currentLinkId === null) {
      throw new Error("LinkStateData: source linkId has not been set.");
    }
    if (this.cache === null) {
      throw new Error(
        `LinkStateData: state not found for linkId ${this.currentLinkId}.`,
      );
    }
    return JSON.parse(JSON.stringify(this.cache));
  }

  public async set(state: LinkState): Promise<void> {
    if (this.currentLinkId === null) {
      throw new Error(
        "LinkStateData: cannot save state before setting a source linkId.",
      );
    }
    await saveLinkState(this.currentLinkId, state);
  }

  public addOnStateDataDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
  }

  public removeOnStateDataDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private async refresh(): Promise<void> {
    if (this.currentLinkId === null) return;

    try {
      const serverState = await fetchLinkState(this.currentLinkId);

      if (JSON.stringify(this.cache) !== JSON.stringify(serverState)) {
        this.cache = serverState;
        this.notifyListeners();
      }
    } catch (error) {
      // Handles missing state (404) or network issues gracefully without stopping the loop
      if (this.cache !== null) {
        this.cache = null;
        this.notifyListeners();
      }
    }
  }

  private notifyListeners(): void {
    for (const callback of this.listeners.values()) {
      try {
        callback();
      } catch (err) {
        console.error(
          "LinkStateData: error thrown inside listener callback:",
          err,
        );
      }
    }
  }
}