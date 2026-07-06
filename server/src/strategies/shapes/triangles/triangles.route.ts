import { Router, Request, Response } from 'express';
import { TrianglesService } from './triangles.service.js';

const router = Router();

router.get(
  '/api/strateries/:strateryName/:symbol/triangles',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;
      const { fromTs, toTs } = req.query;

      const parsedFrom = fromTs ? Number(fromTs) : NaN;
      const parsedTo = toTs ? Number(toTs) : NaN;

      if (Array.isArray(strateryName) || Array.isArray(symbol)) {
        throw new Error('Invalid route parameters');
    }

      if (!isNaN(parsedFrom) && !isNaN(parsedTo)) {
        const matchingTriangles = await TrianglesService.getTrianglesByTimestampRange(
          strateryName,
          symbol,
          parsedFrom,
          parsedTo
        );
        res.json(matchingTriangles);
        return;
      }

      // Default fallback: return all database entries for strategy/symbol
      const allTriangles = await TrianglesService.getAllTriangles(strateryName, symbol);
      res.json(allTriangles);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

export const trianglesRouter = router;