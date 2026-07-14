import type { RGBA } from "../shared/type.js";

export interface Color {
  id?: number;              // Primary key
  color: RGBA;              // Saved as JSON string in DB, parsed as array for client
}

export interface DbColorRow {
  id: number;
  color: string;            // JSON stringified RGBA array
  lastModifyTimestamp: number;
}