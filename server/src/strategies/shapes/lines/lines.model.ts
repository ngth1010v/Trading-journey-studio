export interface Line {
  // id : string; // primary key, handled dynamically in DB methods
  thickness?: number;
  color?: [number, number, number, number]; // [a, r, g, b] stored as JSON string
  timestamp1?: number;
  timestamp2?: number;
  price1?: number;
  price2?: number;
}