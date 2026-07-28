// shape/shape.route.data.ts
import { Router, Request, Response, NextFunction } from "express";
import { ShapeRepository } from "./shape.repository.js";
import { strategyDbManager } from "./shape.service.js";

const router = Router({ mergeParams: true });
const BASE = "/api/chartData/candleChart/shapes"

// Custom safe AST-based Boolean parser for the query engine
function parseFilterToSql(filterStr: string): { sql: string; params: any[] } {
  let index = 0;
  const params: any[] = [];

  function peek() { return filterStr[index]; }
  function consume() { return filterStr[index++]; }
  
  function skipWhitespace() {
    while (index < filterStr.length && /\s/.test(filterStr[index])) {
      index++;
    }
  }

  function parseExpression(): string {
    let node = parseTerm();
    skipWhitespace();
    while (peek() === "|") {
      consume(); // consume '|'
      const right = parseTerm();
      node = `(${node} OR ${right})`;
      skipWhitespace();
    }
    return node;
  }

  function parseTerm(): string {
    let node = parseFactor();
    skipWhitespace();
    while (peek() === "&") {
      consume(); // consume '&'
      const right = parseFactor();
      node = `(${node} AND ${right})`;
      skipWhitespace();
    }
    return node;
  }

  function parseFactor(): string {
    skipWhitespace();
    if (peek() === "!") {
      consume(); // consume '!'
      const factor = parseFactor();
      return `(NOT ${factor})`;
    }
    if (peek() === "(") {
      consume(); // consume '('
      const expr = parseExpression();
      skipWhitespace();
      if (peek() === ")") {
        consume(); // consume ')'
      } else {
        throw new Error("Mismatched parentheses");
      }
      return expr;
    }
    if (peek() === '"') {
      return parseCondition();
    }
    throw new Error(`Unexpected token structural layout at position ${index}`);
  }

  function parseCondition(): string {
    consume(); // consume structural opening double-quote
    let content = "";
    while (index < filterStr.length && peek() !== '"') {
      content += consume();
    }
    if (peek() === '"') {
      consume(); // consume closing double-quote
    } else {
      throw new Error("Unclosed condition quote sequence string");
    }

    // Match conditions like: key=value, key>value, key<value
    const match = content.match(/^([a-zA-Z]+)(=|>|<)(.*)$/);
    if (!match) throw new Error(`Invalid criteria formatting framework inside condition: ${content}`);
    
    const [_, key, operator, valueRaw] = match;
    let value = valueRaw.trim();
    
    // Strip surrounding single quotes if present
    if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }

    const validKeys = ["symbol", "type", "tagId", "fromTs", "toTs"];
    if (!validKeys.includes(key)) throw new Error(`Invalid element search selector parameter: ${key}`);

    if (key === "tagId") {
      if (operator !== "=") throw new Error("TagId only supports equal matching queries");
      params.push(Number(value));
      return `EXISTS (SELECT 1 FROM json_each(shapes.tagIds) WHERE json_each.value = ?)`;
    }

    if (key === "fromTs" || key === "toTs") {
      if (operator !== ">" && operator !== "<" && operator !== "=") {
        throw new Error("Timestamp evaluation allows algebraic dynamic values");
      }
      params.push(Number(value));
      return `${key} ${operator} ?`;
    }

    if (operator !== "=") throw new Error(`String literals can only support equal verification paths: ${key}`);
    params.push(value);
    return `${key} = ?`;
  }

  const generatedSql = parseExpression();
  skipWhitespace();
  if (index < filterStr.length) {
    throw new Error("Malformed logic tokens structural flow syntax");
  }
  return { sql: generatedSql, params };
}

// GET shapes with custom boolean string filter parsing
router.get(`${BASE}/:strategyId`, (req: Request, res: Response, next: NextFunction): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const filterStr = req.query.filter as string;

  try {
    if (!filterStr || filterStr.trim() === "") {
      const shapes = ShapeRepository.getAllShapes(strategyId);
      return res.json(shapes);
    }
    const { sql, params } = parseFilterToSql(filterStr.trim());
    const shapes = ShapeRepository.getAllShapes(strategyId, sql, params);
    return res.json(shapes);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Invalid logical evaluation expression syntax parameters" });
  }
});

// GET strategy lastChange timestamp tracker status
router.get(`${BASE}/:strategyId/lastChange`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const lastChangeTimestamp = strategyDbManager.getLastChange(strategyId);
  return res.json({ lastChangeTimestamp });
});

// POST save single shape mutation payload sequence
router.post(`${BASE}/:strategyId`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  if (isNaN(strategyId)) return res.status(400).json({ error: "Invalid strategy ID" });

  const { id, type, symbol, tagIds, fromTs, toTs, data, style } = req.body;

  if (!type || !symbol || !Array.isArray(tagIds) || fromTs === undefined || toTs === undefined || data === undefined || style === undefined) {
    return res.status(400).json({ error: "Missing required properties from request payload context" });
  }

  if (id !== undefined && id !== null) {
    const existing = ShapeRepository.getShapeById(strategyId, id);
    if (!existing) {
      return res.status(404).json({ error: "Target shape record entity reference id not found" });
    }
  }

  const generatedId = ShapeRepository.saveShape(strategyId, { id, type, symbol, tagIds, fromTs, toTs, data, style });
  strategyDbManager.updateLastChange(strategyId);
  
  return res.json({ id: generatedId });
});

// DELETE shape record tracking entry context instance
router.delete(`${BASE}/:strategyId/:id`, (req: Request, res: Response): any => {
  const strategyId = Number(req.params.strategyId);
  const targetId = Number(req.params.id);

  if (isNaN(strategyId) || isNaN(targetId)) return res.status(400).json({ error: "Invalid target dynamic ID" });

  const deleted = ShapeRepository.deleteShape(strategyId, targetId);
  if (!deleted) return res.status(404).json({ error: "Target structural context identifier reference was not resolved" });
  strategyDbManager.updateLastChange(strategyId);

  return res.json({ success: true });
});

export const shapeDataRouter = router;