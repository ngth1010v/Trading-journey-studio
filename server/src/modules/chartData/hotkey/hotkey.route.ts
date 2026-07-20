import { Router, Request, Response } from "express";
import { HotkeyService } from "./hotkey.service.js";

const BASE = "/api/chartData/hotkey"

export function createHotkeyRouter(service: HotkeyService): Router {
  const router = Router();

  // GET api/hotkeys/:chartType
  router.get(`${BASE}/:chartType`, (req: Request, res: Response) => {
    const { chartType } = Array.isArray(req.params) ? req.params[0] : req.params;
    const hotkeys = service.getHotkeysByChart(chartType);
    res.json(hotkeys);
  });

  // POST api/hotkeys
  router.post(`${BASE}/`, (req: Request, res: Response): any => {
    const { id, chartType, keys, actions } = req.body;

    // Validate strictly required payload fields
    if (!chartType || !Array.isArray(keys) || !Array.isArray(actions)) {
      return res.status(400).send("Bad Request: Missing required fields");
    }

    const result = service.saveHotkey({ id, chartType, keys, actions });
    
    if (!result) {
      return res.status(404).end(); // Empty body 404 response per your instruction
    }

    res.json(result);
  });

  // DELETE api/hotkeys/:id
  router.delete(`${BASE}/:id`, (req: Request, res: Response): any => {
    const id = parseInt(req.params.id as string, 10);
    
    if (isNaN(id)) {
      return res.status(400).send("Invalid ID format");
    }

    const deleted = service.deleteHotkey(id);
    if (!deleted) {
      return res.status(404).end();
    }

    res.status(204).end();
  });

  return router;
}