import { Application, type ApplicationOptions } from 'pixi.js';

export default class Renderer {
  private app: Application | null = null;
  private isInitializing = false;
  private isDestroyed = false;

  /**
   * Reserved for initialization logic.
   */
  public init(): void {
    // Kept empty as requested
  }

  /**
   * Initializes the PixiJS v8 Application with the provided HTMLCanvasElement.
   * Handles async initialization safely against React lifecycle remounts.
   */
  public async setCanvas(
    canvas: HTMLCanvasElement,
    options?: Partial<ApplicationOptions>
  ): Promise<void> {
    // 1. If an app is already initialized or being initialized, destroy it before setting up a new one
    if (this.app || this.isInitializing) {
      await this.destroy();
    }

    this.isDestroyed = false;
    this.isInitializing = true;

    try {
      const app = new Application();

      // PixiJS v8 async initialization
      await app.init({
        canvas,
        resizeTo: canvas.parentElement ?? undefined,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        ...options,
      });

      // Handle race condition: destroy() was called while app.init() was in progress
      if (this.isDestroyed) {
        app.destroy(true, { children: true, texture: true });
        return;
      }

      this.app = app;
    } catch (error) {
      console.error('[Renderer] Failed to initialize PixiJS Application:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Returns the current PixiJS Application instance.
   * Logs a warning if accessed before setCanvas() has completed.
   */
  public getApp(): Application | null {
    if (!this.app) {
      console.warn(
        '[Renderer] getApp() was called, but the PixiJS Application is not initialized yet or was destroyed.'
      );
    }
    return this.app;
  }

  /**
   * Cleans up and destroys the PixiJS Application instance.
   * Safely handles ongoing initialization promises.
   */
  public async destroy(): Promise<void> {
    this.isDestroyed = true;

    if (this.app) {
      const appToDestroy = this.app;
      this.app = null;
      appToDestroy.destroy(true, { children: true, texture: true });
    }

    // Reset state flags
    this.isInitializing = false;
  }
}