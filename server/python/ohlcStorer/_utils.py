import os
import uuid
from pathlib import Path
import numpy as np
import config
import _logger

def get_directory(symbol: str, timeframe: str) -> Path:
    """Returns and ensures creation of the base path for a specific symbol and timeframe."""
    path = Path(config.DATABASE_PATH) / "chartData" / "candles" / symbol / timeframe
    path.mkdir(parents=True, exist_ok=True)
    return path

def get_sorted_files(symbol: str, timeframe: str) -> list[Path]:
    """Returns a sorted list of all valid .bin files in the directory based on timestamp."""
    directory = get_directory(symbol, timeframe)
    files = []
    
    for f in directory.glob("*.bin"):
        name = f.stem
        
        # Bỏ qua các file của Hot Cache (first.bin, last.bin) 
        # và các file tạm (UUID)
        if name in ["first", "last"]:
            continue
            
        try:
            # Parse trực tiếp thành float thay vì dùng isdigit()
            ts_val = float(name)
            files.append((ts_val, f))
        except ValueError:
            # Bỏ qua các file có tên không phải là số (như chuỗi UUID rác chưa kịp đổi tên)
            continue
            
    # Sort files chronologically by their starting timestamp
    files.sort(key=lambda x: x[0])
    return [f[1] for f in files]

def binary_search_ts(data: np.ndarray, ts: float, find_first: bool = True) -> int:
    """
    Performs binary search on a 2D numpy array memory-map based on timestamps (column 0).
    If find_first is True, returns index of first row where row[0] >= ts.
    If find_first is False, returns index of last row where row[0] < ts.
    """
    timestamps = data[:, 0]
    if find_first:
        idx = np.searchsorted(timestamps, ts, side='left')
        return int(idx)  # FIX: Trả về Integer để numpy array có thể slice được
    else:
        idx = np.searchsorted(timestamps, ts, side='left') - 1
        return int(idx)  # FIX: Trả về Integer