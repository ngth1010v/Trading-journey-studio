import type StateData from "../../../state/StateData"
import type { Viewport, ViewportTransform } from "../../../state/viewport/ViewportData"
import type ChartController from "../../ChartController";
import type { System } from "../../loop/GameLoop";

export default class ViewportEventController implements System {
  private state: StateData | null = null;
  private chart: ChartController | null = null;

  private enabled = true;
  private isPanning = false;
  private lastMousePos = { x: 0, y: 0 };

  // Input queued between frames, applied once per frame in update()
  private pendingPan = { dx: 0, dy: 0 };
  private pendingZoom: { factorX: number; factorY: number; mouseX: number; mouseY: number } | null = null;

  // Timer reference for debouncing the wheel flush
  private wheelFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly WHEEL_DEBOUNCE_MS = 100;

  private readonly PAN_EVENT_ID = "ViewportEventController_Pan";
  private readonly WHEEL_EVENT_ID = "ViewportEventController_Wheel";
  private readonly RESET_VIEWPORT_EVENT_ID = "ViewportEventController_ResetViewport";

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
    this.chart.event.addOnEvent("keyDown", this.RESET_VIEWPORT_EVENT_ID, this.handleResetViewport);

    this.chart.loop.addSystem(this);
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
      this.chart.loop.removeSystem(this);
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
    this.clearPending();
  }

  /**
   * Enables or disables transform interaction events.
   * Disabling immediately forces any active panning gesture to cancel.
   */
  public setEnable(enable: boolean): void {
    this.enabled = enable;
    if (!enable) {
      this.isPanning = false;
      this.clearPending();
      if (this.wheelFlushTimer) {
        clearTimeout(this.wheelFlushTimer);
        this.wheelFlushTimer = null;
      }
    }
  }

  //======================================================================================================
  // EVENT HANDLERS
  //======================================================================================================

  private handleResetViewport = (e: React.KeyboardEvent<HTMLCanvasElement>): void => {
    if (e.ctrlKey && e.code === "KeyR") {
      e.preventDefault(); // chặn Ctrl+R reload trang
      this.chart?.viewport.aligner.autoViewport();
    }
  };

  private handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!this.enabled || e.button !== 0) return;
    this.isPanning = true;
    this.lastMousePos = this.getMousePosition(e);
  };
  
  private handleMouseUp = (): void => {
    if (!this.chart) return;
    if (!this.enabled) return;
    this.isPanning = false;
    this.applyPending();
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
    
    const { w, h } = this.chart.event.getCanvasSize();
    if (w <= 0 || h <= 0) return;

    // Queue pixel translation; applied once per frame
    this.pendingPan.dx += dx;
    this.pendingPan.dy += dy;
    this.chart.loop.requestFrame();
  };
  
  private handleWheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    if (!this.chart) return;
    if (!this.enabled) return;

    const view = this.getViewport();
    if (!view) return;

    const { w, h } = this.chart.event.getCanvasSize();
    if (w <= 0 || h <= 0) return;

    const { x: mouseX, y: mouseY } = this.getMousePosition(e);

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isAlt = e.altKey;

    let factorX = 1;
    let factorY = 1;

    if (isCtrl && !isAlt) {
      // ScaleX zoom only
      factorX = zoomFactor;
    } else if (isAlt && !isCtrl) {
      // ScaleY zoom only
      factorY = zoomFactor;
    } else {
      // Uniform Scale: Both X and Y zoom
      factorX = zoomFactor;
      factorY = zoomFactor;
    }

    // Queue zoom; steps within one frame compose into one zoom around the latest mouse position
    const pending = this.pendingZoom;
    this.pendingZoom = {
      factorX: (pending?.factorX ?? 1) * factorX,
      factorY: (pending?.factorY ?? 1) * factorY,
      mouseX,
      mouseY,
    };
    this.chart.loop.requestFrame();

    // Schedule debounced flush
    this.debounceWheelFlush();
  };

  //======================================================================================================
  // GAME LOOP
  //======================================================================================================

  public update(): void {
    this.applyPending();
  }

  /**
   * Applies queued pan & zoom to the viewport transform in a single setTransform call.
   */
  private applyPending(): void {
    const state = this.state;
    const pan = this.pendingPan;
    const zoom = this.pendingZoom;
    if (!state || (pan.dx === 0 && pan.dy === 0 && !zoom)) return;

    const t = state.viewport.getTransform();
    let { scaleX, scaleY } = t;
    let offsetX = t.offsetX + pan.dx;
    let offsetY = t.offsetY + pan.dy;

    if (zoom) {
      const worldX = (zoom.mouseX - offsetX) / scaleX;
      const worldY = (zoom.mouseY - offsetY) / scaleY;
      scaleX *= zoom.factorX;
      scaleY *= zoom.factorY;
      offsetX = zoom.mouseX - worldX * scaleX;
      offsetY = zoom.mouseY - worldY * scaleY;
    }

    this.clearPending();

    const newTransform: ViewportTransform = { scaleX, offsetX, scaleY, offsetY };
    state.viewport.setTransform(newTransform);
  }

  private clearPending(): void {
    this.pendingPan = { dx: 0, dy: 0 };
    this.pendingZoom = null;
  }

  /**
   * Clears any active wheel timer and sets a new timer for 500ms.
   */
  private debounceWheelFlush(): void {
    if (this.wheelFlushTimer) {
      clearTimeout(this.wheelFlushTimer);
    }

    this.wheelFlushTimer = setTimeout(() => {
      this.applyPending();
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