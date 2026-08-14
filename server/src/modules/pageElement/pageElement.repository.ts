import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PageElement, PageElementRow } from "./pageElement.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.join(__dirname, "../../../database");
const DB_PATH = path.join(DB_DIR, "pageElement.db");

export class PageElementRepository {
  private db: Database.Database | null = null;

  public init(): void {
    if (this.db) return;

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    this.db = new Database(DB_PATH);
    this.db.pragma("foreign_keys = ON");

    // Initialize Schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pageElement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parentId INTEGER,
        entry INTEGER NOT NULL,
        entryName TEXT NOT NULL,
        type TEXT NOT NULL,
        position TEXT NOT NULL,
        size TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pageElementConfig (
        pageElementId INTEGER PRIMARY KEY,
        config TEXT DEFAULT NULL,
        FOREIGN KEY (pageElementId) REFERENCES pageElement(id) ON DELETE CASCADE
      );
    `);
  }

  public shutdown(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return this.db;
  }

  public findAll(): PageElementRow[] {
    const stmt = this.getDb().prepare(
      "SELECT id, parentId, entry, entryName, type, position, size FROM pageElement"
    );
    return stmt.all() as PageElementRow[];
  }

  public findById(id: number): PageElementRow | undefined {
    const stmt = this.getDb().prepare(
      "SELECT id, parentId, entry, entryName, type, position, size FROM pageElement WHERE id = ?"
    );
    return stmt.get(id) as PageElementRow | undefined;
  }

  public countChildren(parentId: number): number {
    const stmt = this.getDb().prepare(
      "SELECT COUNT(*) as count FROM pageElement WHERE parentId = ?"
    );
    const result = stmt.get(parentId) as { count: number };
    return result ? result.count : 0;
  }

  public create(element: Omit<PageElement, "id">): number {
    const db = this.getDb();
    const insertElement = db.prepare(`
      INSERT INTO pageElement (parentId, entry, entryName, type, position, size)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertConfig = db.prepare(`
      INSERT INTO pageElementConfig (pageElementId, config)
      VALUES (?, NULL)
    `);

    const transaction = db.transaction(() => {
      const info = insertElement.run(
        element.parentId,
        element.entry ? 1 : 0,
        element.entryName,
        element.type,
        JSON.stringify(element.position),
        JSON.stringify(element.size)
      );
      const newId = Number(info.lastInsertRowid);
      insertConfig.run(newId);
      return newId;
    });

    return transaction();
  }

  public update(element: Required<PageElement>): boolean {
    const stmt = this.getDb().prepare(`
      UPDATE pageElement
      SET parentId = ?, entryName = ?, type = ?, position = ?, size = ?
      WHERE id = ?
    `);
    const info = stmt.run(
      element.parentId,
      element.entryName,
      element.type,
      JSON.stringify(element.position),
      JSON.stringify(element.size),
      element.id
    );
    return info.changes > 0;
  }

  public delete(id: number): boolean {
    const stmt = this.getDb().prepare("DELETE FROM pageElement WHERE id = ?");
    const info = stmt.run(id);
    return info.changes > 0;
  }

  public getConfig(pageElementId: number): string | null | undefined {
    const stmt = this.getDb().prepare(
      "SELECT config FROM pageElementConfig WHERE pageElementId = ?"
    );
    const row = stmt.get(pageElementId) as { config: string | null } | undefined;
    return row ? row.config : undefined;
  }

  public setConfig(pageElementId: number, config: any): boolean {
    const configValue =
      config === undefined || config === null ? null : JSON.stringify(config);
    const stmt = this.getDb().prepare(`
      INSERT INTO pageElementConfig (pageElementId, config)
      VALUES (?, ?)
      ON CONFLICT(pageElementId) DO UPDATE SET config = excluded.config
    `);
    const info = stmt.run(pageElementId, configValue);
    return info.changes > 0;
  }
}

export const pageElementRepository = new PageElementRepository();