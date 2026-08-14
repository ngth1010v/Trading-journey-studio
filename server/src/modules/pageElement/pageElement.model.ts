export interface PageElement {
  id?: number;
  parentId: number | null;
  entry: boolean; // only set when create, unchangeable after that
  entryName: string;
  type: string;
  position: { x: number; y: number }; // saved as json
  size: { w: number; h: number }; // saved as json
}

export interface PageElementRow {
  id: number;
  parentId: number | null;
  entry: number; // Stored as 0 or 1 in SQLite
  entryName: string;
  type: string;
  position: string;
  size: string;
}

export interface PageElementConfigRow {
  pageElementId: number;
  config: string | null;
}