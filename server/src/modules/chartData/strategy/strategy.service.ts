import { RGB, RGBA } from "../../../type.js";

export class StrategyService {
  public static isValidRGB(val: any): val is RGB {
    return Array.isArray(val) && val.length === 3 && val.every(n => typeof n === "number");
  }

  public static isValidRGBA(val: any): val is RGBA {
    return Array.isArray(val) && val.length === 4 && val.every(n => typeof n === "number");
  }

  public static validateStrategyPayload(body: any): string | null {
    if (!body.name || typeof body.name !== "string") return "Invalid or missing fields: name";
    if (typeof body.desc !== "string") return "Invalid or missing fields: desc";
    if (!Array.isArray(body.tagIds) || !body.tagIds.every((id: any) => typeof id === "number")) {
      return "tagIds must be an array of numbers";
    }
    if (!Array.isArray(body.seasonIds) || !body.seasonIds.every((id: any) => typeof id === "number")) {
      return "seasonIds must be an array of numbers";
    }
    if (!["live", "end", "backtest"].includes(body.status)) return "status must be either 'live', 'end', or 'backtest'";
    if (typeof body.createdTimestamp !== "number") return "Invalid or missing fields: createdTimestamp";
    
    if (!body.favorite || !Array.isArray(body.favorite.symbols) || !Array.isArray(body.favorite.timeframes)) {
      return "Missing or structurally incorrect favorite schema.";
    }
    
    if (!body.color || !this.isValidRGB(body.color.font) || !this.isValidRGBA(body.color.background) || !this.isValidRGBA(body.color.border)) {
      return "Missing or invalid Color array assignments (font must be RGB, backgrounds/borders must be RGBA).";
    }

    return null;
  }

  public static validateTagPayload(body: any): string | null {
    if (!body.name || typeof body.name !== "string") return "Invalid or missing fields: name";
    if (typeof body.desc !== "string") return "Invalid or missing fields: desc";
    
    if (!body.color || !this.isValidRGB(body.color.font) || !this.isValidRGBA(body.color.background) || !this.isValidRGBA(body.color.border)) {
      return "Missing or invalid Color arrays (font must be RGB, backgrounds/borders must be RGBA).";
    }

    return null;
  }

  public static validateSeasonPayload(body: any): string | null {
    if (!body.name || typeof body.name !== "string") return "Invalid or missing fields: name";
    if (typeof body.desc !== "string") return "Invalid or missing fields: desc";
    if (!["daily", "monthly", "yearly"].includes(body.type)) return "type must be 'daily', 'monthly', or 'yearly'";

    if (!body.style || !this.isValidRGBA(body.style.background)) {
      return "Missing or invalid style.background (must be RGBA)";
    }
    if (!body.style.border || typeof body.style.border.enable !== "boolean" || typeof body.style.border.thickness !== "number" || !this.isValidRGBA(body.style.border.color)) {
      return "Missing or invalid style.border options";
    }
    if (!body.style.text || !body.style.text.startText || !body.style.text.endText) {
      return "Missing style.text configurations";
    }

    const validateTextConfig = (textObj: any) => {
      return (
        typeof textObj.enable === "boolean" &&
        typeof textObj.size === "number" &&
        this.isValidRGB(textObj.color) &&
        textObj.align &&
        ["left", "right"].includes(textObj.align.x) &&
        ["top", "center", "bottom"].includes(textObj.align.y)
      );
    };

    if (!validateTextConfig(body.style.text.startText) || !validateTextConfig(body.style.text.endText)) {
      return "Invalid text configuration inside style.text";
    }

    const validateTimeConfig = (timeObj: any) => {
      if (!timeObj || typeof timeObj.second !== "number" || typeof timeObj.minute !== "number" || typeof timeObj.hour !== "number") {
        return false;
      }
      if (["monthly", "yearly"].includes(body.type) && typeof timeObj.day !== "number") return false;
      if (body.type === "yearly" && typeof timeObj.month !== "number") return false;
      return true;
    };

    if (!validateTimeConfig(body.fromTime) || !validateTimeConfig(body.toTime)) {
      return "Invalid fromTime or toTime schema according to selected season type";
    }

    return null;
  }
}