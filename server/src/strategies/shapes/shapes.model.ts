export interface Shape {
  id?: number; // Optional now to support auto-creation on save
  type: string;
  fromTs: number; 
  toTs: number;
  data: string; // JSON, no need to validate
  styles: string; // JSON, no need to validate
}

export interface ShapeTemplate {
  id?: number; // Optional now to support auto-creation on save
  type: string;
  name: string;
  styles: string; // JSON, no need to validate
}