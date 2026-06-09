import net from "node:net";
import { encodeMessage, tryParseMessage, type BridgeMessage } from "./protocol";

export type BridgeCallback = (event: string, data: unknown, raw: BridgeMessage) => void;

export class TcpTransport {
    private socket: net.Socket | null = null;
    private buffer = "";

    constructor(
        private readonly host: string,
        private readonly port: number,
        private readonly onMessage: BridgeCallback,
    ) {}

    async connect(timeoutMs: number): Promise<void> {
        const startedAt = Date.now();
        let lastError: unknown = null;

        while (Date.now() - startedAt < timeoutMs) {
            try {
                await new Promise<void>((resolve, reject) => {
                    const socket = net.createConnection({ host: this.host, port: this.port });
                    let settled = false;

                    const remainingMs = Math.max(0, timeoutMs - (Date.now() - startedAt));
                    const timer = setTimeout(() => {
                        fail(new Error(`python bridge connect timeout after ${timeoutMs}ms`));
                    }, remainingMs);

                    const fail = (err: Error) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        socket.destroy();
                        reject(err);
                    };

                    socket.setEncoding("utf8");

                    socket.once("connect", () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        this.socket = socket;
                        resolve();
                    });

                    socket.on("data", (chunk: string) => {
                        this.buffer += chunk;
                        this.flushBuffer();
                    });

                    socket.once("close", () => {
                        if (this.socket === socket) {
                            this.socket = null;
                        }
                    });

                    socket.once("error", (err) => {
                        lastError = err;
                        fail(err);
                    });
                });

                return;
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new Error(`python bridge connect timeout after ${timeoutMs}ms`);
    }

    send(message: BridgeMessage): void {
        if (!this.socket) {
            throw new Error("python bridge is not connected");
        }
        this.socket.write(encodeMessage(message) + "\n");
    }

    close(): void {
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            socket.destroy();
        }
    }

    private flushBuffer(): void {
        let index = this.buffer.indexOf("\n");
        while (index >= 0) {
            const line = this.buffer.slice(0, index);
            this.buffer = this.buffer.slice(index + 1);
            index = this.buffer.indexOf("\n");

            if (!line.trim()) continue;

            try {
                const message = tryParseMessage(line);
                if (message) this.onMessage(message.event, message.data, message);
            } catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                this.onMessage(
                    "STATUS",
                    { ok: false, error, raw: line },
                    {
                        kind: "status",
                        event: "STATUS",
                        ok: false,
                        error,
                    },
                );
            }
        }
    }
}