import type { DirtyKey, Frame } from "../loop/GameLoop";
import type Renderer from "./Renderer";

//======================================================================================================
// Render layer registry. To add a visual layer: add one entry with an `order` (lower = drawn first).
// `prepare` refreshes GPU data for the dirty keys it cares about; `render` issues draw calls only.
//======================================================================================================

export interface Layer {
  name: string;
  order: number;
  prepare(frame: Frame): void;
  render(): void;
}

const has = (frame: Frame, ...keys: DirtyKey[]): boolean => keys.some((k) => frame.dirty.has(k));

export function createLayers(r: Renderer): Layer[] {
  const layers: Layer[] = [
    {
      name: "link.viewport",
      order: 10,
      prepare: (f) => {
        if (has(f, "link.viewport")) r.sync.link.viewport.updateDataAndStyle();
      },
      render: () => r.sync.link.viewport.render(),
    },
    {
      name: "season",
      order: 20,
      prepare: (f) => {
        if (has(f, "season.style")) r.season.updateStyle();
        if (has(f, "season.data", "season.style", "size")) r.season.updateData();
        if (has(f, "transform")) r.season.updateTransform();
      },
      render: () => r.season.render(),
    },
    {
      name: "candle",
      order: 30,
      prepare: (f) => {
        if (has(f, "candle.style")) r.candle.updateStyle();
        if (has(f, "candle.closed", "size")) r.candle.closed.updateData();
        if (has(f, "candle.opening", "size")) r.candle.opening.updateData();
        if (has(f, "transform")) r.candle.updateTransform();
      },
      render: () => r.candle.render(),
    },
    {
      name: "trade",
      order: 40,
      prepare: (f) => {
        if (has(f, "trade.style")) r.trade.updateStyle();
        if (has(f, "trade", "size")) r.trade.updateData();
        if (has(f, "transform", "size")) r.trade.updateTransform();
      },
      // Selected trade layer is intentionally not drawn yet (was commented out before the loop rework)
      render: () => r.trade.unselected.render(),
    },
    {
      name: "shape",
      order: 45,
      prepare: (f) => {
        if (has(f, "shape.style")) r.shape.updateStyle();
        if (has(f, "shape", "shape.editor", "size")) r.shape.updateData();
        if (has(f, "transform", "size")) r.shape.updateTransform();
      },
      render: () => r.shape.render(),
    },
    {
      name: "crosshair",
      order: 50,
      prepare: (f) => {
        if (has(f, "crosshair.style")) r.crosshair.updateStyle();
        if (has(f, "crosshair", "crosshair.style")) r.crosshair.updateData();
      },
      render: () => r.crosshair.render(),
    },
    {
      name: "link.crosshair",
      order: 60,
      prepare: (f) => {
        if (has(f, "link.crosshair.style")) r.sync.link.crosshair.updateStyle();
        if (has(f, "link.crosshair", "link.crosshair.style")) r.sync.link.crosshair.updateData();
      },
      render: () => r.sync.link.crosshair.render(),
    },
  ];

  return layers.sort((a, b) => a.order - b.order);
}
