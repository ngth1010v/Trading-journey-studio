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
    if (!Array.isArray(body.tagIds) || !body.tagIds.every((id: any) => typeof id === "string")) return "tagIds must be an array of strings";
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
    if (typeof body.createdTimestamp !== "number") return "Invalid or missing fields: createdTimestamp";
    
    if (!body.color || !this.isValidRGB(body.color.font) || !this.isValidRGBA(body.color.background) || !this.isValidRGBA(body.color.border)) {
      return "Missing or invalid Color arrays (font must be RGB, backgrounds/borders must be RGBA).";
    }

    return null;
  }
}