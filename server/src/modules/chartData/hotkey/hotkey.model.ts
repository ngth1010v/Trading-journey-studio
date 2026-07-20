export interface Hotkey {
  id?: number;
  chartType: string;
  keys: string[]; // Stored as a JSON string in SQLite
  actions: string[]; // Stored as a JSON string in SQLite
}