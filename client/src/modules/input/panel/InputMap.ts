import React from "react";

import ColorInput from "../single/ColorInput"
import NumberInput from "../single/NumberInput"
import PriceInput from "../single/PriceInput"
import RatioInput from "../single/RatioInput"
import TextInput from "../single/TextInput"
import TimeInput from "../single/TimeInput"
import BooleanInput from "../single/BooleanInput";

export const INPUT_MAP = {

    //==============================================================================
    // RAW
    //==============================================================================
    number: {
        format: "number",
        component: NumberInput,
        props: {}
    },

    boolean: {
        format: "boolean",
        component: BooleanInput,
        props: {}
    },
    
    uNumber: {
        format: "number",
        component: NumberInput,
        props: {
            onTempDataChange: (temp: string, setTemp: React.Dispatch<React.SetStateAction<string>>) => {setTemp(temp.replace('-',''))}
        }
    },
    
    string: {
        format: "string",
        component: TextInput,
        props: {newLine: false, oneLine: true}
    },
    
    //==============================================================================
    // COMPLEX
    //==============================================================================
    
    text: {
        format: "string",
        component: TextInput,
        props: {newLine: true}
    },

    timestamp: {
        format: "number",
        component: TimeInput,
        props: {editMode: "millis", newLine: true} //use component default
    },
    
    price: {
        format: "number",
        component: PriceInput,
        props: {newLine: true} //use component default
    },
    
    rgb: {
        format: "rgb",
        component: ColorInput,
        props: {alpha: false}
    },
    
    rgba: {
        format: "rgba",
        component: ColorInput,
        props: {alpha: true}
    },
    
    positionY: {
        format: "string",
        component: RatioInput,
        props: {options: ["top","center","bottom"]} //use component default
    },
    
    positionX: {
        format: "string",
        component: RatioInput,
        props: {options: ["left","center","right"]} //use component default
    },

    positionXlr: {
        format: "string",
        component: RatioInput,
        props: {options: ["left","right"]} //use component default
    },
    
    status: {
        format: "string",
        component: RatioInput,
        props: {options: ["end","backtest","live"]}
    },

    seasonType: {
        format: "string",
        component: RatioInput,
        props: {options: ["daily", "monthly", "yearly"]}
    },

    lineType: {
        format: "string",
        component: RatioInput,
        props: {options: ["dash", "solid"]}
    },

    shapeLineType: {
        format: "string",
        component: RatioInput,
        props: {options: ["solid", "dash", "dot"]}
    },

    lineAlignX: {
        format: "string",
        component: RatioInput,
        props: {options: ["start", "center", "end"]}
    },

    lineAlignY: {
        format: "string",
        component: RatioInput,
        props: {options: ["above", "on", "below"]}
    },
}