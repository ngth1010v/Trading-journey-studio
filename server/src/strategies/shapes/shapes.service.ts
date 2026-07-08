import { Shape } from './shapes.model.js';
import { ShapesRepository } from './shapes.repository.js';

export class ShapesService {
  
  public static async saveShapes(strateryName: string, symbol: string, shapes: Shape[]): Promise<void> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    
    // SQLite upsert: if ID is provided and conflicts, update. If null, it generates an autoincrement ID.
    const stmt = db.prepare(`
      INSERT INTO shapes (id, type, fromTs, toTs, data, styles)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        fromTs = excluded.fromTs,
        toTs = excluded.toTs,
        data = excluded.data,
        styles = excluded.styles
    `);

    const transaction = db.transaction((shapesList: Shape[]) => {
      for (const shape of shapesList) {
        // Enforce structural fields check (excluding optional id field)
        if (
          shape.type === undefined ||
          shape.fromTs === undefined ||
          shape.toTs === undefined ||
          shape.data === undefined ||
          shape.styles === undefined
        ) {
          throw new Error('Cannot save shape: Missing required fields.');
        }

        // Pass null if shape.id is missing or undefined to trigger AUTOINCREMENT
        const bindId = shape.id !== undefined && shape.id !== null ? shape.id : null;

        stmt.run(
          bindId,
          shape.type,
          shape.fromTs,
          shape.toTs,
          shape.data,
          shape.styles
        );
      }
    });

    // Execute bulk operation safely
    transaction(shapes);
  }

  public static async getShape(strateryName: string, symbol: string, id: number): Promise<Shape | null> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    const row: any = db.prepare('SELECT * FROM shapes WHERE id = ?').get(id);
    if (!row) return null;

    return this.mapRowToShape(row);
  }

  public static async deleteShape(strateryName: string, symbol: string, id: number): Promise<void> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM shapes WHERE id = ?').run(id);
  }

  /**
   * Evaluates the timestamp query condition dynamically based on overlap logic:
   * req.query.fromTs <= shape.toTs AND shape.fromTs < req.query.toTs
   */
  public static async getShapesByTimestampRange(
    strateryName: string, 
    symbol: string, 
    fromTs: number, 
    toTs: number
  ): Promise<Shape[]> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    
    const query = `
      SELECT * FROM shapes 
      WHERE ? <= toTs AND fromTs < ?
    `;
    
    const rows = db.prepare(query).all(fromTs, toTs);
    return rows.map((row: any) => this.mapRowToShape(row));
  }

  public static async getAllShapes(strateryName: string, symbol: string): Promise<Shape[]> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM shapes').all();
    return rows.map((row: any) => this.mapRowToShape(row));
  }

  private static mapRowToShape(row: any): Shape {
    return {
      id: row.id,
      type: row.type,
      fromTs: row.fromTs,
      toTs: row.toTs,
      data: row.data,
      styles: row.styles,
    };
  }
}