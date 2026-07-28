import { strategyDbManager } from "./shape.service.js";
import { Shape, ShapeTag, ShapeTemplate } from "./shape.model.js";

export class ShapeRepository {
  // --- Shapes Logic ---
  static getAllShapes(strategyId: number, whereClause: string = "", params: any[] = []): Shape[] {
    const db = strategyDbManager.getDb(strategyId);
    const sql = `SELECT * FROM shapes ${whereClause ? "WHERE " + whereClause : ""}`;
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(row => ({
      ...row,
      tagIds: JSON.parse(row.tagIds),
      data: JSON.parse(row.data),
      style: JSON.parse(row.style)
    }));
  }

  static getShapeById(strategyId: number, id: number): Shape | null {
    const db = strategyDbManager.getDb(strategyId);
    const row = db.prepare("SELECT * FROM shapes WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      ...row,
      tagIds: JSON.parse(row.tagIds),
      data: JSON.parse(row.data),
      style: JSON.parse(row.style)
    };
  }

  static saveShape(strategyId: number, shape: Shape): number {
    const db = strategyDbManager.getDb(strategyId);
    if (shape.id !== undefined && shape.id !== null) {
      db.prepare(`
        UPDATE shapes SET type = ?, symbol = ?, tagIds = ?, fromTs = ?, toTs = ?, data = ?, style = ? WHERE id = ?
      `).run(
        shape.type,
        shape.symbol,
        JSON.stringify(shape.tagIds),
        shape.fromTs,
        shape.toTs,
        JSON.stringify(shape.data),
        JSON.stringify(shape.style),
        shape.id
      );
      return shape.id;
    } else {
      const result = db.prepare(`
        INSERT INTO shapes (type, symbol, tagIds, fromTs, toTs, data, style) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        shape.type,
        shape.symbol,
        JSON.stringify(shape.tagIds),
        shape.fromTs,
        shape.toTs,
        JSON.stringify(shape.data),
        JSON.stringify(shape.style)
      );
      return result.lastInsertRowid as number;
    }
  }

  static deleteShape(strategyId: number, id: number): boolean {
    const db = strategyDbManager.getDb(strategyId);
    const result = db.prepare("DELETE FROM shapes WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // --- Tags Logic ---
  static getAllTags(strategyId: number): ShapeTag[] {
    const db = strategyDbManager.getDb(strategyId);
    const rows = db.prepare("SELECT * FROM shape_tags").all() as any[];
    return rows.map(row => ({
      ...row,
      color: JSON.parse(row.color)
    }));
  }

  static getTagById(strategyId: number, id: number): ShapeTag | null {
    const db = strategyDbManager.getDb(strategyId);
    const row = db.prepare("SELECT * FROM shape_tags WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      ...row,
      color: JSON.parse(row.color)
    };
  }

  static saveTag(strategyId: number, tag: ShapeTag): number {
    const db = strategyDbManager.getDb(strategyId);
    if (tag.id !== undefined && tag.id !== null) {
      db.prepare("UPDATE shape_tags SET name = ?, color = ? WHERE id = ?").run(
        tag.name,
        JSON.stringify(tag.color),
        tag.id
      );
      return tag.id;
    } else {
      const result = db.prepare("INSERT INTO shape_tags (name, color) VALUES (?, ?)").run(
        tag.name,
        JSON.stringify(tag.color)
      );
      return result.lastInsertRowid as number;
    }
  }

  static deleteTag(strategyId: number, id: number): boolean {
    const db = strategyDbManager.getDb(strategyId);
    
    // 1. Run within a database transaction to keep data mutations atomic and safe
    const deleteTx = db.transaction(() => {
      // Find all shapes that contain this specific tagId inside their JSON array using SQLite json_each
      const targetingShapes = db.prepare(`
        SELECT DISTINCT shapes.id, shapes.tagIds 
        FROM shapes, json_each(shapes.tagIds) 
        WHERE json_each.value = ?
      `).all(id) as { id: number; tagIds: string }[];

      // Scrub the tag id references from the JSON list and update each shape entry
      const updateStmt = db.prepare("UPDATE shapes SET tagIds = ? WHERE id = ?");
      for (const shapeRow of targetingShapes) {
        const currentTagIds: number[] = JSON.parse(shapeRow.tagIds);
        const filteredTagIds = currentTagIds.filter(tagId => tagId !== id);
        updateStmt.run(JSON.stringify(filteredTagIds), shapeRow.id);
      }

      // 2. Perform the actual removal from the shape_tags reference table
      const result = db.prepare("DELETE FROM shape_tags WHERE id = ?").run(id);
      return result.changes > 0;
    });

    return deleteTx();
  }

  // --- Templates Logic ---
  static getAllTemplates(strategyId: number): ShapeTemplate[] {
    const db = strategyDbManager.getDb(strategyId);
    const rows = db.prepare("SELECT * FROM shape_templates").all() as any[];
    return rows.map(row => ({
      ...row,
      style: JSON.parse(row.style)
    }));
  }

  static getTemplateById(strategyId: number, id: number): ShapeTemplate | null {
    const db = strategyDbManager.getDb(strategyId);
    const row = db.prepare("SELECT * FROM shape_templates WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      ...row,
      style: JSON.parse(row.style)
    };
  }

  static saveTemplate(strategyId: number, template: ShapeTemplate): number {
    const db = strategyDbManager.getDb(strategyId);
    if (template.id !== undefined && template.id !== null) {
      db.prepare("UPDATE shape_templates SET type = ?, name = ?, style = ? WHERE id = ?").run(
        template.type,
        template.name,
        JSON.stringify(template.style),
        template.id
      );
      return template.id;
    } else {
      const result = db.prepare("INSERT INTO shape_templates (type, name, style) VALUES (?, ?, ?)").run(
        template.type,
        template.name,
        JSON.stringify(template.style)
      );
      return result.lastInsertRowid as number;
    }
  }

  static deleteTemplate(strategyId: number, id: number): boolean {
    const db = strategyDbManager.getDb(strategyId);
    const result = db.prepare("DELETE FROM shape_templates WHERE id = ?").run(id);
    return result.changes > 0;
  }
}