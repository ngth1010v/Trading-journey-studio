import net from "node:net";

import type { Ohlc, SymbolData } from "../../shared/type.js";

export type PythonCommand =
  | "PING"
  | "LIST_SYMBOLS"
  | "GET_SYMBOL"
  | "GET_OHLC"
  | "GET_LAST_OHLC"
  | "SHUTDOWN";

export interface PythonRequest {
  command: PythonCommand;
  params?: Record<string, unknown>;
}

export interface PythonResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export class PythonClient {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
  ) {}

  async request<T>(command: PythonCommand, params: Record<string, unknown> = {}): Promise<T> {
    const payload: PythonRequest = { command, params };
    const response = await new Promise<PythonResponse<T>>((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        socket.destroy(new Error(`Python IPC timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      let buffer = "";

      socket.setEncoding("utf8");
      socket.on("connect", () => {
        socket.write(`${JSON.stringify(payload)}\n`);
      });
      socket.on("data", (chunk) => {
        buffer += chunk;
        if (buffer.includes("\n")) {
          const line = buffer.slice(0, buffer.indexOf("\n"));
          buffer = "";
          clearTimeout(timer);
          try {
            resolve(JSON.parse(line) as PythonResponse<T>);
          } catch (error) {
            reject(error);
          } finally {
            socket.end();
          }
        }
      });
      socket.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on("close", () => clearTimeout(timer));
    });

    if (!response.ok) {
      throw new Error(response.error ?? "python request failed");
    }

    return response.data as T;
  }

  ping(): Promise<{ ready: boolean; mt5Ready: boolean }> {
    return this.request("PING");
  }

  listSymbols(): Promise<{ symbols: string[] }> {
    return this.request("LIST_SYMBOLS");
  }

  getSymbol(symbol: string): Promise<SymbolData> {
    return this.request("GET_SYMBOL", { symbol });
  }

  getOhlc(params: Record<string, unknown>): Promise<{ ohlc: Ohlc[] }> {
    return this.request("GET_OHLC", params);
  }

  getLastOhlc(params: Record<string, unknown>): Promise<{ ohlc: Ohlc }> {
    return this.request("GET_LAST_OHLC", params);
  }

  shutdown(): Promise<{ shutdown: boolean }> {
    return this.request("SHUTDOWN");
  }
}
