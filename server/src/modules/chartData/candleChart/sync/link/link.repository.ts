import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Link } from './link.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.join(__dirname, "../../../../../database/chartData/candleChart/sync");
const DB_PATH = path.join(DB_DIR, "link.db");

let db: Database.Database | null = null;

export const linkRepository = {
  init(): void {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color_background TEXT NOT NULL,
        color_border TEXT NOT NULL,
        color_font TEXT NOT NULL
      )
    `);
  },

  shutdown(): void {
    if (db) {
      db.close();
      db = null;
    }
  },

  getAll(): Link[] {
    if (!db) throw new Error('Database not initialized');
    const stmt = db.prepare('SELECT * FROM links');
    const rows = stmt.all() as Array<{
      id: number;
      name: string;
      color_background: string;
      color_border: string;
      color_font: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: {
        background: JSON.parse(row.color_background),
        border: JSON.parse(row.color_border),
        font: JSON.parse(row.color_font)
      }
    }));
  },

  getById(id: number): Link | undefined {
    if (!db) throw new Error('Database not initialized');
    const stmt = db.prepare('SELECT * FROM links WHERE id = ?');
    const row = stmt.get(id) as {
      id: number;
      name: string;
      color_background: string;
      color_border: string;
      color_font: string;
    } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      color: {
        background: JSON.parse(row.color_background),
        border: JSON.parse(row.color_border),
        font: JSON.parse(row.color_font)
      }
    };
  },

  create(link: Omit<Link, 'id'>): Link {
    if (!db) throw new Error('Database not initialized');
    const stmt = db.prepare(`
      INSERT INTO links (name, color_background, color_border, color_font)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(
      link.name,
      JSON.stringify(link.color.background),
      JSON.stringify(link.color.border),
      JSON.stringify(link.color.font)
    );
    return {
      id: Number(info.lastInsertRowid),
      ...link
    };
  },

  update(link: Link): boolean {
    if (!db) throw new Error('Database not initialized');
    if (link.id === undefined) return false;
    const stmt = db.prepare(`
      UPDATE links
      SET name = ?, color_background = ?, color_border = ?, color_font = ?
      WHERE id = ?
    `);
    const info = stmt.run(
      link.name,
      JSON.stringify(link.color.background),
      JSON.stringify(link.color.border),
      JSON.stringify(link.color.font),
      link.id
    );
    return info.changes > 0;
  },

  delete(id: number): boolean {
    if (!db) throw new Error('Database not initialized');
    const stmt = db.prepare('DELETE FROM links WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }
};