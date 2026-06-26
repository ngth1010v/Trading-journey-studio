import os
import uuid
from pathlib import Path
import numpy as np
import config
import _logger

def get_directory(symbol: str, timeframe: str) -> Path:
    """Returns and ensures creation of the base path for a specific symbol and timeframe."""
    path = Path(config.DATABASE_PATH) / "markets" / symbol / timeframe
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_sorted_files(symbol: str, timeframe: str) -> list[Path]:
    """Returns a sorted list of all valid .bin files in the directory based on timestamp."""
    directory = get_directory(symbol, timeframe)
    files = []
    for f in directory.glob("*.bin"):
        try:
            # Filter out temporary/random UUID filenames that are not digits
            name = f.stem
            if name.isdigit():
                files.append((int(name), f))
        except ValueError:
            continue
    # Sort files chronologically by their starting timestamp
    files.sort(key=lambda x: x[0])
    return [f[1] for f in files]

def binary_search_ts(data: np.ndarray, ts: int, find_first: bool = True) -> int:
    """
    Performs binary search on a 2D numpy array memory-map based on timestamps (column 0).
    If find_first is True, returns index of first row where row[0] >= ts.
    If find_first is False, returns index of last row where row[0] < ts.
    """
    timestamps = data[:, 0]
    if find_first:
        idx = np.searchsorted(timestamps, ts, side='left')
        return int(idx)
    else:
        idx = np.searchsorted(timestamps, ts, side='left') - 1
        return int(idx)