import type { Event } from "../../../../../data/chartData/event/EventData";

export const DEFAULT_EVENT_MAP: Event[] = [
  // Chart transform
  {
    chartType: "chart.CandleChart",
    event: "chartPan",
    input: {
      mouse: ["MouseLeftDown"],
    },
  },
  {
    chartType: "chart.CandleChart",
    event: "chartZoomX",
    input: {
      mouse: ["Wheel"],
      modifiers: { ctrl: true },
    },
  },
  {
    chartType: "chart.CandleChart",
    event: "chartZoomY",
    input: {
      mouse: ["Wheel"],
      modifiers: { alt: true },
    },
  },
  {
    chartType: "chart.CandleChart",
    event: "chartZoom",
    input: {
      mouse: ["Wheel"],
    },
  },
];