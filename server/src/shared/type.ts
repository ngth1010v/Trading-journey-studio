export interface Tick {
  timestamp: number;
  bid: number;
  ask: number;
  volume: number;
}

export interface Ohlc {
  openTimestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolData {
  symbol: string;
  point: number;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
