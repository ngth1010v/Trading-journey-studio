import { Router, Request, Response } from 'express';
import { TextsService } from './texts.service.js';

const router = Router();

router.get(
  '/api/strateries/:strateryName/:symbol/texts',
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
        const matchingTexts = await TextsService.getTextsByTimestampRange(
          strateryName,
          symbol,
          parsedFrom,
          parsedTo
        );
        res.json(matchingTexts);
        return;
      }

      // Default fallback if parameters are invalid/omitted
      const allTexts = await TextsService.getAllTexts(strateryName, symbol);
      res.json(allTexts);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }
);

export const textsRouter = router;