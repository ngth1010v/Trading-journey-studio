import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { linkService } from './link.service.js';
import { linkDataRouter } from './link.route.data.js';
import { linkStateRouter } from './link.route.state.js';
import { Server } from 'node:http';

const router = Router();
router.use(linkDataRouter);
router.use(linkStateRouter);

let wss: WebSocketServer | null = null;

function init(): void {
  linkService.init();
}

function shutdown(): void {
  if (wss) {
    wss.close();
    wss = null;
  }
  linkService.shutdown();
}

function attachWs(server: Server): void {
  if (wss) return;

  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers?.host || "localhost"}`);

    // Ignore upgrade requests meant for other WS routes
    if (url.pathname !== "/ws/chartData/candleChart/sync/link/state") {
      return;
    }

    wss!.handleUpgrade(request, socket, head, (ws) => {
      wss!.emit("connection", ws, request);
    });
  });

  linkService.attachWs(wss);
}

export const link = {
  init,
  shutdown,
  router,
  attachWs
};