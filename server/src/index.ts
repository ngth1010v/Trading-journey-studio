import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { HTTP_HOST, HTTP_PORT, IPC_HOST, IPC_PORT } from "./shared/config.js";
import { PythonClient } from "./modules/markets/python-client.js";
import { MarketsService } from "./modules/markets/markets.service.js";
import { createMarketsRouter } from "./modules/markets/markets.route.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = dirname(__dirname);
const pythonMain = join(serverRoot, "python", "main.py");

function spawnPython(): ChildProcess {
  const pythonBin = process.env.PYTHON_BIN || process.env.PYTHON || "python";
  const child = spawn(pythonBin, [pythonMain], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[python] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[python] ${chunk}`));

  return child;
}

async function waitForPythonReady(client: PythonClient, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const status = await client.ping();
      if (status.ready) {
        return;
      }
    } catch {
      // keep retrying until the controller comes up
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Python controller did not become ready in time");
}

async function main(): Promise<void> {
  const pythonProcess = spawnPython();
  const pythonClient = new PythonClient(IPC_HOST, IPC_PORT);

  const shutdown = async () => {
    try {
      await pythonClient.shutdown();
    } catch {
      // best-effort shutdown
    }
    if (!pythonProcess.killed) {
      pythonProcess.kill("SIGTERM");
    }
  };

  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });

  await waitForPythonReady(pythonClient);

  const app = express();
  app.use(express.json());

  const service = new MarketsService(pythonClient);
  app.use("/api/markets", createMarketsRouter(service));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  const server = app.listen(Number(process.env.PORT || HTTP_PORT), HTTP_HOST, () => {
    console.log(`HTTP server listening on http://${HTTP_HOST}:${Number(process.env.PORT || HTTP_PORT)}`);
  });

  const close = async () => {
    await shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  process.on("uncaughtException", async (error) => {
    console.error(error);
    await close();
    process.exit(1);
  });
  process.on("unhandledRejection", async (reason) => {
    console.error(reason);
    await close();
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
