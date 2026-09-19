import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { System } from "../../loop/GameLoop";
import type { ShapePoint, ShapeType, TypedShape } from "../../../state/source/shape/shapeType";
import { ANCHOR_COUNT, constrainPoints, newShapeStyle, isTypedShape, moveRectHandle, shapeTimeBounds } from "../../../state/source/shape/shapeType";
import type { Dragging } from "../../../state/shapeEditor/ShapeEditorData";
import { hitTestShapes } from "./shapeHitTest";
import { getFontAtlas, type FontAtlas } from "../../render/common/FontAtlas";

const CLICK_THRESHOLD_PX = 4;
const ID_BASE = "ShapeEventController";

export default class ShapeEventController implements System {
  private state: StateData | null = null;
  private chart: ChartController | null = null;
  private fontAtlas: FontAtlas | null = null;

  // Creation gesture tracking
  private anchorDownScreen: { x: number; y: number } | null = null;
  private armedForSecondClick = false;

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;

    const event = chart.event;
    event.addOnEvent("mouseDown", `${ID_BASE}_down`, this.onMouseDown);
    event.addOnEvent("mouseUp", `${ID_BASE}_up`, this.onMouseUp);
    event.addOnEvent("mouseMove", `${ID_BASE}_move`, this.onMouseMove);
    event.addOnEvent("mouseLeave", `${ID_BASE}_leave`, this.onMouseLeave);
    event.addOnEvent("keyDown", `${ID_BASE}_keyDown`, this.onKeyDown);

