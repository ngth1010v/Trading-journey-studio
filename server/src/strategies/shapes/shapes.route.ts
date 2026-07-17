import { Router, Request, Response } from 'express';
import { ShapesService } from './shapes.service.js';
import { Shape, ShapeTemplate } from './shapes.model.js';

const router = Router();

// GET: Fetch changed shapes matching time windows and update tracking constraints
router.get(
  '/api/strateries/:strateryName/:symbol/shapes/changed',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;
      const { lastUpdateTs, fromTs, toTs } = req.query;

      if (Array.isArray(strateryName) || Array.isArray(symbol)) {
        throw new Error('Invalid route parameters');
      }

      const parsedLastUpdate = lastUpdateTs ? Number(lastUpdateTs) : NaN;
      const parsedFrom = fromTs ? Number(fromTs) : NaN;
      const parsedTo = toTs ? Number(toTs) : NaN;

      // Bad Request Verification for validation requirements
      if (isNaN(parsedLastUpdate) || isNaN(parsedFrom) || isNaN(parsedTo)) {
        res.status(400).json({ 
          error: 'Missing or invalid parameters. lastUpdateTs, fromTs, and toTs must be valid numbers.' 
        });
        return;
      }

      const updatedShapes = await ShapesService.getChangedShapes(
        strateryName,
        symbol,
        parsedLastUpdate,
        parsedFrom,
        parsedTo
      );

      res.json(updatedShapes);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

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

// POST: Add multiple shapes to the database (replaces if existed, auto-creates ID if missing)
router.post(
  '/api/strateries/:strateryName/:symbol/shapes',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;
      const shapes: Shape[] = req.body;

      if (Array.isArray(strateryName) || Array.isArray(symbol)) { 
        throw new Error('Invalid route parameters'); 
      }

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

// 1. Specific route path MUST BE FIRST
router.delete(
  '/api/strateries/:strateryName/:symbol/shapes/type/:typeName',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol, typeName } = req.params;

      if (Array.isArray(strateryName) || Array.isArray(symbol) || Array.isArray(typeName)) {
        throw new Error('Invalid route parameters');
      }

      await ShapesService.deleteShapesByType(strateryName, symbol, typeName);
      res.status(200).json({ message: `All shapes of type '${typeName}' deleted successfully` });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

// 2. Generic route path AFTER
router.delete(
  '/api/strateries/:strateryName/:symbol/shapes/:id',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol, id } = req.params;

      if (Array.isArray(strateryName) || Array.isArray(symbol) || Array.isArray(id)) { 
        throw new Error('Invalid route parameters'); 
      }

      const numericId = Number(id);
      if (isNaN(numericId)) {
        res.status(400).json({ error: 'ID must be a valid number' });
        return;
      }

      await ShapesService.deleteShape(strateryName, symbol, numericId);
      res.status(200).json({ message: 'Shape deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

// GET: Fetch all templates
router.get(
  '/api/strateries/:strateryName/:symbol/shapes/templates',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;

      if (Array.isArray(strateryName) || Array.isArray(symbol)) {
        throw new Error('Invalid route parameters');
      }

      const templates = await ShapesService.getAllTemplates(strateryName, symbol);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

// POST: Add bulk templates to the database (replaces if existed, auto-creates ID if missing)
router.post(
  '/api/strateries/:strateryName/:symbol/shapes/templates',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;
      const templates: ShapeTemplate[] = req.body;

      if (Array.isArray(strateryName) || Array.isArray(symbol)) {
        throw new Error('Invalid route parameters');
      }

      if (!Array.isArray(templates)) {
        res.status(400).json({ error: 'Payload must be an array of templates' });
        return;
      }

      await ShapesService.saveTemplates(strateryName, symbol, templates);
      res.status(200).json({ message: 'Templates saved successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

// DELETE: Delete a specific template by numeric ID
router.delete(
  '/api/strateries/:strateryName/:symbol/shapes/templates/:id',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol, id } = req.params;

      if (Array.isArray(strateryName) || Array.isArray(symbol) || Array.isArray(id)) {
        throw new Error('Invalid route parameters');
      }

      const numericId = Number(id);
      if (isNaN(numericId)) {
        res.status(400).json({ error: 'ID must be a valid number' });
        return;
      }

      await ShapesService.deleteTemplate(strateryName, symbol, numericId);
      res.status(200).json({ message: 'Template deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

export const shapesRouter = router;