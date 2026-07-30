import { Trade, TradeTag, TradeStyle } from "./trade.model.js";

export function validateTrade(trade: any): string | null {
  if (!trade) return "Missing trade body";
  if (trade.type !== "long" && trade.type !== "short") return "Invalid type";
  if (typeof trade.symbol !== "string" || !trade.symbol) return "Invalid symbol";
  if (typeof trade.strategyId !== "number") return "Invalid strategyId";
  if (!Array.isArray(trade.tagIds)) return "Invalid tagIds array";
  
  const d = trade.data;
  if (!d) return "Missing subfield: data";
  if (typeof d.openTimestamp !== "number" || typeof d.closeTimestamp !== "number" ||
      typeof d.openPrice !== "number" || typeof d.closePrice !== "number" ||
      typeof d.stopLossPrice !== "number" || typeof d.takeProfitPrice !== "number" ||
      typeof d.volume !== "number") {
    return "Invalid subfields inside data object";
  }
  return null;
}

export function validateTag(tag: any): string | null {
  if (!tag || typeof tag.name !== "string" || !tag.name || typeof tag.desc !== "string") {
    return "Invalid name or description";
  }
  const c = tag.color;
  if (!c || !Array.isArray(c.font) || !Array.isArray(c.background) || !Array.isArray(c.border)) {
    return "Invalid color configuration properties";
  }
  return null;
}

export function validateStyle(style: any): string | null {
  if (!style || !style.profit || !style.loss || !style.text) return "Missing basic style groups";
  const t = style.text;
  if (typeof t.profitLossSize !== "number" || typeof t.rrSize !== "number" ||
      !["left", "right"].includes(t.alignX) || !["top", "bottom"].includes(t.alignY)) {
    return "Invalid style structural metadata configurations";
  }
  return null;
}