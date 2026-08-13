import { Router } from "express";
import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { PageRepository } from "./page.repository.js";
import { PageService } from "./page.service.js";
import { createPageRouter } from "./page.route.js";
import { WsClientMessage, WsServerMessage } from "./page.model.js";

let pageRouter: Router | null = null;
let pageService: PageService | null = null;
let pageRepository: PageRepository | null = null;
let wss: WebSocketServer | null = null;

function broadcastPages(): void {
  if (!wss || !pageService) return;

  const payload: WsServerMessage = {
    type: "PAGES_UPDATED",
    payload: pageService.getAllPages(),
  };
  const data = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

export const page = {
  get router(): Router {
    if (!pageRouter) {
      throw new Error("Page module must be initialized by calling .init() before accessing the router.");
    }
    return pageRouter;
  },

  init: (): void => {
    pageRepository = new PageRepository();
    pageRepository.init();

    pageService = new PageService(pageRepository);
    pageService.init();

    pageRouter = createPageRouter(pageService);
  },

  attachWs: (server: HttpServer): void => {
    if (!pageService) {
      throw new Error("Page module must be initialized before attaching WebSocket.");
    }

    if (wss) {
      return; // Prevent duplicate attachment if attachWs is called multiple times
    }

    wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url || "", `http://${request.headers?.host || "localhost"}`);

      // GUARANTEED PATH ISOLATION: Ignore upgrade requests intended for other WS modules
      if (url.pathname !== "/ws/pages") {
        return;
      }

      const key = url.searchParams.get("key");

      if (!key || !pageService!.isValidKey(key)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit("connection", ws, request);
      });
    });

    wss.on("connection", (ws: WebSocket) => {
      // Send initial data snapshot
      const initMessage: WsServerMessage = {
        type: "INIT",
        payload: pageService!.getAllPages(),
      };
      ws.send(JSON.stringify(initMessage));

      ws.on("message", (rawMessage: ArrayBuffer | Buffer | string) => {
        try {
          const msg = JSON.parse(rawMessage.toString()) as WsClientMessage;

          if (msg.type === "SET_PAGE") {
            pageService!.setPage(msg.payload);
            broadcastPages();
          } else if (msg.type === "REMOVE_PAGE") {
            pageService!.removePage(msg.payload.id);
            broadcastPages();
          }
        } catch (err) {
          console.error("[Page WS] Error processing client message:", err);
        }
      });
    });
  },

  isElementExist: (pageId: number, elementId: number): boolean | null => {
    if (!pageService) return null;
    return pageService.isElementExist(pageId, elementId);
  },

  flush: (): void => {
    if (pageService) {
      pageService.flush();
    }
  },

  shutdown: async (): Promise<void> => {
    if (pageService) {
      pageService.flush();
    }

    if (wss) {
      wss.close();
      wss = null;
    }

    if (pageRepository) {
      pageRepository.close();
      pageRepository = null;
    }

    pageRouter = null;
    pageService = null;
  },
};