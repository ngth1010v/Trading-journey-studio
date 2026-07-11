export const CONFIG = {

    // Candle data
    CANDLE_DATA: {
        CACHE_EXTEND_RATIO: 1, //[..1..,..data-render..,..1..]
    },

    VIEWPORT: {
        AUTO_TRANSFORM_PRICE_RATIO: 0.8
    },

    CANDLE_LAYER: {
        CANDLE_SPACING: 2,
    },

    VIEW_CONTROLLER: {
        CLIENT_EVENT: {
            SCALE_RATIO: 1.1,
            WHEEL_DURATION: 100, //ms 
        }
    },

    AXES: {
        PRICE_SPACING_RATIO: 3,
        TIME_SPACING_RATIO : 1.5
    },

    AXES_CONTROLLER: {
        SCALE_RATIO: 1.5,
    },

    LINES_LAYER: {
        MAX_LINES           : 100000
    },

    TRIANGLE_LAYER: {
        MAX_TRIANGLES       : 100000
    },

    TEXT_LAYER: {
        MAX_TEXTS_CHAR      : 100000
    },

    SHAPES: {
        CACHE_EXTEND_RATIO: 1, //[..1..,..data-render..,..1..]
        TOLERANCE         : 10, //px
        TEXT_PADDING      : 5,  //px
        EDIT_BUTTON: {
            SIZE            : 10,                   //px
            COLOR           : [10,10,20,255],       //rgba 
            BORDER_WIDTH    : 2,                    //px
            BORDER_COLOR    : [200,200,200,255]     //rgba   
        }
    }
}
