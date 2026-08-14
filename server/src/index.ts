import express, { Request, Response } from 'express';
import { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { logger } from './logger.js';

import { marketServer } from './service-servers/markets-server.js';
import * as modules from "./modules/index.js";

// =============================================================================================================
// GLOBAL
// =============================================================================================================
const app = express();
const PORT = process.env.PORT || 3000;
const _SECTION = 'index.ts';

let server: Server | null = null;
let wss: WebSocketServer | null = null;
let isShuttingDown = false;

// Middleware & Routes
app.use(express.json());
app.use(marketServer.router);
app.get('/', (_req: Request, res: Response) => {
    res.send('Hello World!');
});

// =============================================================================================================
// LOGIC STARTUP & SHUTDOWN 
// =============================================================================================================
function startup(): void {
    modules.color.init();
    modules.theme.init();
    modules.pageElement.init();
    modules.page.init();
    modules.chartData.strategy.init();
    modules.chartData.trade.init();
    modules.chartData.candleChart.sync.link.init();
    modules.chartData.candleChart.shape.init();

    logger.info(_SECTION, 'Start up done!');
}

function useRouter(): void {
    app.use(modules.color.router);
    app.use(modules.theme.router);
    app.use(modules.pageElement.router);
    app.use(modules.page.router);
    app.use(modules.chartData.strategy.router);
    app.use(modules.chartData.trade.router);
    app.use(modules.chartData.candleChart.sync.link.router);
    app.use(modules.chartData.candleChart.shape.router);
}

function attachWs(server : Server) {
    modules.page.attachWs(server);
    modules.chartData.candleChart.sync.link.attachWs(server);
}

async function shutdown(): Promise<void> {
    if (wss) {
        wss.close();
        logger.info(_SECTION, 'WebSocket server closed.');
    }

    modules.color.shutdown();
    modules.theme.shutdown();
    modules.pageElement.shutdown();
    modules.page.shutdown();
    modules.chartData.strategy.shutdown();
    modules.chartData.trade.shutdown();
    modules.chartData.candleChart.sync.link.shutdown();
    modules.chartData.candleChart.shape.shutdown();

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

    if (res) {
        res.status(200).json({ status: "ok", msg: "server shutdown" });
    }

    try {
        await shutdown();

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

// OS signal listeners
process.on('SIGINT', () => void executeShutdown());
process.on('SIGTERM', () => void executeShutdown());

// =============================================================================================================
// WORKFLOW STARTUP
// =============================================================================================================
function startServer(): void {
    try {
        startup();

        useRouter();

        server = app.listen(PORT, () => {
            logger.info(_SECTION, `Server is running on http://localhost:${PORT}`);
        });

        attachWs(server)

    } catch (error) {
        logger.error(_SECTION, `Unable to start the server: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

startServer();