    chart.loop.addSystem(this);
    this.loadFontAtlasWhenReady();
  }

  public destroy(): void {
    if (this.chart) {
      this.chart.loop.removeSystem(this);
      try {
        this.chart.event.removeOnEvent(`${ID_BASE}_down`);
        this.chart.event.removeOnEvent(`${ID_BASE}_up`);
        this.chart.event.removeOnEvent(`${ID_BASE}_move`);
        this.chart.event.removeOnEvent(`${ID_BASE}_leave`);
        this.chart.event.removeOnEvent(`${ID_BASE}_keyDown`);
      } catch {
        // Already disconnected
      }
    }
    this.state = null;
    this.chart = null;
    this.fontAtlas = null;
  }

  public update(): void {
    // No queued input to apply; all handling happens directly in event callbacks.
  }

  private async loadFontAtlasWhenReady(): Promise<void> {
    for (let i = 0; i < 50 && !this.chart?.render.getGl(); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const gl = this.chart?.render.getGl();
    if (!gl) return;
    try {
      this.fontAtlas = await getFontAtlas(gl);
    } catch {
      // Text hit-testing degrades gracefully without the atlas.
    }
  }

  // =========================================================================
  // GUARDS / HELPERS
  // =========================================================================

  private canUseTools(): boolean {
    const config = this.state?.config.get();
    return !!config?.strategyId && config.shape?.visible !== false;
  }

  private getMousePos(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const target = (e.currentTarget || e.target) as HTMLElement;
    if (target && "getBoundingClientRect" in target) {
      const rect = target.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    return { x: e.clientX, y: e.clientY };
  }

  // ponytail: state.crosshair is only recomputed in CrosshairEventController's per-frame update(),
  // so reading it synchronously inside a mouseDown/mouseMove handler can be one RAF tick stale
  // (harmless for a real continuous drag, but a single fast click can land on the wrong point).
  // Computing straight from the event's screen position sidesteps that at the cost of the OHLC
  // magnet snap; add magnet back here if CrosshairEventController's snap logic gets extracted
  // into a shared helper.
  private getWorldAt(e: React.MouseEvent<HTMLCanvasElement>): ShapePoint | null {
    if (!this.chart) return null;
    const pos = this.getMousePos(e);
    const world = this.chart.viewport.converter.screenToWorld(pos.x, pos.y);
    if (!world) return null;
    return { ts: world.ts, price: world.price };
  }

  private getShapesList(): TypedShape[] {
    return this.state?.source.shape.getAll().filter(isTypedShape) ?? [];
  }

  private setPan(enable: boolean): void {
    this.chart?.event.viewport.setEnable(enable);
  }

  // =========================================================================
  // EVENT HANDLERS
  // =========================================================================

  private onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0 || !this.state || !this.chart) return;
    const editor = this.state.shapeEditor;

    if (editor.tool !== "cursor") {
      this.handleCreateMouseDown(e);
      return;
    }

    if (!this.canUseTools()) return;
    this.handleEditMouseDown(e);
  };

  private onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!this.state || !this.chart) return;
    const editor = this.state.shapeEditor;

    if (editor.tool !== "cursor") {
      this.handleCreateMouseMove(e);
      return;
    }

    if (editor.dragging) {
      this.handleDragMouseMove(e);
    } else {
      this.handleHoverMouseMove(e);
    }
  };

  private onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!this.state || !this.chart) return;
    const editor = this.state.shapeEditor;

    if (editor.tool !== "cursor") {
      this.handleCreateMouseUp(e);
      return;
    }

    if (editor.dragging) {
      this.handleDragMouseUp();
    } else {
      // Clicking a locked shape disables pan without starting a drag; re-enable it here.
      this.setPan(true);
    }
  };

  private onMouseLeave = (): void => {
    // Creation draft and edit selection are kept on mouseLeave, matching TradingView; hover is not.
    this.state?.shapeEditor.setHovered(null, null);
  };

  private onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>): void => {
    if (!this.state) return;
    const editor = this.state.shapeEditor;

    if (editor.draft) {
      if (e.key === "Escape" || (e.key === "Backspace" && editor.draft.placed === 1)) {
        this.cancelDraft();
      }
      return;
    }

    if (e.key === "Escape") {
      editor.setSelectedId(null);
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && editor.selectedId != null) {
      const id = editor.selectedId;
      editor.setSelectedId(null);
      this.state.source.shape.remove(id).catch(() => {});
    }
  };

  // =========================================================================
  // CREATION MODE (§5.2)
  // =========================================================================

  private handleCreateMouseDown(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (!this.state || !this.canUseTools()) return;
    const editor = this.state.shapeEditor;
    const type = editor.tool as ShapeType;
    const anchors = ANCHOR_COUNT[type];
    const world = this.getWorldAt(e);
    if (!world) return;

    this.setPan(false);
    const pos = this.getMousePos(e);

    if (anchors === 1) {
      // Single-anchor tools commit on the first click.
      this.commitDraft(type, [world]);
      return;
    }

    if (!editor.draft) {
      editor.setDraft({ type, points: [world, world], placed: 1 });
      this.anchorDownScreen = pos;
      this.armedForSecondClick = false;
    } else {
      this.anchorDownScreen = pos;
    }
  }

  private handleCreateMouseMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (!this.state) return;
    const editor = this.state.shapeEditor;
    const type = editor.tool as ShapeType;
    if (type === "cursor" as ShapeType) return;
    const anchors = ANCHOR_COUNT[type];
    const world = this.getWorldAt(e);
    if (!world) return;

    this.chart?.event.setCursor("crosshair");

    if (anchors === 1) {
      // Ghost preview follows the cursor before the first click.
      editor.setDraft({ type, points: [world], placed: 0 });
      return;
    }

    if (editor.draft && editor.draft.placed === 1) {
      const points = constrainPoints(type, [editor.draft.points[0], world], 1);
      editor.setDraft({ ...editor.draft, points });
    }
  }

  private handleCreateMouseUp(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (!this.state) return;
    const editor = this.state.shapeEditor;
    const type = editor.tool as ShapeType;
    const anchors = ANCHOR_COUNT[type];
    if (anchors === 1 || !editor.draft || editor.draft.placed !== 1 || !this.anchorDownScreen) return;

    const pos = this.getMousePos(e);
    const dx = pos.x - this.anchorDownScreen.x;
    const dy = pos.y - this.anchorDownScreen.y;
    const dragDist = Math.hypot(dx, dy);

    // Read the second anchor straight from this event rather than trusting a prior mouseMove to
    // have updated the draft — a fast click (or a programmatic one) may not fire an intermediate
    // mousemove at all, which would otherwise commit a degenerate zero-length shape.
    const finalWorld = this.getWorldAt(e);
    if (!finalWorld) return;
    const points = constrainPoints(type, [editor.draft.points[0], finalWorld], 1);

    if (dragDist >= CLICK_THRESHOLD_PX) {
      // Press, drag, release.
      this.commitDraft(type, points);
      return;
    }

    if (this.armedForSecondClick) {
      // Click, move, click.
      this.commitDraft(type, points);
    } else {
      this.armedForSecondClick = true;
    }
  }

  private cancelDraft(): void {
    if (!this.state) return;
    this.state.shapeEditor.setDraft(null);
    this.state.shapeEditor.setTool("cursor");
    this.anchorDownScreen = null;
    this.armedForSecondClick = false;
    this.setPan(true);
  }

  private async commitDraft(type: ShapeType, points: ShapePoint[]): Promise<void> {
    if (!this.state) return;
    const config = this.state.config.get();
    const symbol = config?.symbol ?? "";
    const bounds = shapeTimeBounds(type, points);

    // Keep drawing the draft (at its final points) until the save returns and the real shape
    // is in the cache; clearing it first makes the new shape blink out for one round-trip.
    const editor = this.state.shapeEditor;
    const pending = { type, points, placed: points.length };
    editor.setTool("cursor"); // setTool clears the draft, so it must run before setDraft
    editor.setDraft(pending);
    this.anchorDownScreen = null;
    this.armedForSecondClick = false;
    this.setPan(true);

    try {
      const id = await this.state.source.shape.set({
        type,
        symbol,
        tagIds: [],
        data: { points, text: type === "text" ? "Text" : "" },
        style: newShapeStyle(type, config?.shape?.lastStyle),
        ...bounds,
      });
      editor.setSelectedId(id, true);
    } catch (err) {
      console.error("ShapeEventController: failed to save shape:", err);
    } finally {
      if (editor.draft === pending) editor.setDraft(null); // user may have started another draft meanwhile
    }
  }

  // =========================================================================
  // EDIT MODE — SELECTION, HOVER, DRAG (§6.1)
  // =========================================================================

  private handleEditMouseDown(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (!this.state || !this.chart) return;
    const converter = this.chart.viewport.converter;
    const canvasSize = this.chart.event.getCanvasSize();
    const pos = this.getMousePos(e);
    const editor = this.state.shapeEditor;
    const handleRadius = (this.state.config.get()?.style?.shapeEditor?.size ?? 10) / 2;

    const hit = hitTestShapes(this.getShapesList(), pos, converter, canvasSize, editor.selectedId, handleRadius, this.fontAtlas);

    if (!hit) {
      editor.setSelectedId(null);
      return; // Pan stays enabled; nothing was hit.
    }

    editor.setSelectedId(hit.id);
    this.setPan(false);

    const shape = this.state.source.shape.get(hit.id) as TypedShape;
    if (shape.data.locked) return;

    const startWorld = converter.screenToWorld(pos.x, pos.y) ?? { ts: 0, price: 0 };

    const dragging: Dragging = {
      id: hit.id,
      shape: JSON.parse(JSON.stringify(shape)),
      target: hit.target,
      startWorld: { ts: startWorld.ts, price: startWorld.price },
      startPoints: JSON.parse(JSON.stringify(shape.data.points)),
    };
    editor.setDragging(dragging);
  }

  private handleHoverMouseMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (!this.state || !this.chart) return;
    const converter = this.chart.viewport.converter;
    const canvasSize = this.chart.event.getCanvasSize();
    const pos = this.getMousePos(e);
    const editor = this.state.shapeEditor;
    const handleRadius = (this.state.config.get()?.style?.shapeEditor?.size ?? 10) / 2;

    if (!this.canUseTools()) {
      editor.setHovered(null, null);
      this.chart.event.setCursor("default");
      return;
    }

    const hit = hitTestShapes(this.getShapesList(), pos, converter, canvasSize, editor.selectedId, handleRadius, this.fontAtlas);

    if (!hit) {
      editor.setHovered(null, null);
      this.chart.event.setCursor("default");
      return;
    }

    if (hit.target.kind === "handle") {
      editor.setHovered(hit.id, hit.target.index);
      const shape = this.state.source.shape.get(hit.id) as TypedShape;
      this.chart.event.setCursor(shape.data.locked ? "not-allowed" : "grab");
      return;
    }

    editor.setHovered(hit.id, null);
    this.chart.event.setCursor(hit.id === editor.selectedId ? "move" : "pointer");
  }

  private handleDragMouseMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    if (!this.state || !this.chart) return;
    const editor = this.state.shapeEditor;
    const dragging = editor.dragging;
    if (!dragging) return;

    const converter = this.chart.viewport.converter;
    const pos = this.getMousePos(e);
    const type = dragging.shape.type;

    if (dragging.target.kind === "handle") {
      const world = this.getWorldAt(e);
      if (!world) return;
      let constrained: ShapePoint[];
      if (type === "rectangle") {
        constrained = moveRectHandle(dragging.startPoints, dragging.target.index, world);
      } else {
        const points = [...dragging.startPoints];
        points[dragging.target.index] = world;
        constrained = constrainPoints(type, points, dragging.target.index);
      }
      dragging.shape = { ...dragging.shape, data: { ...dragging.shape.data, points: constrained } };
    } else {
      const current = converter.screenToWorld(pos.x, pos.y);
      if (!current) return;
      const dTs = current.ts - dragging.startWorld.ts;
      const dPrice = current.price - dragging.startWorld.price;
      const points = dragging.startPoints.map((p) => ({ ts: p.ts + dTs, price: p.price + dPrice }));
      dragging.shape = { ...dragging.shape, data: { ...dragging.shape.data, points } };
    }

    editor.setDragging({ ...dragging });
  }

  private handleDragMouseUp(): void {
    if (!this.state) return;
    const editor = this.state.shapeEditor;
    const dragging = editor.dragging;
    this.setPan(true);
    if (!dragging) return;

    editor.setDragging(null);
    if (JSON.stringify(dragging.shape.data.points) === JSON.stringify(dragging.startPoints)) return;

    const bounds = shapeTimeBounds(dragging.shape.type, dragging.shape.data.points);
    const updated: TypedShape = { ...dragging.shape, ...bounds };

    this.state.source.shape.set(updated).catch((err) => {
      console.error("ShapeEventController: failed to save dragged shape:", err);
    });
  }
}
