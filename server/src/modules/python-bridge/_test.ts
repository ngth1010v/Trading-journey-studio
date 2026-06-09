import { pythonBridge } from "./index";

async function main(): Promise<void> {
    pythonBridge.addListenCallback("log", (event, data) => {
        console.log("[python]", event, data);
    });

    await pythonBridge.init();
    console.log("python bridge started");

    process.on("SIGINT", async () => {
        await pythonBridge.destroy();
        process.exit(0);
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
