import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { linkService } from './link.service.js';
import { linkDataRouter } from './link.route.data.js';
import { linkStateRouter } from './link.route.state.js';
import { Server } from 'node:http';

const router = Router();
router.use(linkDataRouter);
router.use(linkStateRouter);

function init(): void {
  linkService.init();
}

function shutdown(): void {
  linkService.shutdown();
}

function attachWs(server: Server): void {
    const wss = new WebSocketServer({
        server,
        path: '/ws/chartData/candleChart/sync/link/state',
    });

    linkService.attachWs(wss);
}

export const link = {
  init,
  shutdown,
  router,
  attachWs
};