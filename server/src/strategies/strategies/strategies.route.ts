import { Router, Request, Response } from 'express';
import { repository } from './strategies.repository.js';
import { service } from './strategies.service.js';
import { logger } from '../../logger.js';

const _SECTION = "strategies";
const router = Router();

// GET /api/strategies -> return all strategies
router.get('/api/strategies', (req: Request, res: Response) => {
  try {
    const data = repository.getAllStrategies();
    res.json(data);
  } catch (error: any) {
    logger.error(_SECTION, `GET /api/strategies failed: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/strategies/tags -> return all strategy-tags
router.get('/api/strategies/tags', (req: Request, res: Response) => {
  try {
    const data = repository.getAllTags();
    res.json(data);
  } catch (error: any) {
    logger.error(_SECTION, `GET /api/strategies/tags failed: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/strategies -> create or update strategy
router.post('/api/strategies', (req: Request, res: Response) => {
  try {
    const validationError = service.validateStrategy(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    repository.saveStrategy(req.body);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(_SECTION, `POST /api/strategies failed: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/strategies/tags -> create or update tag
router.post('/api/strategies/tags', (req: Request, res: Response) => {
  try {
    const validationError = service.validateTag(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    repository.saveTag(req.body);
    res.json({ success: true });
  } catch (error: any) {
    logger.error(_SECTION, `POST /api/strategies/tags failed: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/strategies/:name
router.delete('/api/strategies/:name', (req: Request, res: Response) => {
  try {
    const rawName = req.params.name;
    const name = Array.isArray(rawName) ? rawName[0] : rawName;

    if (!name) {
      return res.status(400).json({ error: 'Strategy name parameter is missing.' });
    }

    const deleted = repository.deleteStrategy(name);
    if (!deleted) {
      return res.status(404).json({ error: `Strategy '${name}' not found.` });
    }
    res.json({ success: true });
  } catch (error: any) {
    logger.error(_SECTION, `DELETE /api/strategies/${req.params.name} failed: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/strategies/tags/:name
router.delete('/api/strategies/tags/:name', (req: Request, res: Response) => {
  try {
    const rawName = req.params.name;
    const name = Array.isArray(rawName) ? rawName[0] : rawName;

    if (!name) {
      return res.status(400).json({ error: 'Tag name parameter is missing.' });
    }

    const deleted = repository.deleteTag(name);
    if (!deleted) {
      return res.status(404).json({ error: `Tag '${name}' not found.` });
    }
    res.json({ success: true });
  } catch (error: any) {
    logger.error(_SECTION, `DELETE /api/strategies/tags/${req.params.name} failed: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export { router };