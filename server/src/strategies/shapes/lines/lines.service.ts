import { Line } from './lines.model.js';
import { LinesRepository } from './lines.repository.js';

export class LinesService {
  
  public static async saveLine(strateryName: string, symbol: string, id: string, line: Line): Promise<void> {
    const db = LinesRepository.getConnection(strateryName, symbol);
    
    // Check if the record already exists
    const existing = db.prepare('SELECT id FROM lines WHERE id = ?').get(id);

    if (!existing) {
      // Target does not exist -> All properties must be defined
      if (
        line.thickness === undefined ||
        line.color === undefined ||
        line.timestamp1 === undefined ||
        line.timestamp2 === undefined ||
        line.price1 === undefined ||
        line.price2 === undefined
      ) {
        throw new Error(`Cannot create line: Missing required fields for new instance creation. ID: ${id}`);
      }

      const stmt = db.prepare(`
        INSERT INTO lines (id, thickness, color, timestamp1, timestamp2, price1, price2)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        line.thickness,
        JSON.stringify(line.color),
        line.timestamp1,
        line.timestamp2,
        line.price1,
        line.price2
      );
    } else {
      // Dynamic Partial Patch (Choice 4A)
      const updates: string[] = [];
      const values: any[] = [];

      if (line.thickness !== undefined) { updates.push('thickness = ?'); values.push(line.thickness); }
      if (line.color !== undefined) { updates.push('color = ?'); values.push(JSON.stringify(line.color)); }
      if (line.timestamp1 !== undefined) { updates.push('timestamp1 = ?'); values.push(line.timestamp1); }
      if (line.timestamp2 !== undefined) { updates.push('timestamp2 = ?'); values.push(line.timestamp2); }
      if (line.price1 !== undefined) { updates.push('price1 = ?'); values.push(line.price1); }
      if (line.price2 !== undefined) { updates.push('price2 = ?'); values.push(line.price2); }

      if (updates.length > 0) {
        values.push(id); // push context ID for WHERE clause
        const stmt = db.prepare(`UPDATE lines SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }
    }
  }

  public static async getLine(strateryName: string, symbol: string, id: string): Promise<Line | null> {
    const db = LinesRepository.getConnection(strateryName, symbol);
    const row: any = db.prepare('SELECT * FROM lines WHERE id = ?').get(id);
    if (!row) return null;

    return this.mapRowToLine(row);
  }

  public static async getLinesStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<Line[]> {
    const db = LinesRepository.getConnection(strateryName, symbol);
    // Escape standard wildcard tokens safely using parameter binding
    const rows = db.prepare('SELECT * FROM lines WHERE id LIKE ?').all(`${idStartWith}%`);
    return rows.map((row: any) => this.mapRowToLine(row));
  }

  public static async deleteLine(strateryName: string, symbol: string, id: string): Promise<void> {
    const db = LinesRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM lines WHERE id = ?').run(id);
  }

  public static async deleteLinesStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<void> {
    const db = LinesRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM lines WHERE id LIKE ?').run(`${idStartWith}%`);
  }

  /**
   * Evaluates the timestamp query condition dynamically:
   * fromTs <= MAX(timestamp1, timestamp2) AND MIN(timestamp1, timestamp2) < toTs
   */
  public static async getLinesByTimestampRange(
    strateryName: string, 
    symbol: string, 
    fromTs: number, 
    toTs: number
  ): Promise<Line[]> {
    const db = LinesRepository.getConnection(strateryName, symbol);
    
    // CASE constructs ensure bulletproof functionality on variations of standard SQLite versions
    const query = `
      SELECT * FROM lines 
      WHERE ? <= (CASE WHEN timestamp1 > timestamp2 THEN timestamp1 ELSE timestamp2 END)
        AND (CASE WHEN timestamp1 < timestamp2 THEN timestamp1 ELSE timestamp2 END) < ?
    `;
    
    const rows = db.prepare(query).all(fromTs, toTs);
    return rows.map((row: any) => this.mapRowToLine(row));
  }

  public static async getAllLines(strateryName: string, symbol: string): Promise<Line[]> {
    const db = LinesRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM lines').all();
    return rows.map((row: any) => this.mapRowToLine(row));
  }

  private static mapRowToLine(row: any): Line {
    return {
      thickness: row.thickness,
      color: row.color ? JSON.parse(row.color) : undefined,
      timestamp1: row.timestamp1,
      timestamp2: row.timestamp2,
      price1: row.price1,
      price2: row.price2,
    };
  }
}