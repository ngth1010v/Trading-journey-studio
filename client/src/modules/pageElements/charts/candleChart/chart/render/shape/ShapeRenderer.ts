import type StateData from "../../../state/StateData";
import type ChartController from "../../ChartController";
import type { RGBA } from "../../../../../../shared/type";
import { isTypedShape, newShapeStyle, type TypedShape } from "../../../state/source/shape/shapeType";
import { getFontAtlas, type FontAtlas } from "../common/FontAtlas";
import { shapeLines, shapeRectFill, shapeTextGlyphs, handlesOf, type LineInstance, type RectFillInstance, type TextGlyphInstance } from "./shapeGeometry";
import ShapeLineRenderer from "./ShapeLineRenderer";
import ShapeRectRenderer from "./ShapeRectRenderer";
import ShapeTextRenderer from "./ShapeTextRenderer";
import ShapeHandleRenderer, { type HandleStyle } from "./ShapeHandleRenderer";

const DEFAULT_HANDLE_STYLE: HandleStyle = {
  size: 10,
  color: [41, 98, 255, 255],
  borderThickness: 1,
  borderColor: [255, 255, 255, 255],
};

export default class ShapeRenderer {
  private state: StateData | null = null;
  private chart: ChartController | null = null;
  private gl: WebGL2RenderingContext | null = null;

  private lineRenderer = new ShapeLineRenderer();
  private rectRenderer = new ShapeRectRenderer();
  private textRenderer = new ShapeTextRenderer();
  private handleRenderer = new ShapeHandleRenderer();

  private fontAtlas: FontAtlas | null = null;
  private shapes: TypedShape[] = [];

  public init(state: StateData, chart: ChartController): void {
    this.state = state;
    this.chart = chart;
  }

  public setGl(gl: WebGL2RenderingContext): void {
    if (this.gl === gl) return;
    this.gl = gl;
    this.lineRenderer.setGl(gl);
    this.rectRenderer.setGl(gl);
    this.textRenderer.setGl(gl);
    this.handleRenderer.setGl(gl);
    this.loadFontAtlas();
  }

  public destroy(): void {
    this.lineRenderer.destroy();
    this.rectRenderer.destroy();
    this.textRenderer.destroy();
    this.handleRenderer.destroy();
    this.gl = null;
    this.state = null;
    this.chart = null;
    this.fontAtlas = null;
  }

  public updateStyle(): void {
    const config = this.state?.config.get();
    const style = config?.style?.shapeEditor;
    const handleStyle: HandleStyle = style
      ? {
          size: style.size ?? DEFAULT_HANDLE_STYLE.size,
          color: (style.color as RGBA) ?? DEFAULT_HANDLE_STYLE.color,
          borderThickness: style.border?.thickness ?? DEFAULT_HANDLE_STYLE.borderThickness,
          borderColor: (style.border?.color as RGBA) ?? DEFAULT_HANDLE_STYLE.borderColor,
        }
      : DEFAULT_HANDLE_STYLE;
    this.handleRenderer.setStyle(handleStyle);
  }

  /** Rebuilds the draw list: committed shapes (minus the one being dragged, plus its live copy) + draft. */
  public updateData(): void {
    if (!this.state) return;

    const config = this.state.config.get();
    const visible = config?.shape?.visible !== false;

    if (!visible) {
      this.shapes = [];
    } else {
      const editor = this.state.shapeEditor;
      const dragging = editor.dragging;

      let list = this.state.source.shape.getAll().filter(isTypedShape);
      if (dragging) {
        list = list.filter((s) => s.id !== dragging.id);
        list.push(dragging.shape);
      }

      const draft = editor.draft;
      if (draft && draft.points.length > 0) {
        const symbol = config?.symbol ?? "";
        list = [
          ...list,
          {
            id: -1,
            type: draft.type,
            symbol,
            tagIds: [],
            fromTs: 0,
            toTs: 0,
            data: { points: draft.points, text: draft.type === "text" ? "Text" : "" },
            style: newShapeStyle(draft.type, config?.shape?.lastStyle),
          } as TypedShape,
        ];
      }

      this.shapes = list;
    }

    this.rebuildLinesAndRects();
    this.rebuildText();
    this.rebuildHandles();
  }

  public updateTransform(): void {
    const transform = this.state?.viewport.getTransform();
    const canvasSize = this.chart?.event.getCanvasSize();
    if (!transform || !canvasSize) return;

    this.lineRenderer.updateTransform(transform, canvasSize);
    this.rectRenderer.updateTransform(transform, canvasSize);
    this.textRenderer.updateCanvasSize(canvasSize);

    // Text and handles are computed in screen space on the CPU, so they need a rebuild on transform change.
    this.rebuildText();
    this.rebuildHandles();
  }

  public render(): void {
    if (!this.gl) return;
    const canvasSize = this.chart?.event.getCanvasSize();
    if (!canvasSize || canvasSize.w <= 0 || canvasSize.h <= 0) return;

    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.rectRenderer.render();
    this.lineRenderer.render();
    this.textRenderer.render();
    this.handleRenderer.render(canvasSize);
  }

  private rebuildLinesAndRects(): void {
    const converter = this.chart?.viewport.converter;
    if (!converter) return;

    const editor = this.state?.shapeEditor;
    const hoveredId = editor?.hoveredId ?? null;

    const lines: LineInstance[] = [];
    const rects: RectFillInstance[] = [];

    for (const shape of this.shapes) {
      const shapeLinesList = shapeLines(shape, converter);
      if (shape.id === hoveredId) {
        for (const l of shapeLinesList) l.thickness += 1;
      }
      lines.push(...shapeLinesList);

      const rect = shapeRectFill(shape, converter);
      if (rect) rects.push(rect);
    }

    this.lineRenderer.setData(lines);
    this.rectRenderer.setData(rects);
  }

  private rebuildText(): void {
    const converter = this.chart?.viewport.converter;
    const canvasSize = this.chart?.event.getCanvasSize();
    if (!converter || !canvasSize || !this.fontAtlas) return;

    const glyphs: TextGlyphInstance[] = [];
    for (const shape of this.shapes) {
      glyphs.push(...shapeTextGlyphs(shape, this.fontAtlas, converter, canvasSize));
    }
    this.textRenderer.setData(glyphs);
  }

  private rebuildHandles(): void {
    const converter = this.chart?.viewport.converter;
    const editor = this.state?.shapeEditor;
    if (!converter || !editor) return;

    const selected = this.shapes.find((s) => s.id === editor.selectedId);
    if (!selected) {
      this.handleRenderer.setData([]);
      return;
    }

    const handles = handlesOf(selected, converter);
    this.handleRenderer.setData(handles.map((h) => ({ x: h.x, y: h.y })));
  }

  private async loadFontAtlas(): Promise<void> {
    if (!this.gl) return;
    try {
      const atlas = await getFontAtlas(this.gl);
      this.fontAtlas = atlas;
      this.textRenderer.setFontTexture(atlas.texture);
      this.rebuildText();
      this.chart?.loop.mark("shape");
    } catch (e) {
      console.error("ShapeRenderer: failed loading font atlas:", e);
    }
  }
}
