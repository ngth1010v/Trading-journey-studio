import { pythonBridge } from "./index";

export async function pythonBridgeTest(): Promise<void> {
    pythonBridge.addListenCallback("log", (event, data) => {
        console.log("[python]", event, data);
    });

    // await pythonBridge.init();
    console.log("python bridge started");

    process.on("SIGINT", async () => {
        await pythonBridge.destroy();
        process.exit(0);
    });
}
