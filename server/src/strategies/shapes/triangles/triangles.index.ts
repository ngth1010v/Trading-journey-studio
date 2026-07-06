import { Triangle } from './triangles.model.js';
import { TrianglesService } from './triangles.service.js';

// Auto-close connections if inactive for 5 minutes
export const CONNECTION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export const triangles = {
  /**
   * Creates/saves to database if it does not exist (throws error if missing any field).
   * Overwrites/patches fields if it already exists.
   */
  async save(strateryName: string, symbol: string, id: string, triangle: Triangle): Promise<void> {
    await TrianglesService.saveTriangle(strateryName, symbol, id, triangle);
  },

  /**
   * Retrieves a single row by exact ID match. Returns null if not found.
   */
  async get(strateryName: string, symbol: string, id: string): Promise<Triangle | null> {
    return TrianglesService.getTriangle(strateryName, symbol, id);
  },

  /**
   * Retrieves all rows where the ID starts with idStartWith. Returns [] if none match.
   */
  async getStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<Triangle[]> {
    return TrianglesService.getTrianglesStartWith(strateryName, symbol, idStartWith);
  },

  /**
   * Deletes a specific triangle by ID. Fails silently if it doesn't exist.
   */
  async delete(strateryName: string, symbol: string, id: string): Promise<void> {
    await TrianglesService.deleteTriangle(strateryName, symbol, id);
  },

  /**
   * Deletes rows where the ID starts with idStartWith. Fails silently if none match.
   */
  async deleteStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<void> {
    await TrianglesService.deleteTrianglesStartWith(strateryName, symbol, idStartWith);
  },
};