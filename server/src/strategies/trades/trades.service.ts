import { Trade, TradeTag, TradeTemplate } from './trades.model.js';
import { TradesRepository } from './trades.repository.js';

export class TradesService {

  // --- TRADES ---
  
  public static async getTrades(
    strateryName: string, 
    symbol: string, 
    fromTs: number, 
    toTs: number, 
    lastUpdateTs?: number
  ): Promise<Trade[]> {
    if (strateryName === '*') {
      const strategies = TradesRepository.getAllStrategyNames();
      let allTrades: Trade[] = [];
      for (const strat of strategies) {
        allTrades = allTrades.concat(await this.getTradesForStrategy(strat, symbol, fromTs, toTs, lastUpdateTs));
      }
      return allTrades;
    }
    return this.getTradesForStrategy(strateryName, symbol, fromTs, toTs, lastUpdateTs);
  }

  private static async getTradesForStrategy(
    strateryName: string, symbol: string, fromTs: number, toTs: number, lastUpdateTs?: number
  ): Promise<Trade[]> {
    const db = TradesRepository.getConnection(strateryName);
    
    let query = `SELECT * FROM trades WHERE openTimestamp <= ? AND closeTimestamp >= ?`;
    const params: any[] = [toTs, fromTs];

    if (symbol !== '*') {
      query += ` AND symbol = ?`;
      params.push(symbol);
    }
    if (lastUpdateTs !== undefined && !isNaN(lastUpdateTs)) {
      query += ` AND lastModifyTimestamp >= ?`;
      params.push(lastUpdateTs);
    }

    const rows = db.prepare(query).all(...params);
    return rows.map((row: any) => this.mapRowToTrade(row));
  }

  public static async saveTrade(strateryName: string, symbol: string, trade: Trade): Promise<void> {
    if (strateryName === '*' || symbol === '*') throw new Error("Cannot save data with wildcards.");
    const db = TradesRepository.getConnection(strateryName);
    const ts = Date.now();
    
    // Auto-override the symbol in the payload to match the route param
    trade.symbol = symbol;

    const stmt = db.prepare(`
      INSERT INTO trades (id, type, symbol, tagIds, openTimestamp, closeTimestamp, openPrice, closePrice, stopLossPrice, takeProfitPrice, volume, style, lastModifyTimestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type, symbol = excluded.symbol, tagIds = excluded.tagIds, openTimestamp = excluded.openTimestamp,
        closeTimestamp = excluded.closeTimestamp, openPrice = excluded.openPrice, closePrice = excluded.closePrice,
        stopLossPrice = excluded.stopLossPrice, takeProfitPrice = excluded.takeProfitPrice, volume = excluded.volume,
        style = excluded.style, lastModifyTimestamp = excluded.lastModifyTimestamp
    `);

    const bindId = trade.id !== undefined && trade.id !== null ? trade.id : null;
    stmt.run(
      bindId, trade.type, trade.symbol, JSON.stringify(trade.tagIds || []),
      trade.data.openTimestamp, trade.data.closeTimestamp, trade.data.openPrice, trade.data.closePrice,
      trade.data.stopLossPrice, trade.data.takeProfitPrice, trade.data.volume,
      JSON.stringify(trade.style), ts
    );
  }

  public static async deleteTrade(strateryName: string, symbol: string, id: number): Promise<void> {
    if (strateryName === '*') throw new Error("Cannot delete data using a wildcard strategy.");
    const db = TradesRepository.getConnection(strateryName);
    db.prepare('DELETE FROM trades WHERE id = ? AND symbol = ?').run(id, symbol);
  }

  // --- TAGS ---
  
  public static async getTags(strateryName: string, symbol: string, lastUpdateTs?: number): Promise<TradeTag[]> {
    if (strateryName === '*') {
      const strategies = TradesRepository.getAllStrategyNames();
      let allTags: TradeTag[] = [];
      for (const strat of strategies) {
        allTags = allTags.concat(await this.getTagsForStrategy(strat, symbol, lastUpdateTs));
      }
      return allTags;
    }
    return this.getTagsForStrategy(strateryName, symbol, lastUpdateTs);
  }

