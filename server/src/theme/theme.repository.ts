import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Theme } from './theme.model.js';

export class ThemeRepository {
    private db!: Database.Database;
    private readonly dbPath = path.resolve('server/database/theme.db');

    init() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(this.dbPath);
        
        // Optimize SQLite operations via WAL mode
        this.db.pragma('journal_mode = WAL');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS themes (
                name TEXT PRIMARY KEY,
                selected INTEGER NOT NULL DEFAULT 0,
                json TEXT NOT NULL
            )
        `);
    }

    shutdown() {
        if (this.db) {
            this.db.close();
        }
    }

    getAllThemes(): Theme[] {
        const stmt = this.db.prepare('SELECT name, selected, json FROM themes');
        const rows = stmt.all() as { name: string; selected: number; json: string }[];
        
        return rows.map(row => ({
            name: row.name,
            selected: row.selected === 1,
            ...JSON.parse(row.json)
        }));
    }

    getThemeByName(name: string): Theme | null {
        const stmt = this.db.prepare('SELECT name, selected, json FROM themes WHERE name = ?');
        const row = stmt.get(name) as { name: string; selected: number; json: string } | undefined;
        
        if (!row) return null;
        return {
            name: row.name,
            selected: row.selected === 1,
            ...JSON.parse(row.json)
        };
    }

    saveTheme(theme: Theme) {
        const { name, selected, ...restData } = theme;
        const selectedInt = selected ? 1 : 0;
        const jsonStr = JSON.stringify(restData);

        const stmt = this.db.prepare(`
            INSERT INTO themes (name, selected, json)
            VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                selected = excluded.selected,
                json = excluded.json
        `);
        stmt.run(name, selectedInt, jsonStr);
    }

    clearAllSelections() {
        const stmt = this.db.prepare('UPDATE themes SET selected = 0');
        stmt.run();
    }

    deleteTheme(name: string): boolean {
        const stmt = this.db.prepare('DELETE FROM themes WHERE name = ?');
        const result = stmt.run(name);
        return result.changes > 0;
    }

    hasSelectedTheme(): boolean {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM themes WHERE selected = 1');
        const result = stmt.get() as { count: number } | undefined;
        return (result?.count ?? 0) > 0;
    }
}