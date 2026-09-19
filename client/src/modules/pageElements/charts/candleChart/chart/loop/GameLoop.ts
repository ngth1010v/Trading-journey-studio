//======================================================================================================
// On-demand game loop: one requestAnimationFrame per batch of changes, idle when nothing is dirty.
//
// Frame phases:
//   1. update : systems consume queued input / pending work and mutate state
//   2. draw   : renderer prepares only dirty parts, then draws every layer once
//   3. post   : systems push results outward (e.g. link sync-up)
//
// Marks made during `update` land in the current frame. Marks made during `draw`/`post`
// (or outside a frame) schedule the next frame.
//======================================================================================================

export type DirtyKey =
  | "size"
  | "transform"
  | "candle.closed"
  | "candle.opening"
  | "candle.style"
  | "season.data"
  | "season.style"
  | "crosshair"
  | "crosshair.style"
  | "link.crosshair"
  | "link.crosshair.style"
  | "link.viewport"
  | "trade"
  | "trade.style"
  | "shape"
  | "shape.style"
  | "shape.editor";

export interface Frame {
  time: number;
  dt: number;
  dirty: ReadonlySet<DirtyKey>;
  w: number;
  h: number;
  dpr: number;
}

export interface System {
  update?(frame: Frame): void;
  post?(frame: Frame): void;
}

type Phase = "idle" | "update" | "draw" | "post";

export default class GameLoop {
  private dirty = new Set<DirtyKey>();
  private systems = new Set<System>();
  private rafId: number | null = null;
  private lastTime = 0;
  private phase: Phase = "idle";

  private getSize: () => { w: number; h: number };

  public draw: ((frame: Frame) => void) | null = null;

  constructor(getSize: () => { w: number; h: number }) {
    this.getSize = getSize;
  }

  public addSystem(system: System): void {
    this.systems.add(system);
  }

  public removeSystem(system: System): void {
    this.systems.delete(system);
  }

  /** Flags parts of the scene as changed and schedules a frame. */
  public mark(...keys: DirtyKey[]): void {
    for (const k of keys) this.dirty.add(k);
    if (this.phase !== "update") this.requestFrame();
  }

  /** Schedules a frame without marking anything dirty (systems with pending input use this). */
  public requestFrame(): void {
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  public destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.dirty.clear();
    this.phase = "idle";
  }

  private tick = (time: number): void => {
    this.rafId = null;
    const { w, h } = this.getSize();
    const frame: Frame = {
      time,
      dt: this.lastTime ? time - this.lastTime : 0,
      dirty: this.dirty,
      w,
      h,
      dpr: window.devicePixelRatio || 1,
    };
    this.lastTime = time;

    try {
      this.phase = "update";
      for (const s of this.systems) s.update?.(frame);

      // frame.dirty still points at the set filled before/during update; later marks go to a new set
      this.dirty = new Set();

      this.phase = "draw";
      if (frame.dirty.size > 0) this.draw?.(frame);

      this.phase = "post";
      for (const s of this.systems) s.post?.(frame);
    } finally {
      this.phase = "idle";
    }
  };
}
