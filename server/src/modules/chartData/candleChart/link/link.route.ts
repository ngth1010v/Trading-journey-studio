import { Router, Request, Response } from "express";
import { linkRepository } from "./link.repository.js";
import { LinkService } from "./link.service.js";

const router = Router();
const BASE = "api/chartData/candleChart/links"

// GET api/links -> return all links as Link[]
router.get(`${BASE}`, (req: Request, res: Response) => {
  try {
    const links = linkRepository.findAll();
    res.json(links);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch links" });
  }
});

// POST api/links -> save link with id or without id; return {id: number}
router.post(`${BASE}`, (req: Request, res: Response): void => {
  try {
    const payload = req.body;

    // 400 validation error if payload is structurally missing fields
    if (!LinkService.isValidLink(payload)) {
      res.status(400).json({ error: "Missing or invalid payload fields" });
      return;
    }

    const { id, name, color } = payload;

    if (id !== undefined && id !== null) {
      // If ID is provided, check if it exists
      const existingLink = linkRepository.findById(id);
      if (!existingLink) {
        res.status(404).json({ error: `Link with ID ${id} not found` });
        return;
      }
      
      // Upsert/Update behavior
      linkRepository.update({ id, name, color });
      res.json({ id });
      return;
    } else {
      // Create new record using database autoincrement ID
      const newId = linkRepository.create({ name, color });
      res.json({ id: newId });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to process target link operation" });
  }
});

// DELETE api/links/:id -> delete existing link
router.delete(`${BASE}/:id`, (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID parameter supplied" });
      return;
    }

    const deleted = linkRepository.delete(id);
    if (!deleted) {
      res.status(404).json({ error: `Link with ID ${id} not found` });
      return;
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to delete target link" });
  }
});

export { router as linkRouter };