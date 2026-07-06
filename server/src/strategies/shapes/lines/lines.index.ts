import { Line } from './lines.model.js';
import { LinesService } from './lines.service.js';

// Auto-close connections if inactive for 5 minutes
export const CONNECTION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export const lines = {
  /**
   * Creates/saves to database if it does not exist (throws error if missing any field).
   * Overwrites/patches fields if it already exists.
   */
  async save(strateryName: string, symbol: string, id: string, line: Line): Promise<void> {
    await LinesService.saveLine(strateryName, symbol, id, line);
  },

  /**
   * Retrieves a single row by exact ID match. Returns null if not found.
   */
  async get(strateryName: string, symbol: string, id: string): Promise<Line | null> {
    return LinesService.getLine(strateryName, symbol, id);
  },

  /**
   * Retrieves all rows where the ID starts with idStartWith. Returns [] if none match.
   */
  async getStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<Line[]> {
    return LinesService.getLinesStartWith(strateryName, symbol, idStartWith);
  },

  /**
   * Deletes a specific line by ID. Fails silently if it doesn't exist.
   */
  async delete(strateryName: string, symbol: string, id: string): Promise<void> {
    await LinesService.deleteLine(strateryName, symbol, id);
  },

  /**
   * Deletes rows where the ID starts with idStartWith. Fails silently if none match.
   */
  async deleteStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<void> {
    await LinesService.deleteLinesStartWith(strateryName, symbol, idStartWith);
  },
};