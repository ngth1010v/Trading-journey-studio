import type StateData from "../../../state/StateData"
import type { Viewport, ViewportTransform } from "../../../state/viewport/ViewportData"
import type ChartController from "../../ChartController";

export default class ViewportEventController {
  private state: StateData | null = null;
  private chart: ChartController | null = null;

  private enabled = true;
  private isPanning = false;
  private lastMousePos = { x: 0, y: 0 };

  // Timer reference for debouncing the wheel flush
  private wheelFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly WHEEL_DEBOUNCE_MS = 100;

  private readonly PAN_EVENT_ID = "ViewportEventController_Pan";
  private readonly WHEEL_EVENT_ID = "ViewportEventController_Wheel";

  /**
   * Initializes the event controller with state, chart, and converter references.
   */
  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;

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
    // Clear active wheel timer on cleanup to prevent memory leaks or calling flush on destroyed state
    if (this.wheelFlushTimer) {
      clearTimeout(this.wheelFlushTimer);
      this.wheelFlushTimer = null;
    }

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
      if (this.wheelFlushTimer) {
        clearTimeout(this.wheelFlushTimer);
        this.wheelFlushTimer = null;
      }
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
    this.state?.viewport.flushTransform();
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

    // Directly apply pixel translation offsets
    state.viewport.setTransform({
      ...transform,
      offsetX: transform.offsetX + dx,
      offsetY: transform.offsetY + dy,
    });
  };
  
  private handleWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    if (!this.chart) return;
    if (!this.enabled) return;

    const view = this.getViewport();
    if (!view) return;

    const state = this.getState();

    const { w, h } = this.chart.event.getCanvasSize();
    if (w <= 0 || h <= 0) return;

    const { x: mouseX, y: mouseY } = this.getMousePosition(e);
    const currentTransform = state.viewport.getTransform();

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isAlt = e.altKey;

    let newScaleX = currentTransform.scaleX;
    let newScaleY = currentTransform.scaleY;

    if (isCtrl && !isAlt) {
      // ScaleX zoom only
      newScaleX *= zoomFactor;
    } else if (isAlt && !isCtrl) {
      // ScaleY zoom only
      newScaleY *= zoomFactor;
    } else {
      // Uniform Scale: Both X and Y zoom
      newScaleX *= zoomFactor;
      newScaleY *= zoomFactor;
    }

    const worldX = (mouseX - currentTransform.offsetX) / currentTransform.scaleX;
    const worldY = (mouseY - currentTransform.offsetY) / currentTransform.scaleY;

    const newOffsetX = mouseX - worldX * newScaleX;
    const newOffsetY = mouseY - worldY * newScaleY;

    const newTransform: ViewportTransform = {
      scaleX: newScaleX,
      offsetX: newOffsetX,
      scaleY: newScaleY,
      offsetY: newOffsetY,
    };

    state.viewport.setTransform(newTransform);

    // Schedule debounced flush
    this.debounceWheelFlush();
  };

  /**
   * Clears any active wheel timer and sets a new timer for 500ms.
   */
  private debounceWheelFlush(): void {
    if (this.wheelFlushTimer) {
      clearTimeout(this.wheelFlushTimer);
    }

    this.wheelFlushTimer = setTimeout(() => {
      this.state?.viewport.flushTransform();
      this.wheelFlushTimer = null;
    }, this.WHEEL_DEBOUNCE_MS);
  }

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
    return state.config.get()?.viewport ?? null;
  }

  private getState(): StateData {
    if (!this.state) {
      throw new Error("ViewportEventController: State not initialized.");
    }
    return this.state;
  }
}