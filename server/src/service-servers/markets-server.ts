import { logger } from "../logger.js";
import { Router, Request, Response } from 'express';

const _SECTION = "chartData";
const router = Router();

// Matches /api/chartData/symbols, /api/chartData/symbols/*, 
// /api/chartData/candles, and /api/chartData/candles/*
const routePattern = /^\/api\/chartData\/(symbols|candles)(\/.*)?$/;

router.all(routePattern, async (req: Request, res: Response) => {
    // 1. SHUTDOWN Block Protection
    if (req.path.toUpperCase().includes('/SHUTDOWN')) {
        logger.warn(
            _SECTION,
            `Blocked attempt to access protected route: ${req.method} ${req.originalUrl}`
        );

        res.status(403).json({
            error: 'Access denied.'
        });
        return;
    }

    // 2. Exact Path & Query String Forwarding
    // Preserves the full original URL (e.g., /api/chartData/symbols?param=123)
    const targetUrl = `http://localhost:5000${req.originalUrl}`;

    // 3. Prepare Forwarding Headers
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined && key.toLowerCase() !== 'host') {
            headers[key] = Array.isArray(value) ? value.join(', ') : value;
        }
    }

    // 4. Handle Incoming Request Body (Client -> Proxy -> Server)
    let body: any = undefined;
    if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) {
        if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
            body = req.body;
        } else if (req.body && Object.keys(req.body).length > 0) {
            body = JSON.stringify(req.body);
        }
    }

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: body as RequestInit['body'],
        });

        res.status(response.status);

        // Copy critical response headers back to client
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('content-type', contentType);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            res.setHeader('content-length', contentLength);
        }

        // Remove ETag for binary routes to prevent weak ETag conflicts
        if (req.path.endsWith('/bin')) {
            res.removeHeader('ETag');
        }

        // 5. Handle Response Payload (Server -> Proxy -> Client)
        // ArrayBuffer handles both raw binary payloads and standard JSON seamlessly
        const arrayBuffer = await response.arrayBuffer();
        const responseBuffer = Buffer.from(arrayBuffer);

        res.send(responseBuffer);

    } catch (error) {
        logger.error(
            _SECTION,
            `Proxy request failed: ${error instanceof Error ? error.message : String(error)}`
        );

        res.status(502).json({
            error: 'Unable to connect to market service server.'
        });
    }
});

//==============================================================================================
// EXPORT
//==============================================================================================
export const marketServer = {
    router
};