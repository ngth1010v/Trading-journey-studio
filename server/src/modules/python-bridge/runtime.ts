import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { once } from "node:events";
import { readPythonBridgeConfig } from "./config";
import { TcpTransport } from "./transport";
import type { BridgeMessage } from "./protocol";

type ListenCb = (event: string, data: unknown, raw: BridgeMessage) => void;

class PythonBridgeRuntime {
    private child: ChildProcessWithoutNullStreams | null = null;
    private transport: TcpTransport | null = null;
    private callbacks = new Map<string, ListenCb>();
    private started = false;

    async init(): Promise<void> {
        if (this.started) return;

        const config = readPythonBridgeConfig();
        const connectPort = await this.pickPort(config.port);

        const pythonMain = path.resolve(process.cwd(), config.pythonMain);
        if (!fs.existsSync(pythonMain)) {
            throw new Error(`python bridge entry not found: ${pythonMain}`);
        }

        const env = {
            ...process.env,
            PYTHON_BRIDGE_HOST: config.host,
            PYTHON_BRIDGE_PORT: String(connectPort),
        };

        const child = spawn(config.pythonBin, [pythonMain], {
            cwd: process.cwd(),
            env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
        });

        this.child = child;
        this.transport = new TcpTransport(config.host, connectPort, (event, data, raw) => {
            for (const cb of this.callbacks.values()) {
                try {
                    cb(event, data, raw);
                } catch {
                    // keep bridge alive
                }
            }
        });

        child.stderr.on("data", (chunk) => {
            process.stderr.write(`[pythonBridge] ${String(chunk)}`);
        });

        child.on("exit", (code, signal) => {
            this.transport?.close();
            this.transport = null;
            this.child = null;
            this.started = false;

            if (code !== 0 || signal !== null) {
                process.stderr.write(
                    `[pythonBridge] python exited with code ${code ?? "null"} signal ${signal ?? "null"}\n`,
                );
            }
        });

        try {
            await this.transport.connect(config.startupTimeoutMs);
            this.started = true;
        } catch (error) {
            this.transport?.close();
            this.transport = null;

            if (!child.killed) {
                child.kill();
                await Promise.race([
                    once(child, "exit").then(() => void 0),
                    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
                ]);
            }

            this.child = null;
            this.started = false;
            throw error;
        }
    }

    async destroy(): Promise<void> {
        if (!this.child && !this.transport) {
            this.started = false;
            return;
        }

        try {
            await this.send("SHUTDOWN", {});
        } catch {
            // ignore
        }

        this.transport?.close();
        this.transport = null;

        const child = this.child;
        this.child = null;
        this.started = false;

        if (child && !child.killed) {
            child.kill();
            await Promise.race([
                once(child, "exit").then(() => void 0),
                new Promise<void>((resolve) => setTimeout(resolve, 1000)),
            ]);
        }
    }

    addListenCallback(cbName: string, cb: ListenCb): void {
        this.callbacks.set(cbName, cb);
    }

    removeListenCallback(cbName: string): void {
        this.callbacks.delete(cbName);
    }

    async send(event: string, data: unknown = {}): Promise<void> {
        if (!this.transport) {
            throw new Error("python bridge is not initialized");
        }
        this.transport.send({ kind: "command", event, data, source: "node" });
    }

    private async pickPort(preferredPort: number): Promise<number> {
        if (preferredPort > 0) return preferredPort;

        const server = net.createServer();
        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => resolve());
        });

        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;

        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });

        if (!port) throw new Error("failed to reserve a free port");
        return port;
    }
}

export const pythonBridge = new PythonBridgeRuntime();