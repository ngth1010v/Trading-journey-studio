import { Container } from "pixi.js";
import ChartController from "../../ChartController";
import StateData from "../../../state/StateData";
import ShapeLineRenderer from "./ShapeLineRenderer";
import ShapeRectangleRenderer from "./ShapeRectangleRenderer";
import ShapeTextRenderer from "./ShapeTextRenderer";
import ShapeTriangleRenderer from "./ShapeTriangleRenderer";

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class ShapeRenderer {
  public line: ShapeLineRenderer;
  public rectangle: ShapeRectangleRenderer;
  public text: ShapeTextRenderer;
  public triangle: ShapeTriangleRenderer;

  constructor() {
    this.line = new ShapeLineRenderer();
    this.rectangle = new ShapeRectangleRenderer();
    this.text = new ShapeTextRenderer();
    this.triangle = new ShapeTriangleRenderer();
  }

  /**
   * Initializes all shape sub-renderers.
   *
   * @param state - Global chart state data reference.
   * @param chart - Main chart controller instance.
   * @param parentContainer - (Optional) PixiJS Container to attach renderer containers to.
   * @param fontPath - (Optional) Custom font path for bitmap text renderer.
   */
  public async init(
    state: StateData,
    chart: ChartController,
    parentContainer?: Container | any,
    fontPath?: string
  ): Promise<void> {
    this.line.init(state, chart);
    this.rectangle.init(state, chart);
    await this.text.init(state, chart, fontPath);
    this.triangle.init(state, chart);

    if (parentContainer) {
      this.addToContainer(parentContainer);
    }
  }

  /**
   * Mounts all child shape containers onto a parent PixiJS Container.
   */
  public addToContainer(parentContainer: Container | any): void {
    this.line.addToContainer(parentContainer);
    this.rectangle.addToContainer(parentContainer);
    this.text.addToContainer(parentContainer);
    this.triangle.addToContainer(parentContainer);
  }

  /**
   * Recalculates screen transforms and pixel weight matrix uniforms for all sub-renderers.
   */
  public updateTransform(): void {
    this.line.updateTransform();
    this.rectangle.updateTransform();
    this.text.updateTransform();
    this.triangle.updateTransform();
  }

  /**
   * Triggers explicit render cycles across all sub-renderers.
   */
  public render(): void {
    this.line.render();
    this.rectangle.render();
    this.text.render();
    this.triangle.render();
  }

  /**
   * Destroys GPU buffers, geometries, shaders, and containers for all sub-renderers.
   */
  public destroy(): void {
    this.line.destroy();
    this.rectangle.destroy();
    this.text.destroy();
    this.triangle.destroy();
  }
}