import { Router, Request, Response } from 'express';
import { TradesService } from './trades.service.js';
import { Trade, TradeTag, TradeTemplate } from './trades.model.js';

const router = Router();

// --- TRADES ---

router.get('/api/strateries/:strateryName/:symbol/trades', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol } = req.params;
    const { lastUpdateTs, fromTs, toTs } = req.query;

    const parsedFrom = Number(fromTs);
    const parsedTo = Number(toTs);
    const parsedLastUpdate = lastUpdateTs ? Number(lastUpdateTs) : undefined;

    if (isNaN(parsedFrom) || isNaN(parsedTo) || parsedFrom < 0 || parsedTo < 0) {
      res.status(400).json({ error: 'fromTs and toTs must be valid numbers >= 0' });
      return;
    }

    if (Array.isArray(strateryName) || Array.isArray(symbol)) {throw new Error('Invalid route parameters');}
    const trades = await TradesService.getTrades(strateryName, symbol, parsedFrom, parsedTo, parsedLastUpdate);
    res.json(trades);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

router.post('/api/strateries/:strateryName/:symbol/trades', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol } = req.params;
    const trade: Trade = req.body;
    
    if (Array.isArray(strateryName) || Array.isArray(symbol)) {throw new Error('Invalid route parameters');}
    await TradesService.saveTrade(strateryName, symbol, trade);
    res.status(200).json({ message: 'Trade saved successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

router.delete('/api/strateries/:strateryName/:symbol/trades/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol, id } = req.params;
    const numericId = Number(id);
    if (isNaN(numericId)) {
      res.status(400).json({ error: 'ID must be a valid number' });
      return;
    }

    if (Array.isArray(strateryName) || Array.isArray(symbol)) {throw new Error('Invalid route parameters');}
    await TradesService.deleteTrade(strateryName, symbol, numericId);
    res.status(200).json({ message: 'Trade deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});


// --- TAGS ---

router.get('/api/strateries/:strateryName/:symbol/trades/tags', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol } = req.params;
    const { lastUpdateTs } = req.query;
    const parsedLastUpdate = lastUpdateTs ? Number(lastUpdateTs) : undefined;

    if (Array.isArray(strateryName) || Array.isArray(symbol)) {throw new Error('Invalid route parameters');}
    const tags = await TradesService.getTags(strateryName, symbol, parsedLastUpdate);
    res.json(tags);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

router.post('/api/strateries/:strateryName/:symbol/trades/tags', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol } = req.params;
    const tag: TradeTag = req.body;

    if (Array.isArray(strateryName) || Array.isArray(symbol)) {throw new Error('Invalid route parameters');}
    await TradesService.saveTag(strateryName, symbol, tag);
    res.status(200).json({ message: 'Tag saved successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

router.delete('/api/strateries/:strateryName/:symbol/trades/tags/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol, id } = req.params;
    const numericId = Number(id);
    if (isNaN(numericId)) {
      res.status(400).json({ error: 'ID must be a valid number' });
      return;
    }

    if (Array.isArray(strateryName) || Array.isArray(symbol)) {throw new Error('Invalid route parameters');}
    await TradesService.deleteTag(strateryName, symbol, numericId);
    res.status(200).json({ message: 'Tag deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});


// --- TEMPLATES ---

router.get('/api/strateries/:strateryName/:symbol/trades/templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol } = req.params;
    if (Array.isArray(strateryName) || Array.isArray(symbol)) {throw new Error('Invalid route parameters');}
    const templates = await TradesService.getTemplates(strateryName, symbol);
    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

router.post('/api/strateries/:strateryName/:symbol/trades/templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol } = req.params;
    const template: TradeTemplate = req.body;

    if (!template.name) {
      res.status(400).json({ error: 'Template name is required' });
      return;
    }
    if (Array.isArray(strateryName) || Array.isArray(symbol)) {throw new Error('Invalid route parameters');}
    await TradesService.saveTemplate(strateryName, symbol, template);
    res.status(200).json({ message: 'Template saved successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// Using ':name' parameter for delete to target the TradeTemplate primary key as requested
router.delete('/api/strateries/:strateryName/:symbol/trades/templates/:name', async (req: Request, res: Response): Promise<void> => {
  try {
    const { strateryName, symbol, name } = req.params;
    
    if (Array.isArray(strateryName) || Array.isArray(symbol) || Array.isArray(name)) {throw new Error('Invalid route parameters');}
    await TradesService.deleteTemplate(strateryName, symbol, name);
    res.status(200).json({ message: 'Template deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

export const tradesRouter = router;