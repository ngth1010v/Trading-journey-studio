export type BridgeKind = "command" | "event" | "status" | "log";

export interface BridgeMessage {
    kind?: BridgeKind;
    event: string;
    data?: unknown;
    source?: "node" | "python";
    action?: string;
    ok?: boolean;
    error?: string;
    requestId?: string;
}

export function makeMessage(kind: BridgeKind, event: string, data: unknown = undefined, extra: Record<string, unknown> = {}): BridgeMessage {
    return {
        kind,
        event,
        data,
        ...extra,
    };
}

export function encodeMessage(message: BridgeMessage): string {
    return JSON.stringify(message);
}

export function tryParseMessage(line: string): BridgeMessage | null {
    const text = line.trim();
    if (!text) return null;
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== "object") {
        throw new Error("bridge message must be an object");
    }
    return value as BridgeMessage;
}
