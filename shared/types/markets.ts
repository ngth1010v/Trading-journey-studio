export interface Tick {
  t: number;
  b: number;
  a: number;
  v: number;
}

export interface Ohlc {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface SymbolData {
  symbol: string;
  point: number;
}