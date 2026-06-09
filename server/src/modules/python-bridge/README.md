# Python Bridge

NodeJS module used to communicate with Python process.

---

# Architecture

```text
NodeJS
    |
pythonBridge
    |
TCP Socket
    |
Python
```

NodeJS owns the Python process lifecycle.

---

# Installation

Environment variables:

```env
PYTHON_POST=5000

SERVER_POST=3000

CLIENT_POST=5173
```

---

# Initialization

```ts
import { pythonBridge } from "./python-bridge";

await pythonBridge.init();
```

This will:

1. Start Python process.
2. Connect socket.
3. Start listener loop.

---

# Shutdown

```ts
await pythonBridge.destroy();
```

This will:

1. Send SHUTDOWN.
2. Wait Python exit.
3. Close socket.
4. Release resources.

---

# Send Event

```ts
await pythonBridge.send(
    "RESET",
    {
        symbol: "EURUSD"
    }
);
```

---

# Receive Event

```ts
pythonBridge.addListenCallback(
    "status-listener",
    (event, data, raw) => {
        console.log(event);
        console.log(data);
    }
);
```

---

# Remove Listener

```ts
pythonBridge.removeListenCallback(
    "status-listener"
);
```

---

# Event Format

Every message uses:

```ts
interface BridgeMessage {
    event: string;
    data?: unknown;
}
```

Example:

```json
{
    "event": "RESET",
    "data": {
        "symbol": "EURUSD"
    }
}
```

---

# Typical Usage

```ts
import { pythonBridge } from "./python-bridge";

await pythonBridge.init();

pythonBridge.addListenCallback(
    "logger",
    (event, data) => {
        console.log(event, data);
    }
);

await pythonBridge.send(
    "UPDATE_TICK",
    {
        symbol: "EURUSD",
        timestamp: 1740000000
    }
);
```

---

# Test

Use:

```ts
import "./_test";
```

or

```bash
npx tsx src/modules/python-bridge/_test.ts
```

Expected:

```text
Python process started
Connected to bridge
Event received
Test completed
```

---

# Public API

```ts
await pythonBridge.init();

await pythonBridge.destroy();

await pythonBridge.send(
    event,
    data
);

pythonBridge.addListenCallback(
    cbName,
    callback
);

pythonBridge.removeListenCallback(
    cbName
);
```

This API should be the only entry point used by the rest of the NodeJS application.
