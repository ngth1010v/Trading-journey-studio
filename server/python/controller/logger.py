from __future__ import annotations

import logging
from logging import Logger


def get_logger(name: str = "controller", symbol: str | None = None) -> Logger:
    full_name = name if symbol is None else f"{name}.{symbol}"
    logger = logging.getLogger(full_name)
    if logger.handlers:
        return logger

    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger
