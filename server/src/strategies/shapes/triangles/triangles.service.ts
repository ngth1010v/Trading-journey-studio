import { Triangle } from './triangles.model.js';
import { TrianglesRepository } from './triangles.repository.js';

export class TrianglesService {
  
  public static async saveTriangle(strateryName: string, symbol: string, id: string, triangle: Triangle): Promise<void> {
    const db = TrianglesRepository.getConnection(strateryName, symbol);
    const existing = db.prepare('SELECT id FROM triangles WHERE id = ?').get(id);

    if (!existing) {
      // Must have all fields for a brand new entry
      if (
        triangle.color === undefined ||
        triangle.timestamp === undefined ||
        triangle.price === undefined
      ) {
        throw new Error(`Cannot create triangle: Missing required fields for new instance creation. ID: ${id}`);
      }

      const stmt = db.prepare(`
        INSERT INTO triangles (id, color, timestamp, price)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(
        id,
        JSON.stringify(triangle.color),
        JSON.stringify(triangle.timestamp),
        JSON.stringify(triangle.price)
      );
    } else {
      // Dynamic Partial Patch for updates
      const updates: string[] = [];
      const values: any[] = [];

      if (triangle.color !== undefined) { updates.push('color = ?'); values.push(JSON.stringify(triangle.color)); }
      if (triangle.timestamp !== undefined) { updates.push('timestamp = ?'); values.push(JSON.stringify(triangle.timestamp)); }
      if (triangle.price !== undefined) { updates.push('price = ?'); values.push(JSON.stringify(triangle.price)); }

      if (updates.length > 0) {
        values.push(id);
        const stmt = db.prepare(`UPDATE triangles SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
      }
    }
  }

  public static async getTriangle(strateryName: string, symbol: string, id: string): Promise<Triangle | null> {
    const db = TrianglesRepository.getConnection(strateryName, symbol);
    const row: any = db.prepare('SELECT * FROM triangles WHERE id = ?').get(id);
    if (!row) return null;

    return this.mapRowToTriangle(row);
  }

  public static async getTrianglesStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<Triangle[]> {
    const db = TrianglesRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM triangles WHERE id LIKE ?').all(`${idStartWith}%`);
    return rows.map((row: any) => this.mapRowToTriangle(row));
  }

  public static async deleteTriangle(strateryName: string, symbol: string, id: string): Promise<void> {
    const db = TrianglesRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM triangles WHERE id = ?').run(id);
  }

  public static async deleteTrianglesStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<void> {
    const db = TrianglesRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM triangles WHERE id LIKE ?').run(`${idStartWith}%`);
  }

  /**
   * Dynamically extracts JSON array values to evaluate:
   * fromTs <= MAX(ts1, ts2, ts3) AND MIN(ts1, ts2, ts3) < toTs
   */
  public static async getTrianglesByTimestampRange(
    strateryName: string, 
    symbol: string, 
    fromTs: number, 
    toTs: number
  ): Promise<Triangle[]> {
    const db = TrianglesRepository.getConnection(strateryName, symbol);
    
    // SQLite allows parsing JSON arrays natively. We extract indexes 0, 1, and 2 to find MIN/MAX
    const query = `
      SELECT * FROM triangles 
      WHERE ? <= MAX(
          CAST(json_extract(timestamp, '$[0]') AS INTEGER),
          CAST(json_extract(timestamp, '$[1]') AS INTEGER),
          CAST(json_extract(timestamp, '$[2]') AS INTEGER)
        )
        AND MIN(
          CAST(json_extract(timestamp, '$[0]') AS INTEGER),
          CAST(json_extract(timestamp, '$[1]') AS INTEGER),
          CAST(json_extract(timestamp, '$[2]') AS INTEGER)
        ) < ?
    `;
    
    const rows = db.prepare(query).all(fromTs, toTs);
    return rows.map((row: any) => this.mapRowToTriangle(row));
  }

  public static async getAllTriangles(strateryName: string, symbol: string): Promise<Triangle[]> {
    const db = TrianglesRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM triangles').all();
    return rows.map((row: any) => this.mapRowToTriangle(row));
  }

  private static mapRowToTriangle(row: any): Triangle {
    return {
      color: row.color ? JSON.parse(row.color) : undefined,
      timestamp: row.timestamp ? JSON.parse(row.timestamp) : undefined,
      price: row.price ? JSON.parse(row.price) : undefined,
    };
  }
}