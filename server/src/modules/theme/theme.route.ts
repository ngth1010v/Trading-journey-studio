import { Router, Request, Response } from 'express';
import { ThemeService } from './theme.service.js';

export function createThemeRouter(service: ThemeService): Router {
    const router = Router();

    router.get('/api/themes', (req: Request, res: Response) => {
        try {
            const themes = service.getAll();
            res.json({ success: true, data: themes });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/themes/:id', (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const parsedId = Number(id);

            if (isNaN(parsedId)) {
                res.status(400).json({ success: false, error: 'Invalid ID format. Theme ID must be a number.' });
                return;
            }

            const updatedTheme = service.save(parsedId, req.body);
            res.json({ success: true, data: updatedTheme });
        } catch (err: any) {
            const status = err.message.includes("Validation failed") ? 400 : 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    router.delete('/api/themes/:id', (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const parsedId = Number(id);

            if (isNaN(parsedId)) {
                res.status(400).json({ success: false, error: 'Invalid ID format. Theme ID must be a number.' });
                return;
            }

            service.delete(parsedId);
            res.json({ success: true, message: `Theme with ID ${parsedId} deleted successfully.` });
        } catch (err: any) {
            const status = err.message.includes("does not exist") ? 400 : 500;
            res.status(status).json({ success: false, error: err.message });
        }
    });

    return router;
}