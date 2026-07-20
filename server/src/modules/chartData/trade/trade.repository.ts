import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { Trade, TradeTag, TradeStyle, DefaultTradeStyle } from "./trade.model.js";
import { parseFilterToSql } from "./trade.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "../../../database/chartData/trade.db");

let db: Database.Database;
let lastChangeTimestamp = Date.now();

export const TradeRepository = {
  init() {
    lastChangeTimestamp = Date.now();
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // Table 1: Trades (With flattened data metrics for direct analytical indexing)
    db.prepare(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        symbol TEXT NOT NULL,
        strategyId INTEGER NOT NULL,
        tagIds TEXT NOT NULL,
        data_openTimestamp INTEGER NOT NULL,
        data_closeTimestamp INTEGER NOT NULL,
        data_openPrice REAL NOT NULL,
        data_closePrice REAL NOT NULL,
        data_stopLossPrice REAL NOT NULL,
        data_takeProfitPrice REAL NOT NULL,
        data_volume REAL NOT NULL
      )
    `).run();

    // Table 2: Tags
    db.prepare(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        desc TEXT NOT NULL,
        color TEXT NOT NULL
      )
    `).run();

    // Table 3: Styles
    db.prepare(`
      CREATE TABLE IF NOT EXISTS styles (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        config TEXT NOT NULL
      )
    `).run();

    const checkStyle = db.prepare("SELECT 1 FROM styles WHERE id = 1").get();
    if (!checkStyle) {
      db.prepare("INSERT INTO styles (id, config) VALUES (1, ?)")
        .run(JSON.stringify(DefaultTradeStyle));
    }
  },

  shutdown() {
    if (db) db.close();
  },

  // --- Timestamp Helpers ---
  getLastChangeTimestamp(): number {
    return lastChangeTimestamp;
  },

  refreshLastChangeTimestamp() {
    lastChangeTimestamp = Date.now();
  },

  // --- Trade Operations ---
  getTrades(filterStr?: string): { trades: Trade[] | null; error?: string } {
    try {
      if (!filterStr) {
        const rows = db.prepare("SELECT * FROM trades").all() as any[];
        return { trades: rows.map(mapRowToTrade) };
      }
      const { sql, params } = parseFilterToSql(filterStr);
      const rows = db.prepare(`SELECT * FROM trades WHERE ${sql}`).all(...params) as any[];
      return { trades: rows.map(mapRowToTrade) };
    } catch (err: any) {
      return { trades: null, error: err.message };
    }
  },

  getTradeById(id: number): Trade | null {
    const row = db.prepare("SELECT * FROM trades WHERE id = ?").get(id) as any;
    return row ? mapRowToTrade(row) : null;
  },

  saveTrade(trade: Trade): { id: number } | null {
    const d = trade.data;
    if (trade.id !== undefined) {
      const existing = db.prepare("SELECT 1 FROM trades WHERE id = ?").get(trade.id);
      if (!existing) return null;

      db.prepare(`
        UPDATE trades SET 
          type = ?, symbol = ?, strategyId = ?, tagIds = ?, 
          data_openTimestamp = ?, data_closeTimestamp = ?, data_openPrice = ?, 
          data_closePrice = ?, data_stopLossPrice = ?, data_takeProfitPrice = ?, data_volume = ? 
        WHERE id = ?
      `).run(
        trade.type, trade.symbol, trade.strategyId, JSON.stringify(trade.tagIds),
        d.openTimestamp, d.closeTimestamp, d.openPrice, 
        d.closePrice, d.stopLossPrice, d.takeProfitPrice, d.volume,
        trade.id
      );
      return { id: trade.id };
    } else {
      const info = db.prepare(`
        INSERT INTO trades (
          type, symbol, strategyId, tagIds, 
          data_openTimestamp, data_closeTimestamp, data_openPrice, 
          data_closePrice, data_stopLossPrice, data_takeProfitPrice, data_volume
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        trade.type, trade.symbol, trade.strategyId, JSON.stringify(trade.tagIds),
        d.openTimestamp, d.closeTimestamp, d.openPrice, 
        d.closePrice, d.stopLossPrice, d.takeProfitPrice, d.volume
      );
      return { id: info.lastInsertRowid as number };
    }
  },

  deleteTrade(id: number): boolean {
    const info = db.prepare("DELETE FROM trades WHERE id = ?").run(id);
    return info.changes > 0;
  },

  // --- Tag Operations ---
  getTags(): any[] {
    const rows = db.prepare("SELECT id, name, color FROM tags").all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      color: JSON.parse(r.color)
    }));
  },

  getTagById(id: number): TradeTag | null {
    const row = db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as any;
    return row ? { id: row.id, name: row.name, desc: row.desc, color: JSON.parse(row.color) } : null;
  },

  saveTag(tag: TradeTag): { id: number } | null {
    if (tag.id !== undefined) {
      const existing = db.prepare("SELECT 1 FROM tags WHERE id = ?").get(tag.id);
      if (!existing) return null;

      db.prepare("UPDATE tags SET name = ?, desc = ?, color = ? WHERE id = ?")
        .run(tag.name, tag.desc, JSON.stringify(tag.color), tag.id);
      return { id: tag.id };
    } else {
      const info = db.prepare("INSERT INTO tags (name, desc, color) VALUES (?, ?, ?)")
        .run(tag.name, tag.desc, JSON.stringify(tag.color));
      return { id: info.lastInsertRowid as number };
    }
  },

  deleteTag(id: number): boolean {
    const info = db.prepare("DELETE FROM tags WHERE id = ?").run(id);
    return info.changes > 0;
  },

  // --- Style Operations ---
  getStyle(): TradeStyle {
    const row = db.prepare("SELECT config FROM styles WHERE id = 1").get() as any;
    return JSON.parse(row.config);
  },

  saveStyle(style: TradeStyle) {
    db.prepare("UPDATE styles SET config = ? WHERE id = 1").run(JSON.stringify(style));
  }
};

function mapRowToTrade(row: any): Trade {
  return {
    id: row.id,
    type: row.type,
    symbol: row.symbol,
    strategyId: row.strategyId,
    tagIds: JSON.parse(row.tagIds),
    data: {
      openTimestamp: row.data_openTimestamp,
      closeTimestamp: row.data_closeTimestamp,
      openPrice: row.data_openPrice,
      closePrice: row.data_closePrice,
      stopLossPrice: row.data_stopLossPrice,
      takeProfitPrice: row.data_takeProfitPrice,
      volume: row.data_volume
    }
  };
}