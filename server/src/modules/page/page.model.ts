export interface PageElement {
  id: number;
  parentId: number;
  type: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  data: any;
}

export interface Page {
  id?: number;
  name: string;
  data: PageElement[];
}

export type WsClientMessage =
  | { type: "SET_PAGE"; payload: Page }
  | { type: "REMOVE_PAGE"; payload: { id: number } };

export type WsServerMessage =
  | { type: "INIT"; payload: Page[] }
  | { type: "PAGES_UPDATED"; payload: Page[] };