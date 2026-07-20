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

export interface PageSummary {
  id: number;
  name: string;
}