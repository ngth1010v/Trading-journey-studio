import TrendlineIcon            from "../../../../../assets/icons/shapes/line-segment.svg?react"
import HorizontalTrendlineIcon  from "../../../../../assets/icons/shapes/horizontal-line-segment.svg?react"
import VerticalTrendlineIcon    from "../../../../../assets/icons/shapes/vertical-line-segment.svg?react"
import RectangleIcon            from "../../../../../assets/icons/shapes/bounding-box.svg?react"

import type { RGB, RGBA } from "../../../../../shared/types/color.type"


export const SHAPE_MAP = {

    // TRENDLINE
    trendline: {
        name: "Trendline",
        icon: TrendlineIcon,

        data: {
            t0: "timestamp",
            p0: "price",
            t1: "timestamp",
            p1: "price",
        },

        style: {
            color: "rgba",
            thickness: "uNumber",
        },

        defaultStyle: {
            color: [255,255,255,255] as RGBA,
            thickness: 2,
        },

        render: [
            {type: "line", data: {timestamp1: "t0", timestamp2: "t1", price1: "p0", price2: "p1", color: "style.color", thickness: "style.thickness"}},
        ],

        editPoints: {
            create: {
                "t0 p0": "t0 p0",
                "t1 p1": "t1 p1",
            },

            edit: {
                "t0 p0": "t0 p0",
                "t1 p1": "t1 p1",
            },
        },
    },

    // VERTICAL TRENDLINE
    verticalTrendline: {
        name: "Vertical trendline",
        icon: VerticalTrendlineIcon,

        data: {
            t0: "timestamp",
            p0: "price",
            p1: "price",
        },
        
        style: {
            te: "text",
            color: "rgba",
            thickness: "uNumber",
            text : {
                color: "rgb",
                size: "uNumber",
                alignX: "positionX",
                alignY: "positionY",
            },
        },

        defaultStyle: {
            te: " ",
            color: [255,255,255,255] as RGBA,
            thickness: 2,
            text : {
                color: [255,255,255] as RGB,
                size: 15,
                alignX: "center",
                alignY: "center",
            },
        },

        render: [
            {type: "line", data: {timestamp1: "t0", timestamp2: "t0", price1: "p0", price2: "p1", color: "style.color", thickness: "style.thickness"}},

            {type: "text", data: {timestamp: "t0", price: "max(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'top'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='top'"},
            {type: "text", data: {timestamp: "t0", price: "max(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'top'"}, condition: "style.text.alignX=='center' && style.text.alignY=='top'"},
            {type: "text", data: {timestamp: "t0", price: "max(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'top'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='top'"},

            {type: "text", data: {timestamp: "t0", price: "(p0+p1)/2", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'center'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='center'"},
            {type: "text", data: {timestamp: "t0", price: "(p0+p1)/2", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'center'"}, condition: "style.text.alignX=='center' && style.text.alignY=='center'"},
            {type: "text", data: {timestamp: "t0", price: "(p0+p1)/2", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'center'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='center'"},

            {type: "text", data: {timestamp: "t0", price: "min(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'bottom'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='bottom'"},
            {type: "text", data: {timestamp: "t0", price: "min(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'bottom'"}, condition: "style.text.alignX=='center' && style.text.alignY=='bottom'"},
            {type: "text", data: {timestamp: "t0", price: "min(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'bottom'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='bottom'"},
        ],

        editPoints: {
            create: {
                "t0 p0": "t0 p0",
                "t0 p1": "p1",
            },

            edit: {
                "t0 p0"        : "p0",
                "t0 (p0+p1)/2" : "t0",
                "t0 p1"        : "p1",
            },
        },
    },

    // HORIZONTAL TRENDLINE
    horizontalTrendline: {
        name: "Horizontal trendline",
        icon: HorizontalTrendlineIcon,

        data: {
            t0: "timestamp",
            t1: "timestamp",
            p0: "price",
        },
        
        style: {
            te: "text",
            color: "rgba",
            thickness: "uNumber",
            text : {
                color: "rgb",
                size: "uNumber",
                alignX: "positionX",
                alignY: "positionY",
            },
        },

        defaultStyle: {
            te: " ",
            color: [255,255,255,255] as RGBA,
            thickness: 2,
            text : {
                color: [255,255,255] as RGB,
                size: 15,
                alignX: "center",
                alignY: "center",
            },
        },

        render: [
            {type: "line", data: {timestamp1: "t0", timestamp2: "t1", price1: "p0", price2: "p0", color: "style.color", thickness: "style.thickness"}},

            {type: "text", data: {timestamp: "min(t0,t1)", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'top'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='top'"},
            {type: "text", data: {timestamp: "(t0+t1)/2", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'top'"}, condition: "style.text.alignX=='center' && style.text.alignY=='top'"},
            {type: "text", data: {timestamp: "max(t0,t1)", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'top'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='top'"},
            
            {type: "text", data: {timestamp: "min(t0,t1)", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'center'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='center'"},
            {type: "text", data: {timestamp: "(t0+t1)/2", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'center'"}, condition: "style.text.alignX=='center' && style.text.alignY=='center'"},
            {type: "text", data: {timestamp: "max(t0,t1)", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'center'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='center'"},

            {type: "text", data: {timestamp: "min(t0,t1)", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'bottom'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='bottom'"},
            {type: "text", data: {timestamp: "(t0+t1)/2", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'bottom'"}, condition: "style.text.alignX=='center' && style.text.alignY=='bottom'"},
            {type: "text", data: {timestamp: "max(t0,t1)", price: "p0", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'bottom'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='bottom'"},
        ],

        editPoints: {
            create: {
                "t0 p0": "t0 p0",
                "t1 p0": "t1",
            },

            edit: {
                "t0 p0"        : "t0",
                "(t0+t1)/2 p0" : "p0",
                "t1 p0"        : "t1",
            },
        },
    },

    // RECTANGLE
    rectangle: {
        name: "Rectangle",
        icon: RectangleIcon,

        data        : {
            t0: "timestamp",
            p0: "price",
            t1: "timestamp",
            p1: "price",
        },
        style      : {
            te: "text",
            color : "rgba",
            text : {
                color: "rgb",
                size: "uNumber",
                alignX: "positionX",
                alignY: "positionY",
            },
            border: {
                color       : "rgba",
                thickness   : "uNumber" 
            }
        },
        defaultStyle: {
            te: " ",
            color : [255,255,100,10] as RGBA,
            text : {
                color: [255,255,255] as RGB,
                size: 15,
                alignX: "center",
                alignY: "center",
            },
            border: {
                color       : [255,255,100,255] as RGBA,
                thickness   : 1
            }
        },

        render: [
            {type: "triangle", data: {timestamp: ["t0", "t1", "t1"], price: ["p0", "p0", "p1"], color: "style.color"}},
            {type: "triangle", data: {timestamp: ["t0", "t1", "t0"], price: ["p0", "p1", "p1"], color: "style.color"}},

            {type: "line", data: {timestamp1: "t0", timestamp2: "t1", price1: "p0", price2: "p0", color: "style.border.color", thickness: "style.border.thickness"}},
            {type: "line", data: {timestamp1: "t1", timestamp2: "t1", price1: "p0", price2: "p1", color: "style.border.color", thickness: "style.border.thickness"}},
            {type: "line", data: {timestamp1: "t1", timestamp2: "t0", price1: "p1", price2: "p1", color: "style.border.color", thickness: "style.border.thickness"}},
            {type: "line", data: {timestamp1: "t0", timestamp2: "t0", price1: "p1", price2: "p0", color: "style.border.color", thickness: "style.border.thickness"}},

            {type: "text", data: {timestamp: "min(t0,t1)", price: "max(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'top'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='top'"},
            {type: "text", data: {timestamp: "(t0+t1)/2", price: "max(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'top'"}, condition: "style.text.alignX=='center' && style.text.alignY=='top'"},
            {type: "text", data: {timestamp: "max(t0,t1)", price: "max(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'top'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='top'"},

            {type: "text", data: {timestamp: "min(t0,t1)", price: "(p0+p1)/2", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'center'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='center'"},
            {type: "text", data: {timestamp: "(t0+t1)/2", price: "(p0+p1)/2", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'center'"}, condition: "style.text.alignX=='center' && style.text.alignY=='center'"},
            {type: "text", data: {timestamp: "max(t0,t1)", price: "(p0+p1)/2", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'center'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='center'"},

            {type: "text", data: {timestamp: "min(t0,t1)", price: "min(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'right'", alignY: "'bottom'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='bottom'"},
            {type: "text", data: {timestamp: "(t0+t1)/2", price: "min(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'center'", alignY: "'bottom'"}, condition: "style.text.alignX=='center' && style.text.alignY=='bottom'"},
            {type: "text", data: {timestamp: "max(t0,t1)", price: "min(p0,p1)", text: "style.te", color: "style.text.color", size: "style.text.size", alignX: "'left'", alignY: "'bottom'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='bottom'"},        
        ],        
        editPoints  : {
            create: {
                "t0 p0": "t0 p0", 
                "t1 p1": "t1 p1",
            },
            edit  : {
                "t0 p0": "t0 p0", 
                "t1 p0": "t1 p0",
                "t1 p1": "t1 p1",
                "t0 p1": "t0 p1",
                "(t0+t1)/2 p0": "p0",
                "t1 (p0+p1)/2": "t1",
                "(t0+t1)/2 p1": "p1",
                "t0 (p0+p1)/2": "t0",
            }
        }
    }
}

export const SHAPE_GROUPS = [
    {
        icon: TrendlineIcon,
        shapes: ["trendline","verticalTrendline", "horizontalTrendline"]
    },
    {
        icon: RectangleIcon,
        shapes: ["rectangle"]
    }
]