export interface PythonBridgeConfig {
    host: string;
    port: number;
    pythonBin: string;
    pythonMain: string;
    startupTimeoutMs: number;
}

function readNumber(value: string | undefined, fallback: number): number {
    const text = value ?? "";
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readPythonBridgeConfig(): PythonBridgeConfig {
    return {
        host: process.env.PYTHON_BRIDGE_HOST ?? "127.0.0.1",
        port: readNumber(
            process.env.PYTHON_BRIDGE_PORT
            ?? process.env.PYTHON_POST
            ?? process.env.PORT,
            5000,
        ),
        pythonBin: process.env.PYTHON_BRIDGE_PYTHON_BIN ?? "python",
        pythonMain: process.env.PYTHON_BRIDGE_MAIN ?? "python/main.py",
        startupTimeoutMs: readNumber(process.env.PYTHON_BRIDGE_STARTUP_TIMEOUT_MS, 15000),
    };
}
