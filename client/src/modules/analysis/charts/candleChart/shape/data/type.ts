export interface Shape {
  id     ?: number; // Optional now to support auto-creation on save
  type    : string;
  fromTs  : number; 
  toTs    : number;
  data    : any;
  style   : any;
  creater : string;   // new
  editable: boolean;  // new
}

export interface ShapeTemplate {
  id?: number; 
  type: string;
  name: string;
  style: any; 
}