import type StateData from "../../state/StateData";
import type { Viewport, ViewportTransform } from "../../state/viewport/ViewportData";
import type ChartController from "../ChartController";
import type ViewportConverter from "./ViewportConverter";

export default class ViewportEventController {
  private state: StateData | null = null;
  private chart: ChartController | null = null;
  private converter: ViewportConverter | null = null;

  private enabled = true;
  private isPanning = false;
  private lastMousePos = { x: 0, y: 0 };

  private readonly PAN_EVENT_ID = "ViewportEventController_Pan";
  private readonly WHEEL_EVENT_ID = "ViewportEventController_Wheel";

  /**
   * Initializes the event controller with state, chart, and converter references.
   */
  public init(state: StateData, chart: ChartController, converter: ViewportConverter): void {
    this.state = state;
    this.chart = chart;
    this.converter = converter;

    // Register event listeners
    this.chart.event.addOnEvent("mouseDown", `${this.PAN_EVENT_ID}_down`, this.handleMouseDown);
    this.chart.event.addOnEvent("mouseUp", `${this.PAN_EVENT_ID}_up`, this.handleMouseUp);
    this.chart.event.addOnEvent("mouseLeave", `${this.PAN_EVENT_ID}_leave`, this.handleMouseUp);
    this.chart.event.addOnEvent("mouseMove", `${this.PAN_EVENT_ID}_move`, this.handleMouseMove);
    this.chart.event.addOnEvent("wheel", this.WHEEL_EVENT_ID, this.handleWheel);
  }

  /**
   * Cleans up event listeners and references.
   */
  public destroy(): void {
    if (this.chart) {
      try {
        this.chart.event.removeOnEvent(`${this.PAN_EVENT_ID}_down`);
        this.chart.event.removeOnEvent(`${this.PAN_EVENT_ID}_up`);
        this.chart.event.removeOnEvent(`${this.PAN_EVENT_ID}_leave`);
        this.chart.event.removeOnEvent(`${this.PAN_EVENT_ID}_move`);
        this.chart.event.removeOnEvent(this.WHEEL_EVENT_ID);
      } catch (err) {
        // Event listeners might already be removed during cleanup
      }
    }
    this.state = null;
    this.chart = null;
    this.converter = null;
    this.isPanning = false;
    this.enabled = true;
  }

  /**
   * Enables or disables transform interaction events.
   * Disabling immediately forces any active panning gesture to cancel.
   */
  public setEnable(enable: boolean): void {
    this.enabled = enable;
    if (!enable) {
      this.isPanning = false;
    }
  }

  //======================================================================================================
  // EVENT HANDLERS
  //======================================================================================================

  private handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!this.enabled || e.button !== 0) return;
    this.isPanning = true;
    this.lastMousePos = this.getMousePosition(e);
  };

  private handleMouseUp = (): void => {
    if (!this.chart) return;
    if (!this.enabled) return;
    this.isPanning = false;
  };

  private handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!this.chart) return;
    if (!this.enabled || !this.isPanning) return;

    const view = this.getViewport();
    if (!view) return;

    const currentPos = this.getMousePosition(e);
    const dx = currentPos.x - this.lastMousePos.x;
    const dy = currentPos.y - this.lastMousePos.y;
    this.lastMousePos = currentPos;

    const state = this.getState();
    const { w, h } = this.chart.event.getCanvasSize();
    if (w <= 0 || h <= 0) return;

    const transform = state.viewport.getTransform();

    // Convert pixel delta into timestamp and price domain offsets
    const deltaTs = -(dx / w) * (view.toTs - view.fromTs) * transform.scaleTs;
    const deltaPrice = (dy / h) * (view.toPrice - view.fromPrice) * transform.scalePrice;

    state.viewport.setTransform({
      ...transform,
      offsetTs: transform.offsetTs + deltaTs,
      offsetPrice: transform.offsetPrice + deltaPrice,
    });
  };

  private handleWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    if (!this.chart) return;
    if (!this.enabled) return;
    e.preventDefault();

    const view = this.getViewport();
    if (!view) return;

    const state = this.getState();
    const converter = this.getConverter();

    const { w, h } = this.chart.event.getCanvasSize();
    if (w <= 0 || h <= 0) return;

    const { x: mouseX, y: mouseY } = this.getMousePosition(e);
    const currentTransform = state.viewport.getTransform();

    const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;

    // Convert mouse coordinates into timestamp and price domain values
    const mouseTs = converter.pixelToTimestamp(mouseX);
    const mousePrice = converter.pixelToPrice(mouseY);
    if (mouseTs === null || mousePrice === null) return;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isAlt = e.altKey;

    let newScaleTs = currentTransform.scaleTs;
    let newScalePrice = currentTransform.scalePrice;

    if (isCtrl && !isAlt) {
      // ScaleX: Timestamp zoom only
      newScaleTs *= zoomFactor;
    } else if (isAlt && !isCtrl) {
      // ScaleY: Price zoom only
      newScalePrice *= zoomFactor;
    } else {
      // Uniform Scale: Both X and Y zoom
      newScaleTs *= zoomFactor;
      newScalePrice *= zoomFactor;
    }

    // Adjust offsets so scaling stays centered around current mouse position
    const unscaledFromTs = view.fromTs * newScaleTs;
    const unscaledDeltaTs = (view.toTs - view.fromTs) * newScaleTs;
    const newOffsetTs = unscaledDeltaTs !== 0
      ? mouseTs - unscaledFromTs - (mouseX / w) * unscaledDeltaTs
      : currentTransform.offsetTs;

    const unscaledFromPrice = view.fromPrice * newScalePrice;
    const unscaledDeltaPrice = (view.toPrice - view.fromPrice) * newScalePrice;
    const newOffsetPrice = unscaledDeltaPrice !== 0
      ? mousePrice - unscaledFromPrice - ((h - mouseY) / h) * unscaledDeltaPrice
      : currentTransform.offsetPrice;

    const newTransform: ViewportTransform = {
      scaleTs: newScaleTs,
      offsetTs: newOffsetTs,
      scalePrice: newScalePrice,
      offsetPrice: newOffsetPrice,
    };

    state.viewport.setTransform(newTransform);
  };

  /**
   * Helper to compute relative canvas pixel coordinates from native client mouse events.
   */
  private getMousePosition(e: React.MouseEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>): { x: number; y: number } {
    const target = e.currentTarget || e.target;
    if (target && "getBoundingClientRect" in target) {
      const rect = (target as HTMLElement).getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
    return { x: e.clientX, y: e.clientY };
  }

  private getViewport(): Viewport | null {
    const state = this.getState();
    return state.config.get().data?.viewport ?? null;
  }

  private getState(): StateData {
    if (!this.state) {
      throw new Error("ViewportEventController: State not initialized.");
    }
    return this.state;
  }

  private getConverter(): ViewportConverter {
    if (!this.converter) {
      throw new Error("ViewportEventController: Converter not initialized.");
    }
    return this.converter;
  }
}