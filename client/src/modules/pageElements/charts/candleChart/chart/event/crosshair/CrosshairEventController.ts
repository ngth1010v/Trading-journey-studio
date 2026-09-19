import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { Candle } from "../../../state/source/candle/CandleData";
import type { System } from "../../loop/GameLoop";

const MAGNET_SNAP_DISTANCE_PX = 30;
const MAGNET_SNAP_DISTANCE_SQ = MAGNET_SNAP_DISTANCE_PX * MAGNET_SNAP_DISTANCE_PX;

export default class CrosshairEventController implements System {
  private state: StateData | null = null;
  private chart: ChartController | null = null;

  private isMouseInside: boolean = false;
  private rawMousePos: { x: number; y: number } | null = null;
  // Set by mouse input, consumed once per frame in update()
  private pendingUpdate: boolean = false;

  private readonly eventIdPrefix = `CrosshairEventController_${Math.random().toString(36).substring(2, 9)}`;

  /**
   * Initializes controller and registers canvas event listeners.
   */
  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;

    const event = this.chart.event;

    event.addOnEvent("mouseMove", `${this.eventIdPrefix}_mouseMove`, this.onMouseMove);
    event.addOnEvent("mouseEnter", `${this.eventIdPrefix}_mouseEnter`, this.onMouseEnter);
    event.addOnEvent("mouseLeave", `${this.eventIdPrefix}_mouseLeave`, this.onMouseLeave);

