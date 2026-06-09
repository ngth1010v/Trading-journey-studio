import express from "express";

import { marketDb } from "./database/market";
import { pythonBridge } from "./modules/python-bridge";

const app = express();

app.use(express.json());

const PORT = 3000;

async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received, shutting down...`);

    try {
        await pythonBridge.destroy();
    } catch (error) {
        console.error("Failed to destroy python bridge:", error);
    }

    process.exit(0);
}


async function main(): Promise<void> {
    //=========================================================================================
    // INIT DATABASE
    //=========================================================================================
    marketDb.Init();

    //=========================================================================================
    // INIT PYTHON BRIDGE
    //=========================================================================================
    await pythonBridge.init();

    //=========================================================================================
    // SHUTDOWN HANDLERS
    //=========================================================================================
    process.once("SIGINT", () => {
        void shutdown("SIGINT");
    });

    process.once("SIGTERM", () => {
        void shutdown("SIGTERM");
    });

    process.once("beforeExit", () => {
        void pythonBridge.destroy();
    });

    //=========================================================================================
    // OPEN PORT
    //=========================================================================================
    app.listen(PORT, () => {
        console.log(`Server running on ${PORT}`);
    });
}

main().catch(async (error) => {
    console.error("Server startup failed:", error);

    try {
        await pythonBridge.destroy();
    } catch {
        // ignore
    }

    process.exit(1);
});