# Python NodeJS Bridge

Bridge dùng để giao tiếp hai chiều giữa Python và NodeJS.

---

# Architecture

```text
NodeJS
   |
   | TCP Socket (JSON Line Protocol)
   |
Python Main
   |
nodejs-bridge
   |
Controller(s)
```

Python là phía xử lý dữ liệu.

NodeJS là phía điều khiển.

---

# Folder Structure

```text
python/
├── main.py
├── types.py
├── controller/
├── reader/
├── writer/
├── collector/
└── nodejs-bridge/
    ├── README.md
    ├── nodejs-bridge.py
    ├── protocol.py
    ├── runtime.py
    └── ...
```

---

# Public API

## Send Event To NodeJS

```py
from nodejs_bridge import nodejsBridge

await nodejsBridge.send(
    "STATUS",
    {
        "symbol": "EURUSD",
        "message": "finished"
    }
)
```

---

## Listen Event From NodeJS

```py
from nodejs_bridge import nodejsBridge

def onReset(event: str, data: dict):
    print(event)
    print(data)

nodejsBridge.addListenCallback(
    "reset-handler",
    onReset
)
```

---

## Remove Listener

```py
nodejsBridge.removeListenCallback(
    "reset-handler"
)
```

---

# Supported Commands

## Shutdown

```json
{
    "event": "SHUTDOWN"
}
```

Destroy all controllers.

Send final status.

Exit process.

---

## Reset Symbol

```json
{
    "event": "RESET",
    "data": {
        "symbol": "EURUSD"
    }
}
```

Equivalent:

```py
controllers["EURUSD"].reset()
```

---

## Update Tick

```json
{
    "event": "UPDATE_TICK",
    "data": {
        "symbol": "EURUSD",
        "timestamp": 1740000000
    }
}
```

Equivalent:

```py
controllers["EURUSD"].updateTickByTimestamp(
    timestamp
)
```

---

## OHLC Commands

```text
RESET_OHLC
UPDATE_OHLC
START_CRAWL_OHLC
END_CRAWL_OHLC
```

Require:

```json
{
    "symbol": "EURUSD",
    "timeframe": 60
}
```

---

# Main Lifecycle

main.py is the application entry.

Typical startup:

```py
async def main():
    await nodejsBridge.init()

    try:
        await asyncio.Event().wait()
    finally:
        await nodejsBridge.destroy()
```

NodeJS controls process lifetime.

Python should not terminate itself unless:

* SHUTDOWN received
* Fatal error
* Keyboard interrupt

---

# Send Status To NodeJS

Example:

```py
await nodejsBridge.send(
    "CONTROLLER_READY",
    {
        "symbol": "EURUSD"
    }
)
```

NodeJS will receive:

```json
{
    "event": "CONTROLLER_READY",
    "data": {
        "symbol": "EURUSD"
    }
}
```
