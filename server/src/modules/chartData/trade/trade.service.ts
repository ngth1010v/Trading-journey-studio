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

/**
 * Custom Filter Parser Transpiler
 * Updated to match against "tagId" for search logic while querying the "tagIds" column
 */
export function parseFilterToSql(filterStr: string): { sql: string; params: any[] } {
  let index = 0;
  const params: any[] = [];
  const allowedKeys = [
    "id", "type", "symbol", "strategyId", "tagId",
    "data.openTimestamp", "data.closeTimestamp", "data.openPrice", 
    "data.closePrice", "data.stopLossPrice", "data.takeProfitPrice", "data.volume"
  ];

  function peek() { return filterStr[index]; }
  const consume = () => filterStr[index++];

  function skipWhitespace() {
    while (index < filterStr.length && /\s/.test(peek())) { index++; }
  }

  function parseExpression(): string {
    skipWhitespace();
    let left = parseTerm();
    skipWhitespace();
    while (peek() === '|') {
      consume();
      const right = parseTerm();
      left = `(${left} OR ${right})`;
      skipWhitespace();
    }
    return left;
  }

  function parseTerm(): string {
    skipWhitespace();
    let left = parseFactor();
    skipWhitespace();
    while (peek() === '&') {
      consume();
      const right = parseFactor();
      left = `(${left} AND ${right})`;
      skipWhitespace();
    }
    return left;
  }

  function parseFactor(): string {
    skipWhitespace();
    if (peek() === '!') {
      consume();
      const sub = parseFactor();
      return `(NOT ${sub})`;
    }
    if (peek() === '(') {
      consume();
      const sub = parseExpression();
      skipWhitespace();
      if (consume() !== ')') throw new Error("Mismatched parenthesis");
      return sub;
    }
    if (peek() === '"') {
      return parseConditionClause();
    }
    throw new Error(`Unexpected character token: ${peek()}`);
  }

  function parseConditionClause(): string {
    consume();
    let content = "";
    while (index < filterStr.length && peek() !== '"') {
      content += consume();
    }
    if (consume() !== '"') throw new Error("Unterminated criteria literal string configuration");

    const match = content.match(/^([a-zA-Z0-9_\.]+)\s*=\s*(.*)$/);
    if (!match) throw new Error(`Invalid comparison clause syntax structure: ${content}`);
    
    const [_, field, rawValue] = match;
    if (!allowedKeys.includes(field)) {
      throw new Error(`Invalid search metric parameter exception: ${field}`);
    }

    if (field === "tagId") {
      // Look inside the serialized tagIds JSON text array stored in the database
      params.push(Number(rawValue));
      return `exists(select 1 from json_each(trades.tagIds) where json_each.value = ?)`;
    } else {
      const dbColumn = field.replace(".", "_");
      const parsedVal = isNaN(Number(rawValue)) ? rawValue : Number(rawValue);
      params.push(parsedVal);
      return `trades.${dbColumn} = ?`;
    }
  }

  const generatedSql = parseExpression();
  skipWhitespace();
  if (index < filterStr.length) throw new Error("Trailing unparsed syntactic symbols encountered");
  
  return { sql: generatedSql, params };
}