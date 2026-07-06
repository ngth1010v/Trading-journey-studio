import { Text } from './texts.model.js';
import { TextsService } from './texts.service.js';

// Auto-close connections if inactive for 5 minutes
export const CONNECTION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export const texts = {
  /**
   * Creates/saves to database if it does not exist (throws error if missing any field).
   * Overwrites/patches fields if it already exists.
   */
  async save(strateryName: string, symbol: string, id: string, textObj: Text): Promise<void> {
    await TextsService.saveText(strateryName, symbol, id, textObj);
  },

  /**
   * Retrieves a single row by exact ID match. Returns null if not found.
   */
  async get(strateryName: string, symbol: string, id: string): Promise<Text | null> {
    return TextsService.getText(strateryName, symbol, id);
  },

  /**
   * Retrieves all rows where the ID starts with idStartWith. Returns [] if none match.
   */
  async getStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<Text[]> {
    return TextsService.getTextsStartWith(strateryName, symbol, idStartWith);
  },

  /**
   * Deletes a specific text by ID. Fails silently if it doesn't exist.
   */
  async delete(strateryName: string, symbol: string, id: string): Promise<void> {
    await TextsService.deleteText(strateryName, symbol, id);
  },

  /**
   * Deletes rows where the ID starts with idStartWith. Fails silently if none match.
   */
  async deleteStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<void> {
    await TextsService.deleteTextsStartWith(strateryName, symbol, idStartWith);
  },
};