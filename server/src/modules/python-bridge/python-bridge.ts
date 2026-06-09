import { pythonBridge as runtimeBridge } from "./runtime";
import type { BridgeMessage } from "./protocol";

export type PythonBridgeListener = (event: string, data: unknown, raw: BridgeMessage) => void;

export interface PythonBridge {
    init                ()                                          : Promise<void>;
    destroy             ()                                          : Promise<void>;
    send                (event: string, data?: unknown)             : Promise<void>;
    addListenCallback   (cbName: string, cb: PythonBridgeListener)  : void;
    removeListenCallback(cbName: string)                            : void;
}

export const pythonBridge: PythonBridge = runtimeBridge;
export type { BridgeMessage };