export interface Text {
  // id : string; // primary key, handled dynamically in DB methods
  text?: string;
  timestamp?: number;
  price?: number;
  color?: [number, number, number]; // [r, g, b] stored as JSON string
  size?: number;
  alignX?: "left" | "center" | "right";
  alignY?: "top" | "center" | "bottom";
}