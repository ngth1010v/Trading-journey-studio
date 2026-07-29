import { fetchClosedCandlesBin, fetchOpeningCandle } from "./candleApi";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface BinCandles {
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  v: Float64Array;
}

const REFRESH_DURATION = 250; // ms

type Callback = () => void;

export default class CandleData {
  private symbol: string | null = null;
  private timeframe: string | null = null;
  private fromTs: number | null = null;
  private toTs: number | null = null;

  private closedCandles: BinCandles | null = null;
  private openingCandle: Candle | null = null;

  private timerId: ReturnType<typeof setInterval> | null = null;
  private isLoopRunning = false;
  private isFetchingOpening = false;
  private isFetchingClosed = false;

  private onClosedCallbacks = new Map<string, Callback>();
  private onOpeningCallbacks = new Map<string, Callback>();

  /**
   * Starts the polling loop for opening candle updates.
   */
  public init(): void {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    this.timerId = setInterval(() => {
      this.tick();
    }, REFRESH_DURATION);
  }

  /**
   * Stops the polling loop and resets internal states.
   */
  public destroy(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isLoopRunning = false;
    this.onClosedCallbacks.clear();
    this.onOpeningCallbacks.clear();
  }

  /**
   * Updates source symbol and timeframe. Triggers fetch if all view parameters are set.
   */
  public setSource(symbol: string | null, timeframe: string | null): void {

    let changed = false
    if (symbol && symbol != this.symbol){
      this.symbol = symbol;
      changed = true
    }
    if (timeframe && timeframe != this.timeframe){
      this.timeframe = timeframe;
      changed = true
    }
    if (changed){
      this.checkAndFetchAll();
    }
  }

  /**
   * Updates display view window. Triggers fetch if all source parameters are set.
   */
  public setView(fromTs: number, toTs: number): void {
    if (this.fromTs === fromTs && this.toTs === toTs) return;

    this.fromTs = fromTs;
    this.toTs = toTs;

    this.checkAndFetchAll();
  }

  public getAllClosed(): BinCandles | null {
    return this.closedCandles;
  }

  public getClosed(idx: number): Candle | null {
    if (!this.closedCandles) return null;
    if (idx < 0 || idx >= this.getClosedSize()) return null;

    return {
      t: this.closedCandles.t[idx],
      o: this.closedCandles.o[idx],
      h: this.closedCandles.h[idx],
      l: this.closedCandles.l[idx],
      c: this.closedCandles.c[idx],
      v: this.closedCandles.v[idx],
    };
  }

  public getClosedSize(): number {
    return this.closedCandles ? this.closedCandles.t.length : 0;
  }

  public getOpening(): Candle | null {
    return this.openingCandle;
  }

  public addOnClosedCandleDataChange(id: string, cb: Callback): void {
    this.onClosedCallbacks.set(id, cb);
  }

  public removeOnClosedCandleDataChange(id: string): void {
    this.onClosedCallbacks.delete(id);
  }

  public addOnOpeningCandleDataChange(id: string, cb: Callback): void {
    this.onOpeningCallbacks.set(id, cb);
  }

  public removeOnOpeningCandleDataChange(id: string): void {
    this.onOpeningCallbacks.delete(id);
  }

  // =========================================================================
  // PRIVATE LOGIC & PIPELINE
  // =========================================================================

  private isReadyToFetch(): boolean {
    return (
      this.symbol !== null &&
      this.timeframe !== null &&
      this.fromTs !== null &&
      this.toTs !== null
    );
  }

  private async checkAndFetchAll(): Promise<void> {
    if (!this.isReadyToFetch()) return;

    await Promise.all([this.fetchClosedData(), this.fetchOpeningData()]);
  }

  private async tick(): Promise<void> {
    if (!this.isReadyToFetch()) return;
    await this.fetchOpeningData();
  }

  private async fetchClosedData(): Promise<void> {
    if (this.isFetchingClosed || !this.isReadyToFetch()) return;

    this.isFetchingClosed = true;

    try {
      const binData = await fetchClosedCandlesBin(
        this.symbol!,
        this.timeframe!,
        this.fromTs!,
        this.toTs!
      );

      this.closedCandles = binData;
      this.notifyClosedDataChange();
    } catch (err) {
      console.error("[CandleData] Error fetching closed candles:", err);
    } finally {
      this.isFetchingClosed = false;
    }
  }

  private async fetchOpeningData(): Promise<void> {
    if (this.isFetchingOpening || !this.isReadyToFetch()) return;

    this.isFetchingOpening = true;

    try {
      const newOpening = await fetchOpeningCandle(this.symbol!, this.timeframe!);

      if (!newOpening) {
        this.isFetchingOpening = false;
        return;
      }

      // Detect if opening candle closed (timestamp rolled over to a new candle period)
      const hasRolledOver =
        this.openingCandle !== null &&
        newOpening.t !== undefined &&
        newOpening.t > this.openingCandle.t;

      this.openingCandle = newOpening;
      this.notifyOpeningDataChange();

      // If a rollover occurred, reload closed dataset automatically
      if (hasRolledOver) {
        await this.fetchClosedData();
      }
    } catch (err) {
      console.error("[CandleData] Error fetching opening candle:", err);
    } finally {
      this.isFetchingOpening = false;
    }
  }

  private notifyClosedDataChange(): void {
    this.onClosedCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[CandleData] Error in closed candle listener:", err);
      }
    });
  }

  private notifyOpeningDataChange(): void {
    this.onOpeningCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[CandleData] Error in opening candle listener:", err);
      }
    });
  }
}