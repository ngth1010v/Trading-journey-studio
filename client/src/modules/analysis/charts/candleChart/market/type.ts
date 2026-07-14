export type Ohlc = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type SymbolData = {
  symbol: string;
  point: number;
}