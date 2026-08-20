type Callback = () => void;


export default class LinkCrosshairData {
  private pixel: { x: number; y: number } | null = null;
  private world: { timestamp: number; price: number } | null = null;
  private enable: boolean = true

  private listeners: Map<string, Callback> = new Map();

  public init(): void {
    this.reset();
  }

  public destroy(): void {
    this.reset();
  }

  /**
   * Resets crosshair state to hidden / empty.
   */
  public reset(): void {
    this.pixel = null;
    this.world = null;
    this.notifyDataChange();
    this.enable = false
  }

  /**
   * Updates crosshair position and world values, then triggers listeners if data changed.
   */
  public set(
    pixel: { x: number; y: number } | null,
    world: { timestamp: number; price: number } | null,
  ): void {
    this.pixel = pixel ? { ...pixel } : null;
    this.world = world ? { ...world } : null;

    this.notifyDataChange();
  }
  
  public setEnable(enable: boolean) {
    this.enable = enable
    
    this.notifyDataChange();
  }

  // =========================================================================
  // GETTERS
  // =========================================================================

  public getPixel(): { x: number; y: number } | null {
    if (!this.pixel) return null;
    return { ...this.pixel };
  }

  public get(): { timestamp: number; price: number } | null {
    if (!this.world) return null;
    return { ...this.world };
  }

  public getEnable(): boolean {
    return this.enable;
  }

  // =========================================================================
  // EVENT LISTENERS
  // =========================================================================

  /**
   * Registers a callback for crosshair changes. Overwrites if duplicate ID.
   */
  public addOnCrosshairDataChange(id: string, cb: Callback): void {
    this.listeners.set(id, cb);
    cb()
  }

  /**
   * Removes a callback listener by ID safely without throwing an error if absent.
   */
  public removeOnCrosshairDataChange(id: string): void {
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