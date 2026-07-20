import { Router, Request, Response } from 'express';
import { ThemeService } from './theme.service.js';

export function createThemeRouter(service: ThemeService): Router {
    const router = Router();

    // GET api/themes -> Fetch all stored custom options along with base defaults
    router.get('/api/themes', (req: Request, res: Response) => {
        try {
            const themes = service.getAll();
            res.json({ success: true, data: themes });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET api/themes/changed/:timestamp -> Returns flat list array of theme names changed after timestamp
    router.get('/api/themes/changed/:timestamp', (req: Request, res: Response) => {
        try {
            const { timestamp } = req.params;
            const parsedTimestamp = Number(timestamp);

            if (isNaN(parsedTimestamp)) {
                res.status(400).json({ success: false, error: 'Timestamp must be a valid number.' });
                return;
            }

            const changedThemes = service.getChangedThemesSince(parsedTimestamp);
            res.json(changedThemes);
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST api/themes/:name -> Create or perform updates to an option
    router.post('/api/themes/:name', (req: Request, res: Response) => {
        try {
            const { name } = req.params;
            if (Array.isArray(name)) {
                throw new Error('Invalid route parameters');
            }
            const updatedTheme = service.save(name, req.body);
            res.json({ success: true, data: updatedTheme });
        } catch (err: any) {
            const status = err.message.includes("Cannot modify") ? 400 : 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    // DELETE api/themes/:name -> Purge data option records safely
    router.delete('/api/themes/:name', (req: Request, res: Response) => {
        try {
            const { name } = req.params;
            if (Array.isArray(name)) {
                throw new Error('Invalid route parameters');
            }
            service.delete(name);
            res.json({ success: true, message: `Theme '${name}' deleted successfully.` });
        } catch (err: any) {
            const status = err.message.includes("Cannot delete") || err.message.includes("does not exist") ? 400 : 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    return router;
}