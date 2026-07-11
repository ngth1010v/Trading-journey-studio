import { Shape } from './shapes.model.js';
import { ShapesService } from './shapes.service.js';
import { shapesRouter } from './shapes.route.js';

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
  async get(strateryName: string, symbol: string, id: number): Promise<Shape | null> {
    return ShapesService.getShape(strateryName, symbol, id);
  },

  /**
   * Deletes a specific shape by ID. Fails silently if it doesn't exist.
   */
  async delete(strateryName: string, symbol: string, id: number): Promise<void> {
    await ShapesService.deleteShape(strateryName, symbol, id);
  },

  router: shapesRouter
};