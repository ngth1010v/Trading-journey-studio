import os
import uuid
from pathlib import Path
import numpy as np
import config
import _logger
from ohlcStorer._utils import get_directory, get_sorted_files, binary_search_ts



def write(symbol: str, timeframe: str, data: np.ndarray) -> None:
    """
    Saves a block of OHLC data to a binary file.
    Validates total row count against config constraints.
    """
    if data.shape[0] != config.OHLC_STORER_HOT_LIMIT:
        _logger.error(
            "ohlcStorer", 
            f"Write rejected. Data row count {data.shape[0]} != HOT_LIMIT {config.OHLC_STORER_HOT_LIMIT}"
        )
        return

    directory = get_directory(symbol, timeframe)
    
    # Step 1: Write to temporary file with random name
    temp_filename = f"{uuid.uuid4().hex}.bin"
    temp_filepath = directory / temp_filename
    
    # Ensure explicit int64 formatting for saving data cleanly
    data_to_write = data.astype(np.int64)
    data_to_write.tofile(str(temp_filepath))
    
    # Step 2: Safely rename to the first candle timestamp
    first_ts = data_to_write[0, 0]
    final_filepath = directory / f"{first_ts}.bin"
    
    try:
        temp_filepath.rename(final_filepath)
        _logger.info("ohlcStorer", f"Successfully stored block {first_ts}.bin for {symbol} ({timeframe})")
    except Exception as e:
        _logger.error("ohlcStorer", f"Failed renaming file {temp_filename} to {first_ts}.bin: {e}")
        if temp_filepath.exists():
            temp_filepath.unlink()



def getFirst(symbol: str, timeframe: str) -> np.ndarray | list:
    """Returns the first data row of the oldest file using memory mapping."""
    files = get_sorted_files(symbol, timeframe)
    if not files:
        return []
        
    target_file = files[0]
    
    # Memory map the file to grab only the first row
    mmap_data = np.memmap(str(target_file), dtype=np.int64, mode='r', shape=(config.OHLC_STORER_HOT_LIMIT, 6))
    first_row = np.array(mmap_data[0])
    
    # Clean up memory map reference
    del mmap_data
    return first_row



def getLast(symbol: str, timeframe: str) -> np.ndarray | list:
    """Returns the last data row of the latest file using memory mapping."""
    files = get_sorted_files(symbol, timeframe)
    if not files:
        return []
        
    target_file = files[-1]
    
    # Memory map the file to grab only the last row
    mmap_data = np.memmap(str(target_file), dtype=np.int64, mode='r', shape=(config.OHLC_STORER_HOT_LIMIT, 6))
    last_row = np.array(mmap_data[-1])
    
    # Clean up memory map reference
    del mmap_data
    return last_row



def getRange(symbol: str, timeframe: str, fromTs: int, toTs: int) -> np.ndarray:
    """
    Selects valid files within the timestamp boundaries and builds a single array output.
    Uses memory maps and binary searches to chunk outer files accurately.
    """
    files = get_sorted_files(symbol, timeframe)
    if not files:
        return np.empty((0, 6), dtype=np.int64)
        
    # Find targeted files including the boundary safety offset
    target_files = []
    for idx, f in enumerate(files):
        file_ts = int(f.stem)
        
        # Include file if its start fits the window criteria
        if fromTs <= file_ts < toTs:
            target_files.append(f)
        # Handle the overlap edge case: include previous file if requested range falls inside its data span
        elif file_ts < fromTs:
            if idx == len(files) - 1 or int(files[idx + 1].stem) > fromTs:
                target_files.append(f)

    if not target_files:
        return np.empty((0, 6), dtype=np.int64)
        
    results = []
    
    # --- Process First Target File (Slice Start) ---
    first_mmap = np.memmap(str(target_files[0]), dtype=np.int64, mode='r', shape=(config.OHLC_STORER_HOT_LIMIT, 6))
    start_row_id = binary_search_ts(first_mmap, fromTs, find_first=True)
    
    # If there is only one file targeted
    if len(target_files) == 1:
        end_row_id = binary_search_ts(first_mmap, toTs, find_first=False)
        if start_row_id <= end_row_id:
            results.append(np.array(first_mmap[start_row_id : end_row_id + 1]))
        del first_mmap
    else:
        # Save remainder of first file
        if start_row_id < config.OHLC_STORER_HOT_LIMIT:
            results.append(np.array(first_mmap[start_row_id:]))
        del first_mmap
        
        # --- Process Middle Files (Complete Load) ---
        for f in target_files[1:-1]:
            # Simple standard block loading
            middle_data = np.fromfile(str(f), dtype=np.int64).reshape(-1, 6)
            results.append(middle_data)
            
        # --- Process Last Target File (Slice End) ---
        last_mmap = np.memmap(str(target_files[-1]), dtype=np.int64, mode='r', shape=(config.OHLC_STORER_HOT_LIMIT, 6))
        end_row_id = binary_search_ts(last_mmap, toTs, find_first=False)
        if end_row_id >= 0:
            results.append(np.array(last_mmap[: end_row_id + 1]))
        del last_mmap

    if not results:
        return np.empty((0, 6), dtype=np.int64)
        
    return np.concatenate(results, axis=0)