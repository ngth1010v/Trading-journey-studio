import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Theme, DEFAULT_THEME } from './theme.model.js';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ThemeRepository {
    private db!: Database.Database;
    private readonly dbPath = path.join(__dirname, "../../../database/theme.db");

    init() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(this.dbPath);
        this.db.pragma('journal_mode = WAL');

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS themes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                selected INTEGER NOT NULL DEFAULT 0,
                json TEXT NOT NULL,
                lastModifyTimestamp INTEGER NOT NULL DEFAULT 0
            )
        `);

        this.ensureDefaultThemeExists();
    }

    private ensureDefaultThemeExists() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM themes WHERE id = 0');
        const result = stmt.get() as { count: number };
        
        if (result.count === 0) {
            const { id, name, selected, ...restData } = DEFAULT_THEME;
            const jsonStr = JSON.stringify(restData);
            
            // Explicitly force ID 0 for the default theme using an dynamic insert statement
            this.db.prepare(`
                INSERT INTO themes (id, name, selected, json, lastModifyTimestamp)
                VALUES (0, ?, ?, ?, ?)
            `).run(name, selected ? 1 : 0, jsonStr, Date.now());
        }
    }

    shutdown() {
        if (this.db) {
            this.db.close();
        }
    }

    getAllThemes(): Theme[] {
        const stmt = this.db.prepare('SELECT id, name, selected, json FROM themes');
        const rows = stmt.all() as { id: number; name: string; selected: number; json: string }[];
        
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            selected: row.selected === 1,
            ...JSON.parse(row.json)
        }));
    }

    getThemeById(id: number): Theme | null {
        const stmt = this.db.prepare('SELECT id, name, selected, json FROM themes WHERE id = ?');
        const row = stmt.get(id) as { id: number; name: string; selected: number; json: string } | undefined;
        
        if (!row) return null;
        return {
            id: row.id,
            name: row.name,
            selected: row.selected === 1,
            ...JSON.parse(row.json)
        };
    }

    getChangedThemeIds(timestamp: number): number[] {
        const stmt = this.db.prepare('SELECT id FROM themes WHERE lastModifyTimestamp > ?');
        const rows = stmt.all(timestamp) as { id: number }[];
        return rows.map(row => row.id);
    }

    saveTheme(theme: Theme, currentTimestamp: number): Theme {
        const { id, name, selected, ...restData } = theme;
        const selectedInt = selected ? 1 : 0;
        const jsonStr = JSON.stringify(restData);

        let finalTheme = { ...theme };

        const transaction = this.db.transaction(() => {
            if (selected) {
                this.clearAllSelectionsAndTrack(currentTimestamp);
            }

            if (id !== undefined) {
                const stmt = this.db.prepare(`
                    INSERT INTO themes (id, name, selected, json, lastModifyTimestamp)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        selected = excluded.selected,
                        json = excluded.json,
                        lastModifyTimestamp = excluded.lastModifyTimestamp
                `);
                stmt.run(id, name, selectedInt, jsonStr, currentTimestamp);
            } else {
                const stmt = this.db.prepare(`
                    INSERT INTO themes (name, selected, json, lastModifyTimestamp)
                    VALUES (?, ?, ?, ?)
                `);
                const info = stmt.run(name, selectedInt, jsonStr, currentTimestamp);
                finalTheme.id = Number(info.lastInsertRowid);
            }
        });

        transaction();
        return finalTheme;
    }

    private clearAllSelectionsAndTrack(currentTimestamp: number) {
        this.db.prepare(`
            UPDATE themes 
            SET selected = 0, lastModifyTimestamp = ? 
            WHERE selected = 1
        `).run(currentTimestamp);
    }

    deleteTheme(id: number): boolean {
        const stmt = this.db.prepare('DELETE FROM themes WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
}