import { WebSocket, WebSocketServer } from 'ws';
import { Link, LinkState } from './link.model.js';
import { linkRepository } from './link.repository.js';

// High-speed in-memory store for states (~1000 updates/sec)
const stateMap = new Map<number, LinkState>();
const wsSubscriptions = new Map<number, Set<WebSocket>>();

export const linkService = {
  init(): void {
    linkRepository.init();
    const links = linkRepository.getAll();
    for (const link of links) {
      if (link.id !== undefined && !stateMap.has(link.id)) {
        stateMap.set(link.id, null);
      }
    }
  },

  shutdown(): void {
    linkRepository.shutdown();
    stateMap.clear();
    wsSubscriptions.clear();
  },

  getAllLinks(): Link[] {
    return linkRepository.getAll();
  },

  getLinkById(id: number): Link | undefined {
    return linkRepository.getById(id);
  },

  saveLink(link: Link): { id: number } {
    if (link.id !== undefined && linkRepository.getById(link.id)) {
      linkRepository.update(link);
      return { id: link.id };
    } else {
      const created = linkRepository.create(link);
      const newId = created.id!;
      stateMap.set(newId, null);
      return { id: newId };
    }
  },

  deleteLink(id: number): boolean {
    const deleted = linkRepository.delete(id);
    if (deleted) {
      stateMap.delete(id);
      wsSubscriptions.delete(id);
    }
    return deleted;
  },

  getState(id: number): LinkState | undefined {
    if (!linkRepository.getById(id)) return undefined;
    return stateMap.get(id) ?? null;
  },

  updateState(id: number, state: LinkState, senderWs?: WebSocket): boolean {
    if (!linkRepository.getById(id)) {
      return false;
    }

    stateMap.set(id, state);

    const subscribers = wsSubscriptions.get(id);

    if (subscribers && subscribers.size > 0) {
      const message = JSON.stringify({
        type: 'stateUpdate',
        linkId: id,
        state,
      });

      for (const client of subscribers) {
        if (
          client !== senderWs &&
          client.readyState === WebSocket.OPEN
        ) {
          client.send(message);
        }
      }
    }

    return true;
  },

  registerWsClient(id: number, ws: WebSocket): boolean {
    if (!linkRepository.getById(id)) {
      return false;
    }

    if (!wsSubscriptions.has(id)) {
      wsSubscriptions.set(id, new Set());
    }

    const subscribers = wsSubscriptions.get(id)!;
    subscribers.add(ws);

    return true;
  },

  unregisterWsClient(id: number, ws: WebSocket): void {
    const subscribers = wsSubscriptions.get(id);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        wsSubscriptions.delete(id);
      }
    }
  },

  attachWs(wss: WebSocketServer): void {
    wss.on('connection', (ws: WebSocket) => {
      const clientSubscriptions = new Set<number>();

      ws.on('message', (rawData: Buffer | string) => {
        try {
          const rawString = rawData.toString();
          const msg = JSON.parse(rawString);

          // Support both 'action' and 'type' keys from client payloads
          const action = msg.action || msg.type;
          const linkId = Number(msg.linkId);
          if (action === 'register' || action === 'subscribe') {
            if (this.registerWsClient(linkId, ws)) {
              clientSubscriptions.add(linkId);
              ws.send(JSON.stringify({ type: 'registered', linkId, state: this.getState(linkId) }));
            } else {
              ws.send(JSON.stringify({ type: 'error', message: `Link ${linkId} not found` }));
            }
          } else if (action === 'unregister' || action === 'unsubscribe') {
            this.unregisterWsClient(linkId, ws);
            clientSubscriptions.delete(linkId);
          } else if (action === 'updateState' || action === 'sync' || action === 'update') {
            this.updateState(linkId, msg.state, ws);
          } else {
            console.warn(`[WS] Unhandled action/type: "${action}"`, msg);
          }
        } catch (err) {
          console.error('[WS] Error processing message:', err);
        }
      });

      ws.on('close', () => {
        for (const linkId of clientSubscriptions) {
          this.unregisterWsClient(linkId, ws);
        }
        clientSubscriptions.clear();
      });
    });
  }
};


















