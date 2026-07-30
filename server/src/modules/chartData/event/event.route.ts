import { Router, Request, Response } from "express";
import { eventService } from "./event.service.js";

const router = Router();

// GET /api/chartData/events -> return Event[]
router.get("/api/chartData/events", (_req: Request, res: Response) => {
  try {
    const events = eventService.getAllEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/chartData/events -> return { id: number }
router.post("/api/chartData/events", (req: Request, res: Response) => {
  try {

    console.log(req.body)
    const result = eventService.saveEvent(req.body);

    if (!result) {
      return res.status(404).json({ error: "Event with the specified id was not found" });
    }

    res.status(200).json(result);
  } catch (error) {
    console.log(error)
    res.status(400).json({ error: (error as Error).message });
  }
});

// DELETE /api/chartData/events/:id -> return 404 if id not found
router.delete("/api/chartData/events/:id", (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID parameter" });
    }

    const deleted = eventService.deleteEvent(id);

    if (!deleted) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export { router as eventRouter };