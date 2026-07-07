import { Router, Request, Response } from 'express';
import { ShapesService } from './shapes.service.js';
import { Shape } from './shapes.model.js';

const router = Router();

// GET: Fetch shapes by timestamp range
router.get(
  '/api/strateries/:strateryName/:symbol/shapes',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;
      const { fromTs, toTs } = req.query;

      if (Array.isArray(strateryName) || Array.isArray(symbol)) {
        throw new Error('Invalid route parameters');
      }

      const parsedFrom = fromTs ? Number(fromTs) : NaN;
      const parsedTo = toTs ? Number(toTs) : NaN;

      if (!isNaN(parsedFrom) && !isNaN(parsedTo)) {
        const matchingShapes = await ShapesService.getShapesByTimestampRange(
          strateryName,
          symbol,
          parsedFrom,
          parsedTo
        );
        res.json(matchingShapes);
        return;
      }

      // Default fallback: return all database entries for strategy/symbol
      const allShapes = await ShapesService.getAllShapes(strateryName, symbol);
      res.json(allShapes);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

// POST: Add multiple shapes to the database (replaces if existed)
router.post(
  '/api/strateries/:strateryName/:symbol/shapes',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;
      const shapes: Shape[] = req.body;

      if (Array.isArray(strateryName) || Array.isArray(symbol)) { throw new Error('Invalid route parameters'); }

      if (!Array.isArray(shapes)) {
        res.status(400).json({ error: 'Payload must be an array of shapes' });
        return;
      }

      await ShapesService.saveShapes(strateryName, symbol, shapes);
      res.status(200).json({ message: 'Shapes saved successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

// DELETE: Delete all shapes starting with a specific ID (or all if ID is empty)
// Note: Optional param '?' allows '/startWith/' or '/startWith' to match as empty ID
router.delete(
  '/api/strateries/:strateryName/:symbol/shapes/startWith/:id?',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;
      const idStartWith = req.params.id || ''; // Fallback to empty string for full deletion

      if (Array.isArray(strateryName) || Array.isArray(symbol) || Array.isArray(idStartWith)) { throw new Error('Invalid route parameters'); }

      await ShapesService.deleteShapesStartWith(strateryName, symbol, idStartWith);
      res.status(200).json({ message: 'Shapes deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

// DELETE: Delete a specific shape by ID
router.delete(
  '/api/strateries/:strateryName/:symbol/shapes/:id',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol, id } = req.params;

      if (Array.isArray(strateryName) || Array.isArray(symbol) || Array.isArray(id)) { throw new Error('Invalid route parameters'); }

      await ShapesService.deleteShape(strateryName, symbol, id);
      res.status(200).json({ message: 'Shape deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

export const shapesRouter = router;