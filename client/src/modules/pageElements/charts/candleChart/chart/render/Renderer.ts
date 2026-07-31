import { Application, type ApplicationOptions } from 'pixi.js';
import CandleRenderer from './candle/CandleRenderer';
import type StateData from '../../state/StateData';
import type ChartController from '../ChartController';

export default class Renderer {
  private app: Application | null = null;
  private isInitializing = false;
  private isDestroyed = false;

  // Direct access via Renderer.candle.<CandleRenderer public function>
  public candle: CandleRenderer = new CandleRenderer();

  /**
   * Initializes sub-renderers like CandleRenderer with state and chart data.
   */
  public init(state: StateData, chart: ChartController): void {
    this.candle.init(state, chart);


    state.source.candle.addOnClosedCandleDataChange("Closed candle render", ()=>{
      this.candle.closed.updateData()
    })
    state.source.candle.addOnOpeningCandleDataChange("Opening candle render", ()=>{
      this.candle.opening.updateData()
    })
    state.viewport.addOnViewportTransformDataChange("Render refresh", () => {
      this.candle.updateViewport()
    })
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

      // Mount CandleRenderer to PixiJS stage once app is ready
      this.candle.addToContainer(this.app.stage);
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
   * Cleans up and destroys the PixiJS Application instance and sub-renderers.
   * Safely handles ongoing initialization promises.
   */
  public async destroy(): Promise<void> {
    this.isDestroyed = true;

    // Destroy CandleRenderer resources (Choice 2B)
    this.candle.destroy();

    if (this.app) {
      const appToDestroy = this.app;
      this.app = null;
      appToDestroy.destroy(true, { children: true, texture: true });
    }

    // Reset state flags
    this.isInitializing = false;
  }
}