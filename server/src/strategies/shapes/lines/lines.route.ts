import { Router, Request, Response } from 'express';
import { LinesService } from './lines.service.js';

const router = Router();

router.get(
  '/api/strateries/:strateryName/:symbol/lines',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { strateryName, symbol } = req.params;
      const { fromTs, toTs } = req.query;

      if (Array.isArray(strateryName) || Array.isArray(symbol)) {
        throw new Error('Invalid route parameters');
      }

      const parsedFrom = fromTs ? Number(fromTs) : NaN;
      const parsedTo = toTs ? Number(toTs) : NaN;

      // Check if both limits parameters are valid integers
      if (!isNaN(parsedFrom) && !isNaN(parsedTo)) {
        const matchingLines = await LinesService.getLinesByTimestampRange(
          strateryName,
          symbol,
          parsedFrom,
          parsedTo
        );
        res.json(matchingLines);
        return;
      }

      // Default fallback: return all database entries for strategy/symbol
      const allLines = await LinesService.getAllLines(strateryName, symbol);
      res.json(allLines);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

export const linesRouter = router;