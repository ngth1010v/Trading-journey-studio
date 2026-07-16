import React from "react";

import ColorInput from "../single/ColorInput"
import NumberInput from "../single/NumberInput"
import PriceInput from "../single/PriceInput"
import RatioInput from "../single/RatioInput"
import TextInput from "../single/TextInput"
import TimeInput from "../single/TimeInput"


export const INPUT_MAP = {

    //==============================================================================
    // RAW
    //==============================================================================
    number: {
        format: "number",
        component: NumberInput,
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
        props: {newLine: false}
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


}