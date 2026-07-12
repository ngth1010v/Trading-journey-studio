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

export interface Shape {
  id     ?: number; // Optional now to support auto-creation on save
  type    : string;
  fromTs  : number; 
  toTs    : number;
  data    : any;
  styles  : any;
  creater : string;   // new
  editable: boolean;  // new
}

export interface ShapeTemplate {
  id?: number; 
  type: string;
  name: string;
  styles: any; 
}