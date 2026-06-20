import { logger } from "../logger.js";
import { exec } from 'child_process';

const _SECTION = "markets"

//==============================================================================================
// STATE
//==============================================================================================
function init(): void {
    const command = 'start "Market service server" python python/main.py';

    exec(command, (error, stdout, stderr) => {
        if (error) {
            logger.error(_SECTION, `Open market-server error: ${error.message}`);
            return;
        }
        if (stderr) {
            logger.error(_SECTION, `Open market-server error: ${stderr}`);
            return;
        }
    });

    logger.info(_SECTION, `Open market-server successfully.`);
}

async function shutdown(): Promise<void> {
    const url = 'http://localhost:5000/SHUTDOWN';

    logger.info(_SECTION, `Shutting down Market-server...`);
    
    try {
        const response = await fetch(url, { method: 'GET' });
        
        if (response.ok) {
            logger.info(_SECTION, `Markets-database-server shutdown successfully.`);
        } else {
            logger.error(_SECTION, `Server rejected the shutdown command. Status code: ${response.status}`);
        }
    } catch (error: any) { 
        // Kiểm tra nếu lỗi do không kết nối được (server chưa mở)
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNetworkError = error?.code === 'ECONNREFUSED' || errorMessage.includes('fetch failed') || errorMessage.includes('undici');

        if (isNetworkError) {
            logger.warn(
                _SECTION, 
                `Markets-database-server is not running or already closed (Connection refused).`
            );
        } else {
            // Các lỗi khác (lỗi logic, lỗi hệ thống khác) thì vẫn giữ là error
            logger.error(
                _SECTION, 
                `Connection error to server during shutdown request: ${errorMessage}`
            );
        }
    }
}


//==============================================================================================
// ROUTE
//==============================================================================================
import { Router, Request, Response } from 'express';

const router = Router();


router.all(/^\/api\/markets\/(.*)/, async (req, res) => {
    const content = req.params[0];

    if (content.toUpperCase() === 'SHUTDOWN') {
        logger.warn(
            _SECTION,
            `Blocked attempt to access protected route: ${req.method} /api/markets/SHUTDOWN`
        );

        res.status(403).json({
            error: 'Access denied.'
        });

        return;
    }

    const targetUrl = `http://localhost:5000/${content}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

    logger.debug(_SECTION, `API -> Market-server: ${req.method} ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body: ['GET', 'HEAD'].includes(req.method.toUpperCase())
                ? undefined
                : JSON.stringify(req.body),
        });

        const text = await response.text();

        res.status(response.status);

        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('content-type', contentType);
        }

        res.send(text);
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
    init,
    shutdown,
    router
}