import { Link } from "./link.model.js";

export class LinkService {
  /**
   * Validates if the given payload matches the Link structure.
   */
  static isValidLink(payload: any): payload is Link {
    if (!payload || typeof payload !== "object") return false;
    if (typeof payload.name !== "string" || !payload.name.trim()) return false;
    
    const color = payload.color;
    if (!color || typeof color !== "object") return false;

    // Validate RGB font [r, g, b]
    if (!Array.isArray(color.font) || color.font.length !== 3) return false;
    if (color.font.some((c: any) => typeof c !== "number" || c < 0 || c > 255)) return false;

    // Validate RGBA background [r, g, b, a]
    if (!Array.isArray(color.background) || color.background.length !== 4) return false;
    if (color.background.slice(0, 3).some((c: any) => typeof c !== "number" || c < 0 || c > 255)) return false;
    if (typeof color.background[3] !== "number" || color.background[3] < 0 || color.background[3] > 1) return false;

    // Validate RGBA border [r, g, b, a]
    if (!Array.isArray(color.border) || color.border.length !== 4) return false;
    if (color.border.slice(0, 3).some((c: any) => typeof c !== "number" || c < 0 || c > 255)) return false;
    if (typeof color.border[3] !== "number" || color.border[3] < 0 || color.border[3] > 1) return false;

    return true;
  }
}