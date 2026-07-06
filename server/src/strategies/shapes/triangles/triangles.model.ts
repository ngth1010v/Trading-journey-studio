export interface Triangle {
  // id : string; // primary key, handled dynamically in DB methods
  color?: [number, number, number, number]; // [a, r, g, b] stored as JSON string
  timestamp?: [number, number, number];     // [point1, point2, point3] stored as JSON string
  price?: [number, number, number];         // [point1, point2, point3] stored as JSON string
}