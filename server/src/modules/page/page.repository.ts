import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { Page, PageSummary } from "./page.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "../../../database/page.db");

export class PageRepository {
  private db!: Database.Database;

  public init(): void {
    this.db = new Database(DB_PATH);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        data TEXT NOT NULL
      );
    `);
  }

  public findAll(): PageSummary[] {
    const stmt = this.db.prepare("SELECT id, name FROM pages");
    return stmt.all() as PageSummary[];
  }

  public findById(id: number): Page | null {
    const stmt = this.db.prepare(
      "SELECT id, name, data FROM pages WHERE id = ?"
    );

    const row = stmt.get(id) as
      | { id: number; name: string; data: string }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      data: JSON.parse(row.data),
    };
  }

  public create(page: Omit<Page, "id">): number {
    const stmt = this.db.prepare(
      "INSERT INTO pages (name, data) VALUES (?, ?)"
    );

    const result = stmt.run(
      page.name,
      JSON.stringify(page.data)
    );

    return Number(result.lastInsertRowid);
  }

  public update(page: Required<Page>): boolean {
    const stmt = this.db.prepare(
      "UPDATE pages SET name = ?, data = ? WHERE id = ?"
    );

    const result = stmt.run(
      page.name,
      JSON.stringify(page.data),
      page.id
    );

    return result.changes > 0;
  }

  public delete(id: number): boolean {
    const stmt = this.db.prepare(
      "DELETE FROM pages WHERE id = ?"
    );

    const result = stmt.run(id);

    return result.changes > 0;
  }

  public close(): void {
    this.db.close();
  }
}