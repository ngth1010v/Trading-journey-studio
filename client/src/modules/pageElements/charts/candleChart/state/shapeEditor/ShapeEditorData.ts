import type { ShapePoint, ShapeType, TypedShape } from "../source/shape/shapeType";

export type Tool = "cursor" | ShapeType;

export interface Draft {
  type: ShapeType;
  points: ShapePoint[];
  placed: number; // anchors fixed so far
}

export type DragTarget = { kind: "handle"; index: number } | { kind: "body" };

export interface Dragging {
  id: number;
  shape: TypedShape; // live copy being edited
  target: DragTarget;
  startWorld: ShapePoint;
  startPoints: ShapePoint[];
}

type Callback = () => void;

/** Not persisted. Drawing tool / selection / drag state for the shape editor, per chart instance. */
export default class ShapeEditorData {
  private _tool: Tool = "cursor";
  private _draft: Draft | null = null;
  private _selectedId: number | null = null;
  private _hoveredId: number | null = null;
  private _hoveredHandle: number | null = null;
  private _dragging: Dragging | null = null;

  private listeners: Map<string, Callback> = new Map();

  public init(): void {
    this.reset();
  }

  public destroy(): void {
    this.reset();
    this.listeners.clear();
  }

  public reset(): void {
    this._tool = "cursor";
    this._draft = null;
    this._selectedId = null;
    this._hoveredId = null;
    this._hoveredHandle = null;
    this._dragging = null;
  }

  // =========================================================================
  // GETTERS
  // =========================================================================

  public get tool(): Tool {
    return this._tool;
  }

  public get draft(): Draft | null {
    return this._draft;
  }

  public get selectedId(): number | null {
    return this._selectedId;
  }

  public get hoveredId(): number | null {
    return this._hoveredId;
  }

  public get hoveredHandle(): number | null {
    return this._hoveredHandle;
  }

  public get dragging(): Dragging | null {
    return this._dragging;
  }

  // =========================================================================
  // SETTERS
  // =========================================================================

  public setTool(tool: Tool): void {
    this._tool = tool;
    this._draft = null;
    this.notify();
  }

  public setDraft(draft: Draft | null): void {
    this._draft = draft;
    this.notify();
  }

  public setSelectedId(id: number | null): void {
    this._selectedId = id;
    this.notify();
  }

  public setHovered(id: number | null, handle: number | null): void {
    this._hoveredId = id;
    this._hoveredHandle = handle;
    this.notify();
  }

  public setDragging(dragging: Dragging | null): void {
    this._dragging = dragging;
    this.notify();
  }

  /** Clears selection/draft/drag without changing the active tool. Used on hide-all / symbol / strategy change. */
  public clearSelection(): void {
    this._draft = null;
    this._selectedId = null;
    this._hoveredId = null;
    this._hoveredHandle = null;
    this._dragging = null;
    this.notify();
  }

  // =========================================================================
  // LISTENERS
  // =========================================================================

  public addOnChange(id: string, cb: Callback): void {
    this.listeners.set(id, cb);
  }

  public removeOnChange(id: string): void {
    this.listeners.delete(id);
  }

  private notify(): void {
    for (const cb of this.listeners.values()) {
      try {
        cb();
      } catch (err) {
        console.error("[ShapeEditorData] Error executing listener callback:", err);
      }
    }
  }
}
