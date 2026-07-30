import type { Event } from "../../../../../data/chartData/event/EventData"

export const DEFAULT_EVENT_MAP = [

    // Chart transform
    { chartType: "chart.CandleChart", event: "chartPan"         , input: { mouse: ["MouseLeft"] , } },
    { chartType: "chart.CandleChart", event: "chartZoomInX"     , input: { mouse: ["WheelUp"]   , modifiers: { ctrl: true } } },
    { chartType: "chart.CandleChart", event: "chartZoomInY"     , input: { mouse: ["WheelUp"]   , modifiers: { alt: true } } },
    { chartType: "chart.CandleChart", event: "chartZoomIn"      , input: { mouse: ["WheelUp"]   , } },
    { chartType: "chart.CandleChart", event: "chartZoomOutX"    , input: { mouse: ["WheelDown"] , modifiers: { ctrl: true } } },
    { chartType: "chart.CandleChart", event: "chartZoomOutY"    , input: { mouse: ["WheelDown"] , modifiers: { alt: true } } },
    { chartType: "chart.CandleChart", event: "chartZoomOut"     , input: { mouse: ["WheelDown"] , } },

] as Event[]