    this.chart.loop.addSystem(this);
  }

  /**
   * Unregisters listeners and cleans up references.
   */
  public destroy(): void {
    if (this.chart) {
      this.chart.loop.removeSystem(this);
      try {
        this.chart.event.removeOnEvent(`${this.eventIdPrefix}_mouseMove`);
        this.chart.event.removeOnEvent(`${this.eventIdPrefix}_mouseEnter`);
        this.chart.event.removeOnEvent(`${this.eventIdPrefix}_mouseLeave`);
      } catch {
        // Ignore if already disconnected
      }
    }

    if (this.state) {
      this.state.crosshair.reset();
    }

    this.state = null;
    this.chart = null;
    this.rawMousePos = null;
    this.isMouseInside = false;
    this.pendingUpdate = false;
  }

  /**
   * Retrieves snapped crosshair pixel coordinate from state.
   */
  public getPixel(): { x: number; y: number } | null {
    return this.state?.crosshair.getPixel() ?? null;
  }

  /**
   * Retrieves crosshair world coordinate ({ timestamp, price }) from state.
   */
  public get(): { timestamp: number; price: number } | null {
    return this.state?.crosshair.get() ?? null;
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================

  private onMouseEnter = (): void => {
    this.isMouseInside = true;
    this.scheduleUpdate();
  };

  private onMouseLeave = (): void => {
    this.isMouseInside = false;
    this.rawMousePos = null;
    this.pendingUpdate = false;

    if (this.state) {
      this.state.crosshair.reset();
    }
  };

  private onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    this.isMouseInside = true;

    if (e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      this.rawMousePos = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    } else if (e.nativeEvent) {
      this.rawMousePos = {
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY,
      };
    }

    this.scheduleUpdate();
  };

  // =========================================================================
  // GAME LOOP
  // =========================================================================

  private scheduleUpdate(): void {
    this.pendingUpdate = true;
    this.chart?.loop.requestFrame();
  }

  public update(): void {
    if (!this.pendingUpdate) return;
    this.pendingUpdate = false;
    this.updateCrosshairData();
  }

  // =========================================================================
  // MAGNET COMPUTATION & STATE SYNC
  // =========================================================================

  private updateCrosshairData(): void {
    if (!this.rawMousePos || !this.chart || !this.state || !this.isMouseInside) {
      if (this.state) {
        this.state.crosshair.reset();
      }
      return;
    }

    const { x, y } = this.rawMousePos;
    const magnetPoint = this.getMagnetPixel(x, y);
    const finalPixel = magnetPoint || { x, y };

    const converter = this.chart.viewport.converter;
    const worldPoint = converter.screenToWorld(finalPixel.x, finalPixel.y);

    const world = worldPoint
      ? { timestamp: Math.round(worldPoint.ts), price: worldPoint.price }
      : null;

    // Push calculated state into state.crosshair
    this.state.crosshair.set(finalPixel, world, true);
  }

  /**
   * Snaps crosshair to nearest candle anchor point within distance limit.
   */
  public getMagnetPixel(mouseX: number, mouseY: number): { x: number; y: number } | null {
    if (!this.chart || !this.state) return null;

    const converter = this.chart.viewport.converter;
    const mouseWorld = converter.screenToWorld(mouseX, mouseY);
    if (mouseWorld == null) return null;
    const mouseTs = mouseWorld.ts;

    const closedBin = this.state.source.candle.getAllClosed();
    const openingCandle = this.state.source.candle.getOpening();

    let bestDistanceSq = MAGNET_SNAP_DISTANCE_SQ;
    let bestPoint: { x: number; y: number } | null = null;

    const considerPoint = (px: number | null, py: number | null) => {
      if (px == null || py == null || !Number.isFinite(px) || !Number.isFinite(py)) return;

      const dx = mouseX - px;
      const dy = mouseY - py;
      const d2 = dx * dx + dy * dy;

      if (d2 <= bestDistanceSq) {
        bestDistanceSq = d2;
        bestPoint = { x: px, y: py };
      }
    };

    /**
     * Considers candle anchor points (O, H, L, C) mapped at the center of the rendered candle:
     * centerTimestamp = (openTime + nextTime) / 2
     */
    const considerCandleWithNextTime = (candle: Candle, nextTime: number) => {
      const centerTs = (candle.t + nextTime) / 2;

      const oPoint = converter.worldToScreen(centerTs, candle.o);
      const hPoint = converter.worldToScreen(centerTs, candle.h);
      const lPoint = converter.worldToScreen(centerTs, candle.l);
      const cPoint = converter.worldToScreen(centerTs, candle.c);

      if (oPoint) considerPoint(oPoint.x, oPoint.y);
      if (hPoint) considerPoint(hPoint.x, hPoint.y);
      if (lPoint) considerPoint(lPoint.x, lPoint.y);
      if (cPoint) considerPoint(cPoint.x, cPoint.y);
    };

    // 1. Binary Search inside Closed Candle Data
    if (closedBin && closedBin.t.length > 0) {
      const count = closedBin.t.length;
      const idx = this.binarySearchClosestIndex(closedBin.t, mouseTs);

      const startIdx = Math.max(0, idx - 2);
      const endIdx = Math.min(count - 1, idx + 2);

      for (let i = startIdx; i <= endIdx; i++) {
        const openTime = closedBin.t[i];
        let nextTime: number | null = null;

        if (i < count - 1) {
          nextTime = closedBin.t[i + 1];
        } else if (openingCandle && openingCandle.t != null) {
          nextTime = openingCandle.t;
        } else {
          // Fallback if no opening candle is present
          const openingCloseTime = this.state.source.candle.getOpeningCloseTime();
          if (openingCloseTime != null) {
            nextTime = openTime + (openingCloseTime - (openingCandle?.t ?? openTime));
          }
        }

        if (nextTime != null && nextTime > openTime) {
          const candle: Candle = {
            t: openTime,
            o: closedBin.o[i],
            h: closedBin.h[i],
            l: closedBin.l[i],
            c: closedBin.c[i],
            v: closedBin.v[i],
          };
          considerCandleWithNextTime(candle, nextTime);
        }
      }
    }

    // 2. Consider Opening Candle
    if (openingCandle && openingCandle.t != null) {
      const openingCloseTime = this.state.source.candle.getOpeningCloseTime();
      if (openingCloseTime != null && openingCloseTime > openingCandle.t) {
        considerCandleWithNextTime(openingCandle, openingCloseTime);
      }
    }

    return bestPoint;
  }

  private binarySearchClosestIndex(timestamps: Float64Array, targetTs: number): number {
    let low = 0;
    let high = timestamps.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const midTs = timestamps[mid];

      if (midTs === targetTs) {
        return mid;
      } else if (midTs < targetTs) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (low >= timestamps.length) return timestamps.length - 1;
    if (high < 0) return 0;

    const diffLow = Math.abs(timestamps[low] - targetTs);
    const diffHigh = Math.abs(timestamps[high] - targetTs);

    return diffLow < diffHigh ? low : high;
  }
}