  private static async getTagsForStrategy(strateryName: string, symbol: string, lastUpdateTs?: number): Promise<TradeTag[]> {
    const db = TradesRepository.getConnection(strateryName);
    
    let query = `SELECT * FROM tags WHERE 1=1`;
    const params: any[] = [];

    if (symbol !== '*') {
      query += ` AND symbol = ?`;
      params.push(symbol);
    }
    if (lastUpdateTs !== undefined && !isNaN(lastUpdateTs)) {
      query += ` AND lastModifyTimestamp >= ?`;
      params.push(lastUpdateTs);
    }

    const rows = db.prepare(query).all(...params);
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      desc: row.desc,
      style: JSON.parse(row.style)
    }));
  }

  public static async saveTag(strateryName: string, symbol: string, tag: TradeTag): Promise<void> {
    if (strateryName === '*' || symbol === '*') throw new Error("Cannot save data with wildcards.");
    const db = TradesRepository.getConnection(strateryName);
    const ts = Date.now();
    
    const stmt = db.prepare(`
      INSERT INTO tags (id, symbol, name, desc, style, lastModifyTimestamp)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        symbol = excluded.symbol, name = excluded.name, desc = excluded.desc,
        style = excluded.style, lastModifyTimestamp = excluded.lastModifyTimestamp
    `);

    const bindId = tag.id !== undefined && tag.id !== null ? tag.id : null;
    stmt.run(bindId, symbol, tag.name, tag.desc, JSON.stringify(tag.style), ts);
  }

  public static async deleteTag(strateryName: string, symbol: string, id: number): Promise<void> {
    if (strateryName === '*') throw new Error("Cannot delete data using a wildcard strategy.");
    const db = TradesRepository.getConnection(strateryName);
    db.prepare('DELETE FROM tags WHERE id = ? AND symbol = ?').run(id, symbol);
  }

  // --- TEMPLATES ---
  
  public static async getTemplates(strateryName: string, symbol: string): Promise<TradeTemplate[]> {
    if (strateryName === '*') {
      const strategies = TradesRepository.getAllStrategyNames();
      let allTemplates: TradeTemplate[] = [];
      for (const strat of strategies) {
        allTemplates = allTemplates.concat(await this.getTemplatesForStrategy(strat, symbol));
      }
      return allTemplates;
    }
    return this.getTemplatesForStrategy(strateryName, symbol);
  }

  private static async getTemplatesForStrategy(strateryName: string, symbol: string): Promise<TradeTemplate[]> {
    const db = TradesRepository.getConnection(strateryName);
    
    let query = `SELECT * FROM templates WHERE 1=1`;
    const params: any[] = [];

    if (symbol !== '*') {
      query += ` AND symbol = ?`;
      params.push(symbol);
    }

    const rows = db.prepare(query).all(...params);
    return rows.map((row: any) => ({
      name: row.name,
      style: JSON.parse(row.style)
    }));
  }

  public static async saveTemplate(strateryName: string, symbol: string, template: TradeTemplate): Promise<void> {
    if (strateryName === '*' || symbol === '*') throw new Error("Cannot save data with wildcards.");
    const db = TradesRepository.getConnection(strateryName);
    
    const stmt = db.prepare(`
      INSERT INTO templates (name, symbol, style)
      VALUES (?, ?, ?)
      ON CONFLICT(name, symbol) DO UPDATE SET
        style = excluded.style
    `);

    stmt.run(template.name, symbol, JSON.stringify(template.style));
  }

  public static async deleteTemplate(strateryName: string, symbol: string, name: string): Promise<void> {
    if (strateryName === '*') throw new Error("Cannot delete data using a wildcard strategy.");
    const db = TradesRepository.getConnection(strateryName);
    db.prepare('DELETE FROM templates WHERE name = ? AND symbol = ?').run(name, symbol);
  }

  // --- MAPPERS ---
  
  private static mapRowToTrade(row: any): Trade {
    return {
      id: row.id,
      type: row.type,
      symbol: row.symbol,
      tagIds: JSON.parse(row.tagIds || '[]'),
      data: {
        openTimestamp: row.openTimestamp,
        closeTimestamp: row.closeTimestamp,
        openPrice: row.openPrice,
        closePrice: row.closePrice,
        stopLossPrice: row.stopLossPrice,
        takeProfitPrice: row.takeProfitPrice,
        volume: row.volume
      },
      style: JSON.parse(row.style)
    };
  }
}