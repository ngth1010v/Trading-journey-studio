import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { Hotkey } from "./hotkey.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "../../../database/chartData/hotkey.db");

export class HotkeyRepository {
  private db!: Database.Database;

  public init(): void {
    this.db = new Database(DB_PATH);
    
    // Enable WAL mode for better performance
    this.db.pragma("journal_mode = WAL");

    // Initialize the hotkeys table as requested
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hotkeys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chartType TEXT NOT NULL,
        keys TEXT NOT NULL,
        actions TEXT NOT NULL
      );
    `);
  }

  public shutdown(): void {
    if (this.db) {
      this.db.close();
    }
  }

  public getByChartType(chartType: string): Hotkey[] {
    const stmt = this.db.prepare("SELECT * FROM hotkeys WHERE chartType = ?");
    const rows = stmt.all(chartType) as any[];

    return rows.map(row => ({
      id: row.id,
      chartType: row.chartType,
      keys: JSON.parse(row.keys),
      actions: JSON.parse(row.actions)
    }));
  }

  public getById(id: number): Hotkey | null {
    const stmt = this.db.prepare("SELECT * FROM hotkeys WHERE id = ?");
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      chartType: row.chartType,
      keys: JSON.parse(row.keys),
      actions: JSON.parse(row.actions)
    };
  }

  public create(hotkey: Omit<Hotkey, "id">): number {
    const stmt = this.db.prepare(
      "INSERT INTO hotkeys (chartType, keys, actions) VALUES (?, ?, ?)"
    );
    const result = stmt.run(
      hotkey.chartType,
      JSON.stringify(hotkey.keys),
      JSON.stringify(hotkey.actions)
    );
    return result.lastInsertRowid as number;
  }

  public update(id: number, hotkey: Omit<Hotkey, "id">): void {
    const stmt = this.db.prepare(
      "UPDATE hotkeys SET chartType = ?, keys = ?, actions = ? WHERE id = ?"
    );
    stmt.run(
      hotkey.chartType,
      JSON.stringify(hotkey.keys),
      JSON.stringify(hotkey.actions),
      id
    );
  }

  public delete(id: number): boolean {
    const stmt = this.db.prepare("DELETE FROM hotkeys WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }
}