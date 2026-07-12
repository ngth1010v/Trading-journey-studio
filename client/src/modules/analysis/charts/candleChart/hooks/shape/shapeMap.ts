import TrendlineIcon from "../../../../../../assets/icons/shapes/line-segment.svg?react"
import HorizontalTrendlineIcon from "../../../../../../assets/icons/shapes/horizontal-line-segment.svg?react"
import VerticalTrendlineIcon from "../../../../../../assets/icons/shapes/vertical-line-segment.svg?react"
import RectangleIcon from "../../../../../../assets/icons/shapes/bounding-box.svg?react"



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

        styles: {
            color: "rgba",
            thickness: "number,>=0",
        },

        defaultStyle: {
            color: [255,255,255,255],
            thickness: 2,
        },


        render: [
            {type: "line",pos: ["t0 p0", "t1 p1"],style: {color: "style.color",thickness: "style.thickness"}},
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

    // HORIZONTAL TRENDLINE
    horizontalTrendline: {
        name: "Horizontal trendline",
        icon: HorizontalTrendlineIcon,

        data: {
            t0: "timestamp",
            p0: "price",
            t1: "timestamp",
            te1: "text"
        },

        styles: {
            color: "rgba",
            thickness: "number,>=0",
            text : {
                color: "rgb",
                size: "number,>=0",
                alignX: "string,='left'|'center'|'right'",
                alignY: "string,='top'|'center'|'bottom'",
            },
        },

        defaultStyle: {
            color: [255,255,255,255],
            thickness: 2,
            text : {
                color: [255,255,255],
                size: 15,
                alignX: "center",
                alignY: "center",
            },
        },


        render: [
            {type: "line",pos: ["t0 p0", "t1 p0"],style: {color: "style.color",thickness: "style.thickness"}},

            {type: "text", pos: ["min(t0,t1) p0"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'top'"   }, condition: "style.text.alignX=='left'   && style.text.alignY=='top'"},
            {type: "text", pos: ["(t0+t1)/2 p0"] , data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'center'" , alignY: "'top'"   }, condition: "style.text.alignX=='center' && style.text.alignY=='top'"},
            {type: "text", pos: ["max(t0,t1) p0"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'top'"   }, condition: "style.text.alignX=='right'  && style.text.alignY=='top'"},

            {type: "text", pos: ["min(t0,t1) p0"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'center'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='center'"},
            {type: "text", pos: ["max(t0,t1) p0"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'center'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='center'"},

            {type: "text", pos: ["min(t0,t1) p0"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'bottom'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='bottom'"},
            {type: "text", pos: ["(t0+t1)/2 p0"] , data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'center'" , alignY: "'bottom'"}, condition: "style.text.alignX=='center' && style.text.alignY=='bottom'"},
            {type: "text", pos: ["max(t0,t1) p0"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'bottom'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='bottom'"},        
        ],

        editPoints: {
            create: {
                "t0 p0": "t0 p0",
                "t1 p1": "t1",
            },

            edit: {
                "t0 p0"         : "t0",
                "(t0+t1)/2 p0"  : "p0",
                "t1 p0"         : "t1",
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
            te1: "text"
        },

        styles: {
            color: "rgba",
            thickness: "number,>=0",
            text : {
                color: "rgb",
                size: "number,>=0",
                alignX: "string,='left'|'center'|'right'",
                alignY: "string,='top'|'center'|'bottom'",
            },
        },

        defaultStyle: {
            color: [255,255,255,255],
            thickness: 2,
            text : {
                color: [255,255,255],
                size: 15,
                alignX: "center",
                alignY: "center",
            },
        },


        render: [
            {type: "line", pos: ["t0 p0", "t0 p1"], style: {color: "style.color", thickness: "style.thickness"}},

            {type: "text", pos: ["t0 max(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'top'"   }, condition: "style.text.alignX=='left'   && style.text.alignY=='top'"},
            {type: "text", pos: ["t0 max(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'center'" , alignY: "'top'"   }, condition: "style.text.alignX=='center' && style.text.alignY=='top'"},
            {type: "text", pos: ["t0 max(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'top'"   }, condition: "style.text.alignX=='right'  && style.text.alignY=='top'"},

            {type: "text", pos: ["t0 (p0+p1)/2"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'center'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='center'"},
            {type: "text", pos: ["t0 (p0+p1)/2"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'center'" , alignY: "'center'"}, condition: "style.text.alignX=='center' && style.text.alignY=='center'"},
            {type: "text", pos: ["t0 (p0+p1)/2"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'center'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='center'"},

            {type: "text", pos: ["t0 min(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'bottom'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='bottom'"},
            {type: "text", pos: ["t0 min(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'center'" , alignY: "'bottom'"}, condition: "style.text.alignX=='center' && style.text.alignY=='bottom'"},
            {type: "text", pos: ["t0 min(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'bottom'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='bottom'"},
        ],

        editPoints: {
            create: {
                "t0 p0": "t0 p0",
                "t0 p1": "p1",
            },

            edit: {
                "t0 p0"        : "t0 p0",
                "t0 (p0+p1)/2" : "t0",
                "t0 p1"        : "t0 p1",
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
            te1: "text",
        },
        styles      : {
            color : "rgba",
            text : {
                color: "rgb",
                size: "number,>=0",
                alignX: "string,='left'|'center'|'right'",
                alignY: "string,='top'|'center'|'bottom'",
            },
            border: {
                color       : "rgba",
                thickness   : "number,>=0" 
            }
        },
        defaultStyle: {
            color : [255,255,100,10],
            text : {
                color: [255,255,255],
                size: 15,
                alignX: "center",
                alignY: "center",
            },
            border: {
                color       : [255,255,100,255],
                thickness   : 1
            }
        },


        render: [
            {type: "triangle", pos: ["t0 p0", "t1 p0", "t1 p1"], style: {color: "style.color"}},
            {type: "triangle", pos: ["t0 p0", "t1 p1", "t0 p1"], style: {color: "style.color"}},

            {type: "line", pos: ["t0 p0", "t1 p0"], style: {color: "style.border.color", thickness: "style.border.thickness"}},
            {type: "line", pos: ["t1 p0", "t1 p1"], style: {color: "style.border.color", thickness: "style.border.thickness"}},
            {type: "line", pos: ["t0 p1", "t1 p1"], style: {color: "style.border.color", thickness: "style.border.thickness"}},
            {type: "line", pos: ["t0 p0", "t0 p1"], style: {color: "style.border.color", thickness: "style.border.thickness"}},

            {type: "text", pos: ["min(t0,t1) max(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'top'"   }, condition: "style.text.alignX=='left'   && style.text.alignY=='top'"},
            {type: "text", pos: ["(t0+t1)/2 max(p0,p1)"] , data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'center'" , alignY: "'top'"   }, condition: "style.text.alignX=='center' && style.text.alignY=='top'"},
            {type: "text", pos: ["max(t0,t1) max(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'top'"   }, condition: "style.text.alignX=='right'  && style.text.alignY=='top'"},

            {type: "text", pos: ["min(t0,t1) (p0+p1)/2"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'center'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='center'"},
            {type: "text", pos: ["(t0+t1)/2 (p0+p1)/2"] , data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'center'" , alignY: "'center'"}, condition: "style.text.alignX=='center' && style.text.alignY=='center'"},
            {type: "text", pos: ["max(t0,t1) (p0+p1)/2"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'center'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='center'"},

            {type: "text", pos: ["min(t0,t1) min(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'right'"  , alignY: "'bottom'"}, condition: "style.text.alignX=='left'   && style.text.alignY=='bottom'"},
            {type: "text", pos: ["(t0+t1)/2 min(p0,p1)"] , data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'center'" , alignY: "'bottom'"}, condition: "style.text.alignX=='center' && style.text.alignY=='bottom'"},
            {type: "text", pos: ["max(t0,t1) min(p0,p1)"], data: {text: "te1"}, style: {color: "style.text.color", size: "style.text.size", alignX: "'left'"   , alignY: "'bottom'"}, condition: "style.text.alignX=='right'  && style.text.alignY=='bottom'"},        
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
        name: "Line",
        icon: TrendlineIcon,
        shapes: ["trendline","verticalTrendline","horizontalTrendline"]
    },
    {
        name: "Other shapes",
        icon: RectangleIcon,
        shapes: ["rectangle"]
    }
]