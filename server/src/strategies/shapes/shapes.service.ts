import { Shape, ShapeTemplate } from './shapes.model.js';
import { ShapesRepository } from './shapes.repository.js';

export class ShapesService {
  
  public static async saveShapes(strateryName: string, symbol: string, shapes: Shape[]): Promise<void> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    const currentTimestamp = Date.now();
    
    // SQLite upsert: updates existing fields and sets the automated internal timestamp on modification
    const stmt = db.prepare(`
      INSERT INTO shapes (id, type, fromTs, toTs, data, style, creater, editable, lastModifyTimestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        fromTs = excluded.fromTs,
        toTs = excluded.toTs,
        data = excluded.data,
        style = excluded.style,
        creater = excluded.creater,
        editable = excluded.editable,
        lastModifyTimestamp = excluded.lastModifyTimestamp
    `);

    const transaction = db.transaction((shapesList: Shape[]) => {
      for (const shape of shapesList) {
        // Enforce structural fields check (excluding optional id field)
        if (
          shape.type === undefined ||
          shape.fromTs === undefined ||
          shape.toTs === undefined ||
          shape.data === undefined ||
          shape.style === undefined ||
          shape.creater === undefined ||
          shape.editable === undefined
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
          shape.style,
          shape.creater,
          shape.editable ? 1 : 0, // Map boolean to SQLite INTEGER (1/0)
          currentTimestamp
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

  public static async deleteShapesByType(strateryName: string, symbol: string, typeName: string): Promise<void> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM shapes WHERE type = ?').run(typeName);
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

  /**
   * Fetches shapes that intersect with [fromTs, toTs] AND have been modified since lastUpdateTs
   */
  public static async getChangedShapes(
    strateryName: string,
    symbol: string,
    lastUpdateTs: number,
    fromTs: number,
    toTs: number
  ): Promise<Shape[]> {
    const db = ShapesRepository.getConnection(strateryName, symbol);

    const query = `
      SELECT * FROM shapes
      WHERE lastModifyTimestamp >= ?
        AND ? <= toTs 
        AND fromTs < ?
    `;

    const rows = db.prepare(query).all(lastUpdateTs, fromTs, toTs);
    return rows.map((row: any) => this.mapRowToShape(row));
  }

  public static async getAllShapes(strateryName: string, symbol: string): Promise<Shape[]> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM shapes').all();
    return rows.map((row: any) => this.mapRowToShape(row));
  }

  // --- Template System Methods ---

  public static async saveTemplates(strateryName: string, symbol: string, templates: ShapeTemplate[]): Promise<void> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    
    const stmt = db.prepare(`
      INSERT INTO templateShapes (id, type, name, style)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        style = excluded.style
    `);

    const transaction = db.transaction((templatesList: ShapeTemplate[]) => {
      for (const template of templatesList) {
        if (
          template.type === undefined ||
          template.name === undefined ||
          template.style === undefined
        ) {
          throw new Error('Cannot save template: Missing required fields.');
        }

        const bindId = template.id !== undefined && template.id !== null ? template.id : null;

        stmt.run(
          bindId,
          template.type,
          template.name,
          template.style
        );
      }
    });

    transaction(templates);
  }

  public static async getAllTemplates(strateryName: string, symbol: string): Promise<ShapeTemplate[]> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    const rows = db.prepare('SELECT * FROM templateShapes').all();
    return rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      style: row.style
    }));
  }

  public static async deleteTemplate(strateryName: string, symbol: string, id: number): Promise<void> {
    const db = ShapesRepository.getConnection(strateryName, symbol);
    db.prepare('DELETE FROM templateShapes WHERE id = ?').run(id);
  }

  private static mapRowToShape(row: any): Shape {
    return {
      id: row.id,
      type: row.type,
      fromTs: row.fromTs,
      toTs: row.toTs,
      data: row.data,
      style: row.style,
      creater: row.creater,
      editable: row.editable === 1, // Map SQLite INTEGER back to boolean
      // lastModifyTimestamp is intentionally excluded to keep the Interface and payload pristine
    };
  }
}