import { Text } from './texts.model.js';
import { TextsRepository } from './texts.repository.js';

export class TextsService {
  
  public static async saveText(strateryName: string, symbol: string, id: string, textObj: Text): Promise<void> {
    const db = TextsRepository.getConnection(strateryName, symbol);
    const existing = db.prepare('SELECT id FROM texts WHERE id = ?').get(id);

    if (!existing) {
      // Complete object structure verification check on new creations
      if (
        textObj.text === undefined ||
        textObj.timestamp === undefined ||
        textObj.price === undefined ||
        textObj.color === undefined ||
        textObj.size === undefined ||
        textObj.alignX === undefined ||
        textObj.alignY === undefined
      ) {
        throw new Error(`Cannot create text: Missing required fields for new instance creation. ID: ${id}`);
      }

      const stmt = db.prepare(`
        INSERT INTO texts (id, text, timestamp, price, color, size, alignX, alignY)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        textObj.text,
        textObj.timestamp,
        textObj.price,
        JSON.stringify(textObj.color),
        textObj.size,
        textObj.alignX,
        textObj.alignY
      );
    } else {
      // Dynamic Partial Patch logic
      const updates: string[] = [];
      const values: any[] = [];

      if (textObj.text !== undefined) { updates.push('text = ?'); values.push(textObj.text); }
      if (textObj.timestamp !== undefined) { updates.push('timestamp = ?'); values.push(textObj.timestamp); }
      if (textObj.price !== undefined) { updates.push('price = ?'); values.push(textObj.price); }
      if (textObj.color !== undefined) { updates.push('color = ?'); values.push(JSON.stringify(textObj.color)); }
      if (textObj.size !== undefined) { updates.push('size = ?'); values.push(textObj.size); }
      if (textObj.alignX !== undefined) { updates.push('alignX = ?'); values.push(textObj.alignX); }
      if (textObj.alignY !== undefined) { updates.push('alignY = ?'); values.push(textObj.alignY); }

      if (updates.length > 0) {
        values.push(id);
        const stmt = db.prepare(`UPDATE texts SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }
    }
  }

  public static async getText(strateryName: string, symbol: string, id: string): Promise<Text | null> {
    const db = TextsRepository.getConnection(strateryName, symbol);
    const row: any = db.prepare('SELECT * FROM texts WHERE id = ?').get(id);
    if (!row) return null;

    return this.mapRowToText(row);
  }

  public static async getTextsStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<Text[]> {
    const db = TextsRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM texts WHERE id LIKE ?').all(`${idStartWith}%`);
    return rows.map((row: any) => this.mapRowToText(row));
  }

  public static async deleteText(strateryName: string, symbol: string, id: string): Promise<void> {
    const db = TextsRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM texts WHERE id = ?').run(id);
  }

  public static async deleteTextsStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<void> {
    const db = TextsRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM texts WHERE id LIKE ?').run(`${idStartWith}%`);
  }

  /**
   * For single timestamp rows, the logic simplifies to:
   * fromTs <= timestamp AND timestamp < toTs
   */
  public static async getTextsByTimestampRange(
    strateryName: string, 
    symbol: string, 
    fromTs: number, 
    toTs: number
  ): Promise<Text[]> {
    const db = TextsRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM texts WHERE timestamp >= ? AND timestamp < ?').all(fromTs, toTs);
    return rows.map((row: any) => this.mapRowToText(row));
  }

  public static async getAllTexts(strateryName: string, symbol: string): Promise<Text[]> {
    const db = TextsRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM texts').all();
    return rows.map((row: any) => this.mapRowToText(row));
  }

  private static mapRowToText(row: any): Text {
    return {
      text: row.text,
      timestamp: row.timestamp,
      price: row.price,
      color: row.color ? JSON.parse(row.color) : undefined,
      size: row.size,
      alignX: row.alignX,
      alignY: row.alignY,
    };
  }
}