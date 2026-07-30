import { fetchEvents, saveEvent } from "./eventApi";

export type MouseInput =
  | "MouseLeftDown"
  | "MouseMiddleDown"
  | "MouseRightDown"
  | "MouseBackDown"
  | "MouseForwardDown"
  | "MouseLeftUp"
  | "MouseMiddleUp"
  | "MouseRightUp"
  | "MouseBackUp"
  | "MouseForwardUp"
  | "MouseMove"
  | "Wheel"
  | "MouseEnter"
  | "MouseLeave";

export type KeyType = "up" | "down" | "pressed" | "unpressed";

export interface KeyInput {
  code: string;
  type: KeyType;
}

export interface InputEvent {
  mouse?: MouseInput[];
  code?: KeyInput[];
  modifiers?: {
    ctrl?: KeyType;
    shift?: KeyType;
    alt?: KeyType;
    meta?: KeyType;
  };
}

export interface Event {
  id?: number;
  chartType: string;
  event: string;
  input: InputEvent;
}

const REFRESH_DURATION = 1000;

export default class EventData {
  private isInitialized = false;
  private intervalId: number | null = null;
  private cache: Map<number, Event> = new Map();
  private listeners: Map<string, () => void> = new Map();
  private lastCacheJson: string = "";
  private defaultQueue: Event[] = [];

  /**
   * Starts the polling/refresh loop.
   * If called a second time without destroy() being called first, it does nothing.
   */
  public init(): void {
    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;

    // Initial fetch immediately
    this.refreshCache();

    // Start periodic loop
    this.intervalId = window.setInterval(() => {
      this.refreshCache();
    }, REFRESH_DURATION);

    console.log("INIT");
  }

  /**
   * Cleans up all event listeners, clears default queue, and stops the refresh loop.
   * @throws Error if init() has not been called yet.
   */
  public destroy(): void {
    if (!this.isInitialized) {
      throw new Error("EventData has not been initialized yet.");
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.listeners.clear();
    this.cache.clear();
    this.defaultQueue = [];
    this.lastCacheJson = "";
    this.isInitialized = false;

    console.log("DESTROY");
  }

  /**
   * Retrieves an event from local cache by ID.
   * @throws Error if event ID is not found in local cache.
   */
  public get(id: number): Event {
    const event = this.cache.get(id);
    if (!event) {
      throw new Error(`Event with id ${id} not found in local cache.`);
    }
    return event;
  }

  /**
   * Returns all events from local cache that match the specified chartType.
   */
  public getAllChart(chartType: string): Event[] {
    const results: Event[] = [];
    for (const event of this.cache.values()) {
      if (event.chartType === chartType) {
        results.push(event);
      }
    }
    return results;
  }

  /**
   * Saves event to server only.
   * Local cache and listeners update asynchronously on the next refresh loop tick.
   */
  public async set(event: Event): Promise<void> {
    try {
      await saveEvent(event);
    } catch (error) {
      console.error("Failed to save event to server:", error);
    }
  }

  /**
   * Adds default events to a queue to be processed after the next refresh loop cycle.
   * @throws Error if EventData has not been initialized yet.
   */
  public setDefault(events: Event[]): void {
    if (!this.isInitialized) {
      throw new Error("EventData has not been initialized yet.");
    }

    this.defaultQueue.push(...events);
  }

  /**
   * Registers a change listener callback.
   * If a callback with the same ID already exists, it is overwritten.
   */
  public addOnEventDataChange(id: string, cb: () => void): void {
    this.listeners.set(id, cb);
  }

  /**
   * Removes a change listener callback by ID.
   */
  public removeOnEventDataChange(id: string): void {
    this.listeners.delete(id);
  }

  /**
   * Synchronizes data with the server and triggers listeners if deep changes are detected.
   * Processes the defaultQueue after updating the local cache.
   */
  private async refreshCache(): Promise<void> {
    try {
      const serverEvents = await fetchEvents();

      // Build updated cache map
      const newCache = new Map<number, Event>();
      for (const event of serverEvents) {
        if (event.id !== undefined) {
          newCache.set(event.id, event);
        }
      }

      // Perform deep comparison via JSON string check
      const currentCacheJson = JSON.stringify(serverEvents);
      const isChanged = currentCacheJson !== this.lastCacheJson;

      if (isChanged) {
        this.cache = newCache;
        this.lastCacheJson = currentCacheJson;
        this.notifyListeners();
      }

      // Process default event queue if present
      await this.processDefaultQueue();
    } catch (error) {
      console.error("Failed to refresh EventData from server:", error);
    }
  }

  /**
   * Iterates through defaultQueue, checking against current cache for matching `event.event`.
   * Sends new default events to the server using `set()` and then clears the queue.
   */
  private async processDefaultQueue(): Promise<void> {
    if (this.defaultQueue.length === 0) {
      return;
    }

    const currentQueue = [...this.defaultQueue];
    this.defaultQueue = []; // Clear queue immediately to avoid re-processing

    for (const queuedEvent of currentQueue) {
      const existsInCache = Array.from(this.cache.values()).some(
        (cachedEvent) => cachedEvent.event === queuedEvent.event
      );

      if (!existsInCache) {
        await this.set(queuedEvent);
      }
    }
  }

  /**
   * Triggers all registered change callbacks.
   */
  private notifyListeners(): void {
    for (const cb of this.listeners.values()) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing EventData change listener:", err);
      }
    }
  }
}