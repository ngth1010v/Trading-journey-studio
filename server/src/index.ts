import express, { Request, Response } from 'express';

import { Server } from 'node:http';
import { logger } from './logger.js';
import { marketServer } from './service-servers/markets-server.js';
import { clientServer } from './service-servers/client-server.js';

const app = express();
const PORT = process.env.PORT || 3000;
const _SECTION = 'index.ts';

let server: Server | null = null;
let isShuttingDown = false;

// Middleware & Routes
app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
    res.send('Hello World!');
});

// =============================================================================================================
// LOGIC STARTUP & SHUTDOWN 
// =============================================================================================================
function startup(): void {
    marketServer.init();
    clientServer.init();
    logger.info(_SECTION, 'Start up done!');
}

async function shutdown(): Promise<void> {
    await marketServer.shutdown();
    await clientServer.shutdown();
    logger.info(_SECTION, 'Shutdown done!');
}




// =============================================================================================================
// WORKFLOW SHUTDOWN
// =============================================================================================================
async function executeShutdown(res?: Response): Promise<void> {
    if (isShuttingDown) {
        res?.status(409).send('Shutdown already in progress.');
        return;
    }
    isShuttingDown = true;

    // 1. Phản hồi API trước (nếu gọi từ route SHUTDOWN) để ngắt kết nối ngay lập tức
    if (res) {
        res.status(200).json({ status: "ok", msg: "server shutdown" });
    }

    try {
        // 2. Chạy logic shutdown bên ngoài
        await shutdown();

        // 3. Đóng server / port (Đợi đóng xong hoàn toàn mới đi tiếp)
        // if (server) {
        //     await new Promise<void>((resolve) => server!.close(() => resolve()));
        //     logger.info(_SECTION, 'HTTP server closed.');
        // }

        logger.info(_SECTION, 'Process terminated gracefully.');
        process.exit(0);
    } catch (err) {
        logger.error(_SECTION, `Error during shutdown: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
}

// Route SHUTDOWN
app.get('/SHUTDOWN', (_req: Request, res: Response) => {
    logger.warn(_SECTION, 'HTTP /SHUTDOWN endpoint called');
    void executeShutdown(res);
});

// Hệ thống lắng nghe tín hiệu OS
process.on('SIGINT', () => void executeShutdown());
process.on('SIGTERM', () => void executeShutdown());

// =============================================================================================================
// WORKFLOW STARTUP
// =============================================================================================================
function startServer(): void {
    try {
        // 1. Chạy startup 100% trước
        startup();

        // 2. Mở server / port
        server = app.listen(PORT, () => {
            logger.info(_SECTION, `Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        logger.error(_SECTION, `Unable to start the server: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

// Khởi chạy ứng dụng
startServer();