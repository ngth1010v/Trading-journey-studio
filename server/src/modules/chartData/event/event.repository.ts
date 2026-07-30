import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { Event } from "./event.model.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.join(__dirname, "../../../../database/chartData");
const DB_PATH = path.join(DB_DIR, "event.db");

export class EventRepository {
  private db: Database.Database | null = null;

  public init(): void {
    if (this.db) return;

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    this.db = new Database(DB_PATH);

    // Initialize events table with INTEGER PRIMARY KEY (maintains insertion order)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        chartType TEXT NOT NULL,
        event TEXT NOT NULL,
        input TEXT NOT NULL
      )
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
      throw new Error("Database not initialized. Call event.init() first.");
    }
    return this.db;
  }

  public getAll(): Event[] {
    const db = this.getDb();
    const rows = db.prepare("SELECT id, chartType, event, input FROM events ORDER BY id ASC").all() as Array<{
      id: number;
      chartType: string;
      event: string;
      input: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      chartType: row.chartType,
      event: row.event,
      input: JSON.parse(row.input),
    }));
  }

  public getById(id: number): Event | null {
    const db = this.getDb();
    const row = db.prepare("SELECT id, chartType, event, input FROM events WHERE id = ?").get(id) as {
      id: number;
      chartType: string;
      event: string;
      input: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      chartType: row.chartType,
      event: row.event,
      input: JSON.parse(row.input),
    };
  }

  public create(data: Omit<Event, "id">): number {
    const db = this.getDb();
    const stmt = db.prepare(
      "INSERT INTO events (chartType, event, input) VALUES (?, ?, ?)"
    );
    const info = stmt.run(data.chartType, data.event, JSON.stringify(data.input));
    return Number(info.lastInsertRowid);
  }

  public update(eventData: Event & { id: number }): boolean {
    const db = this.getDb();
    const stmt = db.prepare(
      "UPDATE events SET chartType = ?, event = ?, input = ? WHERE id = ?"
    );
    const info = stmt.run(
      eventData.chartType,
      eventData.event,
      JSON.stringify(eventData.input),
      eventData.id
    );
    return info.changes > 0;
  }

  public deleteById(id: number): boolean {
    const db = this.getDb();
    const stmt = db.prepare("DELETE FROM events WHERE id = ?");
    const info = stmt.run(id);
    return info.changes > 0;
  }
}

export const eventRepository = new EventRepository();