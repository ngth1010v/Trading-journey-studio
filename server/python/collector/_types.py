from __future__ import annotations

try:
    from type import Tick, SymbolData  # type: ignore
except Exception:  # pragma: no cover
    try:
        from server.python.type import Tick, SymbolData  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise ImportError(
            "Cannot import Tick/SymbolData from 'type' or 'server.python.type'."
        ) from exc

__all__ = ["Tick", "SymbolData"]
