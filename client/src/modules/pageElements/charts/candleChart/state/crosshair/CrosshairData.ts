type Callback = () => void;

export type CrosshairPos = {
  pixel: { x: number; y: number } | null;
  world: { timestamp: number; price: number } | null;
  isInside: boolean;
};

export default class CrosshairData {
  private pixel: { x: number; y: number } | null = null;
  private world: { timestamp: number; price: number } | null = null;
  private isInside: boolean = false;

  private listeners: Map<string, Callback> = new Map();

  public init(): void {
    this.reset();
  }

  public destroy(): void {
    this.reset();
    this.listeners.clear();
  }

  /**
   * Resets crosshair state to hidden / empty.
   */
  public reset(): void {
    this.pixel = null;
    this.world = null;
    this.isInside = false;
    this.notifyDataChange();
  }

  /**
   * Updates crosshair position and world values, then triggers listeners if data changed.
   */
  public set(
    pixel: { x: number; y: number } | null,
    world: { timestamp: number; price: number } | null,
    isInside: boolean
  ): void {
    this.pixel = pixel ? { ...pixel } : null;
    this.world = world ? { ...world } : null;
    this.isInside = isInside;

    this.notifyDataChange();
  }

  // =========================================================================
  // GETTERS
  // =========================================================================

  public getPixel(): { x: number; y: number } | null {
    if (!this.isInside || !this.pixel) return null;
    return { ...this.pixel };
  }

  public get(): { timestamp: number; price: number } | null {
    if (!this.isInside || !this.world) return null;
    return { ...this.world };
  }

  public getIsInside(): boolean {
    return this.isInside;
  }

  // =========================================================================
  // EVENT LISTENERS
  // =========================================================================

  /**
   * Registers a callback for crosshair changes. Overwrites if duplicate ID.
   */
  public addCrosshairDataChange(id: string, cb: Callback): void {
    this.listeners.set(id, cb);
  }

  /**
   * Removes a callback listener by ID safely without throwing an error if absent.
   */
  public removeCrosshairDataChange(id: string): void {
    this.listeners.delete(id);
  }

  private notifyDataChange(): void {
    for (const cb of this.listeners.values()) {
      try {
        cb();
      } catch (err) {
        console.error("[CrosshairData] Error executing listener callback:", err);
      }
    }
  }
}