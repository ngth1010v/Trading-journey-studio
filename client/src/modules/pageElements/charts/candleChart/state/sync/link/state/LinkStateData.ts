export interface LinkState {
  modifyTimestamp: {
    global: number;
    viewport: number;
    transform: number;
    crosshair: number;
  };
  symbol: string;

  viewport: {
    fromTs: number;
    toTs: number;
    fromPrice: number;
    toPrice: number;
    alt: {
      priceDeltaRatio: number;
      priceOffsetRatio: number;      
    };
  } | null;
  transform: {
    scaleX: number;
    scaleY: number;
    offsetXRatio: number;
    offsetYRatio: number;
    archorLeftXRatio: number;
    archorRightXRatio: number;
  } | null;
  crosshair: {
    price: number;
    timestamp: number;
    alt: {
      priceOffsetRatio: number;      
    };
  } | null;
}

export default class LinkStateData {
  private currentLinkId: number | null = null;
  private currentState: LinkState | null = null;
  private ws: WebSocket | null = null;
  private onLinkStateDataChangeListeners = new Map<string, () => void>();
  private isInitialized = false;

  public init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  public destroy(): void {
    if (!this.isInitialized) return;
    this.unregistry();
    this.isInitialized = false;
  }

  public registry(linkId: number): void {
    if (this.currentLinkId !== null) {
      this.unregistry();
    }

    this.currentLinkId = linkId;

    // Use backend port directly if not running through a proxy (e.g. localhost:3000)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.port === "5173" ? "localhost:3000" : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/chartData/candleChart/sync/link/state`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      if (this.currentLinkId === linkId && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: "register", linkId }));

        // Flush latest state if updated before connection completed
        if (this.currentState !== null) {
          this.sendStateToServer(this.currentState);
        }
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if ((msg.type === "registered" || msg.type === "stateUpdate") && msg.linkId === this.currentLinkId) {
          if (msg.state !== undefined) {
            this.currentState = msg.state;
            this.notifyStateChange();
          }
        }
      } catch (err) {
        console.error("Error parsing WebSocket state message:", err);
      }
    };

    this.ws.onerror = (err) => {
      console.error(`[LinkStateData] WebSocket error on linkId ${linkId}:`, err);
    };

    this.notifyStateChange();
  }

  public unregistry(): void {
    if (this.currentLinkId === null) return;

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: "unregister", linkId: this.currentLinkId }));
      }
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }

    this.currentLinkId = null;
    this.currentState = null;
    this.notifyStateChange();
  }

  public getRegistriedLinkId(): number | null {
    return this.currentLinkId;
  }

  public set(state: LinkState): void {
    this.currentState = state;
    this.sendStateToServer(state);
    this.notifyStateChange();
  }

  private sendStateToServer(state: LinkState): void {
    if (this.currentLinkId !== null && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: "updateState",
          linkId: this.currentLinkId,
          state,
        })
      );
    } else {
      console.warn("[WS Client] Frame buffered/skipped (socket in CONNECTING or CLOSED state)");
    }
  }

  public get(): LinkState | null {
    return this.currentState;
  }

  public addOnLinkStateDataChange(id: string, cb: () => void): void {
    this.onLinkStateDataChangeListeners.set(id, cb);
    if (this.currentState !== null) {
      try {
        cb();
      } catch (err) {
        console.error("Error executing onLinkStateDataChange callback:", err);
      }
    }
  }

  public removeOnLinkStateDataChange(id: string): void {
    if (!this.onLinkStateDataChangeListeners.has(id)) {
      console.warn(`[LinkStateData] Listener ID '${id}' not found.`);
      return;
    }
    this.onLinkStateDataChangeListeners.delete(id);
  }

  private notifyStateChange(): void {
    for (const listener of this.onLinkStateDataChangeListeners.values()) {
      try {
        listener();
      } catch (err) {
        console.error("Error executing onLinkStateDataChange callback:", err);
      }
    }
  }
}