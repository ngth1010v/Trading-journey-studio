import Database from 'better-sqlite3';
import { Strategy, StrategyTag } from './strategies.model.js';
import { logger } from '../../logger.js';

const _SECTION = "strategies";
const DB_PATH = 'database/strategies.db';

let db: Database.Database;

function initDb(): void {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tags table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS strategies (
      name TEXT PRIMARY KEY,
      tagNames TEXT NOT NULL,
      createdTimestamp INTEGER NOT NULL,
      desc TEXT NOT NULL,
      favoriteSymbols TEXT NOT NULL,
      favoriteTimeframes TEXT NOT NULL,
      themeColor TEXT NOT NULL
    )
  `).run();

  // Create strategies table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS strategies (
      name TEXT PRIMARY KEY,
      tagNames TEXT NOT NULL,
      createdTimestamp INTEGER NOT NULL,
      desc TEXT NOT NULL,
      themeColor TEXT NOT NULL
    )
  `).run();

  logger.info(_SECTION, "Database initialized successfully.");
}

function closeDb(): void {
  if (db) {
    db.close();
    logger.info(_SECTION, "Database connection closed.");
  }
}

// --- Tag Operations ---
function getAllTags(): StrategyTag[] {
  const stmt = db.prepare('SELECT * FROM tags');
  const rows = stmt.all() as any[];
  return rows.map(row => ({
    name: row.name,
    createdTimestamp: Number(row.createdTimestamp),
    desc: row.desc,
    themeColor: JSON.parse(row.themeColor)
  }));
}

function getTagByName(name: string): StrategyTag | null {
  const row = db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as any;
  if (!row) return null;
  return {
    name: row.name,
    createdTimestamp: Number(row.createdTimestamp),
    desc: row.desc,
    themeColor: JSON.parse(row.themeColor)
  };
}

function saveTag(tag: StrategyTag): void {
  const stmt = db.prepare(`
    INSERT INTO tags (name, createdTimestamp, desc, themeColor)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      createdTimestamp = excluded.createdTimestamp,
      desc = excluded.desc,
      themeColor = excluded.themeColor
  `);
  stmt.run(tag.name, tag.createdTimestamp, tag.desc, JSON.stringify(tag.themeColor));
}

function deleteTag(name: string): boolean {
  const stmt = db.prepare('DELETE FROM tags WHERE name = ?');
  return stmt.run(name).changes > 0;
}

// --- Strategy Operations ---
function getAllStrategies(): Strategy[] {
  const stmt = db.prepare('SELECT * FROM strategies');
  const rows = stmt.all() as any[];
  return rows.map(row => ({
    name: row.name,
    tagNames: JSON.parse(row.tagNames),
    createdTimestamp: Number(row.createdTimestamp),
    desc: row.desc,
    favoriteSymbols: JSON.parse(row.favoriteSymbols),
    favoriteTimeframes: JSON.parse(row.favoriteTimeframes),
    themeColor: JSON.parse(row.themeColor)
  }));
}

function getStrategyByName(name: string): Strategy | null {
  const row = db.prepare('SELECT * FROM strategies WHERE name = ?').get(name) as any;
  if (!row) return null;
  return {
    name: row.name,
    tagNames: JSON.parse(row.tagNames),
    createdTimestamp: Number(row.createdTimestamp),
    desc: row.desc,
    favoriteSymbols: JSON.parse(row.favoriteSymbols),
    favoriteTimeframes: JSON.parse(row.favoriteTimeframes),
    themeColor: JSON.parse(row.themeColor)
  };
}

function saveStrategy(strategy: Strategy): void {
  const stmt = db.prepare(`
    INSERT INTO strategies (name, tagNames, createdTimestamp, desc, favoriteSymbols, favoriteTimeframes, themeColor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      tagNames = excluded.tagNames,
      createdTimestamp = excluded.createdTimestamp,
      desc = excluded.desc,
      favoriteSymbols = excluded.favoriteSymbols,
      favoriteTimeframes = excluded.favoriteTimeframes,
      themeColor = excluded.themeColor
  `);
  stmt.run(
    strategy.name, 
    JSON.stringify(strategy.tagNames), 
    strategy.createdTimestamp, 
    strategy.desc, 
    JSON.stringify(strategy.favoriteSymbols),
    JSON.stringify(strategy.favoriteTimeframes),
    JSON.stringify(strategy.themeColor)
  );
}

function deleteStrategy(name: string): boolean {
  const stmt = db.prepare('DELETE FROM strategies WHERE name = ?');
  return stmt.run(name).changes > 0;
}

export const repository = {
  initDb,
  closeDb,
  getAllTags,
  getTagByName,
  saveTag,
  deleteTag,
  getAllStrategies,
  getStrategyByName,
  saveStrategy,
  deleteStrategy
};