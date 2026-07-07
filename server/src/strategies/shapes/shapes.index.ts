import { Shape } from './shapes.model.js';
import { ShapesService } from './shapes.service.js';

// Auto-close connections if inactive for 5 minutes
export const CONNECTION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export const shapes = {
  /**
   * Creates or replaces a single shape in the database.
   * Throws an error if any field is missing.
   */
  async save(strateryName: string, symbol: string, shape: Shape): Promise<void> {
    await ShapesService.saveShapes(strateryName, symbol, [shape]);
  },

  /**
   * Bulk inserts or replaces multiple shapes in the database.
   * Throws an error if any field is missing on any shape.
   */
  async saveMultiple(strateryName: string, symbol: string, shapesArray: Shape[]): Promise<void> {
    await ShapesService.saveShapes(strateryName, symbol, shapesArray);
  },

  /**
   * Retrieves a single row by exact ID match. Returns null if not found.
   */
  async get(strateryName: string, symbol: string, id: string): Promise<Shape | null> {
    return ShapesService.getShape(strateryName, symbol, id);
  },

  /**
   * Retrieves all rows where the ID starts with idStartWith. Returns [] if none match.
   */
  async getStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<Shape[]> {
    return ShapesService.getShapesStartWith(strateryName, symbol, idStartWith);
  },

  /**
   * Deletes a specific shape by ID. Fails silently if it doesn't exist.
   */
  async delete(strateryName: string, symbol: string, id: string): Promise<void> {
    await ShapesService.deleteShape(strateryName, symbol, id);
  },

  /**
   * Deletes rows where the ID starts with idStartWith. 
   * Fails silently if none match. Passing an empty string removes all.
   */
  async deleteStartWith(strateryName: string, symbol: string, idStartWith: string): Promise<void> {
    await ShapesService.deleteShapesStartWith(strateryName, symbol, idStartWith);
  },
};