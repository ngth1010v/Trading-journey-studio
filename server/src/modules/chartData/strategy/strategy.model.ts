import { RGB, RGBA } from "../../../type.js";

// NEW
export interface Strategy {
  id?: number;
  name: string;
  desc: string;
  tagIds: number[];
  seasonIds: number[];
  status: "live" | "end" | "backtest";
  createdTimestamp: number;

  favorite: {
    symbols: string[];
    timeframes: string[];
  };
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}

export interface StrategySeason {
  id?:number
  name: string;
  desc: string;
  color: { // save as JSON
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
  style: { // save as JSON
    border: {
      enable: boolean
      thickness: number
    }
    text: {
      startText: {
        enable: boolean
        size: number
        align: {
          x: "left" | "right"
          y: "top" | "center" | "bottom"
        }
      }
      endText: {
        enable: boolean
        size: number
        align: {
          x: "left" | "right"
          y: "top" | "center" | "bottom"
        }
      }
    }
  }
  type: "daily" | "monthly" | "yearly"
  fromTime: { // save as JSON
    second: number
    minute: number
    hour  : number
    day  ?: number // use if type in ["monthly", "yearly"]
    month?: number // use if type = "yearly"
  }
  toTime: { // save as JSON
    second: number
    minute: number
    hour  : number
    day  ?: number // use if type in ["monthly", "yearly"]
    month?: number // use if type = "yearly"
  }
}


// OLD SEASON
// export interface StrategySeason {
//   id?:number
//   name: string;
//   desc: string;
//   style: { // save as JSON
//     background: RGBA;  
//     border: {
//       enable: boolean
//       thickness: number
//       color: RGBA
//     }
//     text: {
//       startText: {
//         enable: boolean
//         size: number
//         color: RGB
//         align: {
//           x: "left" | "right"
//           y: "top" | "center" | "bottom"
//         }
//       }
//       endText: {
//         enable: boolean
//         size: number
//         color: RGB
//         align: {
//           x: "left" | "right"
//           y: "top" | "center" | "bottom"
//         }
//       }
//     }
//   }
//   type: "daily" | "monthly" | "yearly"
//   fromTime: { // save as JSON
//     second: number
//     minute: number
//     hour  : number
//     day  ?: number // use if type in ["monthly", "yearly"]
//     month?: number // use if type = "yearly"
//   }
//   toTime: { // save as JSON
//     second: number
//     minute: number
//     hour  : number
//     day  ?: number // use if type in ["monthly", "yearly"]
//     month?: number // use if type = "yearly"
//   }
// }

export interface StrategyTag {
  id?: number;
  name: string;
  desc: string;
  color: {
    font: RGB;
    background: RGBA;
    border: RGBA;
  };
}

// OLD
// export interface Strategy {
//   id?: number;
//   name: string;
//   desc: string;
//   tagIds: string[];
//   status: "live" | "end" | "backtest";
//   createdTimestamp: number;

//   favorite: {
//     symbols: string[];
//     timeframes: string[];
//   };
//   color: {
//     font: RGB;
//     background: RGBA;
//     border: RGBA;
//   };
// }

// export interface StrategyTag {
//   id?: number;
//   name: string;
//   createdTimestamp: number;
//   desc: string;
//   color: {
//     font: RGB;
//     background: RGBA;
//     border: RGBA;
//   };
// }